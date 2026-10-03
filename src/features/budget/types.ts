/**
 * Types du domaine budgétaire. Voir specs/002-income-subscriptions-budget/data-model.md.
 *
 * Tous les montants sont des `Cents` (entiers), toutes les dates des `IsoDate`
 * (`AAAA-MM-JJ`), tous les mois des `MonthKey` (`AAAA-MM`).
 */

import type { IsoDate, MonthKey } from "@/lib/date";
import type { Cents } from "@/lib/money";
import { initialCategoryRules, initialTreatmentRules } from "@/features/banking/initial-rules";

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

// --- Dépenses -------------------------------------------------------------------------

/**
 * Une sortie d'argent saisie par l'utilisateur (fonctionnalité 003).
 *
 * Aucun champ `type` : cette entité ne représente que des dépenses. Les revenus restent
 * l'affaire de la fonctionnalité 002 et les virements sont hors périmètre — ajouter un
 * discriminant aujourd'hui serait de la généralité spéculative (principe VI).
 */
export interface Expense {
  id: Id;
  amountCents: Cents;
  date: IsoDate;
  /** Facultatif : un libellé par défaut est affiché, jamais stocké. */
  label?: string;
  /** Facultative, pour ne pas ralentir la saisie. */
  category: string | null;
  /**
   * Banque d'origine d'une dépense importée (fonctionnalité 006). **Absent = saisie
   * manuelle** : aucune valeur `"manual"` n'est stockée, ce qui laisse les dépenses
   * antérieures valides sans migration.
   */
  source?: BankSource;
  /** Référence de l'opération bancaire d'origine. Présente si et seulement si `source` l'est. */
  bankRef?: string;
}

// --- Synchronisation bancaire (fonctionnalité 006) ------------------------------------------
//
// Voir specs/006-bank-sync/data-model.md (§1). Ces types vivent ici, et non dans
// `features/banking`, parce qu'ils font partie du document persisté : l'analyseur du document
// doit les connaître sans dépendre du domaine bancaire.

export type BankSource = "lcl" | "revolut";

/**
 * Un remboursement vient en **déduction** des dépenses. Le sens est porté par la collection,
 * jamais par le signe : le montant reste strictement positif, comme partout ailleurs (R9).
 */
export interface Refund {
  id: Id;
  amountCents: Cents;
  date: IsoDate;
  label?: string;
  category: string | null;
  source: BankSource;
  bankRef: string;
}

export type LedgerOutcome = "expense" | "refund" | "ignored" | "inbox";

/** Sort d'une opération bancaire. Une référence inscrite ici n'est jamais retraitée (R2). */
export interface LedgerEntry {
  ref: string;
  outcome: LedgerOutcome;
  /** Règle qui a tranché. Sert à expliquer le sort, jamais à le recalculer. */
  reason: string;
  /** Arrondis Revolut fusionnés dans cette opération, eux aussi réputés traités. */
  mergedRefs?: string[];
}

export type BankOperationKind =
  | "card"
  | "cardRefund"
  | "transferOut"
  | "transferIn"
  | "directDebit"
  | "bankFee"
  | "topUp"
  | "roundUp"
  | "other";

export type InboxReason =
  | "noRule"
  | "possibleSubscription"
  | "ambiguousRoundUp"
  | "foreignCurrency"
  | "unreadableDate";

/** Instantané d'une opération « À classer », consultable sans le serveur. */
export interface InboxItem {
  ref: string;
  bank: BankSource;
  date: IsoDate;
  amountCents: Cents;
  direction: "debit" | "credit";
  kind: BankOperationKind;
  label: string;
  rawLabel: string;
  why: InboxReason;
}

export type TreatmentAction =
  | { type: "ignore" }
  | { type: "expense" }
  | { type: "subscription"; subscriptionId: Id };

export interface TreatmentRule {
  id: Id;
  /** `null` : les deux banques. */
  bank: BankSource | null;
  contains: string;
  action: TreatmentAction;
}

export interface CategoryRule {
  id: Id;
  contains: string;
  category: string;
}

export interface BankingState {
  /** Date de début d'import (R12). `null` tant qu'aucune banque n'a été reliée. */
  importFrom: IsoDate | null;
  ledger: LedgerEntry[];
  inbox: InboxItem[];
  /** Évaluées dans l'ordre : la première qui correspond l'emporte. */
  rules: TreatmentRule[];
  categoryRules: CategoryRule[];
}

// --- Enveloppes budgétaires ------------------------------------------------------------

