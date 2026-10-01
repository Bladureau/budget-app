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
  EXPENSE_DELETE_CONFIRM,
  LABEL_TOO_LONG,
} from "@/features/budget/messages";
import type { Expense } from "@/features/budget/types";
import { isValidIsoDate } from "@/lib/date";
import { centsToInputValue, parseAmountInput } from "@/lib/money";

interface Erreurs {
  amount?: string;
  date?: string;
  label?: string;
  category?: string;
}

/**
 * Détail d'une dépense : consultation, modification, suppression (EF-006).
 *
 * Changer la date fait changer la dépense de journée : les sous-totaux des deux journées
 * concernées sont recalculés, puisqu'ils sont dérivés et non stockés.
 */
export function ExpenseDetail({
  expense,
  onDone,
}: {
  expense: Expense;
  onDone: () => void;
}) {
  const { updateExpense, removeExpense } = useBudget();
  const prefixe = useId();

  const [montant, setMontant] = useState(centsToInputValue(expense.amountCents));
  const [libelle, setLibelle] = useState(expense.label ?? "");
  const [categorie, setCategorie] = useState(expense.category ?? "");
  const [date, setDate] = useState(expense.date);
  const [erreurs, setErreurs] = useState<Erreurs>({});
  const [confirmationSuppression, setConfirmationSuppression] = useState(false);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();

    const trouvees: Erreurs = {};
    const analyse = parseAmountInput(montant);
    if (!analyse.ok) trouvees.amount = AMOUNT_ERROR_MESSAGES[analyse.reason];
    if (!isValidIsoDate(date)) trouvees.date = DATE_INVALID;
    if (libelle.trim().length > 80) trouvees.label = LABEL_TOO_LONG;
    if (categorie.trim().length > 80) trouvees.category = LABEL_TOO_LONG;

    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0 || !analyse.ok) return;

    const libelleNettoye = libelle.trim();
    updateExpense({
      id: expense.id,
      amountCents: analyse.cents,
      date,
      ...(libelleNettoye === "" ? {} : { label: libelleNettoye }),
      category: categorie.trim() === "" ? null : categorie.trim(),
      // Une correction ne change pas l'origine d'une dépense importée (fonctionnalité 006) :
      // la provenance reste affichée, et la référence bancaire reste unique au document.
      ...(expense.source !== undefined && expense.bankRef !== undefined
        ? { source: expense.source, bankRef: expense.bankRef }
        : {}),
    });
    onDone();
  }

  return (
    <form onSubmit={soumettre} noValidate className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${prefixe}-montant`} label="Montant" error={erreurs.amount}>
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

        <FormField id={`${prefixe}-date`} label="Date" error={erreurs.date}>
          {(props) => (
            <input
              {...props}
              type="date"
              className={inputClassName}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          )}
        </FormField>

        <FormField id={`${prefixe}-libelle`} label="Libellé" error={erreurs.label}>
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

        <FormField id={`${prefixe}-categorie`} label="Catégorie" error={erreurs.category}>
          {(props) => (
            <input
              {...props}
              type="text"
              className={inputClassName}
              value={categorie}
              onChange={(e) => setCategorie(e.target.value)}
            />
          )}
        </FormField>
      </div>

      {confirmationSuppression ? (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-[var(--deficit)] p-3 text-sm"
        >
          <p>{EXPENSE_DELETE_CONFIRM}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={primaryButtonClassName}
              onClick={() => {
                removeExpense(expense.id);
                onDone();
              }}
            >
              Confirmer la suppression
            </button>
            <button
              type="button"
              className={buttonClassName}
              onClick={() => setConfirmationSuppression(false)}
            >
              Conserver
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={primaryButtonClassName}>
            Enregistrer
          </button>
          <button type="button" className={buttonClassName} onClick={onDone}>
            Annuler
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => setConfirmationSuppression(true)}
          >
            Supprimer
          </button>
        </div>
      )}
    </form>
  );
}
