"use client";

import { useId, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  FormField,
  inputClassName,
  primaryButtonClassName,
  buttonClassName,
} from "@/features/budget/components/form-field";
import {
  CATEGORY_REQUIRED,
  LABEL_TOO_LONG,
  LIMIT_ERROR_MESSAGES,
  ZERO_LIMIT_MEANING,
} from "@/features/budget/messages";
import { centsToInputValue, parseLimitInput } from "@/lib/money";
import type { EnvelopeStatus } from "@/features/budget/types";

interface Erreurs {
  category?: string;
  limit?: string;
}

/**
 * Définition ou modification d’un plafond (EF-001, EF-004).
 *
 * Le mois n’est pas un champ : c’est celui du sélecteur déjà en place. Introduire un second
 * sélecteur ici permettrait de croire qu’on plafonne un mois alors qu’on en consulte un autre.
 *
 * L’état initial est lu une seule fois, au montage : `editing` est un **dérivé**, recalculé
 * à chaque lecture du document. Le resynchroniser par un effet écraserait la saisie en cours
 * dès qu’une dépense change ailleurs dans l’application. C’est l’appelant qui remonte le
 * formulaire, par une clé portant l’identifiant de l’enveloppe.
 *
 * En modification, la catégorie est en lecture seule. La changer reviendrait à créer une autre
 * enveloppe tout en effaçant la première — deux opérations sous un seul geste, dont l’une
 * détruit des données. Supprimer puis recréer reste possible, et le dit.
 */
export function EnvelopeForm({
  editing,
  onDone,
}: {
  editing?: EnvelopeStatus;
  onDone?: () => void;
}) {
  const { setEnvelopeLimit, selectedMonth } = useBudget();
  const prefixe = useId();

  const [categorie, setCategorie] = useState(editing?.category ?? "");
  const [plafond, setPlafond] = useState(
    editing ? centsToInputValue(editing.limitCents) : "",
  );
  const [erreurs, setErreurs] = useState<Erreurs>({});

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();

    const trouvees: Erreurs = {};
    const categorieNettoyee = categorie.trim();

    if (categorieNettoyee === "") trouvees.category = CATEGORY_REQUIRED;
    else if (categorieNettoyee.length > 80) trouvees.category = LABEL_TOO_LONG;

    const analyse = parseLimitInput(plafond);
    if (!analyse.ok) trouvees.limit = LIMIT_ERROR_MESSAGES[analyse.reason];

    setErreurs(trouvees);
    if (Object.keys(trouvees).length > 0) return;
    if (!analyse.ok) return; // garde de typage, déjà signalé

    setEnvelopeLimit(categorieNettoyee, selectedMonth, analyse.cents);

    if (onDone) {
      onDone();
      return;
    }

    // Réinitialisation immédiate : définir cinq plafonds d’affilée ne doit demander aucun
    // geste superflu, ni rechargement ni navigation (CS-001).
    setCategorie("");
    setPlafond("");
    setErreurs({});
  }

  // Le nom accessible reprend le verbe du bouton : il doit décrire l’action, pas la section.
  const nomAction = editing
    ? `Enregistrer le plafond de ${editing.category}`
    : "Définir un nouveau plafond";

  return (
    <form onSubmit={soumettre} noValidate className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <FormField
          id={`${prefixe}-categorie`}
          label="Catégorie"
          error={erreurs.category}
          className="min-w-40 flex-1"
        >
          {(props) =>
            editing ? (
              <input
                {...props}
                type="text"
                readOnly
                className={`${inputClassName} text-[var(--muted)]`}
                value={categorie}
              />
            ) : (
              <input
                {...props}
                type="text"
                autoComplete="off"
                className={inputClassName}
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
                placeholder="Courses"
              />
            )
          }
        </FormField>

        <FormField
          id={`${prefixe}-plafond`}
          label="Plafond du mois"
          error={erreurs.limit}
          className="min-w-40 flex-1"
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              className={inputClassName}
              value={plafond}
              onChange={(e) => setPlafond(e.target.value)}
              placeholder="400"
            />
          )}
        </FormField>

        <button type="submit" className={primaryButtonClassName} aria-label={nomAction}>
          {editing ? "Enregistrer" : "Définir"}
        </button>

        {onDone ? (
          <button type="button" className={buttonClassName} onClick={onDone}>
            Annuler
          </button>
        ) : null}
      </div>

      <p className="text-sm text-[var(--muted)]">{ZERO_LIMIT_MEANING}</p>
    </form>
  );
}
