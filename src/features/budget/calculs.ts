/**
 * Logique budgétaire pure.
 *
 * Voir specs/002-income-subscriptions-budget/contracts/calculs.md.
 *
 * Aucune fonction de ce module ne lit `localStorage`, ne touche au DOM ni ne consulte
 * l’horloge : la date de référence est toujours passée en paramètre. C’est ce qui les rend
 * testables sans simulation d’horloge, et c’est exigé par le principe III.
 */

import { addMonthsClamped, compareIso, monthKeyOf } from "@/lib/date";
import { sumCents } from "@/lib/money";
import { MONTHS_PER_PERIOD } from "@/features/budget/types";
import type {
  BudgetDocument,
  Cents,
  ChargeLine,
  Income,
  IsoDate,
  MonthKey,
  MonthlyBudget,
  Subscription,
  UpcomingDue,
} from "@/features/budget/types";

/** Index absolu d’un mois, pour compter des écarts sans manipuler de dates. */
function indexMois(month: MonthKey): number {
  return Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1);
}

/**
 * Occurrences d’un revenu dans un mois donné (EF-005).
 *
 * Renvoie une liste et non un booléen : une périodicité plus fine qu’un mois pourrait
 * produire plusieurs occurrences dans le même mois. Les périodicités actuellement prises en
 * charge en produisent au plus une.
 */
export function occurrencesInMonth(income: Income, month: MonthKey): IsoDate[] {
  if (income.kind === "oneOff") {
    return monthKeyOf(income.date) === month ? [income.date] : [];
  }

  const ecart = indexMois(month) - indexMois(monthKeyOf(income.startDate));
  if (ecart < 0) return [];

  const pas = MONTHS_PER_PERIOD[income.periodicity];
  if (ecart % pas !== 0) return [];

  const echeance = addMonthsClamped(income.startDate, ecart);
  if (compareIso(echeance, income.startDate) < 0) return [];
  if (income.endDate !== null && compareIso(echeance, income.endDate) > 0) return [];

  return [echeance];
}

/** Total des revenus d’un mois : somme des montants de toutes les occurrences. */
export function totalIncomeCentsForMonth(
  incomes: readonly Income[],
  month: MonthKey,
): Cents {
  const montants: Cents[] = [];
  for (const revenu of incomes) {
    const nombre = occurrencesInMonth(revenu, month).length;
    for (let i = 0; i < nombre; i += 1) montants.push(revenu.amountCents);
  }
  return sumCents(montants);
}

// --- Abonnements -----------------------------------------------------------------------

/**
 * Montant applicable à une date donnée (EF-010).
 *
 * Renvoie la dernière période dont `effectiveFrom <= date`. `null` avant la première
 * période : ce cas ne peut survenir si les invariants du modèle tiennent, mais on préfère
 * l’exposer plutôt que de le masquer derrière une valeur par défaut qui fausserait un total.
 */
export function amountAt(subscription: Subscription, date: IsoDate): Cents | null {
  let applicable: Cents | null = null;
  for (const periode of subscription.amounts) {
    if (compareIso(periode.effectiveFrom, date) <= 0) applicable = periode.amountCents;
    else break; // les périodes sont triées par date croissante
  }
  return applicable;
}

/** Vrai si la date tombe dans une période de suspension (EF-011). */
function estSuspendu(subscription: Subscription, date: IsoDate): boolean {
  return subscription.pauses.some(
    (pause) =>
      compareIso(date, pause.from) >= 0 &&
      (pause.to === null || compareIso(date, pause.to) <= 0),
  );
}

/**
 * Échéances d’un abonnement imputées à un mois (EF-008).
 *
 * Une échéance est rattachée au mois où elle tombe réellement, jamais lissée sur l’année.
 */
export function duesInMonth(
  subscription: Subscription,
  month: MonthKey,
): { dueDate: IsoDate; amountCents: Cents }[] {
  const ecart = indexMois(month) - indexMois(monthKeyOf(subscription.startDate));
  if (ecart < 0) return [];

  const pas = MONTHS_PER_PERIOD[subscription.periodicity];
  if (ecart % pas !== 0) return [];

  const echeance = addMonthsClamped(subscription.startDate, ecart);
  if (subscription.endDate !== null && compareIso(echeance, subscription.endDate) > 0) return [];
  if (estSuspendu(subscription, echeance)) return [];

  const montant = amountAt(subscription, echeance);
  if (montant === null) return [];

  return [{ dueDate: echeance, amountCents: montant }];
}

