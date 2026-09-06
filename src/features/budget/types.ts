/**
 * Types du domaine budgétaire. Voir specs/002-income-subscriptions-budget/data-model.md.
 *
 * Tous les montants sont des `Cents` (entiers), toutes les dates des `IsoDate`
 * (`AAAA-MM-JJ`), tous les mois des `MonthKey` (`AAAA-MM`).
 */

import type { IsoDate, MonthKey } from "@/lib/date";
import type { Cents } from "@/lib/money";

export type { IsoDate, MonthKey } from "@/lib/date";
export type { Cents } from "@/lib/money";

/** Identifiant opaque, immuable, généré à la création. */
export type Id = string;

/**
 * Périodicités prises en charge (EF-007). `semiannual` est préféré à `biannual`, ambigu en
 * anglais entre « deux fois par an » et « tous les deux ans ».
 */
export type Periodicity = "monthly" | "quarterly" | "semiannual" | "annual";

/** Nombre de mois entre deux échéances, par périodicité. */
export const MONTHS_PER_PERIOD: Readonly<Record<Periodicity, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export const PERIODICITY_LABELS: Readonly<Record<Periodicity, string>> = {
  monthly: "Mensuelle",
  quarterly: "Trimestrielle",
  semiannual: "Semestrielle",
  annual: "Annuelle",
};

// --- Revenus -------------------------------------------------------------------------

export type IncomeKind = "oneOff" | "recurring";

/** Revenu ponctuel : rattaché au mois de sa date. */
export interface OneOffIncome {
  id: Id;
  label: string;
  amountCents: Cents;
  kind: "oneOff";
  date: IsoDate;
}

/** Revenu récurrent : produit une occurrence par échéance entre début et fin incluses. */
export interface RecurringIncome {
  id: Id;
  label: string;
  amountCents: Cents;
  kind: "recurring";
  periodicity: Periodicity;
  startDate: IsoDate;
  endDate: IsoDate | null;
}

export type Income = OneOffIncome | RecurringIncome;

// --- Abonnements ---------------------------------------------------------------------

/** Montant applicable à partir d’une date (EF-010). Historique, jamais écrasé. */
export interface AmountPeriod {
  amountCents: Cents;
  effectiveFrom: IsoDate;
}

/** Période de suspension (EF-011). `to` à `null` = suspension sans terme. */
export interface PausePeriod {
  from: IsoDate;
  to: IsoDate | null;
}

export interface Subscription {
  id: Id;
  label: string;
  periodicity: Periodicity;
  /** Fixe aussi le quantième de prélèvement. */
  startDate: IsoDate;
  /** Date de résiliation incluse. */
  endDate: IsoDate | null;
  /** Trié par `effectiveFrom` croissant, au moins un élément. */
  amounts: AmountPeriod[];
  /** Périodes disjointes. */
  pauses: PausePeriod[];
}

// --- Document persisté ---------------------------------------------------------------

export const DOCUMENT_VERSION = 1;

export interface BudgetDocument {
  version: number;
  incomes: Income[];
  subscriptions: Subscription[];
}

export function emptyDocument(): BudgetDocument {
  return { version: DOCUMENT_VERSION, incomes: [], subscriptions: [] };
}

// --- Entités dérivées (jamais persistées) --------------------------------------------

export type BudgetStatus = "surplus" | "balanced" | "deficit";

/** Une ligne de la ventilation des charges d’un mois (EF-017). */
export interface ChargeLine {
  subscriptionId: Id;
  label: string;
  amountCents: Cents;
  dueDate: IsoDate;
}

export interface MonthlyBudget {
  month: MonthKey;
  totalIncomeCents: Cents;
  totalChargesCents: Cents;
  remainingCents: Cents;
  /** `null` si les revenus sont nuls : jamais de division par zéro (EF-018). */
  commitmentRate: number | null;
  status: BudgetStatus;
  breakdown: ChargeLine[];
  isProjection: boolean;
}

/** Une échéance à venir (EF-024). */
export interface UpcomingDue {
  subscriptionId: Id;
  label: string;
  amountCents: Cents;
  dueDate: IsoDate;
}