/**
 * Un plafond de dépense pour une catégorie sur un mois (fonctionnalité 001).
 *
 * `category` est le **texte** de la catégorie, identique à celui porté par les dépenses : il
 * n'existe pas d'identifiant de catégorie, celle-ci étant une chaîne libre depuis la
 * fonctionnalité 003. Renommer la catégorie d'une dépense la détache donc de son enveloppe —
 * conséquence assumée (décision D3 du plan).
 */
export interface Envelope {
  id: Id;
  category: string;
  month: MonthKey;
  /**
   * Entier `>= 0`. **Zéro est valide** et signifie « ne rien dépenser ici » : c'est la seule
   * exception du projet à la règle du montant strictement positif, et elle est délibérée.
   * L'absence d'intention se traduit par l'absence d'enveloppe, pas par un plafond nul.
   */
  limitCents: Cents;
}

// --- Réserve d'épargne (fonctionnalité 008) ----------------------------------------------

/**
 * Une déclaration de la réserve d'épargne, datée du mois où elle prend effet.
 *
 * Seules les déclarations sont enregistrées : la réserve d'un mois se **recalcule** par une
 * cascade partant de la dernière déclaration qui le précède (specs/008-savings-reserve,
 * décision R1). Aucun solde mensuel n'est stocké — il serait faux à la première correction
 * d'une dépense passée.
 *
 * C'est une liste et non une valeur unique (R2) : recaler ou retirer **ajoute** une déclaration
 * pour le mois en cours, si bien que les mois antérieurs gardent leurs montants.
 */
export type ReserveDeclaration =
  | {
      fromMonth: MonthKey;
      kind: "open";
      /**
       * Réserve **en début** du mois `fromMonth`. Entier `>= 0` ; zéro est valide (report simple
       * d'un mois sur l'autre, sans épargne).
       */
      balanceCents: Cents;
      /** Nombre de mois sur lesquels répartir la réserve, de 1 à 120. */
      months: number;
    }
  /** Retrait : à partir de ce mois, plus de réserve ni de report. */
  | { fromMonth: MonthKey; kind: "closed" };

// --- Document persisté ---------------------------------------------------------------

/**
 * Version 5 : ajout de `reserve` (fonctionnalité 008). Version 4 : ajout de `refunds` et
 * `banking` (fonctionnalité 006). Version 3 : ajout de la collection `envelopes`. Toutes ces
 * migrations sont purement additives.
 */
export const DOCUMENT_VERSION = 5;

export interface BudgetDocument {
  version: number;
  incomes: Income[];
  subscriptions: Subscription[];
  expenses: Expense[];
  envelopes: Envelope[];
  refunds: Refund[];
  banking: BankingState;
  /** Triée par `fromMonth` strictement croissant : au plus une déclaration par mois. */
  reserve: ReserveDeclaration[];
}

/**
 * État bancaire d'un budget neuf. Les règles initiales y figurent déjà, comme dans un
 * document migré depuis la version 3 : un budget neuf et un budget ancien doivent partir du
 * même point.
 */
export function emptyBankingState(): BankingState {
  return {
    importFrom: null,
    ledger: [],
    inbox: [],
    rules: initialTreatmentRules(),
    categoryRules: initialCategoryRules(),
  };
}

export function emptyDocument(): BudgetDocument {
  return {
    version: DOCUMENT_VERSION,
    incomes: [],
    subscriptions: [],
    expenses: [],
    envelopes: [],
    refunds: [],
    banking: emptyBankingState(),
    reserve: [],
  };
}

// --- Entités dérivées (jamais persistées) --------------------------------------------

/**
 * État de la synchronisation avec le stockage central (fonctionnalité 005).
 *
 * Entièrement dérivé, jamais persisté — à l'image des totaux du budget. Voir
 * specs/005-server-side-storage/data-model.md (§3).
 *
 * `offline` et `pending` se cumulent en pratique : hors connexion avec des saisies en
 * attente est le cas nominal du récit 3.
 */
export type SyncState =
  | "idle"
  | "syncing"
  | "offline"
  | "pending"
  | "conflict"
  | "failed"
  | "unauthorized";

export type BudgetStatus = "surplus" | "balanced" | "deficit";

/** Les quatre états de l'anneau du reste mensuel (EF-011). */
export type RingStatus = "untouched" | "inProgress" | "exhausted" | "overspent";

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

// --- Entités dérivées de la fonctionnalité 003 ----------------------------------------

/**
 * La réserve d'épargne vue d'un mois (fonctionnalité 008). **Entièrement dérivée**, jamais
 * persistée : recalculée par cascade depuis la dernière déclaration. Voir
 * specs/008-savings-reserve/contracts/calcul-reserve.md.
 */
