/**
 * Formatage des dates et des mois pour l’affichage, en français.
 *
 * Pendant du formatage monétaire de `@/lib/money` : un seul point de formatage par type,
 * pour que la présentation reste cohérente partout.
 */

import type { IsoDate, MonthKey } from "@/lib/date";

const formateurMois = new Intl.DateTimeFormat("fr-FR", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * Les dates du domaine sont des dates calendaires sans fuseau. On les interprète en UTC
 * pour le seul formatage, afin qu’aucun décalage horaire ne décale l’affichage d’un jour.
 */
function versDateUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** `2026-03-15` → `15/03/2026`. */
export function formatIsoDateFr(date: IsoDate | undefined): string {
  if (!date) return "";
  return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
}

/** `2026-03` → `mars 2026`. */
export function formatMonthFr(month: MonthKey): string {
  return formateurMois.format(versDateUtc(`${month}-01`));
}

/** Formatage d’un taux : `0.6042` → `60,4 %`. */
export function formatRateFr(rate: number): string {
  return `${(rate * 100).toFixed(1).replace(".", ",")} %`;
}