/**
 * Coût mensuel moyen d’un abonnement (EF-009).
 *
 * INDICATEUR D’AFFICHAGE UNIQUEMENT. Cette valeur est arrondie ; elle n’entre dans aucun
 * total, ce qui empêche l’arrondi de se propager et préserve l’exactitude exigée par le
 * principe II. Le demi-centime est arrondi au supérieur.
 */
export function averageMonthlyCostCents(
  subscription: Subscription,
  at: IsoDate,
): Cents {
  const montant = amountAt(subscription, at) ?? subscription.amounts[0].amountCents;
  const pas = MONTHS_PER_PERIOD[subscription.periodicity];
  return Math.floor(montant / pas + 0.5);
}

/** Total des charges engagées d’un mois : somme des échéances réellement imputées. */
export function totalChargesCentsForMonth(
  subscriptions: readonly Subscription[],
  month: MonthKey,
): Cents {
  const montants: Cents[] = [];
  for (const abonnement of subscriptions) {
    for (const echeance of duesInMonth(abonnement, month)) montants.push(echeance.amountCents);
  }
  return sumCents(montants);
}

/** Un abonnement est actif tant que sa date de résiliation n’est pas passée (EF-012). */
export function isActiveSubscription(subscription: Subscription, today: IsoDate): boolean {
  return subscription.endDate === null || compareIso(today, subscription.endDate) <= 0;
}

/**
 * Prochaine échéance d’un abonnement à partir d’une date incluse, ou `null` s’il n’y en a
 * plus. La recherche est bornée à 24 mois : au-delà, soit l’abonnement est résilié, soit il
 * est suspendu sans terme, et il n’a plus d’échéance à annoncer.
 */
export function nextDueFrom(
  subscription: Subscription,
  from: IsoDate,
): { dueDate: IsoDate; amountCents: Cents } | null {
  const moisDepart = monthKeyOf(from);
  for (let decalage = 0; decalage <= 24; decalage += 1) {
    const mois = monthKeyOf(addMonthsClamped(`${moisDepart}-01`, decalage));
    for (const echeance of duesInMonth(subscription, mois)) {
      if (compareIso(echeance.dueDate, from) >= 0) return echeance;
    }
  }
  return null;
}

// --- Budget mensuel ---------------------------------------------------------------------

/**
 * Budget dérivé d’un mois (EF-014 à EF-018).
 *
 * Ne consulte pas l’horloge : `today` est fourni, ce qui rend la fonction testable et la
 * projection déterministe.
 */
export function computeMonthlyBudget(
  doc: BudgetDocument,
  month: MonthKey,
  today: IsoDate,
): MonthlyBudget {
  const totalIncomeCents = totalIncomeCentsForMonth(doc.incomes, month);

  const breakdown: ChargeLine[] = [];
  for (const abonnement of doc.subscriptions) {
    for (const echeance of duesInMonth(abonnement, month)) {
      breakdown.push({
        subscriptionId: abonnement.id,
        label: abonnement.label,
        amountCents: echeance.amountCents,
        dueDate: echeance.dueDate,
      });
    }
  }

  // Tri par montant décroissant, puis par libellé : le second critère rend l’affichage
  // déterministe à montants égaux, donc testable.
  breakdown.sort((a, b) =>
    b.amountCents !== a.amountCents
      ? b.amountCents - a.amountCents
      : a.label.localeCompare(b.label, "fr"),
  );

  const totalChargesCents = sumCents(breakdown.map((ligne) => ligne.amountCents));
  const remainingCents = totalIncomeCents - totalChargesCents;

  return {
    month,
    totalIncomeCents,
    totalChargesCents,
    remainingCents,
    // `null` plutôt qu’une division par zéro : un taux d’engagement n’a pas de sens sans
    // revenu, et renvoyer 0 ou l’infini induirait l’utilisateur en erreur.
    commitmentRate:
      totalIncomeCents === 0
        ? null
        : Math.round((totalChargesCents / totalIncomeCents) * 1000) / 1000,
    status:
      remainingCents > 0 ? "surplus" : remainingCents === 0 ? "balanced" : "deficit",
    breakdown,
    isProjection: compareIso(month, monthKeyOf(today)) > 0,
  };
}

