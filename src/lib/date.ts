/**
 * Dates calendaires locales, sans heure ni fuseau.
 *
 * Travailler sur des chaînes `AAAA-MM-JJ` plutôt que sur des objets `Date` neutralise le
 * changement d’heure saisonnier et les décalages de fuseau : une journée budgétaire est une
 * case du calendrier, pas un intervalle de 24 heures.
 */

/** Date calendaire au format `AAAA-MM-JJ`. */
export type IsoDate = string;

/** Mois au format `AAAA-MM`. L’ordre lexicographique y est l’ordre chronologique. */
export type MonthKey = string;

const FORMAT_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMAT_MOIS = /^(\d{4})-(\d{2})$/;

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

function joursDansMois(annee: number, mois: number): number {
  if (mois === 2) return estBissextile(annee) ? 29 : 28;
  return [4, 6, 9, 11].includes(mois) ? 30 : 31;
}

function deuxChiffres(valeur: number): string {
  return String(valeur).padStart(2, "0");
}

/** Vérifie la syntaxe ET la validité calendaire : le 31 février est refusé. */
export function isValidIsoDate(value: string): boolean {
  const correspondance = FORMAT_DATE.exec(value);
  if (!correspondance) return false;
  const annee = Number(correspondance[1]);
  const mois = Number(correspondance[2]);
  const jour = Number(correspondance[3]);
  if (mois < 1 || mois > 12) return false;
  return jour >= 1 && jour <= joursDansMois(annee, mois);
}

export function isValidMonthKey(value: string): boolean {
  const correspondance = FORMAT_MOIS.exec(value);
  if (!correspondance) return false;
  const mois = Number(correspondance[2]);
  return mois >= 1 && mois <= 12;
}

export function monthKeyOf(date: IsoDate): MonthKey {
  return date.slice(0, 7);
}

export function dayOfMonth(date: IsoDate): number {
  return Number(date.slice(8, 10));
}

export function daysInMonth(month: MonthKey): number {
  return joursDansMois(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
}

export function startOfMonth(month: MonthKey): IsoDate {
  return `${month}-01`;
}

export function endOfMonth(month: MonthKey): IsoDate {
  return `${month}-${deuxChiffres(daysInMonth(month))}`;
}

/**
 * Ajoute des mois en rabattant sur le dernier jour du mois cible lorsque le quantième
 * d’origine n’y existe pas (EF-013).
 *
 * Le rabattement part toujours du quantième d’ORIGINE, jamais du résultat précédent : un
 * abonnement au 31 janvier produit le 28 février puis le 31 mars, et non le 28 mars. C’est
 * la dérive que ce calcul évite.
 */
export function addMonthsClamped(date: IsoDate, months: number): IsoDate {
  const annee = Number(date.slice(0, 4));
  const mois = Number(date.slice(5, 7));
  const jour = dayOfMonth(date);

  const indexMois = annee * 12 + (mois - 1) + months;
  const anneeCible = Math.floor(indexMois / 12);
  const moisCible = (indexMois % 12) + 1;

  const jourCible = Math.min(jour, joursDansMois(anneeCible, moisCible));
  return `${anneeCible}-${deuxChiffres(moisCible)}-${deuxChiffres(jourCible)}`;
}

/** Décale un mois. */
export function addMonthsToKey(month: MonthKey, months: number): MonthKey {
  return monthKeyOf(addMonthsClamped(startOfMonth(month), months));
}

/** Nombre de mois de `from` à `to` ; négatif si `to` précède `from`. Arithmétique entière. */
export function monthsBetween(from: MonthKey, to: MonthKey): number {
  const index = (mois: MonthKey) => Number(mois.slice(0, 4)) * 12 + Number(mois.slice(5, 7));
  return index(to) - index(from);
}

/** Comparaison chronologique, qui coïncide avec l’ordre lexicographique de ce format. */
export function compareIso(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
