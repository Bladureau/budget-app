"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  FormField,
  buttonClassName,
  inputClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import {
  AMOUNT_ERROR_MESSAGES,
  DATE_INVALID,
  LABEL_REQUIRED,
  LABEL_TOO_LONG,
} from "@/features/budget/messages";
import {
  RULE_EDIT_ERROR_MESSAGES,
  TAG_EXPLANATION,
  TAG_EXPLANATION_IMPORTED,
  TAG_NO_SUBSCRIPTION,
} from "@/features/banking/messages";
import { PERIODICITY_LABELS } from "@/features/budget/types";
import type { Expense, Periodicity } from "@/features/budget/types";
import { isValidIsoDate } from "@/lib/date";
import { formatIsoDateFr } from "@/lib/format";
import { centsToInputValue, formatCents, parseAmountInput } from "@/lib/money";

type Choix = "existant" | "nouveau";

interface Erreurs {
  subscription?: string;
  label?: string;
  amount?: string;
  startDate?: string;
  pattern?: string;
}

/**
 * Fenêtre « Marquer comme abonnement » (specs/006-bank-sync, récit 6).
 *
 * Une dépense qui est en réalité le paiement d'un abonnement est rattachée à un abonnement
 * existant, ou à un abonnement créé ici même, prérempli d'après la dépense. La dépense est
 * alors retirée : l'abonnement la compte déjà dans les charges du mois.
 *
 * `<dialog>` natif ouvert en mode modal : le navigateur piège le focus, ferme sur Échap et
 * rend le reste de la page inerte, sans code d'accessibilité à écrire (principe VII).
 */
export function SubscriptionTagDialog({
  expense,
  onDone,
}: {
  expense: Expense;
  onDone: () => void;
}) {
  const { document, tagExpenseAsSubscription } = useBudget();
  const prefixe = useId();
  const dialogue = useRef<HTMLDialogElement>(null);

  const abonnements = document.subscriptions;
  const importee = expense.source !== undefined;

  const [choix, setChoix] = useState<Choix>(abonnements.length > 0 ? "existant" : "nouveau");
  const [abonnement, setAbonnement] = useState(abonnements[0]?.id ?? "");
  const [libelle, setLibelle] = useState(expense.label ?? "");
  const [montant, setMontant] = useState(centsToInputValue(expense.amountCents));
  const [periodicite, setPeriodicite] = useState<Periodicity>("monthly");
  const [premiereEcheance, setPremiereEcheance] = useState(expense.date);
  const [motif, setMotif] = useState(expense.label ?? "");
  const [erreurs, setErreurs] = useState<Erreurs>({});

  useEffect(() => {
    const element = dialogue.current;
    if (element && !element.open) element.showModal();
  }, []);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    const trouvees: Erreurs = {};

    const analyseMontant = parseAmountInput(montant);
    if (choix === "existant") {
      if (abonnement === "") trouvees.subscription = TAG_NO_SUBSCRIPTION;
    } else {
      const propre = libelle.trim();
      if (propre.length === 0) trouvees.label = LABEL_REQUIRED;
      else if (propre.length > 80) trouvees.label = LABEL_TOO_LONG;
      if (!analyseMontant.ok) trouvees.amount = AMOUNT_ERROR_MESSAGES[analyseMontant.reason];
      if (!isValidIsoDate(premiereEcheance)) trouvees.startDate = DATE_INVALID;
    }

    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;

    const cible =
      choix === "existant" || !analyseMontant.ok
        ? { subscriptionId: abonnement }
        : {
            create: {
              label: libelle.trim(),
              periodicity: periodicite,
              startDate: premiereEcheance,
              endDate: null,
              amounts: [{ amountCents: analyseMontant.cents, effectiveFrom: premiereEcheance }],
              pauses: [],
            },
          };

    const refus = tagExpenseAsSubscription(expense.id, cible, motif);
    if (refus === "invalidPattern") {
      setErreurs({ pattern: RULE_EDIT_ERROR_MESSAGES.invalidPattern });
      return;
    }
    // Dépense ou abonnement disparus entre-temps (autre appareil) : il n'y a plus rien à faire.
    onDone();
  }

  const titre = `${expense.label ?? "Dépense"} du ${formatIsoDateFr(expense.date)}`;

  return (
    <dialog
      ref={dialogue}
      aria-labelledby={`${prefixe}-titre`}
      onClose={onDone}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 text-[var(--foreground)] backdrop:bg-black/50"
    >
      <form onSubmit={soumettre} noValidate className="space-y-4">
        <div>
          <h2 id={`${prefixe}-titre`} className="text-lg font-semibold">
            Marquer comme abonnement
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {titre} · {formatCents(expense.amountCents)}
          </p>
        </div>

        <p className="text-sm">
          {TAG_EXPLANATION}
          {importee ? ` ${TAG_EXPLANATION_IMPORTED}` : null}
        </p>

        {abonnements.length > 0 ? (
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">Abonnement</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${prefixe}-choix`}
                checked={choix === "existant"}
                onChange={() => setChoix("existant")}
              />
              Un abonnement existant
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${prefixe}-choix`}
                checked={choix === "nouveau"}
                onChange={() => setChoix("nouveau")}
              />
              Un nouvel abonnement
            </label>
          </fieldset>
        ) : null}

        {choix === "existant" ? (
          <FormField
            id={`${prefixe}-abonnement`}
            label="Abonnement existant"
            error={erreurs.subscription}
          >
            {(props) => (
              <select
                {...props}
                className={inputClassName}
                value={abonnement}
                onChange={(e) => setAbonnement(e.target.value)}
              >
                {abonnements.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>
        ) : (
          <div className="space-y-3">
            <FormField id={`${prefixe}-libelle`} label="Libellé de l’abonnement" error={erreurs.label}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className={inputClassName}
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                />
              )}
            </FormField>

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                id={`${prefixe}-montant`}
                label="Montant de l’échéance"
                error={erreurs.amount}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    inputMode="decimal"
                    className={inputClassName}
                    value={montant}
                    onChange={(e) => setMontant(e.target.value)}
                  />
                )}
              </FormField>

              <FormField id={`${prefixe}-periodicite`} label="Périodicité">
                {(props) => (
                  <select
                    {...props}
                    className={inputClassName}
                    value={periodicite}
                    onChange={(e) => setPeriodicite(e.target.value as Periodicity)}
                  >
                    {Object.entries(PERIODICITY_LABELS).map(([valeur, nom]) => (
                      <option key={valeur} value={valeur}>
                        {nom}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            </div>

            <FormField
              id={`${prefixe}-echeance`}
              label="Première échéance"
              error={erreurs.startDate}
            >
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClassName}
                  value={premiereEcheance}
                  onChange={(e) => setPremiereEcheance(e.target.value)}
                />
              )}
            </FormField>
          </div>
        )}

        {importee ? (
          <FormField
            id={`${prefixe}-motif`}
            label="Pour les opérations dont le libellé contient"
            error={erreurs.pattern}
          >
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="off"
                className={inputClassName}
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
              />
            )}
          </FormField>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButtonClassName}>
            Valider
          </button>
          <button type="button" className={buttonClassName} onClick={() => dialogue.current?.close()}>
            Annuler
          </button>
        </div>
      </form>
    </dialog>
  );
}
