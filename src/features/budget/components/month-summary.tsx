"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { computeMonthlyBudget } from "@/features/budget/calculs";
import type { BudgetStatus } from "@/features/budget/types";
import { formatCents } from "@/lib/money";
import { formatMonthFr, formatRateFr } from "@/lib/format";

/**
 * Synthèse du mois : revenus, charges engagées, reste disponible (EF-014 à EF-018).
 *
 * Principe VII : l’état du budget est porté par un libellé textuel. La couleur ne fait que
 * renforcer une information déjà lisible sans elle.
 */
const ETATS: Readonly<
  Record<BudgetStatus, { libelle: string; couleur: string; intitule: string }>
> = {
  surplus: {
    libelle: "Excédent",
    couleur: "text-[var(--surplus)]",
    intitule: "Reste disponible",
  },
  balanced: {
    libelle: "Équilibre",
    couleur: "text-[var(--balanced)]",
    intitule: "Reste disponible",
  },
  deficit: {
    libelle: "Déficit",
    couleur: "text-[var(--deficit)]",
    intitule: "Déficit",
  },
};

export function MonthSummary() {
  const { document, selectedMonth, today } = useBudget();
  const budget = computeMonthlyBudget(document, selectedMonth, today);
  const etat = ETATS[budget.status];

  const vide =
    document.incomes.length === 0 && document.subscriptions.length === 0;

  // EF-015 : un déficit est présenté comme un montant de déficit libellé, jamais comme un
  // nombre négatif brut.
  const montantPrincipal =
    budget.status === "deficit"
      ? formatCents(-budget.remainingCents)
      : formatCents(budget.remainingCents);

  return (
    <section
      aria-labelledby="titre-synthese"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titre-synthese" className="text-lg font-semibold">
          Budget de {formatMonthFr(selectedMonth)}
        </h2>
        {budget.isProjection ? (
          <p className="rounded-md border border-[var(--border)] px-2 py-1 text-xs font-medium">
            Projection
          </p>
        ) : null}
      </div>

      <div className="mt-4">
        <p className="text-sm text-[var(--muted)]">{etat.intitule}</p>
        <p className={`text-3xl font-semibold tabular-nums ${etat.couleur}`}>
          {montantPrincipal}
        </p>
        <p className={`mt-1 text-sm font-medium ${etat.couleur}`}>{etat.libelle}</p>
      </div>

      <dl className="mt-6 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-[var(--muted)]">Revenus</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatCents(budget.totalIncomeCents)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--muted)]">Charges engagées</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {formatCents(budget.totalChargesCents)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-[var(--muted)]">Taux d’engagement</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {budget.commitmentRate === null ? (
              <span className="text-base font-normal text-[var(--muted)]">
                Sans revenu déclaré
              </span>
            ) : (
              formatRateFr(budget.commitmentRate)
            )}
          </dd>
        </div>
      </dl>

      {vide ? (
        <p className="mt-6 rounded-md border border-dashed border-[var(--border)] p-4 text-sm">
          Aucune donnée pour l’instant. Commencez par enregistrer un revenu ou un abonnement
          ci-dessous : le reste disponible se calculera automatiquement.
        </p>
      ) : null}
    </section>
  );
}
