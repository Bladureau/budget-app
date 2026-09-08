"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { forecast } from "@/features/budget/calculs";
import { formatCents } from "@/lib/money";
import { formatMonthFr } from "@/lib/format";

/**
 * Anticipation sur douze mois (EF-023).
 *
 * Les mois déficitaires sont signalés par un libellé textuel autant que par la couleur
 * (principe VII) : retirer la couleur ne doit faire perdre aucune information.
 */
export function ForecastView() {
  const { document, selectedMonth, today } = useBudget();

  if (document.incomes.length === 0 && document.subscriptions.length === 0) return null;

  const mois = forecast(document, selectedMonth, 12, today);
  const deficitaires = mois.filter((budget) => budget.status === "deficit");
  const pire = deficitaires.reduce<(typeof mois)[number] | null>(
    (candidat, budget) =>
      candidat === null || budget.remainingCents < candidat.remainingCents ? budget : candidat,
    null,
  );

  return (
    <section aria-labelledby="titre-anticipation" className="space-y-3">
      <h2 id="titre-anticipation" className="text-lg font-semibold">
        Douze prochains mois
      </h2>

      <p className="text-sm">
        {deficitaires.length === 0 ? (
          <span>Aucun mois déficitaire sur la période projetée.</span>
        ) : (
          <span className="text-[var(--deficit)]">
            {deficitaires.length === 1
              ? "1 mois déficitaire"
              : `${deficitaires.length} mois déficitaires`}
            {pire
              ? ` · le plus lourd : ${formatMonthFr(pire.month)}, ${formatCents(-pire.remainingCents)} de déficit`
              : ""}
            .
          </span>
        )}
      </p>

      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {mois.map((budget) => {
          const deficit = budget.status === "deficit";
          // Barre proportionnelle au reste disponible, plafonnée : elle illustre, elle ne
          // porte aucune information qui ne soit pas déjà écrite en toutes lettres.
          const reference = Math.max(
            ...mois.map((b) => Math.abs(b.remainingCents)),
            1,
          );
          const largeur = Math.round((Math.abs(budget.remainingCents) / reference) * 100);

          return (
            <li key={budget.month} className="flex flex-wrap items-center gap-3 p-3">
              <span className="w-32 shrink-0 text-sm capitalize">
                {formatMonthFr(budget.month)}
              </span>

              <span className="h-2 min-w-16 flex-1 overflow-hidden rounded-full bg-[var(--surface)]">
                <span
                  aria-hidden="true"
                  className={`block h-full rounded-full ${deficit ? "bg-[var(--deficit)]" : "bg-[var(--surplus)]"}`}
                  style={{ width: `${largeur}%` }}
                />
              </span>

              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {deficit
                  ? `− ${formatCents(-budget.remainingCents)}`
                  : formatCents(budget.remainingCents)}
              </span>

              <span
                className={`shrink-0 text-xs font-medium ${deficit ? "text-[var(--deficit)]" : "text-[var(--muted)]"}`}
              >
                {deficit ? "Déficit" : budget.isProjection ? "Projection" : "Constaté"}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
