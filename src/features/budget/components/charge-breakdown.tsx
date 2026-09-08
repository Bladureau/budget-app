"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { computeMonthlyBudget } from "@/features/budget/calculs";
import { formatCents } from "@/lib/money";
import { formatIsoDateFr, formatMonthFr } from "@/lib/format";

/** Ventilation des charges du mois, du montant le plus élevé au plus faible (EF-017). */
export function ChargeBreakdown() {
  const { document, selectedMonth, today } = useBudget();
  const budget = computeMonthlyBudget(document, selectedMonth, today);

  if (budget.breakdown.length === 0) return null;

  return (
    <section aria-labelledby="titre-ventilation" className="space-y-3">
      <h2 id="titre-ventilation" className="text-lg font-semibold">
        Ventilation des charges
      </h2>
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Charges engagées de {formatMonthFr(selectedMonth)}, de la plus élevée à la plus faible
        </caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
            <th scope="col" className="py-2 font-medium">
              Abonnement
            </th>
            <th scope="col" className="py-2 font-medium">
              Échéance
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Montant
            </th>
          </tr>
        </thead>
        <tbody>
          {budget.breakdown.map((ligne) => (
            <tr
              key={`${ligne.subscriptionId}-${ligne.dueDate}`}
              className="border-b border-[var(--border)]"
            >
              <th scope="row" className="py-2 text-left font-normal">
                {ligne.label}
              </th>
              <td className="py-2 text-[var(--muted)]">{formatIsoDateFr(ligne.dueDate)}</td>
              <td className="py-2 text-right font-semibold tabular-nums">
                {formatCents(ligne.amountCents)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" colSpan={2} className="py-2 text-left font-medium">
              Total engagé
            </th>
            <td className="py-2 text-right font-semibold tabular-nums">
              {formatCents(budget.totalChargesCents)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
