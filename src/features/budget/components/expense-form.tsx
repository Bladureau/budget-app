"use client";

import { useId, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  FormField,
  inputClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import {
  AMOUNT_ERROR_MESSAGES,
  DATE_INVALID,
  LABEL_TOO_LONG,
} from "@/features/budget/messages";
import { isValidIsoDate } from "@/lib/date";
import { parseAmountInput } from "@/lib/money";

interface Erreurs {
  amount?: string;
  date?: string;
  label?: string;
  category?: string;
}

/**
 * Saisie rapide d'une dépense (EF-001 à EF-004).
 *
 * Le montant est le seul champ obligatoire, et la date du jour est appliquée par défaut :
 * l'objectif est qu'enregistrer une dépense au comptoir d'une boulangerie ne soit pas plus
 * long que de payer (CS-001, moins de dix secondes).
 */
export function ExpenseForm() {
  const { addExpense, today } = useBudget();
  const prefixe = useId();

  const [montant, setMontant] = useState("");
  const [libelle, setLibelle] = useState("");
  const [categorie, setCategorie] = useState("");
  const [date, setDate] = useState(today);
  const [detailsOuverts, setDetailsOuverts] = useState(false);
  const [erreurs, setErreurs] = useState<Erreurs>({});

  function valider(): Erreurs {
    const trouvees: Erreurs = {};

    const analyse = parseAmountInput(montant);
    if (!analyse.ok) trouvees.amount = AMOUNT_ERROR_MESSAGES[analyse.reason];

    if (!isValidIsoDate(date)) trouvees.date = DATE_INVALID;
    if (libelle.trim().length > 80) trouvees.label = LABEL_TOO_LONG;
    if (categorie.trim().length > 80) trouvees.category = LABEL_TOO_LONG;

    return trouvees;
  }

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    const trouvees = valider();
    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;

    const analyse = parseAmountInput(montant);
    if (!analyse.ok) return; // déjà signalé, garde de typage

    const libelleNettoye = libelle.trim();
    addExpense({
      amountCents: analyse.cents,
      date,
      ...(libelleNettoye === "" ? {} : { label: libelleNettoye }),
      category: categorie.trim() === "" ? null : categorie.trim(),
    });

    // Réinitialisation immédiate : enchaîner une seconde dépense ne doit demander aucun
    // geste superflu.
    setMontant("");
    setLibelle("");
    setCategorie("");
    setDate(today);
    setErreurs({});
  }

  return (
    <section aria-labelledby="titre-saisie" className="space-y-3">
      <h2 id="titre-saisie" className="text-lg font-semibold">
        Nouvelle dépense
      </h2>

      <form onSubmit={soumettre} noValidate className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <FormField
            id={`${prefixe}-montant`}
            label="Montant"
            error={erreurs.amount}
            className="min-w-40 flex-1"
          >
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className={inputClassName}
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                placeholder="12,40"
              />
            )}
          </FormField>

          <button type="submit" className={primaryButtonClassName}>
            Enregistrer
          </button>
        </div>

        <details
          open={detailsOuverts}
          onToggle={(e) => setDetailsOuverts((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer text-sm text-[var(--muted)]">
            Libellé, catégorie, date
          </summary>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <FormField id={`${prefixe}-libelle`} label="Libellé" error={erreurs.label}>
              {(props) => (
                <input
                  {...props}
                  type="text"
                  className={inputClassName}
                  value={libelle}
                  onChange={(e) => setLibelle(e.target.value)}
                  placeholder="Boulangerie"
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
                  placeholder="Courses"
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
          </div>
        </details>
      </form>
    </section>
  );
}
