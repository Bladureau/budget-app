/**
 * Protocole de synchronisation avec le stockage central, côté navigateur.
 *
 * Voir specs/005-server-side-storage/contracts/synchronisation.md.
 *
 * Ces deux fonctions sont **pures vis-à-vis du stockage** : elles parlent au réseau et rendent
 * un résultat. Décider quoi écrire revient au fournisseur. C'est la même séparation que celle
 * déjà pratiquée entre `prepareImport()` et `confirmImport()` — un analyseur qui n'écrit pas,
 * un appelant qui décide — et c'est ce qui les rend testables sans simuler `localStorage`.
 *
 * **La réponse du serveur est une frontière de confiance** au même titre que `localStorage`
 * (principe IV). Un intermédiaire réseau, un portail captif ou une version dépareillée du
 * serveur peuvent rendre `200` avec n'importe quoi : tout corps part donc d'`unknown` et passe
 * par l'analyseur partagé.
 */

import { parseDocument } from "@/lib/budget-document";
import type { BudgetDocument } from "@/features/budget/types";

const ENDPOINT = "/api/budget";

/**
 * Motif technique renvoyé par le serveur avec un `500`.
 *
 * Transporté tel quel jusqu'au fournisseur parce que ces cas appellent des gestes
 * **différents** de la part de l'utilisateur : un contenu mis de côté n'est pas un fichier
 * plus récent que l'application, qui n'est pas un disque plein. Les réduire tous les trois à
 * « erreur serveur » lui cacherait lequel s'applique.
 */
export type ServerCode = "storageUnreadable" | "storageFutureVersion" | "writeFailed";

export type FetchOutcome =
  | { ok: true; revision: number; updatedAt: string | null; document: BudgetDocument }
  | {
      ok: false;
      reason: "offline" | "unauthorized" | "invalidResponse" | "serverError";
      serverCode?: ServerCode;
    };

export type PushOutcome =
  | { ok: true; revision: number; updatedAt: string }
  | {
      ok: false;
      reason: "offline" | "unauthorized" | "rejected" | "serverError";
      serverCode?: ServerCode;
    }
  | { ok: false; reason: "conflict"; revision: number; document: BudgetDocument };

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function revisionValide(valeur: unknown): valeur is number {
  return typeof valeur === "number" && Number.isInteger(valeur) && valeur >= 0;
}

/** `null` est accepté : c'est ce que rend le serveur quand aucun budget n'a jamais été écrit. */
function horodatageValide(valeur: unknown): valeur is string | null {
  return valeur === null || (typeof valeur === "string" && !Number.isNaN(Date.parse(valeur)));
}

async function corpsJson(reponse: Response): Promise<unknown | undefined> {
  try {
    return (await reponse.json()) as unknown;
  } catch {
    return undefined;
  }
}

const CODES_SERVEUR: readonly string[] = [
  "storageUnreadable",
  "storageFutureVersion",
  "writeFailed",
];

/** Extrait le motif d'un `500`, s'il en porte un que nous connaissons. */
async function codeServeur(reponse: Response): Promise<ServerCode | undefined> {
  const corps = await corpsJson(reponse);
  if (!estObjet(corps)) return undefined;
  const code = corps.error;
  return typeof code === "string" && CODES_SERVEUR.includes(code)
    ? (code as ServerCode)
    : undefined;
}

/**
 * Lit l'état central. Ne touche jamais au stockage local.
 *
 * `credentials: "same-origin"` est explicite plutôt que laissé au défaut : le cookie d'accès
 * est `httpOnly`, et sans lui la requête serait refusée sans que la cause soit évidente.
 */
export async function fetchRemote(): Promise<FetchOutcome> {
  let reponse: Response;
  try {
    reponse = await fetch(ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      // Le budget change ; un cache intermédiaire servirait une révision périmée et ferait
      // croire à un conflit inexistant.
      cache: "no-store",
    });
  } catch {
    // `fetch` ne lève que si la requête n'a pas abouti : réseau coupé, serveur éteint.
    return { ok: false, reason: "offline" };
  }

  if (reponse.status === 401) return { ok: false, reason: "unauthorized" };
  if (reponse.status !== 200) {
    return { ok: false, reason: "serverError", serverCode: await codeServeur(reponse) };
  }

  const corps = await corpsJson(reponse);
  if (!estObjet(corps)) return { ok: false, reason: "invalidResponse" };
  if (!revisionValide(corps.revision)) return { ok: false, reason: "invalidResponse" };
  if (!horodatageValide(corps.updatedAt)) return { ok: false, reason: "invalidResponse" };

  const document = parseDocument(corps.document);
  if (!document.ok) return { ok: false, reason: "invalidResponse" };

  return {
    ok: true,
    revision: corps.revision,
    updatedAt: corps.updatedAt,
    document: document.value,
  };
}

/**
 * Pousse le document local. Ne touche jamais au stockage local.
 *
 * Il n'existe aucun moyen de forcer : après un conflit, l'appelant rejoue en se fondant sur la
 * révision courante, ce qui fait du choix un acte délibéré (EF-025).
 */
export async function pushLocal(
  document: BudgetDocument,
  baseRevision: number,
): Promise<PushOutcome> {
  let reponse: Response;
  try {
    reponse = await fetch(ENDPOINT, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseRevision, document }),
    });
  } catch {
    return { ok: false, reason: "offline" };
  }

  if (reponse.status === 401) return { ok: false, reason: "unauthorized" };
  if (reponse.status === 400) return { ok: false, reason: "rejected" };

  if (reponse.status === 409) {
    const corps = await corpsJson(reponse);
    if (!estObjet(corps) || !revisionValide(corps.revision)) {
      return { ok: false, reason: "serverError" };
    }
    const courant = parseDocument(corps.document);
    if (!courant.ok) return { ok: false, reason: "serverError" };

    return { ok: false, reason: "conflict", revision: corps.revision, document: courant.value };
  }

  if (reponse.status !== 200) {
    return { ok: false, reason: "serverError", serverCode: await codeServeur(reponse) };
  }

  const corps = await corpsJson(reponse);
  if (!estObjet(corps) || !revisionValide(corps.revision) || typeof corps.updatedAt !== "string") {
    // L'écriture a peut-être abouti, mais la révision est inconnue. Rendre un échec laisse
    // le drapeau « en attente » levé : la poussée suivante, idempotente, rattrapera. Rendre
    // un succès, lui, marquerait synchronisé un état dont on ignore la révision.
    return { ok: false, reason: "serverError" };
  }

  return { ok: true, revision: corps.revision, updatedAt: corps.updatedAt };
}
