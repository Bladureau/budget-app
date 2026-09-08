"use client";

import { useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import { SubscriptionForm } from "@/features/budget/components/subscription-form";
import { buttonClassName } from "@/features/budget/components/form-field";
import { SubscriptionLifecycle } from "@/features/budget/components/subscription-lifecycle";
import {
  amountAt,
  averageMonthlyCostCents,
  duesInMonth,
  isActiveSubscription,
  nextDueFrom,
  totalChargesCentsForMonth,
} from "@/features/budget/calculs";
import { PERIODICITY_LABELS } from "@/features/budget/types";
import type { Subscription } from "@/features/budget/types";
import { compareIso, startOfMonth } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { formatIsoDateFr } from "@/lib/format";

type Tri = "amount" | "nextDue";

/** Liste des abonnements, leur imputation au mois consulté et leur coût mensuel moyen. */
export function SubscriptionList() {
  const { document, selectedMonth, today, removeSubscription } = useBudget();
  const [enEdition, setEnEdition] = useState<Subscription | null>(null);
  const [tri, setTri] = useState<Tri>("amount");

  const actifs = document.subscriptions.filter((abonnement) =>
    isActiveSubscription(abonnement, today),
  );
  const inactifs = document.subscriptions.filter(
    (abonnement) => !isActiveSubscription(abonnement, today),
  );

  const reference = startOfMonth(selectedMonth);

  const tries = [...actifs].sort((a, b) => {
    if (tri === "amount") {
      const montantA = amountAt(a, reference) ?? a.amounts[0].amountCents;
      const montantB = amountAt(b, reference) ?? b.amounts[0].amountCents;
      if (montantB !== montantA) return montantB - montantA;
      return a.label.localeCompare(b.label, "fr");
    }
    const prochaineA = nextDueFrom(a, today)?.dueDate ?? "9999-12-31";
    const prochaineB = nextDueFrom(b, today)?.dueDate ?? "9999-12-31";
    const ordre = compareIso(prochaineA, prochaineB);
    return ordre !== 0 ? ordre : a.label.localeCompare(b.label, "fr");
  });

  const totalDuMois = totalChargesCentsForMonth(document.subscriptions, selectedMonth);

  return (
    <section aria-labelledby="titre-abonnements" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="titre-abonnements" className="text-lg font-semibold">
          Abonnements
        </h2>
        <p className="text-sm">
          <span className="text-[var(--muted)]">Engagé ce mois </span>
          <span className="font-semibold tabular-nums">{formatCents(totalDuMois)}</span>
        </p>
      </div>

      {actifs.length > 1 ? (
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="tri-abonnements" className="text-[var(--muted)]">
            Trier par
          </label>
          <select
            id="tri-abonnements"
            className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            value={tri}
            onChange={(e) => setTri(e.target.value as Tri)}
          >
            <option value="amount">Montant décroissant</option>
            <option value="nextDue">Prochaine échéance</option>
          </select>
        </div>
      ) : null}

      {actifs.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Aucun abonnement. Ajoutez-en un ci-dessous pour connaître vos charges engagées.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {tries.map((abonnement) => {
            const imputation = duesInMonth(abonnement, selectedMonth);
            const moyenne = averageMonthlyCostCents(abonnement, reference);
            const prochaine = nextDueFrom(abonnement, today);
            return (
              <li key={abonnement.id} className="p-3">
                {enEdition?.id === abonnement.id ? (
                  <SubscriptionForm editing={abonnement} onDone={() => setEnEdition(null)} />
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{abonnement.label}</p>
                      <p className="text-sm text-[var(--muted)]">
                        {PERIODICITY_LABELS[abonnement.periodicity]}
                        {prochaine
                          ? ` · prochaine échéance le ${formatIsoDateFr(prochaine.dueDate)}`
                          : " · plus d’échéance à venir"}
                      </p>
                      {abonnement.periodicity !== "monthly" ? (
                        <p className="text-sm text-[var(--muted)]">
                          Coût mensuel moyen : {formatCents(moyenne)}{" "}
                          <span className="italic">(indicatif, hors total)</span>
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold tabular-nums">
                        {imputation.length > 0
                          ? formatCents(imputation[0].amountCents)
                          : "—"}
                      </span>
                      {/*
                        Nom accessible porté par `aria-label` : accolé à un `sr-only`,
                        l’espace séparateur disparaît au calcul du nom accessible.
                      */}
                      <button
                        type="button"
                        className={buttonClassName}
                        aria-label={`Modifier l’abonnement ${abonnement.label}`}
                        onClick={() => setEnEdition(abonnement)}
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        className={buttonClassName}
                        aria-label={`Supprimer l’abonnement ${abonnement.label}`}
                        onClick={() => removeSubscription(abonnement.id)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                )}
                {enEdition?.id === abonnement.id ? null : (
                  <SubscriptionLifecycle subscription={abonnement} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {inactifs.length > 0 ? (
        <details className="rounded-lg border border-[var(--border)] p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Abonnements résiliés ({inactifs.length})
          </summary>
          <ul className="mt-3 space-y-2 text-sm text-[var(--muted)]">
            {inactifs.map((abonnement) => (
              <li key={abonnement.id} className="flex justify-between gap-3">
                <span>{abonnement.label}</span>
                <span>Résilié le {formatIsoDateFr(abonnement.endDate ?? undefined)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <details className="rounded-lg border border-[var(--border)] p-3">
        <summary className="cursor-pointer text-sm font-medium">Ajouter un abonnement</summary>
        <div className="mt-4">
          <SubscriptionForm />
        </div>
      </details>
    </section>
  );
}
