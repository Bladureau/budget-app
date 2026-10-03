"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { computeMonthlySpending } from "@/features/budget/expenses";
import { NO_BUDGET_YET, RING_STATUS_LABELS } from "@/features/budget/messages";
import type { RingStatus } from "@/features/budget/types";
import { formatCents } from "@/lib/money";
import { formatMonthFr } from "@/lib/format";
import { TabLink } from "@/features/navigation/components/tab-link";

const COULEURS: Readonly<Record<RingStatus, string>> = {
  untouched: "var(--surplus)",
  inProgress: "var(--surplus)",
  exhausted: "var(--balanced)",
  overspent: "var(--deficit)",
};

const CLASSES_TEXTE: Readonly<Record<RingStatus, string>> = {
  untouched: "text-[var(--surplus)]",
  inProgress: "text-[var(--surplus)]",
  exhausted: "text-[var(--balanced)]",
  overspent: "text-[var(--deficit)]",
};

const RAYON = 52;
const CIRCONFERENCE = 2 * Math.PI * RAYON;

/**
 * Anneau du reste mensuel (EF-007 à EF-014).
 *
 * L'anneau lui-même est `aria-hidden` : **toute l'information est portée par le texte**. Le
 * retirer entièrement, ou lui retirer la couleur, ne fait rien perdre — c'est le critère de
 * CS-009. Le montant central est du texte HTML et non du `<text>` SVG, ce qui le rend
 * sélectionnable, correctement mis à l'échelle au zoom et lisible par un lecteur d'écran.
 */
export function BudgetRing() {
  const { document, selectedMonth, today } = useBudget();
  const bilan = computeMonthlySpending(document, selectedMonth, today);

  const sansBudget = bilan.availableCents <= 0 && bilan.spentCents === 0;
  const enDepassement = bilan.status === "overspent";

  // EF-012 : un dépassement s'affiche comme un montant de dépassement, jamais comme un reste
  // négatif brut.
  const montantPrincipal = enDepassement
    ? formatCents(bilan.overspentCents)
    : formatCents(bilan.remainingCents);

  // « Dépassé de » plutôt que « Dépassement » : le libellé d'état, à côté, porte déjà ce
  // dernier mot, et l'intitulé du montant gagne à annoncer ce que le chiffre signifie.
  const intitule = enDepassement ? "Dépassé de" : "Reste à dépenser";

  return (
    <section
      aria-labelledby="titre-anneau"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-6"
    >
      <h2 id="titre-anneau" className="sr-only">
        Reste à dépenser en {formatMonthFr(selectedMonth)}
      </h2>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-8">
        <div className="relative shrink-0">
          <svg
            aria-hidden="true"
            viewBox="0 0 120 120"
            className="size-36 -rotate-90 sm:size-40"
          >
            <circle
              cx="60"
              cy="60"
              r={RAYON}
              fill="none"
              stroke="var(--border)"
              strokeWidth="12"
            />
            <circle
              cx="60"
              cy="60"
              r={RAYON}
              fill="none"
              stroke={COULEURS[bilan.status]}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={CIRCONFERENCE}
              // Plafonné au tour complet : la portion ne déborde jamais (EF-012).
              strokeDashoffset={CIRCONFERENCE * (1 - bilan.consumedRatio)}
              className="motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500"
            />
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-xs text-[var(--muted)]">{intitule}</span>
            <span className={`text-xl font-semibold tabular-nums ${CLASSES_TEXTE[bilan.status]}`}>
              {montantPrincipal}
            </span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <p className={`font-medium ${CLASSES_TEXTE[bilan.status]}`}>
            {RING_STATUS_LABELS[bilan.status]}
          </p>

          {sansBudget ? (
            <p className="text-sm text-[var(--muted)]">
              {NO_BUDGET_YET}{" "}
              <TabLink tab="month" section="titre-revenus" className="underline">
                Ouvrir l’onglet Mois
              </TabLink>
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[var(--muted)]">Disponible ce mois</dt>
                <dd className="font-semibold tabular-nums">
                  {formatCents(bilan.availableCents)}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Déjà dépensé</dt>
                <dd className="font-semibold tabular-nums">{formatCents(bilan.spentCents)}</dd>
              </div>
            </dl>
          )}

          {/* Fonctionnalité 006 : le dépensé affiché est net des remboursements. On le dit,
              pour que le chiffre ne paraisse pas contredire le journal (EF-031). */}
          {bilan.refundedCents > 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Remboursements déduits : {formatCents(bilan.refundedCents)}.
              {bilan.refundSurplusCents > 0
                ? ` Ils dépassent les dépenses du mois de ${formatCents(bilan.refundSurplusCents)}.`
                : null}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
