/**
 * Appels du navigateur aux points d'entrée `/api/banking/*`.
 *
 * Voir specs/006-bank-sync/contracts/api-banking.md.
 *
 * Mêmes conventions que `@/features/budget/sync` : ces fonctions parlent au réseau et rendent
 * un résultat, sans rien écrire. Décider quoi en faire revient au fournisseur du budget.
 *
 * **Toute réponse est une frontière de confiance** (principe IV) : elle part d'`unknown` et
 * est validée champ par champ. Une opération invalide est **écartée**, jamais devinée ; les
 * autres opérations du lot restent utilisables.
 */

import { parseBankOperation } from "@/features/banking/operation";
import { BANK_SOURCES } from "@/features/banking/types";
import type {
  BankConnectionStatus,
  BankError,
  BankOperation,
  BankStatus,
} from "@/features/banking/types";
import type { BankSource } from "@/features/budget/types";

export type ClientFailure = "offline" | "unauthorized" | "notConfigured" | "invalidResponse" | "serverError";

export type ClientResult<T> = { ok: true; value: T } | { ok: false; reason: ClientFailure };

const ERREURS: readonly BankError[] = [
  "expired",
  "revoked",
  "noAccount",
  "rateLimited",
  "unavailable",
];

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function horodatageOuNull(valeur: unknown): valeur is string | null {
  return valeur === null || (typeof valeur === "string" && !Number.isNaN(Date.parse(valeur)));
}

async function appeler(entree: string, init: RequestInit): Promise<ClientResult<unknown>> {
  let reponse: Response;
  try {
    reponse = await fetch(entree, {
      credentials: "same-origin",
      cache: "no-store",
      ...init,
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch {
    return { ok: false, reason: "offline" };
  }

  if (reponse.status === 401) return { ok: false, reason: "unauthorized" };
  if (reponse.status === 503) return { ok: false, reason: "notConfigured" };
  if (reponse.status !== 200) return { ok: false, reason: "serverError" };

  try {
    return { ok: true, value: (await reponse.json()) as unknown };
  } catch {
    return { ok: false, reason: "invalidResponse" };
  }
}

// --- État des banques ----------------------------------------------------------------------

function analyserEtatBanque(brut: unknown): BankConnectionStatus | null {
  if (!estObjet(brut)) return null;
  if (typeof brut.bank !== "string" || !BANK_SOURCES.includes(brut.bank as BankSource)) {
    return null;
  }
  if (typeof brut.connected !== "boolean") return null;
  if (brut.ibanSuffix !== null && (typeof brut.ibanSuffix !== "string" || brut.ibanSuffix.length > 4)) {
    return null;
  }
  if (!horodatageOuNull(brut.validUntil) || !horodatageOuNull(brut.lastFetchAt)) return null;
  if (brut.lastError !== null && !ERREURS.includes(brut.lastError as BankError)) return null;
  if (
    typeof brut.discardedCount !== "number" ||
    !Number.isInteger(brut.discardedCount) ||
    brut.discardedCount < 0
  ) {
    return null;
  }
  if (typeof brut.historyGap !== "boolean") return null;

  return {
    bank: brut.bank as BankSource,
    connected: brut.connected,
    ibanSuffix: brut.ibanSuffix,
    validUntil: brut.validUntil,
    lastFetchAt: brut.lastFetchAt,
    lastError: brut.lastError as BankError | null,
    discardedCount: brut.discardedCount,
    historyGap: brut.historyGap,
  };
}

export function parseBankStatus(brut: unknown): BankStatus | null {
  if (!estObjet(brut) || typeof brut.configured !== "boolean" || !Array.isArray(brut.banks)) {
    return null;
  }
  const banks: BankConnectionStatus[] = [];
  for (const element of brut.banks) {
    const etat = analyserEtatBanque(element);
    if (!etat) return null;
    banks.push(etat);
  }
  return { configured: brut.configured, banks };
}

export async function fetchBankStatus(): Promise<ClientResult<BankStatus>> {
  const resultat = await appeler("/api/banking/status", { method: "GET" });
  if (!resultat.ok) return resultat;

  const etat = parseBankStatus(resultat.value);
  return etat ? { ok: true, value: etat } : { ok: false, reason: "invalidResponse" };
}

// --- Liaison -------------------------------------------------------------------------------

/** Rend l'URL de la banque, à ouvrir en navigation de premier niveau. */
export async function startConnect(bank: BankSource): Promise<ClientResult<string>> {
  const resultat = await appeler("/api/banking/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bank }),
  });
  if (!resultat.ok) return resultat;

  const url = estObjet(resultat.value) ? resultat.value.url : undefined;
  if (typeof url !== "string") return { ok: false, reason: "invalidResponse" };
  try {
    // Le navigateur n'est envoyé que vers une adresse HTTPS : une réponse détournée ne doit
    // pas pouvoir le diriger vers une page en clair.
    if (new URL(url).protocol !== "https:") return { ok: false, reason: "invalidResponse" };
  } catch {
    return { ok: false, reason: "invalidResponse" };
  }
  return { ok: true, value: url };
}

// --- Opérations ----------------------------------------------------------------------------

export interface OperationsBatch {
  operations: BankOperation[];
  status: BankStatus;
  /** Opérations écartées par la validation : jamais devinées, mais comptées. */
  rejectedCount: number;
}

export async function fetchOperations(
  since: string,
  manual: boolean,
): Promise<ClientResult<OperationsBatch>> {
  const parametres = new URLSearchParams({ since });
  if (manual) parametres.set("refresh", "manual");

  const resultat = await appeler(`/api/banking/operations?${parametres.toString()}`, {
    method: "GET",
  });
  if (!resultat.ok) return resultat;

  const corps = resultat.value;
  if (!estObjet(corps) || !Array.isArray(corps.operations)) {
    return { ok: false, reason: "invalidResponse" };
  }
  const status = parseBankStatus({ configured: true, banks: corps.banks });
  if (!status) return { ok: false, reason: "invalidResponse" };

  const operations: BankOperation[] = [];
  let rejectedCount = 0;
  for (const element of corps.operations) {
    const operation = parseBankOperation(element);
    if (operation) operations.push(operation);
    else rejectedCount += 1;
  }
  return { ok: true, value: { operations, status, rejectedCount } };
}
