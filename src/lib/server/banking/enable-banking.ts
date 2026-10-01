/**
 * Appels au fournisseur Enable Banking.
 *
 * Voir specs/006-bank-sync/research.md (R5) et contracts/api-banking.md.
 *
 * **Ce module ne doit jamais rejoindre le graphe client.** Il signe avec la clé privée.
 *
 * Aucune dépendance : le JWT est signé par `node:crypto`, les appels passent par le `fetch`
 * natif. Une bibliothèque JWT ou le SDK du fournisseur auraient été une dépendance d'exécution
 * pour une vingtaine de lignes (principe VI).
 *
 * **Toute réponse du fournisseur est une entrée non fiable** (principe IV) : elle part
 * d'`unknown`. Ce module ne valide que ce dont il a besoin pour router (identifiants, URL,
 * pagination) ; les transactions elles-mêmes sont validées une à une par les normalisateurs.
 *
 * Seul l'accès en **lecture** est implémenté (EF-002) : aucune fonction d'initiation de
 * paiement n'existe ici, et l'application n'est inscrite qu'au service AIS.
 */

import { createHash, createSign } from "node:crypto";

import type { BankingConfig } from "@/lib/server/banking/config";
import type { BankError } from "@/features/banking/types";
import type { BankSource } from "@/features/budget/types";

const API = "https://api.enablebanking.com";
const DUREE_JWT_S = 3600;
/** Garde-fou contre une pagination qui ne finirait jamais. */
const PAGES_MAX = 50;

/** Nom et pays de chaque banque chez le fournisseur, tels que constatés lors de l'essai. */
const ASPSP: Readonly<Record<BankSource, { name: string; country: string }>> = {
  lcl: { name: "LCL", country: "FR" },
  revolut: { name: "Revolut", country: "FR" },
};

export type ProviderResult<T> = { ok: true; value: T } | { ok: false; error: BankError };

export interface ProviderAccount {
  uid: string;
  iban: string | null;
  currency: string | null;
}

export interface ProviderSession {
  sessionId: string;
  accounts: ProviderAccount[];
}

/** En-têtes signalant à la banque un utilisateur présent (R3). */
export interface PsuHeaders {
  ipAddress: string | null;
  userAgent: string | null;
}

// --- Signature -------------------------------------------------------------------------------

function base64url(valeur: string | Buffer): string {
  return Buffer.from(valeur).toString("base64url");
}

/** JWT RS256 attendu par le fournisseur : `kid` = identifiant d'application. */
export function signJwt(config: BankingConfig, maintenant: Date): string {
  const iat = Math.floor(maintenant.getTime() / 1000);
  const entete = base64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: config.appId }));
  const charge = base64url(
    JSON.stringify({
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat,
      exp: iat + DUREE_JWT_S,
    }),
  );
  const signataire = createSign("RSA-SHA256");
  signataire.update(`${entete}.${charge}`);
  return `${entete}.${charge}.${base64url(signataire.sign(config.privateKey))}`;
}

// --- Transport ---------------------------------------------------------------------------------

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/**
 * Traduit un refus du fournisseur en erreur compréhensible par l'utilisateur.
 *
 * Le fournisseur porte un code dans le corps (`code` ou `error`). Les libellés exacts varient
 * d'une banque à l'autre : on reconnaît des **familles** plutôt que des valeurs exactes, et
 * tout le reste devient `unavailable`, qui invite à réessayer — l'issue la moins trompeuse.
 */
export function traduireErreur(statut: number, corps: unknown): BankError {
  const code = estObjet(corps)
    ? `${String(corps.code ?? "")} ${String(corps.error ?? "")} ${String(corps.message ?? "")}`
    : "";
  const texte = code.toUpperCase();

  if (statut === 429 || texte.includes("RATE_LIMIT") || texte.includes("TOO_MANY")) {
    return "rateLimited";
  }
  if (texte.includes("EXPIRED")) return "expired";
  if (texte.includes("REVOKED") || texte.includes("CLOSED") || texte.includes("INVALID_SESSION")) {
    return "revoked";
  }
  if (statut === 401 || statut === 403) return "revoked";
  return "unavailable";
}