export interface ReserveState {
  /** Réserve en début de mois. Peut être négative : dépassements cumulés supérieurs à l'épargne. */
  openingCents: Cents;
  /** Découvert à afficher, `max(0, −openingCents)` : la vue ne montre jamais un solde négatif. */
  shortfallCents: Cents;
  /** Mois sur lesquels la réserve doit encore durer, mois courant compris. Au moins 1. */
  monthsRemaining: number;
  /** La durée déclarée est écoulée. */
  horizonReached: boolean;
  /** Part du mois, tronquée au centime. Négative (toute la dette) si la réserve l'est. */
  shareCents: Cents;
  /** Épargne entamée ce mois : ce que le dépensé prend au-delà des revenus nets. */
  drawnCents: Cents;
  /**
   * Réserve en fin de mois : ouverture + revenus nets − sorties nettes. Les sorties ne sont
   * **pas** bornées à zéro ici, contrairement à `spentCents` : un excédent de remboursement
   * entre dans la réserve au lieu de disparaître.
   */
  closingCents: Cents;
}

/** L'anneau du reste mensuel (EF-007 à EF-014). Jamais persisté. */
export interface MonthlySpending {
  month: MonthKey;
  /** Revenus moins charges engagées du mois : `computeMonthlyBudget().remainingCents`. */
  incomeNetCents: Cents;
  /** `null` si aucune réserve ne s'applique à ce mois. */
  reserve: ReserveState | null;
  /**
   * Ce qui est dépensable ce mois : revenus nets, plus la part d'épargne s'il y a une réserve.
   * Sans réserve, c'est exactement `incomeNetCents`.
   */
  availableCents: Cents;
  /**
   * Dépensé **net** : dépenses moins remboursements du mois, jamais négatif (fonctionnalité
   * 006, EF-032).
   */
  spentCents: Cents;
  /** Remboursements du mois, déjà déduits de `spentCents`. */
  refundedCents: Cents;
  /** Part des remboursements excédant les dépenses du mois ; 0 sinon. Exposée, jamais dépensée. */
  refundSurplusCents: Cents;
  remainingCents: Cents;
  /** Plafonné à 1 pour que l'anneau ne déborde pas ; 0 si le disponible est nul ou négatif. */
  consumedRatio: number;
  /** Montant du dépassement, 0 s'il n'y en a pas : la vue n'affiche jamais un reste négatif. */
  overspentCents: Cents;
  status: RingStatus;
}

/**
 * L'allocation d'une journée (EF-015 à EF-022). **Entièrement dérivée** : rien n'est stocké
 * pour la produire. Voir la décision D1 du plan de la fonctionnalité 003.
 */
export interface DailyAllowance {
  date: IsoDate;
  allowanceCents: Cents;
  spentTodayCents: Cents;
  remainingTodayCents: Cents;
  /** `null` le premier jour du mois : il n'y a pas de veille dans ce budget. */
  carryOverCents: Cents | null;
  daysRemaining: number;
}

/** Une journée du journal (EF-024, EF-025). */
export interface JournalDay {
  date: IsoDate;
  expenses: Expense[];
  /** Remboursements du jour (fonctionnalité 006), présentés comme des déductions. */
  refunds: Refund[];
  /** Dépenses moins remboursements du jour : négatif si un remboursement l'emporte. */
  subtotalCents: Cents;
}

// --- Entités dérivées de la fonctionnalité 001 ----------------------------------------

/** Les quatre états d'une enveloppe (EF-014). */
export type EnvelopeState = "unused" | "onTrack" | "nearingLimit" | "overBudget";

/** Une enveloppe et sa consommation. Jamais persistée. */
export interface EnvelopeStatus {
  envelopeId: Id;
  category: string;
  limitCents: Cents;
  spentCents: Cents;
  remainingCents: Cents;
  /** Montant du dépassement, 0 sinon : la vue n'affiche jamais un reste négatif (EF-016). */
  overspentCents: Cents;
  /** Plafonné à 1. Aucune division n'est effectuée quand le plafond est nul. */
  consumedRatio: number;
  state: EnvelopeState;
}

/** Dépenses ne relevant d'aucune enveloppe du mois (EF-012). */
export interface UnbudgetedGroup {
  totalCents: Cents;
  /** `null` regroupe les dépenses sans catégorie. Trié par montant décroissant. */
  byCategory: { category: string | null; totalCents: Cents }[];
}

/** Synthèse des enveloppes d'un mois (EF-013, EF-018). */
export interface MonthlyEnvelopes {
  month: MonthKey;
  envelopes: EnvelopeStatus[];
  totalPlannedCents: Cents;
  totalSpentBudgetedCents: Cents;
  totalRemainingCents: Cents;
  unbudgeted: UnbudgetedGroup;
  overBudgetCount: number;
  overBudgetTotalCents: Cents;
}
