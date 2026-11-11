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
import type { Income, IncomeKind, Periodicity } from "@/features/budget/types";
import { incomeAmountInMonth, withMonthOverride } from "@/features/budget/calculs";
import { compareIso, isValidIsoDate } from "@/lib/date";
import { formatMonthFr } from "@/lib/format";
import { centsToInputValue, formatCents, parseAmountInput } from "@/lib/money";

interface Erreurs {
  label?: string;
  amount?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
}

/** Portée d’une modification de revenu récurrent. */
type Portee = "month" | "all";

function valeursInitiales(revenu: Income | null, defaut: string) {
  if (!revenu) {
    return {
      label: "",
      amount: "",
      kind: "recurring" as IncomeKind,
      periodicity: "monthly" as Periodicity,
      date: defaut,
      startDate: defaut,
      endDate: "",
    };
  }
  return {
    label: revenu.label,
    // Réaffiché en clair pour l’édition : le formatage monétaire complet gênerait la saisie.
    amount: centsToInputValue(revenu.amountCents),
    kind: revenu.kind,
    periodicity: revenu.kind === "recurring" ? revenu.periodicity : "monthly",
    date: revenu.kind === "oneOff" ? revenu.date : defaut,
    startDate: revenu.kind === "recurring" ? revenu.startDate : defaut,
    endDate: revenu.kind === "recurring" ? (revenu.endDate ?? "") : "",
  };
}

/**
 * Saisie et modification d’un revenu (EF-001 à EF-004).
 *
 * Toute saisie invalide est refusée avec un message textuel à côté du champ, et rien n’est
 * enregistré.
 */