async function appeler(
  config: BankingConfig,
  methode: "GET" | "POST",
  chemin: string,
  corps?: unknown,
  enTetes: Record<string, string> = {},
): Promise<ProviderResult<unknown>> {
  let reponse: Response;
  try {
    reponse = await fetch(`${API}${chemin}`, {
      method: methode,
      headers: {
        Authorization: `Bearer ${signJwt(config, new Date())}`,
        "Content-Type": "application/json",
        ...enTetes,
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }

  let contenu: unknown;
  try {
    contenu = (await reponse.json()) as unknown;
  } catch {
    contenu = undefined;
  }

  if (!reponse.ok) return { ok: false, error: traduireErreur(reponse.status, contenu) };
  return { ok: true, value: contenu };
}

// --- Opérations -------------------------------------------------------------------------------

/** Durée maximale d'autorisation annoncée par la banque, en secondes. */
export async function getAspspMaxValidity(
  config: BankingConfig,
  bank: BankSource,
): Promise<ProviderResult<number>> {
  const { name, country } = ASPSP[bank];
  const resultat = await appeler(config, "GET", `/aspsps?country=${encodeURIComponent(country)}`);
  if (!resultat.ok) return resultat;

  const liste = estObjet(resultat.value) ? resultat.value.aspsps : undefined;
  if (!Array.isArray(liste)) return { ok: false, error: "unavailable" };

  const banque = liste.find((element) => estObjet(element) && element.name === name);
  const duree = estObjet(banque) ? banque.maximum_consent_validity : undefined;
  if (typeof duree !== "number" || !Number.isInteger(duree) || duree <= 0) {
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, value: duree };
}

/** Démarre une autorisation ; rend l'URL de la banque à ouvrir par le navigateur. */
export async function startAuthorization(
  config: BankingConfig,
  bank: BankSource,
  state: string,
  validUntil: Date,
): Promise<ProviderResult<string>> {
  const resultat = await appeler(config, "POST", "/auth", {
    access: { valid_until: validUntil.toISOString() },
    aspsp: ASPSP[bank],
    state,
    redirect_url: config.redirectUrl,
    psu_type: "personal",
  });
  if (!resultat.ok) return resultat;

  const url = estObjet(resultat.value) ? resultat.value.url : undefined;
  if (typeof url !== "string") return { ok: false, error: "unavailable" };
  try {
    // Seule une URL HTTPS est renvoyée au navigateur : une réponse détournée ne doit pas
    // pouvoir l'envoyer ailleurs que chez une banque, par un canal chiffré.
    if (new URL(url).protocol !== "https:") return { ok: false, error: "unavailable" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
  return { ok: true, value: url };
}

function analyserCompte(brut: unknown): ProviderAccount | null {
  if (!estObjet(brut) || typeof brut.uid !== "string" || brut.uid === "") return null;
  const identifiant = estObjet(brut.account_id) ? brut.account_id : {};
  return {
    uid: brut.uid,
    iban: typeof identifiant.iban === "string" ? identifiant.iban : null,
    currency: typeof brut.currency === "string" ? brut.currency : null,
  };
}

/** Échange le code de retour contre une session. */
export async function createSession(
  config: BankingConfig,
  code: string,
): Promise<ProviderResult<ProviderSession>> {
  const resultat = await appeler(config, "POST", "/sessions", { code });
  if (!resultat.ok) return resultat;

  const valeur = resultat.value;
  if (!estObjet(valeur) || typeof valeur.session_id !== "string") {
    return { ok: false, error: "unavailable" };
  }
  const comptes = Array.isArray(valeur.accounts) ? valeur.accounts : [];
  return {
    ok: true,
    value: {
      sessionId: valeur.session_id,
      accounts: comptes.flatMap((compte) => {
        const analyse = analyserCompte(compte);
        return analyse ? [analyse] : [];
      }),
    },
  };
}

/**
 * Transactions **comptabilisées** d'un compte depuis `dateFrom`, toutes pages réunies.
 *
 * Rendues brutes (`unknown[]`) : leur validation appartient aux normalisateurs, qui savent
 * écarter et compter une transaction mal formée sans faire échouer les autres.
 */
export async function fetchTransactions(
  config: BankingConfig,
  accountUid: string,
  dateFrom: string,
  psu: PsuHeaders,
): Promise<ProviderResult<unknown[]>> {
  const enTetes: Record<string, string> = {};
  if (psu.ipAddress) enTetes["Psu-Ip-Address"] = psu.ipAddress;
  if (psu.userAgent) enTetes["Psu-User-Agent"] = psu.userAgent;

  const transactions: unknown[] = [];
  let cle: string | null = null;

  for (let page = 0; page < PAGES_MAX; page += 1) {
    const parametres = new URLSearchParams({ date_from: dateFrom, transaction_status: "BOOK" });
    if (cle) parametres.set("continuation_key", cle);

    const resultat = await appeler(
      config,
      "GET",
      `/accounts/${encodeURIComponent(accountUid)}/transactions?${parametres.toString()}`,
      undefined,
      enTetes,
    );
    if (!resultat.ok) return resultat;
    if (!estObjet(resultat.value) || !Array.isArray(resultat.value.transactions)) {
      return { ok: false, error: "unavailable" };
    }

    transactions.push(...resultat.value.transactions);
    const suivante = resultat.value.continuation_key;
    if (typeof suivante !== "string" || suivante === "") return { ok: true, value: transactions };
    cle = suivante;
  }

  // Pagination interminable : plutôt que de rendre un historique tronqué en silence, on
  // signale l'échec ; la récupération suivante repartira de la même date.
  return { ok: false, error: "unavailable" };
}

// --- Identité d'un compte ---------------------------------------------------------------------

/** IBAN sans espaces, en majuscules : deux écritures d'un même IBAN ont la même empreinte. */
export function normaliserIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/** Empreinte SHA-256 de l'IBAN normalisé. L'IBAN complet n'est conservé nulle part (EF-003). */
export function empreinteIban(iban: string): string {
  return createHash("sha256").update(normaliserIban(iban)).digest("hex");
}

export function suffixeIban(iban: string): string {
  return normaliserIban(iban).slice(-4);
}
