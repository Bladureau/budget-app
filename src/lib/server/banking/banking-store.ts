/**
 * État bancaire du serveur : `banking.json`.
 *
 * Voir specs/006-bank-sync/data-model.md (§3).
 *
 * **Ce module ne doit jamais rejoindre le graphe client.** Il détient les identifiants de
 * session, qui ne sortent d'ici que vers `enable-banking.ts`.
 *
 * Fichier **distinct** de `budget.json` : il contient ce qui est secret (sessions) ou
 * récupérable à nouveau (opérations), donc ni exportable, ni synchronisable (R1). Un incident
 * sur l'un ne touche pas l'autre.
 *
 * Mêmes garanties que le magasin du budget, par les mêmes primitives : écriture atomique,
 * sérialisation, quarantaine d'un contenu illisible.
 *
 * Un contenu illisible est mis en quarantaine **et l'état repart à vide** : les opérations se
 * récupèrent à nouveau, et des sessions perdues obligent seulement à relier les banques. Le
 * budget, lui, n'est jamais touché.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ecrireJsonAtomiquement,
  enSerie,
  existe,
  mettreEnQuarantaine,
} from "@/lib/server/atomic-file";
import { parseBankOperation } from "@/features/banking/operation";
import { BANK_SOURCES } from "@/features/banking/types";
import type { BankError, BankOperation } from "@/features/banking/types";
import type { BankSource } from "@/features/budget/types";

export const BANKING_STORE_VERSION = 1;

const ERREURS: readonly BankError[] = [
  "expired",
  "revoked",
  "noAccount",
  "rateLimited",
  "unavailable",
];

export interface BankConnection {
  bank: BankSource;
  /** Donnée sensible : jamais renvoyée au navigateur. */
  sessionId: string;
  /** Identifiant du compte pour **cette** session ; il change à chaque autorisation. */
  accountUid: string;
  /** Empreinte SHA-256 de l'IBAN normalisé : reconnaît le compte (EF-003). */
  ibanHash: string;
  /** Pour l'affichage uniquement. */
  ibanSuffix: string;
  validUntil: string;
  lastFetchAt: string | null;
  lastAttemptAt: string | null;
  lastError: BankError | null;
  /** Transactions illisibles écartées lors de la dernière récupération. */
  discardedCount: number;
  operations: BankOperation[];
}

export interface StoredBanking {
  version: number;
  connections: BankConnection[];
}

export type BankingReadOutcome = { state: StoredBanking; quarantined: boolean };

export function emptyBanking(): StoredBanking {
  return { version: BANKING_STORE_VERSION, connections: [] };
}

function repertoire(): string {
  const configure = process.env.BUDGET_DATA_DIR;
  return configure && configure.trim() !== "" ? configure : "./data";
}

function cheminBanque(): string {
  return path.join(repertoire(), "banking.json");
}

const CLE_SERIE = "banking";

// --- Validation (principe IV) ------------------------------------------------------------------

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function texte(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.length > 0 && valeur.length <= 500;
}

function horodatage(valeur: unknown): valeur is string {
  return typeof valeur === "string" && !Number.isNaN(Date.parse(valeur));
}

function horodatageOuNull(valeur: unknown): valeur is string | null {
  return valeur === null || horodatage(valeur);
}

function analyserConnexion(brut: unknown): BankConnection | null {
  if (!estObjet(brut)) return null;
  if (typeof brut.bank !== "string" || !BANK_SOURCES.includes(brut.bank as BankSource)) {
    return null;
  }
  if (!texte(brut.sessionId) || !texte(brut.accountUid)) return null;
  if (typeof brut.ibanHash !== "string" || !/^[0-9a-f]{64}$/.test(brut.ibanHash)) return null;
  if (typeof brut.ibanSuffix !== "string" || brut.ibanSuffix.length > 4) return null;
  if (!horodatage(brut.validUntil)) return null;
  if (!horodatageOuNull(brut.lastFetchAt) || !horodatageOuNull(brut.lastAttemptAt)) return null;
  if (brut.lastError !== null && !ERREURS.includes(brut.lastError as BankError)) return null;
  if (
    typeof brut.discardedCount !== "number" ||
    !Number.isInteger(brut.discardedCount) ||
    brut.discardedCount < 0
  ) {
    return null;
  }
  if (!Array.isArray(brut.operations)) return null;

  const operations: BankOperation[] = [];
  for (const element of brut.operations) {
    const operation = parseBankOperation(element);
    if (!operation || operation.bank !== brut.bank) return null;
    operations.push(operation);
  }

  return {
    bank: brut.bank as BankSource,
    sessionId: brut.sessionId,
    accountUid: brut.accountUid,
    ibanHash: brut.ibanHash,
    ibanSuffix: brut.ibanSuffix,
    validUntil: brut.validUntil,
    lastFetchAt: brut.lastFetchAt,
    lastAttemptAt: brut.lastAttemptAt,
    lastError: (brut.lastError as BankError | null) ?? null,
    discardedCount: brut.discardedCount,
    operations,
  };
}

function analyserEtat(brut: unknown): StoredBanking | null {
  if (!estObjet(brut) || brut.version !== BANKING_STORE_VERSION) return null;
  if (!Array.isArray(brut.connections)) return null;

  const connections: BankConnection[] = [];
  for (const element of brut.connections) {
    const connexion = analyserConnexion(element);
    if (!connexion) return null;
    connections.push(connexion);
  }

  // Au plus une connexion par banque.
  const banques = connections.map((connexion) => connexion.bank);
  if (new Set(banques).size !== banques.length) return null;

  return { version: BANKING_STORE_VERSION, connections };
}

