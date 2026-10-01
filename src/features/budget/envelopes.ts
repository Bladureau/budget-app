/**
 * Enveloppes budgétaires : plafonds par catégorie et par mois, consommation, alerte.
 *
 * Voir specs/001-monthly-budget-envelopes/contracts/calculs-enveloppes.md.
 *
 * Module PUR : ni `localStorage`, ni DOM, ni horloge.
 *
 * Frontière avec les deux autres modules de calcul : `calculs.ts` répond « que prévoit ce
 * mois ? », `expenses.ts` répond « où en suis-je aujourd'hui ? », celui-ci répond « ai-je
 * tenu mes plafonds ? ».
 *
 * Rien n'est stocké hormis le plafond : dépensé, restant, état et totaux sont dérivés. Un
 * total dérivé ne peut pas contredire ses composantes.
 */

import { monthKeyOf } from "@/lib/date";
import { sumCents } from "@/lib/money";
import { newId } from "@/lib/storage";
import type {
  BudgetDocument,
  Cents,
  Envelope,
  EnvelopeState,
  EnvelopeStatus,
  Expense,
  MonthKey,
  MonthlyEnvelopes,
  Refund,
  UnbudgetedGroup,
} from "@/features/budget/types";

/** Seuil de l'alerte « proche du plafond », en pourcentage (EF-015). Non configurable. */
const NEARING_LIMIT_PERCENT = 85;

// --- Sélection ---------------------------------------------------------------------------

/** Enveloppes du mois, triées par catégorie pour un ordre déterministe. */
export function envelopesForMonth(
  envelopes: readonly Envelope[],
  month: MonthKey,
): Envelope[] {
  return envelopes
    .filter((enveloppe) => enveloppe.month === month)
    .sort((a, b) => a.category.localeCompare(b.category, "fr"));
}

/**
 * L'enveloppe d'un couple catégorie / mois, ou `null`.
 *
 * La comparaison de catégorie est **sensible à la casse et aux accents** : c'est une chaîne
 * libre, comparée comme partout ailleurs dans l'application. Normaliser ici seulement créerait
 * une incohérence plus déroutante que le problème résolu (décision D3).
 */
export function findEnvelope(
  envelopes: readonly Envelope[],
  category: string,
  month: MonthKey,
): Envelope | null {
  return (
    envelopes.find(
      (enveloppe) => enveloppe.month === month && enveloppe.category === category,
    ) ?? null
  );
}

// --- État et consommation ------------------------------------------------------------------

/**
 * État d'une enveloppe (EF-014, EF-015), évalué dans l'ordre.
 *
 * Le seuil se compare par **multiplication entière** et non par division : une alerte ne doit
 * pas dépendre d'un flottant. Un plafond nul avec une dépense tombe dans le premier cas, ce
 * qui est le comportement voulu — « ne rien dépenser ici » est immédiatement dépassé.
 */
export function envelopeState(spentCents: Cents, limitCents: Cents): EnvelopeState {
  if (spentCents > limitCents) return "overBudget";
  // Rien de dépensé n'est jamais « proche du plafond ». Sans cette garde, un plafond nul et
  // un dépensé nul satisferaient trivialement la comparaison de seuil (0 >= 0).
  if (spentCents === 0) return "unused";
  if (spentCents * 100 >= limitCents * NEARING_LIMIT_PERCENT) return "nearingLimit";
  return "onTrack";
}

/**
 * Proportion consommée, plafonnée à 1 pour que la progression ne déborde jamais (EF-016).
 *
 * Le plafond nul est traité avant tout calcul : **aucune division par zéro n'est effectuée**.
 */
export function consumedRatio(spentCents: Cents, limitCents: Cents): number {
  if (limitCents <= 0) return spentCents > 0 ? 1 : 0;
  return Math.min(1, spentCents / limitCents);
}

// --- Calcul du mois -------------------------------------------------------------------------

/** Dépenses du mois, quelle que soit leur catégorie. */
function depensesDuMois(expenses: readonly Expense[], month: MonthKey): Expense[] {
  return expenses.filter((depense) => monthKeyOf(depense.date) === month);
}

/**
 * Regroupe les dépenses ne relevant d'aucune enveloppe (EF-012).
 *
 * Deux populations s'y retrouvent : les catégories non plafonnées **et** les dépenses sans
 * catégorie. Dans les deux cas la dépense n'était pas prévue, ce qui rend le regroupement
 * cohérent malgré son origine double (décision D3).
 */
