"use client";

import { useMemo, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import { EnvelopeForm } from "@/features/budget/components/envelope-form";
import { EnvelopeSummary } from "@/features/budget/components/envelope-summary";
import {
  buttonClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import { computeMonthlyEnvelopes, envelopesForMonth } from "@/features/budget/envelopes";
import {
  COPY_REPLACE_CONFIRM,
  ENVELOPE_DELETE_HINT,
  ENVELOPE_STATE_LABELS,
  NOTHING_TO_COPY,
  NO_ENVELOPE_YET,
} from "@/features/budget/messages";
import type { Cents, EnvelopeState, EnvelopeStatus } from "@/features/budget/types";
import { formatCents } from "@/lib/money";
import { addMonthsToKey } from "@/lib/date";

/**
 * Couleur de renfort de chaque état. Elle ne porte **jamais** l'information : le libellé
 * textuel la porte (EF-017). Retirer la couleur ne doit rien faire perdre (CS-006).
 */
const COULEUR_ETAT: Readonly<Record<EnvelopeState, string>> = {
  unused: "var(--muted)",
  onTrack: "var(--surplus)",
  nearingLimit: "var(--warning)",
  overBudget: "var(--deficit)",
};

/**
 * Section « Enveloppes » : les plafonds du mois consulté et leur consommation.
 *
 * Elle suit le sélecteur de mois de l'en-tête et n'en introduit pas un second (EF-019) : le
 * mois affiché ici est toujours celui qu'affiche le reste de la page.
 *
 * Tout ce qui est montré est **dérivé** à la lecture (EF-010) : une dépense créée, modifiée
 * ou supprimée se répercute sans action de rafraîchissement, y compris lorsqu'un changement
 * de date fait passer une dépense d'un mois à l'autre.
 */
export function EnvelopeList() {
  const { document, selectedMonth, removeEnvelope, copyEnvelopesFromPreviousMonth } =
    useBudget();
  const [enEdition, setEnEdition] = useState<string | null>(null);
  const [confirmationSuppression, setConfirmationSuppression] = useState<string | null>(
    null,
  );
  const [confirmationReport, setConfirmationReport] = useState(false);

  const synthese = useMemo(
    () => computeMonthlyEnvelopes(document, selectedMonth),
    [document, selectedMonth],
  );

  // Le report est indisponible tant que le mois précédent n'a rien à offrir : mieux vaut le
  // dire que proposer une action sans effet (EF-020).
  const aReporter = useMemo(
    () =>
      envelopesForMonth(document.envelopes, addMonthsToKey(selectedMonth, -1)).length > 0,
    [document.envelopes, selectedMonth],
  );
  const remplacerait = synthese.envelopes.length > 0;

  return (
    <section aria-labelledby="titre-enveloppes" className="space-y-4">
      <h2 id="titre-enveloppes" className="text-lg font-semibold">
        Enveloppes
      </h2>

      <EnvelopeSummary synthese={synthese} />

      {synthese.envelopes.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">{NO_ENVELOPE_YET}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {synthese.envelopes.map((statut) => (
            <li key={statut.envelopeId} className="p-3">
              {enEdition === statut.envelopeId ? (
                <EnvelopeForm
                  key={statut.envelopeId}
                  editing={statut}
                  onDone={() => setEnEdition(null)}
                />
              ) : (
                <LigneEnveloppe
                  statut={statut}
                  enConfirmation={confirmationSuppression === statut.envelopeId}
                  onModifier={() => {
                    setConfirmationSuppression(null);
                    setEnEdition(statut.envelopeId);
                  }}
                  onDemanderSuppression={() =>
                    setConfirmationSuppression(statut.envelopeId)
                  }
                  onAnnulerSuppression={() => setConfirmationSuppression(null)}
                  onConfirmerSuppression={() => {
                    removeEnvelope(statut.envelopeId);
                    setConfirmationSuppression(null);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-[var(--border)] p-3">
        <EnvelopeForm />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          className={`${buttonClassName} disabled:cursor-not-allowed disabled:opacity-60`}
          disabled={!aReporter}
          aria-describedby={aReporter ? undefined : "report-indisponible"}
          onClick={() => {
            // Le remplacement écrase des plafonds saisis à la main : il se confirme (EF-021).
            if (remplacerait) {
              setConfirmationReport(true);
              return;
            }
            copyEnvelopesFromPreviousMonth(selectedMonth);
          }}
        >
          Reprendre les plafonds du mois précédent
        </button>

        {aReporter ? null : (
          <p id="report-indisponible" className="text-sm text-[var(--muted)]">
            {NOTHING_TO_COPY}
          </p>
        )}

        {confirmationReport ? (
          <div
            role="alert"
            className="space-y-3 rounded-md border border-[var(--deficit)] p-3 text-sm"
          >
            <p>{COPY_REPLACE_CONFIRM}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={primaryButtonClassName}
                onClick={() => {
                  copyEnvelopesFromPreviousMonth(selectedMonth);
                  setConfirmationReport(false);
                }}
              >
                Remplacer
              </button>
              <button
                type="button"
                className={buttonClassName}
                onClick={() => setConfirmationReport(false)}
              >
                Annuler
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LigneEnveloppe({
  statut,
  enConfirmation,
  onModifier,
  onDemanderSuppression,
  onAnnulerSuppression,
  onConfirmerSuppression,
}: {
  statut: EnvelopeStatus;
  enConfirmation: boolean;
  onModifier: () => void;
  onDemanderSuppression: () => void;
  onAnnulerSuppression: () => void;
  onConfirmerSuppression: () => void;
}) {
  const couleur = COULEUR_ETAT[statut.state];
  const enDepassement = statut.state === "overBudget";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{statut.category}</p>
          <p className="text-sm" style={{ color: couleur }}>
            {ENVELOPE_STATE_LABELS[statut.state]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/*
            Nom accessible porté par `aria-label` plutôt que par un `sr-only` accolé : le
            calcul du nom accessible supprime l’espace de tête du second nœud de texte, et
            le lecteur d’écran annonçait « Supprimerl’enveloppe Courses ».
          */}
          <button
            type="button"
            className={buttonClassName}
            aria-label={`Modifier le plafond de ${statut.category}`}
            onClick={onModifier}
          >
            Modifier
          </button>
          <button
            type="button"
            className={buttonClassName}
            aria-label={`Supprimer l’enveloppe ${statut.category}`}
            onClick={onDemanderSuppression}
          >
            Supprimer
          </button>
        </div>
      </div>

      <BarreConsommation ratio={statut.consumedRatio} couleur={couleur} />

      {/*
        Plafond, dépensé et restant sont toujours présents (EF-011). En dépassement, le
        troisième change de nature : on affiche le **montant du dépassement**, jamais un
        reste négatif brut (EF-016) — « −45,00 € restants » se lit mal et se retient mal.
      */}
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <Montant libelle="Plafond" montant={statut.limitCents} />
        <Montant libelle="Dépensé" montant={statut.spentCents} />
        {enDepassement ? (
          <Montant
            libelle="Dépassement"
            montant={statut.overspentCents}
            couleur="var(--deficit)"
          />
        ) : (
          <Montant libelle="Restant" montant={statut.remainingCents} />
        )}
      </dl>

      {enConfirmation ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-[var(--deficit)] p-3 text-sm"
        >
          <p>
            Supprimer l’enveloppe « {statut.category} » ? {ENVELOPE_DELETE_HINT}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButtonClassName}
              onClick={onConfirmerSuppression}
            >
              Supprimer
            </button>
            <button
              type="button"
              className={buttonClassName}
              onClick={onAnnulerSuppression}
            >
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Progression purement **décorative** : `aria-hidden`, puisque les trois montants et le
 * libellé d'état disent déjà tout. `consumedRatio` est déjà plafonné à 1 par le domaine, la
 * barre ne peut donc pas déborder de son cadre.
 */
function BarreConsommation({ ratio, couleur }: { ratio: number; couleur: string }) {
  return (
    <div
      aria-hidden="true"
      className="h-2 overflow-hidden rounded-full bg-[var(--surface)]"
    >
      <div
        className="h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500"
        style={{ width: `${ratio * 100}%`, backgroundColor: couleur }}
      />
    </div>
  );
}

function Montant({
  libelle,
  montant,
  couleur,
}: {
  libelle: string;
  montant: Cents;
  couleur?: string;
}) {
  return (
    <div>
      <dt className="text-[var(--muted)]">{libelle}</dt>
      <dd
        className="font-semibold tabular-nums"
        style={couleur ? { color: couleur } : undefined}
      >
        {formatCents(montant)}
      </dd>
    </div>
  );
}