// --- Lecture et écriture -------------------------------------------------------------------------

async function lire(): Promise<BankingReadOutcome> {
  const chemin = cheminBanque();
  if (!(await existe(chemin))) return { state: emptyBanking(), quarantined: false };

  let brut: string;
  try {
    brut = await readFile(chemin, "utf8");
  } catch {
    return { state: emptyBanking(), quarantined: false };
  }
  if (brut.trim() === "") return { state: emptyBanking(), quarantined: false };

  let analyse: unknown;
  try {
    analyse = JSON.parse(brut);
  } catch {
    await mettreEnQuarantaine(chemin);
    return { state: emptyBanking(), quarantined: true };
  }

  const etat = analyserEtat(analyse);
  if (!etat) {
    await mettreEnQuarantaine(chemin);
    return { state: emptyBanking(), quarantined: true };
  }
  return { state: etat, quarantined: false };
}

/** Lit l'état bancaire, à l'intérieur de la file d'écriture pour ne jamais lire à mi-écriture. */
export function readBanking(): Promise<BankingReadOutcome> {
  return enSerie(CLE_SERIE, lire);
}

/**
 * Lit, transforme et réécrit l'état, sans qu'aucune autre écriture ne puisse s'intercaler.
 * `transformer` est une fonction pure : elle rend le nouvel état, ou `null` pour ne rien
 * écrire.
 */
export function updateBanking(
  transformer: (etat: StoredBanking) => StoredBanking | null,
): Promise<{ ok: true; state: StoredBanking } | { ok: false }> {
  return enSerie(CLE_SERIE, async () => {
    const { state } = await lire();
    const suivant = transformer(state);
    if (!suivant) return { ok: true, state } as const;
    if (!(await ecrireJsonAtomiquement(cheminBanque(), suivant))) return { ok: false } as const;
    return { ok: true, state: suivant } as const;
  });
}

// --- Transformations pures -------------------------------------------------------------------------

export function findConnection(etat: StoredBanking, bank: BankSource): BankConnection | undefined {
  return etat.connections.find((connexion) => connexion.bank === bank);
}

function remplacer(etat: StoredBanking, connexion: BankConnection): StoredBanking {
  return {
    ...etat,
    connections: [
      ...etat.connections.filter((existante) => existante.bank !== connexion.bank),
      connexion,
    ],
  };
}

/**
 * Enregistre une liaison ou un renouvellement.
 *
 * Le cache d'opérations est **conservé** lors d'un renouvellement : les références sont
 * stables d'une autorisation à l'autre (R2), et repartir à vide obligerait à tout récupérer.
 */
export function withConnection(
  etat: StoredBanking,
  nouvelle: Pick<BankConnection, "bank" | "sessionId" | "accountUid" | "ibanHash" | "ibanSuffix" | "validUntil">,
): StoredBanking {
  const existante = findConnection(etat, nouvelle.bank);
  return remplacer(etat, {
    lastFetchAt: existante?.lastFetchAt ?? null,
    discardedCount: existante?.discardedCount ?? 0,
    operations: existante?.operations ?? [],
    ...nouvelle,
    // Une nouvelle autorisation efface l'erreur précédente et autorise une récupération
    // immédiate, sans attendre la fin de la borne de 6 heures.
    lastError: null,
    lastAttemptAt: null,
  });
}

/**
 * Ajoute des opérations au cache, **dédupliquées par référence**.
 *
 * Une opération déjà connue n'est pas remplacée : une opération comptabilisée ne change plus.
 * Un arrondi déjà fusionné dans un paiement (sa référence figure en `roundUpRef`) n'est pas
 * réajouté, sans quoi il réapparaîtrait seul à chaque récupération (R8).
 */
export function mergeOperations(
  existantes: readonly BankOperation[],
  nouvelles: readonly BankOperation[],
): BankOperation[] {
  const connues = new Set<string>();
  for (const operation of existantes) {
    connues.add(operation.ref);
    if (operation.roundUpRef) connues.add(operation.roundUpRef);
  }

  const resultat = [...existantes];
  for (const operation of nouvelles) {
    if (connues.has(operation.ref)) continue;
    connues.add(operation.ref);
    resultat.push(operation);
  }
  return resultat;
}

export function withAttempt(etat: StoredBanking, bank: BankSource, at: Date): StoredBanking {
  const connexion = findConnection(etat, bank);
  return connexion ? remplacer(etat, { ...connexion, lastAttemptAt: at.toISOString() }) : etat;
}

export function withFetchResult(
  etat: StoredBanking,
  bank: BankSource,
  resultat: { operations: BankOperation[]; discardedCount: number; at: Date },
): StoredBanking {
  const connexion = findConnection(etat, bank);
  if (!connexion) return etat;
  return remplacer(etat, {
    ...connexion,
    operations: resultat.operations,
    discardedCount: resultat.discardedCount,
    lastFetchAt: resultat.at.toISOString(),
    lastAttemptAt: resultat.at.toISOString(),
    lastError: null,
  });
}

export function withError(
  etat: StoredBanking,
  bank: BankSource,
  erreur: BankError,
  at: Date,
): StoredBanking {
  const connexion = findConnection(etat, bank);
  if (!connexion) return etat;
  // Le cache est conservé : un échec ne fait rien perdre de ce qui a déjà été récupéré.
  return remplacer(etat, { ...connexion, lastError: erreur, lastAttemptAt: at.toISOString() });
}
