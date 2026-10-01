/**
 * Stockage central du budget, sur le système de fichiers du serveur.
 *
 * Voir specs/005-server-side-storage/data-model.md (§1) et contracts/api-budget.md.
 *
 * **Ce module ne doit jamais rejoindre le graphe client.** Il touche `node:fs` et vit sous
 * `src/lib/server/`, dont le nom porte précisément cet invariant.
 *
 * Trois garanties structurent le fichier :
 *
 *  1. **Atomicité** — l'écriture passe par un fichier temporaire puis un `rename`. Une
 *     coupure laisse l'ancien fichier intact, jamais un fichier tronqué.
 *  2. **Sérialisation** — les écritures traversent une chaîne de promesses. Lire la révision
 *     puis écrire forme une section critique ; deux requêtes simultanées ne peuvent pas
 *     s'y entrelacer. Cela suppose une instance unique du serveur, ce qu'un déploiement
 *     auto-hébergé garantit.
 *  3. **Jamais d'écrasement d'un contenu illisible** — il est mis de côté sous un nom
 *     distinct, exactement comme `storage.ts` le fait déjà dans le navigateur.
 *
 * Le document est enveloppé dans un **conteneur** portant la révision. Le terme « enveloppe »
 * est délibérément évité : il désigne déjà une entité du domaine — un plafond par catégorie
 * et par mois — et le réemployer ici pour un conteneur technique prêterait à confusion.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  ecrireJsonAtomiquement,
  enSerie,
  existe,
  mettreEnQuarantaine,
} from "@/lib/server/atomic-file";
import { parseDocument } from "@/lib/budget-document";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

/** Contenu du fichier central. Le document y porte son propre `version` (EF-006). */
export interface StoredBudget {
  /** Entier >= 1, incrémenté à chaque écriture acceptée. Jamais réutilisé, jamais décrémenté. */
  revision: number;
  /** Horodatage ISO 8601 de la dernière écriture. Informatif : jamais utilisé pour arbitrer. */
  updatedAt: string;
  document: BudgetDocument;
}

/**
 * `unreadable` : le contenu a été mis en quarantaine, la lecture suivante repartira à vide.
 * `futureVersion` : le fichier est **laissé strictement en place**, pas même déplacé — il a
 * été écrit par une version plus récente de l'application, et le mettre de côté le
 * soustrairait à celle qui sait le lire (EF-007, EF-016).
 */
export type ReadFailure = "unreadable" | "futureVersion";

export type ReadOutcome =
  | { ok: true; revision: number; updatedAt: string | null; document: BudgetDocument }
  | { ok: false; reason: ReadFailure };

export type WriteOutcome =
  | { ok: true; revision: number; updatedAt: string }
  | {
      ok: false;
      reason: "conflict";
      revision: number;
      updatedAt: string | null;
      document: BudgetDocument;
    }
  | { ok: false; reason: "invalidDocument" | "writeFailed" | ReadFailure };

// --- Emplacement ------------------------------------------------------------------------

/**
 * Lu à chaque appel, et non figé au chargement du module : les tests changent
 * `BUDGET_DATA_DIR` d'un cas à l'autre, et une constante de module les rendrait dépendants
 * de leur ordre d'exécution.
 */
function repertoire(): string {
  const configure = process.env.BUDGET_DATA_DIR;
  return configure && configure.trim() !== "" ? configure : "./data";
}

function cheminBudget(): string {
  return path.join(repertoire(), "budget.json");
}

// Les primitives d'atomicité, de sérialisation et de quarantaine vivent dans
// `atomic-file.ts`, partagé avec le magasin bancaire (fonctionnalité 006, décision D3).
const CLE_SERIE = "budget";

// --- Lecture -----------------------------------------------------------------------------

