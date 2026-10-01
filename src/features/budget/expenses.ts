/**
 * Logique des dépenses : anneau du reste mensuel, allocation quotidienne, journal.
 *
 * Voir specs/003-daily-allowance-dashboard/contracts/calculs-depenses.md.
 *
 * Module PUR : ne lit ni `localStorage`, ni le DOM, ni l'horloge. La date de référence est
 * toujours passée en paramètre — c'est ce qui rend l'allocation quotidienne testable sans
 * simuler le temps.
 *
 * Frontière avec `calculs.ts` : celui-ci répond « que prévoit ce mois ? » (revenus,
 * abonnements, budget prévisionnel), celui-là répond « où en suis-je aujourd'hui ? ».
 */

import { compareIso, dayOfMonth, daysInMonth, monthKeyOf } from "@/lib/date";
import { sumCents } from "@/lib/money";
import { computeMonthlyBudget } from "@/features/budget/calculs";
import type {
  BudgetDocument,
  Cents,
  DailyAllowance,
  Expense,
  IsoDate,
  JournalDay,
  MonthKey,
  MonthlySpending,
  Refund,
  RingStatus,
} from "@/features/budget/types";

// --- Agrégation ------------------------------------------------------------------------

/** Dépenses du mois, de la plus récente à la plus ancienne. */
export function expensesInMonth(
  expenses: readonly Expense[],
  month: MonthKey,
): Expense[] {
  return expenses
    .filter((depense) => monthKeyOf(depense.date) === month)
    .sort((a, b) => compareIso(b.date, a.date));
}

export function totalSpentCentsForMonth(
  expenses: readonly Expense[],
  month: MonthKey,
): Cents {
  return sumCents(
    expenses
      .filter((depense) => monthKeyOf(depense.date) === month)
      .map((depense) => depense.amountCents),
  );
}

export function spentOnDayCents(expenses: readonly Expense[], date: IsoDate): Cents {
  return sumCents(
    expenses.filter((depense) => depense.date === date).map((depense) => depense.amountCents),
  );
}

/**
 * Dépenses **du même mois** strictement antérieures à la date.
 *
 * Le cantonnement au mois est essentiel : l'allocation répartit le budget d'un mois, pas
 * d'une vie. Une dépense du mois précédent ne doit jamais amputer le budget de celui-ci.
 */
export function spentBeforeDayCents(expenses: readonly Expense[], date: IsoDate): Cents {
  const mois = monthKeyOf(date);
  return sumCents(
    expenses
      .filter(
        (depense) =>
          monthKeyOf(depense.date) === mois && compareIso(depense.date, date) < 0,
      )
      .map((depense) => depense.amountCents),
  );
}

// --- Remboursements (fonctionnalité 006) ------------------------------------------------
//
// Un remboursement vient en **déduction** des dépenses (EF-031). Les fonctions ci-dessus
// restent brutes — elles servent aussi au journal et à ses tests — et les calculs de l'anneau
// et de l'allocation composent dépenses et remboursements à part.
//
// Règle unique, appliquée partout : le dépensé net est **borné à zéro** (EF-032). Un excédent
// de remboursement est exposé tel quel, jamais présenté comme une dépense négative, et il
// n'augmente pas le reste disponible : il n'a pas été prévu, il n'est pas promis.

function rembourseDuMois(refunds: readonly Refund[], month: MonthKey): Cents {
  return sumCents(
    refunds.filter((r) => monthKeyOf(r.date) === month).map((r) => r.amountCents),
  );
}

function rembourseLeJour(refunds: readonly Refund[], date: IsoDate): Cents {
  return sumCents(refunds.filter((r) => r.date === date).map((r) => r.amountCents));
}

/** Même cantonnement au mois que `spentBeforeDayCents`. */
function rembourseAvantLeJour(refunds: readonly Refund[], date: IsoDate): Cents {
  const mois = monthKeyOf(date);
  return sumCents(
    refunds
      .filter((r) => monthKeyOf(r.date) === mois && compareIso(r.date, date) < 0)
      .map((r) => r.amountCents),
  );
}

function net(depense: Cents, rembourse: Cents): Cents {
  return Math.max(0, depense - rembourse);
}

/** Dépensé net du mois avant la date : c'est lui qui fixe ce qui reste à répartir. */
function depenseNetAvant(doc: BudgetDocument, date: IsoDate): Cents {
  return net(spentBeforeDayCents(doc.expenses, date), rembourseAvantLeJour(doc.refunds, date));
}

function depenseNetLeJour(doc: BudgetDocument, date: IsoDate): Cents {
  return net(spentOnDayCents(doc.expenses, date), rembourseLeJour(doc.refunds, date));
}

// --- Anneau du reste mensuel ------------------------------------------------------------

function etatAnneau(spent: Cents, remaining: Cents): RingStatus {
  if (remaining < 0) return "overspent";
  if (remaining === 0) return "exhausted";
  return spent === 0 ? "untouched" : "inProgress";
}

/**
 * Reste mensuel et état de l'anneau (EF-007 à EF-014).
 *
 * `availableCents` provient du budget prévisionnel de la fonctionnalité 002 : revenus moins
 * charges récurrentes engagées. Les dépenses viennent s'imputer dessus.
 */
