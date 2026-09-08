/**
 * Persistance du document budgétaire dans le navigateur.
 *
 * Voir specs/002-income-subscriptions-budget/contracts/stockage.md et, pour la bascule vers
 * un stockage central, specs/005-server-side-storage/plan.md.
 *
 * Deux règles gouvernent ce module :
 *  - Principe IV : `localStorage` est une frontière de confiance. Tout ce qui en sort part
 *    d'`unknown` et passe par un analyseur ; aucun transtypage.
 *  - Constitution, contraintes de données : la perte de données n’est jamais acceptable. Un
 *    document illisible n’est PAS écrasé, il est mis en quarantaine sous une clé distincte.
 *
 * Depuis la fonctionnalité 005, l'analyseur lui-même vit dans `@/lib/budget-document` : le
 * stockage central en a besoin à l'identique, et deux analyseurs auraient divergé. Ce module
 * ne conserve donc que ce qui touche réellement au navigateur, et réexporte l'analyseur pour
 * que ses appelants historiques n'aient pas à changer d'import.
 *
 * `localStorage` n'est plus la seule copie du budget, mais il reste la **copie de travail** :
 * il est lu et écrit immédiatement, sans attendre le réseau. C'est ce qui permet à
 * l'application de rester utilisable hors connexion, comme l'exige le principe I.
 */

import { parseDocument } from "@/lib/budget-document";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

export { parseDocument } from "@/lib/budget-document";
export type { ParseFailure, ParseResult } from "@/lib/budget-document";

export const STORAGE_KEY = "budget-app:v1";
export const CORRUPTED_KEY_PREFIX = "budget-app:corrupted:";

export type SaveResult = { ok: true } | { ok: false; reason: "invalidData" | "writeFailed" };

export interface LoadResult {
  document: BudgetDocument;
  /** Vrai si un contenu illisible a été écarté et conservé sous une clé de quarantaine. */
  quarantined: boolean;
}

// --- Accès au stockage ------------------------------------------------------------------

function stockageDisponible(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Navigation privée ou stockage désactivé : l’accès lui-même peut lever.
    return null;
  }
}

function mettreEnQuarantaine(stockage: Storage, brut: string): void {
  try {
    stockage.setItem(`${CORRUPTED_KEY_PREFIX}${new Date().toISOString()}`, brut);
    stockage.removeItem(STORAGE_KEY);
  } catch {
    // Si la quarantaine échoue faute de place, on laisse le document d’origine en place :
    // mieux vaut redémarrer à vide à chaque ouverture que détruire des données.
  }
}

export function loadDocument(): LoadResult {
  const stockage = stockageDisponible();
  if (!stockage) return { document: emptyDocument(), quarantined: false };

  const brut = stockage.getItem(STORAGE_KEY);
  if (brut === null || brut.trim() === "") {
    return { document: emptyDocument(), quarantined: false };
  }

  let analyse: unknown;
  try {
    analyse = JSON.parse(brut);
  } catch {
    mettreEnQuarantaine(stockage, brut);
    return { document: emptyDocument(), quarantined: true };
  }

  const resultat = parseDocument(analyse);
  if (!resultat.ok) {
    mettreEnQuarantaine(stockage, brut);
    return { document: emptyDocument(), quarantined: true };
  }

  return { document: resultat.value, quarantined: false };
}

export function saveDocument(document: BudgetDocument): SaveResult {
  // Revalidation avant écriture : un document invalide n’est jamais persisté.
  const controle = parseDocument(document);
  if (!controle.ok) return { ok: false, reason: "invalidData" };

  const stockage = stockageDisponible();
  if (!stockage) return { ok: false, reason: "writeFailed" };

  try {
    stockage.setItem(STORAGE_KEY, JSON.stringify(controle.value));
    return { ok: true };
  } catch {
    // Quota dépassé ou stockage indisponible : l’échec remonte, il n’est jamais silencieux.
    return { ok: false, reason: "writeFailed" };
  }
}

/**
 * Identifiant opaque pour une nouvelle entité.
 *
 * **`crypto.randomUUID()` n'existe que dans un contexte sécurisé** — HTTPS, ou `localhost`.
 * Or la fonctionnalité 005 fait précisément ouvrir l'application depuis un autre appareil, à
 * une adresse du type `http://10.0.0.4:3000`, qui n'en est pas un : la fonction y vaut
 * `undefined` et la première saisie échouerait.
 *
 * `crypto.getRandomValues()`, lui, reste disponible hors contexte sécurisé. Le repli produit
 * donc un UUID v4 de même qualité aléatoire, et non un identifiant dégradé.
 */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);

  // Version 4 et variante RFC 4122, comme le ferait `randomUUID`.
  octets[6] = (octets[6] & 0x0f) | 0x40;
  octets[8] = (octets[8] & 0x3f) | 0x80;

  const hex = Array.from(octets, (o) => o.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