function regrouperNonBudgete(
  depenses: readonly Expense[],
  remboursements: readonly Refund[],
  categoriesPlafonnees: ReadonlySet<string>,
): UnbudgetedGroup {
  const parCategorie = new Map<string | null, Cents>();
  const horsEnveloppe = (category: string | null) =>
    category === null || !categoriesPlafonnees.has(category);

  for (const depense of depenses) {
    if (!horsEnveloppe(depense.category)) continue;
    const cle = depense.category;
    parCategorie.set(cle, (parCategorie.get(cle) ?? 0) + depense.amountCents);
  }
  // Fonctionnalité 006 : un remboursement réduit sa catégorie. Une catégorie seulement
  // remboursée, ou entièrement remboursée, n'a rien coûté ce mois-ci : elle n'apparaît pas.
  for (const remboursement of remboursements) {
    if (!horsEnveloppe(remboursement.category)) continue;
    const cle = remboursement.category;
    parCategorie.set(cle, (parCategorie.get(cle) ?? 0) - remboursement.amountCents);
  }

  const byCategory = [...parCategorie.entries()]
    .filter(([, totalCents]) => totalCents > 0)
    .map(([category, totalCents]) => ({ category, totalCents }))
    .sort((a, b) => {
      if (b.totalCents !== a.totalCents) return b.totalCents - a.totalCents;
      // Les dépenses sans catégorie passent en dernier à montant égal, l'ordre restant
      // déterministe et donc testable.
      if (a.category === null) return 1;
      if (b.category === null) return -1;
      return a.category.localeCompare(b.category, "fr");
    });

  return {
    totalCents: sumCents(byCategory.map((ligne) => ligne.totalCents)),
    byCategory,
  };
}

/** Synthèse des enveloppes d'un mois (EF-011 à EF-018). */
export function computeMonthlyEnvelopes(
  doc: BudgetDocument,
  month: MonthKey,
): MonthlyEnvelopes {
  const enveloppes = envelopesForMonth(doc.envelopes, month);
  const depenses = depensesDuMois(doc.expenses, month);
  const remboursements = doc.refunds.filter((r) => monthKeyOf(r.date) === month);
  const categoriesPlafonnees = new Set(enveloppes.map((e) => e.category));

  const statuts: EnvelopeStatus[] = enveloppes.map((enveloppe) => {
    const brut = sumCents(
      depenses
        .filter((depense) => depense.category === enveloppe.category)
        .map((depense) => depense.amountCents),
    );
    const rembourse = sumCents(
      remboursements
        .filter((r) => r.category === enveloppe.category)
        .map((r) => r.amountCents),
    );
    // Consommation nette, jamais négative (EF-032) : un remboursement n'élargit pas le plafond.
    const spentCents = Math.max(0, brut - rembourse);
    const remainingCents = enveloppe.limitCents - spentCents;

    return {
      envelopeId: enveloppe.id,
      category: enveloppe.category,
      limitCents: enveloppe.limitCents,
      spentCents,
      remainingCents,
      overspentCents: remainingCents < 0 ? -remainingCents : 0,
      consumedRatio: consumedRatio(spentCents, enveloppe.limitCents),
      state: envelopeState(spentCents, enveloppe.limitCents),
    };
  });

  // Tri par dépensé décroissant puis par catégorie : le second critère rend l'affichage
  // déterministe à montants égaux, donc testable.
  statuts.sort((a, b) =>
    b.spentCents !== a.spentCents
      ? b.spentCents - a.spentCents
      : a.category.localeCompare(b.category, "fr"),
  );

  const enDepassement = statuts.filter((statut) => statut.state === "overBudget");

  return {
    month,
    envelopes: statuts,
    totalPlannedCents: sumCents(statuts.map((s) => s.limitCents)),
    totalSpentBudgetedCents: sumCents(statuts.map((s) => s.spentCents)),
    totalRemainingCents:
      sumCents(statuts.map((s) => s.limitCents)) - sumCents(statuts.map((s) => s.spentCents)),
    unbudgeted: regrouperNonBudgete(depenses, remboursements, categoriesPlafonnees),
    overBudgetCount: enDepassement.length,
    overBudgetTotalCents: sumCents(enDepassement.map((s) => s.overspentCents)),
  };
}

// --- Report ---------------------------------------------------------------------------------

/**
 * Duplique les plafonds d'un mois vers un autre (EF-020).
 *
 * Les copies reçoivent de **nouveaux identifiants** et ne gardent aucun lien avec leurs
 * originaux : modifier le plafond du mois cible ne touche pas le mois source. C'est ce
 * qu'exige EF-022, et c'est aussi ce qui rend le report compréhensible — il est un point de
 * départ, pas un abonnement.
 */
export function copyEnvelopesToMonth(
  envelopes: readonly Envelope[],
  from: MonthKey,
  to: MonthKey,
): Envelope[] {
  return envelopesForMonth(envelopes, from).map((enveloppe) => ({
    id: newId(),
    category: enveloppe.category,
    month: to,
    limitCents: enveloppe.limitCents,
  }));
}
