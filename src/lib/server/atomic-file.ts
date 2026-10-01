/**
 * Primitives d'écriture sûre d'un fichier JSON sur le serveur.
 *
 * Voir specs/006-bank-sync/plan.md (décision D3). Extraites de `budget-store.ts` au moment où
 * un second magasin en avait besoin (`banking-store.ts`) : dupliquer l'atomicité et la
 * quarantaine aurait été la vraie dette, deux implémentations finissant toujours par diverger.
 *
 * **Ce module ne doit jamais rejoindre le graphe client.** Il touche `node:fs`.
 *
 * Trois garanties :
 *
 *  1. **Atomicité** — fichier temporaire puis `rename`. Une coupure laisse l'ancien fichier
 *     intact, jamais un fichier tronqué.
 *  2. **Sérialisation** — les opérations sur **un même fichier** traversent une chaîne de
 *     promesses. Lire puis écrire forme une section critique. Une chaîne par fichier, et non
 *     une seule globale : une récupération bancaire lente ne doit pas faire attendre
 *     l'enregistrement du budget. Cela suppose une instance unique du serveur, ce qu'un
 *     déploiement auto-hébergé garantit.
 *  3. **Jamais d'écrasement d'un contenu illisible** — il est mis de côté sous un nom distinct.
 */

import { constants } from "node:fs";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const chaines = new Map<string, Promise<unknown>>();

/**
 * Exécute `operation` après toutes celles déjà en file **pour la même clé**, qu'elles aient
 * abouti ou échoué. L'échec de l'une ne doit pas rompre la chaîne des suivantes.
 */
export function enSerie<T>(cle: string, operation: () => Promise<T>): Promise<T> {
  const precedente = chaines.get(cle) ?? Promise.resolve();
  const resultat = precedente.then(operation, operation);
  chaines.set(
    cle,
    resultat.then(
      () => undefined,
      () => undefined,
    ),
  );
  return resultat;
}

export async function existe(chemin: string): Promise<boolean> {
  try {
    await access(chemin, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Écrit `contenu` en JSON indenté, atomiquement. Rend `false` en cas d'échec, sans lever : le
 * fichier de référence est alors intact.
 */
export async function ecrireJsonAtomiquement(chemin: string, contenu: unknown): Promise<boolean> {
  const temporaire = `${chemin}.tmp`;
  try {
    await mkdir(path.dirname(chemin), { recursive: true });
    await writeFile(temporaire, `${JSON.stringify(contenu, null, 2)}\n`, "utf8");
    // `rename` sur le même système de fichiers est atomique : à aucun instant le fichier de
    // référence n'existe à moitié écrit.
    await rename(temporaire, chemin);
    return true;
  } catch {
    return false;
  }
}

/**
 * Les deux-points d'un horodatage ISO sont **interdits dans un nom de fichier Windows**. Les
 * remplacer ici évite un échec de quarantaine au pire moment : celui où l'on tente de sauver
 * un contenu abîmé.
 *
 * `budget.json` → `budget.corrupted-2026-10-01T18-00-00.000Z.json`.
 */
export function cheminQuarantaine(chemin: string, maintenant: Date): string {
  const extension = path.extname(chemin);
  const base = chemin.slice(0, chemin.length - extension.length);
  const horodatage = maintenant.toISOString().replace(/:/g, "-");
  return `${base}.corrupted-${horodatage}${extension}`;
}

/**
 * Met un contenu illisible de côté par un **simple `rename`**.
 *
 * Un déplacement, et non une copie suivie d'un effacement : l'opération est atomique, le
 * contenu ne peut donc jamais exister en double ni disparaître entre les deux étapes. Si elle
 * échoue, le fichier d'origine reste intégralement en place — mieux vaut échouer à chaque
 * lecture que détruire un contenu qu'on ne sait pas relire.
 */
export async function mettreEnQuarantaine(chemin: string): Promise<void> {
  try {
    await rename(chemin, cheminQuarantaine(chemin, new Date()));
  } catch {
    // Volontairement silencieux : voir ci-dessus.
  }
}