export function IncomeForm({
  editing,
  onDone,
}: {
  editing?: Income | null;
  onDone?: () => void;
}) {
  const { addIncome, updateIncome, today, selectedMonth } = useBudget();
  const prefixe = useId();
  const [valeurs, setValeurs] = useState(() => valeursInitiales(editing ?? null, today));
  const [erreurs, setErreurs] = useState<Erreurs>({});

  // Modifier un revenu récurrent ne touche par défaut que le mois consulté : changer son
  // montant pour tous les mois réécrirait aussi les mois passés.
  const editionRecurrente = editing?.kind === "recurring" ? editing : null;
  const [portee, setPortee] = useState<Portee>("month");
  const montantDuMois = editionRecurrente
    ? incomeAmountInMonth(editionRecurrente, selectedMonth)
    : null;
  const [montantMois, setMontantMois] = useState(() =>
    montantDuMois === null ? "" : centsToInputValue(montantDuMois),
  );
  const exceptionDuMois =
    editionRecurrente?.monthOverrides?.some((o) => o.month === selectedMonth) ?? false;
  const modeMois = editionRecurrente !== null && portee === "month";

  const estRecurrent = valeurs.kind === "recurring";

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

    if (estRecurrent) {
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
    } else if (!isValidIsoDate(valeurs.date)) {
      trouvees.date = DATE_INVALID;
    }

    return trouvees;
  }

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();

    if (modeMois && editionRecurrente) {
      const montant = parseAmountInput(montantMois);
      if (!montant.ok) {
        setErreurs({ amount: AMOUNT_ERROR_MESSAGES[montant.reason] });
        return;
      }
      updateIncome(withMonthOverride(editionRecurrente, selectedMonth, montant.cents));
      setErreurs({});
      onDone?.();
      return;
    }

    const trouvees = valider();
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;

    const montant = parseAmountInput(valeurs.amount);
    if (!montant.ok) return; // déjà signalé par `valider`, garde de typage

    const commun = { label: valeurs.label.trim(), amountCents: montant.cents };
    const donnees = estRecurrent
      ? {
          ...commun,
          kind: "recurring" as const,
          periodicity: valeurs.periodicity,
          startDate: valeurs.startDate,
          endDate: valeurs.endDate === "" ? null : valeurs.endDate,
        }
      : { ...commun, kind: "oneOff" as const, date: valeurs.date };

    if (editing) {
      // Les exceptions mensuelles survivent à une modification « tous les mois ».
      const exceptions =
        editionRecurrente?.monthOverrides && donnees.kind === "recurring"
          ? { monthOverrides: editionRecurrente.monthOverrides }
          : {};
      updateIncome({ ...donnees, ...exceptions, id: editing.id });
    }
    else addIncome(donnees);

    if (!editing) setValeurs(valeursInitiales(null, today));
    setErreurs({});
    onDone?.();
  }

  const apercu = parseAmountInput(valeurs.amount);

  const choixPortee = editionRecurrente ? (
    <fieldset>
      <legend className="text-sm font-medium">Appliquer la modification à</legend>
      <div className="mt-2 flex flex-wrap gap-4">
        {(
          [
            ["month", `${formatMonthFr(selectedMonth)} seulement`],
            ["all", "Tous les mois"],
          ] as const
        ).map(([valeur, libelle]) => (
          <label key={valeur} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${prefixe}-portee`}
              value={valeur}
              checked={portee === valeur}
              onChange={() => {
                setPortee(valeur);
                setErreurs({});
              }}
              className="size-4"
            />
            {libelle}
          </label>
        ))}
      </div>
    </fieldset>
  ) : null;

  if (modeMois && editionRecurrente) {
    const apercuMois = parseAmountInput(montantMois);
    return (
      <form onSubmit={soumettre} noValidate className="space-y-4">
        <p className="font-medium">{editionRecurrente.label}</p>
        {choixPortee}
        <FormField
          id={`${prefixe}-amount-month`}
          label={`Montant pour ${formatMonthFr(selectedMonth)}`}
          error={erreurs.amount}
        >
          {(props) => (
            <>
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className={inputClassName}
                value={montantMois}
                onChange={(e) => setMontantMois(e.target.value)}
              />
              <p className="mt-1 text-sm text-[var(--muted)]">
                {apercuMois.ok && !erreurs.amount ? `${formatCents(apercuMois.cents)} · ` : ""}
                Montant habituel : {formatCents(editionRecurrente.amountCents)}
              </p>
            </>
          )}
        </FormField>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButtonClassName}>
            Enregistrer
          </button>
          {exceptionDuMois ? (
            <button
              type="button"
              className={buttonClassName}
              onClick={() => {
                updateIncome(withMonthOverride(editionRecurrente, selectedMonth, null));
                onDone?.();
              }}
            >
              Revenir au montant habituel
            </button>
          ) : null}
          <button type="button" className={buttonClassName} onClick={onDone}>
            Annuler
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={soumettre} noValidate className="space-y-4">
      {choixPortee}
      <FormField id={`${prefixe}-label`} label="Libellé" error={erreurs.label}>
        {(props) => (
          <input
            {...props}
            type="text"
            className={inputClassName}
            value={valeurs.label}
            onChange={(e) => modifier("label", e.target.value)}
            placeholder="Salaire, prime…"
          />
        )}
      </FormField>

      <FormField id={`${prefixe}-amount`} label="Montant" error={erreurs.amount}>
        {(props) => (
          <>
            <input
              {...props}
              type="text"
              inputMode="decimal"
              className={inputClassName}
              value={valeurs.amount}
              onChange={(e) => modifier("amount", e.target.value)}
              placeholder="2400,00"
            />
            {apercu.ok && !erreurs.amount ? (
              <p className="mt-1 text-sm text-[var(--muted)]">{formatCents(apercu.cents)}</p>
            ) : null}
          </>
        )}
      </FormField>

      <fieldset>
        <legend className="text-sm font-medium">Nature</legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {(
            [
              ["recurring", "Récurrent"],
              ["oneOff", "Ponctuel"],
            ] as const
          ).map(([valeur, libelle]) => (
            <label key={valeur} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={`${prefixe}-kind`}
                value={valeur}
                checked={valeurs.kind === valeur}
                onChange={() => modifier("kind", valeur)}
                className="size-4"
              />
              {libelle}
            </label>
          ))}
        </div>
      </fieldset>

      {estRecurrent ? (
        <div className="grid gap-4 sm:grid-cols-3">
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

          <FormField id={`${prefixe}-start`} label="Début" error={erreurs.startDate}>
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
            label="Fin (facultative)"
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
      ) : (
        <FormField id={`${prefixe}-date`} label="Date" error={erreurs.date}>
          {(props) => (
            <input
              {...props}
              type="date"
              className={inputClassName}
              value={valeurs.date}
              onChange={(e) => modifier("date", e.target.value)}
            />
          )}
        </FormField>
      )}

      <div className="flex gap-2">
        <button type="submit" className={primaryButtonClassName}>
          {editing ? "Enregistrer" : "Ajouter le revenu"}
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
