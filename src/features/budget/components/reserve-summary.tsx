"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { computeMonthlySpending } from "@/features/budget/expenses";
import { RESERVE_HORIZON_REACHED, reserveShortfallMessage } from "@/features/budget/messages";
import { TabLink } from "@/features/navigation/components/tab-link";
import { formatCents } from "@/lib/money";

/** Un solde de réserve : jamais de négatif brut, un découvert se dit en toutes lettres (FR-018). */
function solde(cents: number): string {
  return cents < 0 ? reserveShortfallMessage(formatCents(-cents)) : formatCents(cents);
}

/**
 * La réserve d'épargne vue du mois sélectionné (specs/008-savings-reserve, FR-017).
 *
 * Placée sous le bilan du mois, dont le « reste disponible » ne compte que revenus et
 * abonnements : la ligne « Disponible avec la part d'épargne » fait le lien avec le
 * « disponible ce mois » de l'anneau, qui, lui, inclut la part.
 *
 * Ne rend rien pour un mois sans réserve — avant la première déclaration, ou après un retrait.
 */
export function ReserveSummary() {
  const { document, selectedMonth, today } = useBudget();
  const bilan = computeMonthlySpending(document, selectedMonth, today);
  const reserve = bilan.reserve;
  if (reserve === null) return null;

  const lignes: [string, string][] = [
    ["Réserve en début de mois", solde(reserve.openingCents)],
    ["Mois restants", String(reserve.monthsRemaining)],
    ["Part du mois", formatCents(Math.max(0, reserve.shareCents))],
    ["Disponible avec la part d’épargne", solde(bilan.availableCents)],
    ["Épargne entamée ce mois", formatCents(reserve.drawnCents)],
    ["Réserve prévue en fin de mois", solde(reserve.closingCents)],
  ];

  return (
    <section
      aria-labelledby="titre-reserve-mois"
      className="space-y-3 rounded-lg border border-[var(--border)] p-4"
    >
      <h2 id="titre-reserve-mois" className="text-lg font-semibold">
        Réserve d’épargne
      </h2>

      <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        {lignes.map(([intitule, valeur]) => (
          <div key={intitule}>
            <dt className="text-[var(--muted)]">{intitule}</dt>
            <dd className="font-semibold tabular-nums">{valeur}</dd>
          </div>
        ))}
      </dl>

      {reserve.horizonReached ? (
        <p className="text-sm font-medium">
          {RESERVE_HORIZON_REACHED}{" "}
          <TabLink tab="settings" section="titre-reserve" className="underline">
            Choisir une nouvelle durée
          </TabLink>
        </p>
      ) : null}
    </section>
  );
}
