"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import { ExpenseDetail } from "@/features/budget/components/expense-detail";
import { buttonClassName, inputClassName } from "@/features/budget/components/form-field";
import { groupByDay, searchExpenses } from "@/features/budget/expenses";
import { EMPTY_JOURNAL, NO_SEARCH_RESULT } from "@/features/budget/messages";
import { compareIso, monthKeyOf } from "@/lib/date";
import { formatCents, sumCents } from "@/lib/money";
import { formatIsoDateFr, formatMonthFr } from "@/lib/format";
import { BANK_LABELS } from "@/features/banking/types";

/** Nombre de dépenses affichées d'emblée, puis ajoutées à chaque extension. */
const TAILLE_TRANCHE = 50;

/**
 * Journal des dépenses, présenté comme un relevé bancaire (EF-024 à EF-029).
 *
 * La pagination est incrémentale : une tranche s'ajoute lorsqu'une sentinelle devient
 * visible. Pas de virtualisation — elle ne se justifierait qu'avec des milliers d'éléments
 * affichés simultanément, ce que la pagination évite précisément (décision D6).
 */
export function ExpenseJournal() {
  const { document, today } = useBudget();
  const idRecherche = useId();
  const idFiltre = useId();

  const [recherche, setRecherche] = useState("");
  const [moisFiltre, setMoisFiltre] = useState<string>("");
  const [tranche, setTranche] = useState(TAILLE_TRANCHE);
  const [enEdition, setEnEdition] = useState<string | null>(null);

  /**
   * Changer de filtre repart du début de liste : conserver une tranche étendue n'aurait pas
   * de sens sur un autre jeu de résultats. Fait ici plutôt que dans un effet — réagir à un
   * changement d'état dans un effet est un détour dont React n'a pas besoin.
   */
  function filtrer(action: () => void) {
    action();
    setTranche(TAILLE_TRANCHE);
  }

  const sentinelle = useRef<HTMLDivElement>(null);

  /** Mois pour lesquels au moins une dépense existe, du plus récent au plus ancien. */
  const moisDisponibles = useMemo(() => {
    const mois = new Set(
      [...document.expenses, ...document.refunds].map((d) => monthKeyOf(d.date)),
    );
    return [...mois].sort((a, b) => compareIso(b, a));
  }, [document.expenses, document.refunds]);

  const filtrees = useMemo(() => {
    let liste = [...document.expenses];
    if (moisFiltre !== "") liste = liste.filter((d) => monthKeyOf(d.date) === moisFiltre);
    liste = searchExpenses(liste, recherche);
    return liste.sort((a, b) => compareIso(b.date, a.date));
  }, [document.expenses, moisFiltre, recherche]);

  // Remboursements (fonctionnalité 006) : mêmes filtres que les dépenses. Un remboursement a
  // un libellé et une catégorie comme une dépense, la recherche s'y applique donc telle quelle.
  const remboursements = useMemo(() => {
    let liste = [...document.refunds];
    if (moisFiltre !== "") liste = liste.filter((r) => monthKeyOf(r.date) === moisFiltre);
    return searchExpenses(liste, recherche);
  }, [document.refunds, moisFiltre, recherche]);

  const totalFiltre = useMemo(
    () =>
      sumCents(filtrees.map((d) => d.amountCents)) -
      sumCents(remboursements.map((r) => r.amountCents)),
    [filtrees, remboursements],
  );

  // Les remboursements rejoignent les journées affichées : ceux d'une journée encore hors de
  // la tranche apparaîtront avec elle.
  const journees = useMemo(() => {
    const affichees = filtrees.slice(0, tranche);
    const tronquee = filtrees.length > tranche;
    const plusAncienne = affichees.at(-1)?.date;
    const visibles =
      tronquee && plusAncienne !== undefined
        ? remboursements.filter((r) => compareIso(r.date, plusAncienne) >= 0)
        : remboursements;
    return groupByDay(affichees, visibles);
  }, [filtrees, remboursements, tranche]);

  const resteAAfficher = filtrees.length > tranche;

  // Extension au fil du défilement, sans bouton de pagination (EF-028). Le focus n'est pas
  // déplacé : on ajoute du contenu sous le point de lecture, on ne saute nulle part.
  useEffect(() => {
    const cible = sentinelle.current;
    if (!cible || !resteAAfficher || typeof IntersectionObserver === "undefined") return;

    const observateur = new IntersectionObserver((entrees) => {
      if (entrees.some((e) => e.isIntersecting)) {
        setTranche((precedente) => precedente + TAILLE_TRANCHE);
      }
    });
    observateur.observe(cible);
    return () => observateur.disconnect();
  }, [resteAAfficher]);

  const journalVide = document.expenses.length === 0 && document.refunds.length === 0;

  return (
    <section aria-labelledby="titre-journal" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="titre-journal" className="text-lg font-semibold">
          Mes dépenses
        </h2>
        {!journalVide ? (
          <p className="text-sm">
            <span className="text-[var(--muted)]">
              {moisFiltre === "" ? "Total affiché " : `Total de ${formatMonthFr(moisFiltre)} `}
            </span>
            <span className="font-semibold tabular-nums">{formatCents(totalFiltre)}</span>
          </p>
        ) : null}
      </div>

      {journalVide ? (
        <p className="text-sm text-[var(--muted)]">{EMPTY_JOURNAL}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="min-w-48 flex-1">
              <label htmlFor={idRecherche} className="block text-sm font-medium">
                Rechercher
              </label>
              <input
                id={idRecherche}
                type="search"
                className={`${inputClassName} mt-1`}
                value={recherche}
                onChange={(e) => filtrer(() => setRecherche(e.target.value))}
                placeholder="Libellé ou catégorie"
              />
            </div>

            <div>
              <label htmlFor={idFiltre} className="block text-sm font-medium">
                Mois
              </label>
              <select
                id={idFiltre}
                className={`${inputClassName} mt-1`}
                value={moisFiltre}
                onChange={(e) => filtrer(() => setMoisFiltre(e.target.value))}
              >
                <option value="">Tous les mois</option>
                {moisDisponibles.map((mois) => (
                  <option key={mois} value={mois}>
                    {formatMonthFr(mois)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filtrees.length === 0 && remboursements.length === 0 ? (
            <div className="space-y-2 text-sm">
              <p className="text-[var(--muted)]">{NO_SEARCH_RESULT}</p>
              <button
                type="button"
                className={buttonClassName}
                onClick={() =>
                  filtrer(() => {
                    setRecherche("");
                    setMoisFiltre("");
                  })
                }
              >
                Effacer la recherche
              </button>
            </div>
          ) : (
            <>
              <ol className="space-y-4">
                {journees.map((journee) => (
                  <li key={journee.date}>
                    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--border)] pb-1">
                      <h3 className="text-sm font-medium">
                        {formatIsoDateFr(journee.date)}
                        {journee.date === today ? (
                          <span className="ml-2 text-[var(--muted)]">aujourd’hui</span>
                        ) : null}
                      </h3>
                      <p className="text-sm font-semibold tabular-nums text-[var(--muted)]">
                        {formatCents(journee.subtotalCents)}
                      </p>
                    </div>

                    <ul className="divide-y divide-[var(--border)]">
                      {journee.expenses.map((depense) => (
                        <li key={depense.id} className="py-2">
                          {enEdition === depense.id ? (
                            <ExpenseDetail
                              expense={depense}
                              onDone={() => setEnEdition(null)}
                            />
                          ) : (
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium">{depense.label ?? "Dépense"}</p>
                                {depense.category || depense.source ? (
                                  <p className="text-sm text-[var(--muted)]">
                                    {/* Provenance en texte, jamais par une icône seule
                                        (EF-029, principe VII). Rien pour une saisie manuelle. */}
                                    {[
                                      depense.category,
                                      depense.source ? BANK_LABELS[depense.source] : null,
                                    ]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </p>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-semibold tabular-nums">
                                  {formatCents(depense.amountCents)}
                                </span>
                                {/*
                                  Nom accessible porté par `aria-label` : accolé à un
                                  `sr-only`, l’espace séparateur disparaît au calcul du nom
                                  et le lecteur d’écran annonçait « Détailde Marché ».
                                */}
                                <button
                                  type="button"
                                  className={buttonClassName}
                                  aria-label={`Détail de ${
                                    depense.label ?? "la dépense"
                                  } du ${formatIsoDateFr(depense.date)}`}
                                  onClick={() => setEnEdition(depense.id)}
                                >
                                  Détail
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                      {/* Remboursements (fonctionnalité 006) : distincts des dépenses, et
                          annoncés comme une déduction en toutes lettres, pas par la seule
                          couleur ni par le seul signe (principe VII). */}
                      {journee.refunds.map((remboursement) => (
                        <li key={remboursement.id} className="py-2">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium">
                                Remboursement · {remboursement.label ?? "sans libellé"}
                              </p>
                              <p className="text-sm text-[var(--muted)]">
                                {[remboursement.category, BANK_LABELS[remboursement.source]]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </p>
                            </div>
                            <span className="font-semibold tabular-nums">
                              − {formatCents(remboursement.amountCents)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>

              {resteAAfficher ? (
                <div ref={sentinelle} className="pt-2 text-center text-sm text-[var(--muted)]">
                  Chargement des dépenses plus anciennes…
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}
