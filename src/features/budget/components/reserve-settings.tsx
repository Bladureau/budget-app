"use client";

import { useId, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  FormField,
  buttonClassName,
  inputClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import { computeMonthlySpending } from "@/features/budget/expenses";
import {
  RESERVE_BALANCE_ERROR_MESSAGES,
  RESERVE_BALANCE_HELP,
  RESERVE_EXPLANATION,
  RESERVE_HORIZON_REACHED,
  RESERVE_MONTHS_ERROR_MESSAGES,
  RESERVE_ONE_OFF_REMINDER,
  RESERVE_REMOVE_CONFIRM,
  RESERVE_UPDATE_HELP,
  RESERVE_WRITE_FAILED,
  reserveShortfallMessage,
} from "@/features/budget/messages";
import { parseMonthsInput } from "@/features/budget/reserve";
import { monthKeyOf } from "@/lib/date";
import { formatCents, parseLimitInput } from "@/lib/money";

interface Erreurs {
  balance?: string;
  months?: string;
}

/**
 * Déclaration, recalage et retrait de la réserve d'épargne (specs/008-savings-reserve,
 * récits 1 et 4).
 *
 * Le mois d'effet n'est pas un champ : c'est toujours le mois en cours (FR-002). Les champs ne
 * sont pas préremplis avec la réserve calculée, même quand il en existe une : un recalage sert
 * à saisir le solde **réel** constaté à la banque, pas à confirmer celui que l'application a
 * déduit.
 */
export function ReserveSettings() {
  const { document, today, declareReserve, removeReserve } = useBudget();
  const prefixe = useId();

  const [solde, setSolde] = useState("");
  const [duree, setDuree] = useState("");
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [echecEcriture, setEchecEcriture] = useState(false);
  const [retraitDemande, setRetraitDemande] = useState(false);

  const moisCourant = monthKeyOf(today);
  const reserve = computeMonthlySpending(document, moisCourant, today).reserve;

  const revenuPonctuelCeMois = document.incomes.some(
    (revenu) => revenu.kind === "oneOff" && monthKeyOf(revenu.date) === moisCourant,
  );

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setEchecEcriture(false);

    const trouvees: Erreurs = {};
    const analyseSolde = parseLimitInput(solde);
    if (!analyseSolde.ok) trouvees.balance = RESERVE_BALANCE_ERROR_MESSAGES[analyseSolde.reason];
    const analyseDuree = parseMonthsInput(duree);
    if (!analyseDuree.ok) trouvees.months = RESERVE_MONTHS_ERROR_MESSAGES[analyseDuree.reason];

    setErreurs(trouvees);
    if (!analyseSolde.ok || !analyseDuree.ok) return;

    const issue = declareReserve(analyseSolde.cents, analyseDuree.months);
    if (issue === "tooLarge") {
      setErreurs({ balance: RESERVE_BALANCE_ERROR_MESSAGES.tooLarge });
      return;
    }
    if (issue === "writeFailed") {
      setEchecEcriture(true);
      return;
    }

    setSolde("");
    setDuree("");
    setErreurs({});
  }

  function retirer() {
    setEchecEcriture(!removeReserve());
    setRetraitDemande(false);
  }

  return (
    <section
      aria-labelledby="titre-reserve"
      className="space-y-3 rounded-lg border border-[var(--border)] p-4"
    >
      <h2 id="titre-reserve" className="text-lg font-semibold">
        Réserve d’épargne
      </h2>

      {reserve === null ? (
        <p className="text-sm text-[var(--muted)]">{RESERVE_EXPLANATION}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[var(--muted)]">Réserve en début de mois</dt>
              <dd className="font-semibold tabular-nums">
                {reserve.shortfallCents > 0
                  ? reserveShortfallMessage(formatCents(reserve.shortfallCents))
                  : formatCents(reserve.openingCents)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Mois restants</dt>
              <dd className="font-semibold tabular-nums">{reserve.monthsRemaining}</dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Part de ce mois</dt>
              <dd className="font-semibold tabular-nums">
                {formatCents(Math.max(0, reserve.shareCents))}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--muted)]">Réserve prévue en fin de mois</dt>
              <dd className="font-semibold tabular-nums">
                {reserve.closingCents < 0
                  ? reserveShortfallMessage(formatCents(-reserve.closingCents))
                  : formatCents(reserve.closingCents)}
              </dd>
            </div>
          </dl>
          {reserve.horizonReached ? (
            <p className="text-sm font-medium">{RESERVE_HORIZON_REACHED}</p>
          ) : null}
        </>
      )}

      <form onSubmit={soumettre} noValidate className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            id={`${prefixe}-solde`}
            label="Solde de l’épargne aujourd’hui"
            error={erreurs.balance}
            className="min-w-40 flex-1"
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className={inputClassName}
                value={solde}
                onChange={(e) => setSolde(e.target.value)}
                placeholder="6000"
              />
            )}
          </FormField>

          <FormField
            id={`${prefixe}-duree`}
            label="À répartir sur (mois)"
            error={erreurs.months}
            className="min-w-32 flex-1"
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className={inputClassName}
                value={duree}
                onChange={(e) => setDuree(e.target.value)}
                placeholder="12"
              />
            )}
          </FormField>

          <button
            type="submit"
            className={primaryButtonClassName}
            aria-label={reserve === null ? "Enregistrer la réserve" : "Mettre à jour la réserve"}
          >
            {reserve === null ? "Enregistrer" : "Mettre à jour"}
          </button>
        </div>

        <p className="text-sm text-[var(--muted)]">
          {reserve === null ? RESERVE_BALANCE_HELP : RESERVE_UPDATE_HELP}
        </p>

        {revenuPonctuelCeMois ? <p className="text-sm font-medium">{RESERVE_ONE_OFF_REMINDER}</p> : null}

        {echecEcriture ? (
          <p role="alert" className="text-sm text-[var(--deficit)]">
            {RESERVE_WRITE_FAILED}
          </p>
        ) : null}
      </form>

      {reserve === null ? null : retraitDemande ? (
        <div className="space-y-2 rounded-md border border-[var(--deficit)] p-3 text-sm">
          <p>{RESERVE_REMOVE_CONFIRM}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButtonClassName} onClick={retirer}>
              Confirmer le retrait
            </button>
            <button
              type="button"
              className={buttonClassName}
              onClick={() => setRetraitDemande(false)}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={buttonClassName} onClick={() => setRetraitDemande(true)}>
          Retirer la réserve
        </button>
      )}
    </section>
  );
}