export function computeMonthlySpending(
  doc: BudgetDocument,
  month: MonthKey,
  today: IsoDate,
): MonthlySpending {
  const availableCents = computeMonthlyBudget(doc, month, today).remainingCents;
  const brut = totalSpentCentsForMonth(doc.expenses, month);
  const refundedCents = rembourseDuMois(doc.refunds, month);
  const spentCents = net(brut, refundedCents);
  const remainingCents = availableCents - spentCents;

  // Plafonné à 1 pour que l'anneau ne déborde jamais ; 0 sans budget, ce qui évite aussi
  // toute division par zéro.
  const consumedRatio =
    availableCents <= 0 ? 0 : Math.min(1, spentCents / availableCents);

  return {
    month,
    availableCents,
    spentCents,
    refundedCents,
    refundSurplusCents: Math.max(0, refundedCents - brut),
    remainingCents,
    consumedRatio,
    // Exposé séparément pour que la vue n'ait jamais à présenter un reste négatif (EF-012).
    overspentCents: remainingCents < 0 ? -remainingCents : 0,
    status: etatAnneau(spentCents, remainingCents),
  };
}

// --- Allocation quotidienne --------------------------------------------------------------

/**
 * Allocation d'une journée, **entièrement dérivée** (décision D1 du plan).
 *
 * Rien n'est stocké pour la produire : allocation et report se déduisent du montant
 * disponible, des dépenses antérieures et du nombre de jours restants. Stocker un instantané
 * quotidien créerait des trous les jours où l'application n'est pas ouverte.
 *
 * La division est **tronquée au centime inférieur**, et c'est normatif : cela garantit que la
 * somme des allocations restantes n'excède jamais le disponible (CS-004). Arrondir au plus
 * proche permettrait de promettre de l'argent qui n'existe pas. Les centimes non répartis
 * restent dans le reste et reviennent au dernier jour, où il reste un seul jour à servir.
 */
export function computeDailyAllowance(doc: BudgetDocument, date: IsoDate): DailyAllowance {
  const mois = monthKeyOf(date);
  const disponible = computeMonthlyBudget(doc, mois, date).remainingCents;

  const daysRemaining = daysInMonth(mois) - dayOfMonth(date) + 1;
  const restant = disponible - depenseNetAvant(doc, date);

  const allowanceCents =
    restant <= 0 || daysRemaining <= 0 ? 0 : Math.floor(restant / daysRemaining);

  const spentTodayCents = depenseNetLeJour(doc, date);

  return {
    date,
    allowanceCents,
    spentTodayCents,
    remainingTodayCents: allowanceCents - spentTodayCents,
    carryOverCents: reportDeLaVeille(doc, date),
    daysRemaining,
  };
}

/**
 * Report de la veille : allocation de la veille moins ce qui y a été dépensé.
 *
 * `null` le premier jour du mois — l'absence de veille dans ce budget n'est pas un report
 * nul, et la vue doit pouvoir dire l'un ou l'autre.
 */
function reportDeLaVeille(doc: BudgetDocument, date: IsoDate): Cents | null {
  const quantieme = dayOfMonth(date);
  if (quantieme <= 1) return null;

  const mois = monthKeyOf(date);
  const veille = `${mois}-${String(quantieme - 1).padStart(2, "0")}`;

  const disponible = computeMonthlyBudget(doc, mois, veille).remainingCents;
  const joursRestantsVeille = daysInMonth(mois) - (quantieme - 1) + 1;
  const restantVeille = disponible - depenseNetAvant(doc, veille);

  const allocationVeille =
    restantVeille <= 0 ? 0 : Math.floor(restantVeille / joursRestantsVeille);

  return allocationVeille - depenseNetLeJour(doc, veille);
}

// --- Journal -----------------------------------------------------------------------------

/**
 * Regroupe par journée avec sous-total, journées de la plus récente à la plus ancienne.
 *
 * Les remboursements (fonctionnalité 006) rejoignent leur journée et viennent en déduction du
 * sous-total, qui peut alors être négatif : le journal est un relevé, il montre ce qui s'est
 * passé ce jour-là, sans la borne à zéro qui ne vaut que pour les budgets.
 */
export function groupByDay(
  expenses: readonly Expense[],
  refunds: readonly Refund[] = [],
): JournalDay[] {
  const parJour = new Map<IsoDate, { expenses: Expense[]; refunds: Refund[] }>();
  const journee = (date: IsoDate) => {
    const existante = parJour.get(date);
    if (existante) return existante;
    const nouvelle = { expenses: [] as Expense[], refunds: [] as Refund[] };
    parJour.set(date, nouvelle);
    return nouvelle;
  };

  for (const depense of expenses) journee(depense.date).expenses.push(depense);
  for (const remboursement of refunds) journee(remboursement.date).refunds.push(remboursement);

  return [...parJour.entries()]
    .sort(([a], [b]) => compareIso(b, a))
    .map(([date, contenu]) => ({
      date,
      expenses: contenu.expenses,
      refunds: contenu.refunds,
      subtotalCents:
        sumCents(contenu.expenses.map((depense) => depense.amountCents)) -
        sumCents(contenu.refunds.map((remboursement) => remboursement.amountCents)),
    }));
}

/**
 * Normalisation pour la recherche : sans accents, en minuscules.
 *
 * Sur un corpus français, « café » doit être trouvé en tapant « cafe » — sans quoi la
 * recherche paraît cassée (EF-026).
 */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("fr");
}

/**
 * Filtre sur libellé et catégorie. Requête vide : liste inchangée.
 *
 * Générique pour servir aussi aux remboursements (fonctionnalité 006), qui portent libellé et
 * catégorie de la même façon.
 */
export function searchExpenses<T extends Pick<Expense, "label" | "category">>(
  expenses: readonly T[],
  query: string,
): T[] {
  const recherche = normalizeForSearch(query);
  if (recherche === "") return [...expenses];

  return expenses.filter((depense) => {
    const champs = `${depense.label ?? ""} ${depense.category ?? ""}`;
    return normalizeForSearch(champs).includes(recherche);
  });
}
