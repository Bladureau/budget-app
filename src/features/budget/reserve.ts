/**
 * Réserve d'épargne : déclarations, durée et part du mois (fonctionnalité 008).
 *
 * Voir specs/008-savings-reserve/contracts/calcul-reserve.md.
 *
 * Ce module est une **feuille** : fonctions pures, sans horloge ni stockage, et sans dépendance
 * vers `expenses.ts`. La cascade qui fait vivre la réserve d'un mois à l'autre a besoin du
 * dépensé du mois et vit donc là-bas (`computeReserveState`) ; la garder hors d'ici évite un
 * import circulaire.
 */

import { compareIso, monthsBetween } from "@/lib/date";
import type { MonthKey } from "@/lib/date";
import type { Cents } from "@/lib/money";
import type { ReserveDeclaration } from "@/features/budget/types";

export const RESERVE_MIN_MONTHS = 1;
export const RESERVE_MAX_MONTHS = 120;

/** Une déclaration d'ouverture : la seule qui porte un solde et une durée. */
export type OpenDeclaration = Extract<ReserveDeclaration, { kind: "open" }>;

/**
 * Dernière déclaration dont le mois d'effet est inférieur ou égal à `month`, ou `null`.
 *
 * Une déclaration postérieure n'influence donc jamais un mois antérieur : c'est ce qui laisse
 * les mois passés intacts après un recalage ou un retrait (FR-021).
 */
export function activeDeclaration(
  reserve: readonly ReserveDeclaration[],
  month: MonthKey,
): ReserveDeclaration | null {
  let applicable: ReserveDeclaration | null = null;
  for (const declaration of reserve) {
    if (compareIso(declaration.fromMonth, month) > 0) break;
    applicable = declaration;
  }
  return applicable;
}

/** Mois sur lesquels la réserve doit encore durer, mois courant compris. Jamais sous 1. */
export function monthsRemaining(declaration: OpenDeclaration, month: MonthKey): number {
  return Math.max(
    RESERVE_MIN_MONTHS,
    declaration.months - monthsBetween(declaration.fromMonth, month),
  );
}

/** La durée déclarée est écoulée : il est temps d'en choisir une nouvelle (FR-023). */
export function horizonReached(declaration: OpenDeclaration, month: MonthKey): boolean {
  return monthsBetween(declaration.fromMonth, month) >= declaration.months;
}

/**
 * Part d'épargne d'un mois.
 *
 * La division est **tronquée au centime inférieur**, et c'est normatif : la somme des parts ne
 * peut ainsi jamais excéder la réserve. Le reste de la division n'est pas redistribué, il n'a
 * simplement jamais quitté la réserve ; au dernier mois, où il ne reste qu'un mois à servir,
 * la part est la réserve entière.
 *
 * Une réserve négative ou nulle n'est pas divisée : toute la dette est imputée au mois
 * (FR-012). `Math.floor` sur un négatif arrondirait d'ailleurs vers le bas, c'est-à-dire
 * gonflerait la dette répartie.
 */
export function shareCents(openingCents: Cents, remaining: number): Cents {
  if (openingCents <= 0) return openingCents;
  return Math.floor(openingCents / remaining);
}

/** Retire la déclaration du mois, s'il y en a une ; les autres sont reprises telles quelles. */
function sansLeMois(reserve: readonly ReserveDeclaration[], month: MonthKey): ReserveDeclaration[] {
  return reserve.filter((declaration) => declaration.fromMonth !== month);
}

function triee(reserve: ReserveDeclaration[]): ReserveDeclaration[] {
  return reserve.sort((a, b) => compareIso(a.fromMonth, b.fromMonth));
}

/**
 * Liste après une déclaration ou un recalage au mois `month`.
 *
 * `openingCents` est la réserve **en début** de ce mois — pas forcément le montant saisi, voir
 * `openingBalanceFor`. Les déclarations des autres mois ne sont jamais touchées.
 */
export function withDeclaration(
  reserve: readonly ReserveDeclaration[],
  month: MonthKey,
  openingCents: Cents,
  months: number,
): ReserveDeclaration[] {
  return triee([
    ...sansLeMois(reserve, month),
    { fromMonth: month, kind: "open", balanceCents: openingCents, months },
  ]);
}

/**
 * Liste après le retrait de la réserve au mois `month`.
 *
 * Sans déclaration antérieure, il n'y a rien à clore : la liste redevient ce qu'elle était
 * avant ce mois, plutôt que de garder un retrait qui ne retire rien.
 */
export function withoutReserve(
  reserve: readonly ReserveDeclaration[],
  month: MonthKey,
): ReserveDeclaration[] {
  const autres = sansLeMois(reserve, month);
  const aUnAntecedent = autres.some((declaration) => compareIso(declaration.fromMonth, month) < 0);
  if (!aUnAntecedent) return autres;
  return triee([...autres, { fromMonth: month, kind: "closed" }]);
}

// --- Saisie -------------------------------------------------------------------------------

export type MonthsError = "empty" | "notAnInteger" | "outOfRange";

export type ParseMonthsResult =
  | { ok: true; months: number }
  | { ok: false; reason: MonthsError };

const ENTIER = /^\d+$/;

/** Analyse la durée saisie : un entier strict, de 1 à 120 mois. */
export function parseMonthsInput(raw: string): ParseMonthsResult {
  const nettoye = raw.trim();
  if (nettoye === "") return { ok: false, reason: "empty" };
  if (!ENTIER.test(nettoye)) return { ok: false, reason: "notAnInteger" };

  const months = Number(nettoye);
  if (months < RESERVE_MIN_MONTHS || months > RESERVE_MAX_MONTHS) {
    return { ok: false, reason: "outOfRange" };
  }
  return { ok: true, months };
}