/** Valide le conteneur lui-même, pas seulement le document qu'il porte (principe IV). */
function parseConteneur(
  brut: unknown,
): { ok: true; value: StoredBudget } | { ok: false; reason: ReadFailure } {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    return { ok: false, reason: "unreadable" };
  }

  const valeur = brut as Record<string, unknown>;

  if (
    typeof valeur.revision !== "number" ||
    !Number.isInteger(valeur.revision) ||
    valeur.revision < 1
  ) {
    return { ok: false, reason: "unreadable" };
  }

  if (typeof valeur.updatedAt !== "string" || Number.isNaN(Date.parse(valeur.updatedAt))) {
    return { ok: false, reason: "unreadable" };
  }

  const document = parseDocument(valeur.document);
  if (!document.ok) {
    // Un document écrit par une version plus récente n'est pas « abîmé » : il est
    // simplement au-delà de ce que cette version sait lire. Le distinguer est ce qui
    // permet de ne pas le déplacer.
    return { ok: false, reason: document.reason === "futureVersion" ? "futureVersion" : "unreadable" };
  }

  return {
    ok: true,
    value: { revision: valeur.revision, updatedAt: valeur.updatedAt, document: document.value },
  };
}

/**
 * Lit l'état central. **N'écrit jamais**, hormis la mise en quarantaine d'un contenu
 * illisible — qui est une préservation, pas une écriture du budget.
 *
 * Un fichier absent n'est pas une erreur : c'est un budget neuf, rendu à la révision `0`.
 */
export async function readBudget(): Promise<ReadOutcome> {
  const chemin = cheminBudget();

  if (!(await existe(chemin))) {
    return { ok: true, revision: 0, updatedAt: null, document: emptyDocument() };
  }

  let brut: string;
  try {
    brut = await readFile(chemin, "utf8");
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  if (brut.trim() === "") {
    return { ok: true, revision: 0, updatedAt: null, document: emptyDocument() };
  }

  let analyse: unknown;
  try {
    analyse = JSON.parse(brut);
  } catch {
    await mettreEnQuarantaine(cheminBudget());
    return { ok: false, reason: "unreadable" };
  }

  const conteneur = parseConteneur(analyse);
  if (!conteneur.ok) {
    // Le fichier d'une version postérieure reste strictement en place.
    if (conteneur.reason === "unreadable") await mettreEnQuarantaine(cheminBudget());
    return { ok: false, reason: conteneur.reason };
  }

  return {
    ok: true,
    revision: conteneur.value.revision,
    updatedAt: conteneur.value.updatedAt,
    document: conteneur.value.document,
  };
}

// --- Écriture -----------------------------------------------------------------------------

/**
 * Remplace l'état central si `baseRevision` correspond encore à la révision courante.
 *
 * Il n'existe **aucun moyen de forcer** : pour imposer ses modifications après un conflit,
 * l'appelant relit et rejoue son écriture avec la révision courante. Le choix reste ainsi un
 * acte délibéré, et rien ne peut écraser un état qu'on n'a pas vu (EF-024, EF-025).
 */
export function writeBudget(
  document: unknown,
  baseRevision: number,
): Promise<WriteOutcome> {
  return enSerie(CLE_SERIE, async () => {
    // Revalidation avant écriture : seul le résultat de l'analyseur est persisté, jamais le
    // corps reçu tel quel — même règle que `saveDocument()` dans le navigateur.
    const controle = parseDocument(document);
    if (!controle.ok) return { ok: false, reason: "invalidDocument" } as const;

    const courant = await readBudget();
    if (!courant.ok) return { ok: false, reason: courant.reason } as const;

    if (courant.revision !== baseRevision) {
      return {
        ok: false,
        reason: "conflict",
        revision: courant.revision,
        updatedAt: courant.updatedAt,
        document: courant.document,
      } as const;
    }

    const conteneur: StoredBudget = {
      revision: courant.revision + 1,
      updatedAt: new Date().toISOString(),
      document: controle.value,
    };

    if (!(await ecrireJsonAtomiquement(cheminBudget(), conteneur))) {
      return { ok: false, reason: "writeFailed" } as const;
    }

    return { ok: true, revision: conteneur.revision, updatedAt: conteneur.updatedAt } as const;
  });
}
