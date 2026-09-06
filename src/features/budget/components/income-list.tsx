"use client";

import { useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import { IncomeForm } from "@/features/budget/components/income-form";
import { buttonClassName } from "@/features/budget/components/form-field";
import { occurrencesInMonth, totalIncomeCentsForMonth } from "@/features/budget/calculs";
import { PERIODICITY_LABELS } from "@/features/budget/types";
import type { Income } from "@/features/budget/types";
import { formatCents } from "@/lib/money";
import { formatIsoDateFr } from "@/lib/format";

/** Liste des revenus imputés au mois consulté, avec leur total (EF-003, EF-005). */
export function IncomeList() {
  const { document, selectedMonth, removeIncome } = useBudget();
  const [enEdition, setEnEdition] = useState<Income | null>(null);

  const duMois = document.incomes.filter(
    (revenu) => occurrencesInMonth(revenu, selectedMonth).length > 0,
  );
  const total = totalIncomeCentsForMonth(document.incomes, selectedMonth);

  return (
    <section aria-labelledby="titre-revenus" className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="titre-revenus" className="text-lg font-semibold">
          Revenus
        </h2>
        <p className="text-sm">
          <span className="text-[var(--muted)]">Total du mois </span>
          <span className="font-semibold tabular-nums">{formatCents(total)}</span>
        </p>
      </div>

      {duMois.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Aucun revenu pour ce mois. Ajoutez-en un ci-dessous.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {duMois.map((revenu) => {
            const echeances = occurrencesInMonth(revenu, selectedMonth);
            return (
              <li key={revenu.id} className="p-3">
                {enEdition?.id === revenu.id ? (
                  <IncomeForm editing={revenu} onDone={() => setEnEdition(null)} />
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{revenu.label}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {revenu.kind === "recurring"
                          ? `${PERIODICITY_LABELS[revenu.periodicity]} · échéance le ${formatIsoDateFr(echeances[0])}`
                          : `Ponctuel · ${formatIsoDateFr(revenu.date)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">
                        {formatCents(revenu.amountCents)}
                      </span>
                      {/*
                        Nom accessible porté par `aria-label` : accolé à un `sr-only`,
                        l’espace séparateur disparaît au calcul du nom accessible.
                      */}
                      <button
                        type="button"
                        className={buttonClassName}
                        aria-label={`Modifier le revenu ${revenu.label}`}
                        onClick={() => setEnEdition(revenu)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className={buttonClassName}
                        aria-label={`Supprimer le revenu ${revenu.label}`}
                        onClick={() => removeIncome(revenu.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <details className="rounded-lg border border-[var(--border)] p-3">
        <summary className="cursor-pointer text-sm font-medium">Ajouter un revenu</summary>
        <div className="mt-4">
          <IncomeForm />
        </div>
      </details>
    </section>
  );
}
