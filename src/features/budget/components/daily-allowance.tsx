"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { computeDailyAllowance } from "@/features/budget/expenses";
import { NO_CARRY_OVER, NOTHING_LEFT_TO_SPREAD } from "@/features/budget/messages";
import { monthKeyOf } from "@/lib/date";
import { formatCents } from "@/lib/money";

/**
 * Allocation du jour et report de la veille (EF-015 à EF-022).
 *
 * N'a de sens que pour le mois courant : consulter un mois passé ou futur n'a pas d'« aujourd'hui ».
 */
export function DailyAllowance() {
  const { document, selectedMonth, today } = useBudget();

  if (selectedMonth !== monthKeyOf(today)) return null;

  const jour = computeDailyAllowance(document, today);
  const rienARepartir = jour.allowanceCents === 0;
  const journeeDepassee = jour.remainingTodayCents < 0;

  return (
    <section
      aria-labelledby="titre-allocation"
      className="rounded-lg border border-[var(--border)] p-4"
    >
      <h2 id="titre-allocation" className="text-sm font-medium text-[var(--muted)]">
        Aujourd’hui
      </h2>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <p className="text-2xl font-semibold tabular-nums">
          {formatCents(jour.allowanceCents)}
        </p>
        <p className="text-sm text-[var(--muted)]">
          réparti sur {jour.daysRemaining}{" "}
          {jour.daysRemaining > 1 ? "jours restants" : "jour restant"}
        </p>
      </div>

      {rienARepartir ? (
        <p className="mt-2 text-sm text-[var(--deficit)]">{NOTHING_LEFT_TO_SPREAD}</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-[var(--muted)]">Dépensé aujourd’hui</dt>
            <dd className="font-semibold tabular-nums">
              {formatCents(jour.spentTodayCents)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">
              {journeeDepassee ? "Dépassé de" : "Reste pour la journée"}
            </dt>
            <dd
              className={`font-semibold tabular-nums ${
                journeeDepassee ? "text-[var(--deficit)]" : ""
              }`}
            >
              {/* Jamais un nombre négatif brut : on nomme le dépassement. */}
              {formatCents(
                journeeDepassee ? -jour.remainingTodayCents : jour.remainingTodayCents,
              )}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm">
        {jour.carryOverCents === null ? (
          // L'absence de veille n'est pas un report nul : on le dit.
          <span className="text-[var(--muted)]">{NO_CARRY_OVER}</span>
        ) : jour.carryOverCents >= 0 ? (
          <span className="text-[var(--surplus)]">
            Report d’hier : <strong>+{formatCents(jour.carryOverCents)}</strong> gagnés en
            dépensant moins que prévu.
          </span>
        ) : (
          <span className="text-[var(--deficit)]">
            Report d’hier : <strong>−{formatCents(-jour.carryOverCents)}</strong> à rattraper.
          </span>
        )}
      </p>
    </section>
  );
}
