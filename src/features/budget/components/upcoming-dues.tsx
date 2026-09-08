"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { listUpcomingDues } from "@/features/budget/calculs";
import { formatCents } from "@/lib/money";
import { formatIsoDateFr } from "@/lib/format";

/** Prochaines échéances d’abonnement, ordonnées par date (EF-024). */
export function UpcomingDues() {
  const { document, today } = useBudget();
  const echeances = listUpcomingDues(document, today, 6);

  if (echeances.length === 0) return null;

  return (
    <section aria-labelledby="titre-echeances" className="space-y-3">
      <h2 id="titre-echeances" className="text-lg font-semibold">
        Prochaines échéances
      </h2>
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
        {echeances.map((echeance) => (
          <li
            key={`${echeance.subscriptionId}-${echeance.dueDate}`}
            className="flex flex-wrap items-baseline justify-between gap-3 p-3"
          >
            <span className="font-medium">{echeance.label}</span>
            <span className="flex items-baseline gap-4 text-sm">
              <span className="text-[var(--muted)]">
                {formatIsoDateFr(echeance.dueDate)}
              </span>
              <span className="font-semibold tabular-nums">
                {formatCents(echeance.amountCents)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
