"use client";

import { useId, useState } from "react";
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
  END_BEFORE_START,
  LABEL_REQUIRED,
  LABEL_TOO_LONG,
} from "@/features/budget/messages";
import { PERIODICITY_LABELS } from "@/features/budget/types";
import type { Periodicity, Subscription } from "@/features/budget/types";
import { compareIso, isValidIsoDate } from "@/lib/date";
import { centsToInputValue, formatCents, parseAmountInput } from "@/lib/money";

interface Erreurs {
  label?: string;
  amount?: string;
  startDate?: string;
  endDate?: string;
}

function valeursInitiales(abonnement: Subscription | null, defaut: string) {
  if (!abonnement) {
    return {
      label: "",
      amount: "",
      periodicity: "monthly" as Periodicity,
      startDate: defaut,
      endDate: "",
    };
  }
  return {
    label: abonnement.label,
    amount: centsToInputValue(abonnement.amounts[0].amountCents),
    periodicity: abonnement.periodicity,
    startDate: abonnement.startDate,
    endDate: abonnement.endDate ?? "",
  };
}

/**
 * Saisie et modification d’un abonnement (EF-006, EF-007).
 *
 * En modification, seuls le libellé, la périodicité et les dates sont ajustés ici : changer
 * le tarif à une date donnée relève du récit 5 et passe par `changeSubscriptionAmount`, qui
 * préserve l’historique au lieu de l’écraser.
 */
export function SubscriptionForm({
  editing,
  onDone,
}: {
  editing?: Subscription | null;
  onDone?: () => void;
}) {
  const { addSubscription, updateSubscription, today } = useBudget();
  const prefixe = useId();
  const [valeurs, setValeurs] = useState(() => valeursInitiales(editing ?? null, today));
  const [erreurs, setErreurs] = useState<Erreurs>({});

  function modifier<K extends keyof typeof valeurs>(champ: K, valeur: (typeof valeurs)[K]) {
    setValeurs((precedent) => ({ ...precedent, [champ]: valeur }));
  }

  function valider(): Erreurs {
    const trouvees: Erreurs = {};

    const libelle = valeurs.label.trim();
    if (libelle.length === 0) trouvees.label = LABEL_REQUIRED;
    else if (libelle.length > 80) trouvees.label = LABEL_TOO_LONG;

    const montant = parseAmountInput(valeurs.amount);
    if (!montant.ok) trouvees.amount = AMOUNT_ERROR_MESSAGES[montant.reason];

    if (!isValidIsoDate(valeurs.startDate)) trouvees.startDate = DATE_INVALID;

    if (valeurs.endDate !== "") {
      if (!isValidIsoDate(valeurs.endDate)) trouvees.endDate = DATE_INVALID;
      else if (
        isValidIsoDate(valeurs.startDate) &&
        compareIso(valeurs.endDate, valeurs.startDate) < 0
      ) {
        trouvees.endDate = END_BEFORE_START;
      }
    }

    return trouvees;
  }

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    const trouvees = valider();
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;

    const montant = parseAmountInput(valeurs.amount);
    if (!montant.ok) return;

    const finale = valeurs.endDate === "" ? null : valeurs.endDate;

    if (editing) {
      // L’historique des changements de tarif est conservé : seule la première période est
      // remplacée, car l’invariant du modèle exige qu’elle coïncide avec la date de début.
      const suivantes = editing.amounts
        .slice(1)
        .filter((periode) => compareIso(periode.effectiveFrom, valeurs.startDate) > 0);
      updateSubscription({
        ...editing,
        label: valeurs.label.trim(),
        periodicity: valeurs.periodicity,
        startDate: valeurs.startDate,
        endDate: finale,
        amounts: [
          { amountCents: montant.cents, effectiveFrom: valeurs.startDate },
          ...suivantes,
        ],
      });
    } else {
      addSubscription({
        label: valeurs.label.trim(),
        periodicity: valeurs.periodicity,
        startDate: valeurs.startDate,
        endDate: finale,
        amounts: [{ amountCents: montant.cents, effectiveFrom: valeurs.startDate }],
        pauses: [],
      });
      setValeurs(valeursInitiales(null, today));
    }

    setErreurs({});
    onDone?.();
  }

  const apercu = parseAmountInput(valeurs.amount);

  return (
    <form onSubmit={soumettre} noValidate className="space-y-4">
      <FormField id={`${prefixe}-label`} label="Libellé" error={erreurs.label}>
        {(props) => (
          <input
            {...props}
            type="text"
            className={inputClassName}
            value={valeurs.label}
            onChange={(e) => modifier("label", e.target.value)}
            placeholder="Loyer, assurance, streaming…"
          />
        )}
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={`${prefixe}-amount`} label="Montant de l’échéance" error={erreurs.amount}>
          {(props) => (
            <>
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className={inputClassName}
                value={valeurs.amount}
                onChange={(e) => modifier("amount", e.target.value)}
                placeholder="13,99"
              />
              {apercu.ok && !erreurs.amount ? (
                <p className="mt-1 text-sm text-[var(--muted)]">{formatCents(apercu.cents)}</p>
              ) : null}
            </>
          )}
        </FormField>

        <FormField id={`${prefixe}-periodicity`} label="Périodicité">
          {(props) => (
            <select
              {...props}
              className={inputClassName}
              value={valeurs.periodicity}
              onChange={(e) => modifier("periodicity", e.target.value as Periodicity)}
            >
              {Object.entries(PERIODICITY_LABELS).map(([valeur, libelle]) => (
                <option key={valeur} value={valeur}>
                  {libelle}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id={`${prefixe}-start`}
          label="Première échéance"
          error={erreurs.startDate}
        >
          {(props) => (
            <input
              {...props}
              type="date"
              className={inputClassName}
              value={valeurs.startDate}
              onChange={(e) => modifier("startDate", e.target.value)}
            />
          )}
        </FormField>

        <FormField
          id={`${prefixe}-end`}
          label="Résiliation (facultative)"
          error={erreurs.endDate}
        >
          {(props) => (
            <input
              {...props}
              type="date"
              className={inputClassName}
              value={valeurs.endDate}
              onChange={(e) => modifier("endDate", e.target.value)}
            />
          )}
        </FormField>
      </div>

      <p className="text-sm text-[var(--muted)]">
        Le jour de la première échéance fixe le jour de prélèvement. S&apos;il n&apos;existe pas dans
        un mois, l&apos;échéance est rattachée au dernier jour de ce mois.
      </p>

      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClassName}>
          {editing ? "Enregistrer" : "Ajouter l’abonnement"}
        </button>
        {editing ? (
          <button type="button" className={buttonClassName} onClick={onDone}>
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}
