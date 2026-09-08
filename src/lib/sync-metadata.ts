/**
 * Métadonnées de synchronisation, côté navigateur.
 *
 * Voir specs/005-server-side-storage/data-model.md (§2) et contracts/synchronisation.md.
 *
 * Deux valeurs seulement : la révision serveur dont dérive la copie locale, et un drapeau
 * disant si cette copie porte des modifications que le serveur n'a pas encore acceptées.
 *
 * **Pourquoi une clé distincte de celle du budget (décision D5).** Si ces deux valeurs
 * vivaient dans le document budgétaire, un contenu de synchronisation abîmé déclencherait la
 * mise en quarantaine du budget entier — une perte de données provoquée par la corruption
 * d'un entier et d'un booléen. Les deux contenus ont des conséquences d'échec sans commune
 * mesure ; ils sont donc stockés séparément et échouent indépendamment.
 */

export const SYNC_METADATA_KEY = "budget-app:sync:v1";

export interface SyncMetadata {
  /** Révision serveur dont dérive la copie locale. `0` = jamais synchronisé. */
  baseRevision: number;
  /**
   * Vrai si la copie locale porte des modifications non encore acceptées par le serveur.
   * C'est ce drapeau, et non un journal d'opérations, qui porte l'état « en attente » (D1).
   */
  pendingChanges: boolean;
}

/**
 * Valeurs de repli, appliquées dès qu'une lecture ne rend pas exactement la forme attendue.
 *
 * Elles ne sont pas arbitraires : **les deux échouent du côté prudent.**
 *  - `baseRevision = 0` force l'application à se croire jamais synchronisée. Sa prochaine
 *    écriture entrera donc en conflit plutôt que d'écraser un état plus récent.
 *  - `pendingChanges = true` force une poussée qui se révélera peut-être inutile. Le coût
 *    d'une poussée superflue est une requête ; celui de l'oubli inverse est une dépense
 *    perdue.
 */
export function defaultSyncMetadata(): SyncMetadata {
  return { baseRevision: 0, pendingChanges: true };
}

function stockageDisponible(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Navigation privée ou stockage désactivé : l'accès lui-même peut lever.
    return null;
  }
}

/**
 * Analyse depuis `unknown` (principe IV). Une forme partiellement valide est refusée en
 * bloc : accepter `baseRevision` en ignorant un `pendingChanges` corrompu produirait une
 * combinaison que rien n'a jamais écrite.
 */
export function parseSyncMetadata(brut: unknown): SyncMetadata | null {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) return null;

  const valeur = brut as Record<string, unknown>;
  const revision = valeur.baseRevision;
  const enAttente = valeur.pendingChanges;

  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0) return null;
  if (typeof enAttente !== "boolean") return null;

  return { baseRevision: revision, pendingChanges: enAttente };
}

/** Ne lève jamais : une métadonnée illisible rend le repli prudent, pas une erreur. */
export function readSyncMetadata(): SyncMetadata {
  const stockage = stockageDisponible();
  if (!stockage) return defaultSyncMetadata();

  const brut = stockage.getItem(SYNC_METADATA_KEY);
  if (brut === null || brut.trim() === "") return defaultSyncMetadata();

  let analyse: unknown;
  try {
    analyse = JSON.parse(brut);
  } catch {
    return defaultSyncMetadata();
  }

  return parseSyncMetadata(analyse) ?? defaultSyncMetadata();
}

/**
 * Renvoie `false` si l'écriture a échoué. L'appelant n'a **rien à réparer** : un échec laisse
 * les métadonnées telles qu'elles étaient, et la lecture suivante appliquera le repli prudent,
 * qui provoque au pire une poussée inutile.
 */
export function writeSyncMetadata(metadata: SyncMetadata): boolean {
  const stockage = stockageDisponible();
  if (!stockage) return false;

  try {
    stockage.setItem(SYNC_METADATA_KEY, JSON.stringify(metadata));
    return true;
  } catch {
    return false;
  }
}

/** Efface les métadonnées. Utilisé par les tests ; la lecture suivante repart du repli. */
export function clearSyncMetadata(): void {
  const stockage = stockageDisponible();
  if (!stockage) return;
  try {
    stockage.removeItem(SYNC_METADATA_KEY);
  } catch {
    // Sans conséquence : la lecture suivante appliquera de toute façon le repli prudent.
  }
}
