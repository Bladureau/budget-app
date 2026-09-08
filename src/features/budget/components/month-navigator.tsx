"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { buttonClassName } from "@/features/budget/components/form-field";
import { monthKeyOf } from "@/lib/date";
import { formatMonthFr } from "@/lib/format";

/**
 * Navigation entre les mois (EF-021).
 *
 * Le mois affiché est annoncé aux lecteurs d’écran à chaque changement grâce à `aria-live` :
 * sans cela, l’utilisateur au clavier active un bouton sans savoir où il a atterri.
 */
export function MonthNavigator() {
  const { selectedMonth, goToAdjacentMonth, goToCurrentMonth, today } = useBudget();
  const surMoisCourant = selectedMonth === monthKeyOf(today);

  return (
    <nav aria-label="Navigation entre les mois" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={buttonClassName}
        onClick={() => goToAdjacentMonth(-1)}
      >
        <span aria-hidden="true">←</span>
        <span className="sr-only">Mois précédent</span>
      </button>

      <p aria-live="polite" className="min-w-40 text-center font-medium capitalize">
        {formatMonthFr(selectedMonth)}
      </p>

      <button
        type="button"
        className={buttonClassName}
        onClick={() => goToAdjacentMonth(1)}
      >
        <span aria-hidden="true">→</span>
        <span className="sr-only">Mois suivant</span>
      </button>

      {!surMoisCourant ? (
        <button type="button" className={buttonClassName} onClick={goToCurrentMonth}>
          Mois courant
        </button>
      ) : null}
    </nav>
  );
}