// --- Anticipation -----------------------------------------------------------------------

/** Projette `months` mois consécutifs à partir de `fromMonth` (EF-022, EF-023). */
export function forecast(
  doc: BudgetDocument,
  fromMonth: MonthKey,
  months: number,
  today: IsoDate,
): MonthlyBudget[] {
  const projection: MonthlyBudget[] = [];
  for (let decalage = 0; decalage < months; decalage += 1) {
    const mois = monthKeyOf(addMonthsClamped(`${fromMonth}-01`, decalage));
    projection.push(computeMonthlyBudget(doc, mois, today));
  }
  return projection;
}

/**
 * Les `count` prochaines échéances d’abonnement à partir de `from` incluse (EF-024).
 *
 * La fenêtre d’exploration est bornée à 24 mois : au-delà, un abonnement sans échéance est
 * soit résilié, soit suspendu sans terme.
 */
export function listUpcomingDues(
  doc: BudgetDocument,
  from: IsoDate,
  count: number,
): UpcomingDue[] {
  const echeances: UpcomingDue[] = [];
  const moisDepart = monthKeyOf(from);

  for (let decalage = 0; decalage <= 24; decalage += 1) {
    const mois = monthKeyOf(addMonthsClamped(`${moisDepart}-01`, decalage));
    for (const abonnement of doc.subscriptions) {
      for (const echeance of duesInMonth(abonnement, mois)) {
        if (compareIso(echeance.dueDate, from) < 0) continue;
        echeances.push({
          subscriptionId: abonnement.id,
          label: abonnement.label,
          amountCents: echeance.amountCents,
          dueDate: echeance.dueDate,
        });
      }
    }
  }

  echeances.sort((a, b) => {
    const ordre = compareIso(a.dueDate, b.dueDate);
    return ordre !== 0 ? ordre : a.label.localeCompare(b.label, "fr");
  });

  return echeances.slice(0, Math.max(0, count));
}

// --- Évolution d’un abonnement ----------------------------------------------------------

/**
 * Enregistre un changement de tarif applicable à partir d’une date (EF-010, EF-025).
 *
 * L’historique n’est jamais écrasé : une période est ajoutée, ce qui garantit que les mois
 * antérieurs conservent leur montant. Une période de même date d’effet est remplacée, car
 * l’invariant du modèle interdit deux périodes à la même date.
 */
export function withAmountChange(
  subscription: Subscription,
  amountCents: Cents,
  effectiveFrom: IsoDate,
): Subscription {
  const conservees = subscription.amounts.filter(
    (periode) => periode.effectiveFrom !== effectiveFrom,
  );
  const amounts = [...conservees, { amountCents, effectiveFrom }].sort((a, b) =>
    compareIso(a.effectiveFrom, b.effectiveFrom),
  );
  return { ...subscription, amounts };
}

/**
 * Suspend un abonnement sur une période bornée (EF-011).
 *
 * Renvoie `null` si la période est invalide ou chevauche une suspension existante : les
 * invariants du modèle sont vérifiés ici plutôt qu’au moment de l’écriture, pour que
 * l’interface puisse refuser l’action avec un message plutôt que d’échouer à l’écriture.
 */
export function withPause(
  subscription: Subscription,
  from: IsoDate,
  to: IsoDate | null,
): Subscription | null {
  if (to !== null && compareIso(to, from) < 0) return null;

  const chevauche = subscription.pauses.some((pause) => {
    const finExistante = pause.to;
    const debutApresFinNouvelle = to !== null && compareIso(pause.from, to) > 0;
    const finAvantDebutNouveau =
      finExistante !== null && compareIso(finExistante, from) < 0;
    return !debutApresFinNouvelle && !finAvantDebutNouveau;
  });
  if (chevauche) return null;

  const pauses = [...subscription.pauses, { from, to }].sort((a, b) =>
    compareIso(a.from, b.from),
  );
  return { ...subscription, pauses };
}

/** Résilie un abonnement à une date donnée (EF-011, EF-012). */
export function withTermination(
  subscription: Subscription,
  endDate: IsoDate,
): Subscription | null {
  if (compareIso(endDate, subscription.startDate) < 0) return null;
  return { ...subscription, endDate };
}
