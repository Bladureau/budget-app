/**
 * Onglets de l'application et leur traduction en adresse.
 *
 * L'onglet actif n'est mémorisé nulle part ailleurs que dans l'adresse (`/?onglet=mois`) : c'est
 * elle qui donne l'actualisation, le bouton retour et les liens directs sans code dédié.
 * Voir specs/007-navigation-menu/research.md (R1) et data-model.md.
 */

export type Tab = "today" | "expenses" | "month" | "settings";

export interface TabDefinition {
  tab: Tab;
  /** Valeur du paramètre `onglet`, en français puisqu'elle est visible ; `null` pour l'adresse nue. */
  param: string | null;
  label: string;
}

/** Dans l'ordre du menu. */
export const TABS: readonly TabDefinition[] = [
  { tab: "today", param: null, label: "Aujourd’hui" },
  { tab: "expenses", param: "depenses", label: "Dépenses" },
  { tab: "month", param: "mois", label: "Mois" },
  { tab: "settings", param: "reglages", label: "Réglages" },
];

export const TAB_PARAM = "onglet";

/**
 * Onglet désigné par une chaîne de requête (`location.search`).
 *
 * L'adresse est une frontière de confiance (principe IV) : la valeur est comparée exactement à une
 * liste fermée, jamais transtypée. Absente, vide, inconnue ou de casse différente, elle ramène à
 * « Aujourd'hui », sans erreur (FR-004, FR-016).
 */
export function parseTab(search: string): Tab {
  const valeur = new URLSearchParams(search).get(TAB_PARAM);
  return TABS.find((definition) => definition.param !== null && definition.param === valeur)?.tab ?? "today";
}

/**
 * Adresse d'un onglet, éventuellement complétée de la section à amener à l'écran.
 *
 * Aucun autre paramètre n'est conservé : le seul qui existe, `banking`, doit justement disparaître
 * dès qu'on quitte le message de retour de banque.
 */
export function tabHref(tab: Tab, section?: string): string {
  const param = TABS.find((definition) => definition.tab === tab)?.param ?? null;
  const base = param === null ? "/" : `/?${TAB_PARAM}=${param}`;
  return section ? `${base}#${section}` : base;
}
