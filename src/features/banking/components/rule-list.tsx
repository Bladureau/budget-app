"use client";

import { useId, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  FormField,
  buttonClassName,
  inputClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import { BANK_LABELS } from "@/features/banking/types";
import {
  RULES_EXPLANATION,
  RULE_EDIT_ERROR_MESSAGES,
  TREATMENT_ACTION_LABELS,
} from "@/features/banking/messages";
import type { RuleEditFailure } from "@/features/banking/rules";
import type { CategoryRule, TreatmentRule } from "@/features/budget/types";

/** Une seule règle est en cours de modification ou de suppression à la fois. */
type Geste = { id: string; mode: "modifier" | "supprimer" } | null;

/** Boutons d'une règle au repos. Le nom accessible porte le motif : chaque bouton est unique. */
function Actions({ motif, onModifier, onSupprimer }: {
  motif: string;
  onModifier: () => void;
  onSupprimer: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={buttonClassName}
        aria-label={`Modifier la règle ${motif}`}
        onClick={onModifier}
      >
        Modifier
      </button>
      <button
        type="button"
        className={buttonClassName}
        aria-label={`Supprimer la règle ${motif}`}
        onClick={onSupprimer}
      >
        Supprimer
      </button>
    </div>
  );
}

function ConfirmationSuppression({ motif, onConfirmer, onConserver }: {
  motif: string;
  onConfirmer: () => void;
  onConserver: () => void;
}) {
  return (
    <div role="alert" className="space-y-2 rounded-md border border-[var(--deficit)] p-3 text-sm">
      <p>
        Supprimer la règle « {motif} » ? Les opérations déjà traitées ne changent pas ; les
        prochaines ne seront plus concernées.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primaryButtonClassName} onClick={onConfirmer}>
          Confirmer la suppression
        </button>
        <button type="button" className={buttonClassName} onClick={onConserver}>
          Conserver
        </button>
      </div>
    </div>
  );
}

/**
 * Modification d'une règle. La catégorie n'est proposée que pour une règle de catégorie : une
 * règle de traitement garde sa banque et son action, seul son motif se corrige.
 */
function FormulaireRegle({
  motifInitial,
  categorieInitiale,
  onEnregistrer,
  onAnnuler,
}: {
  motifInitial: string;
  categorieInitiale?: string;
  onEnregistrer: (motif: string, categorie: string) => RuleEditFailure | null;
  onAnnuler: () => void;
}) {
  const prefixe = useId();
  const [motif, setMotif] = useState(motifInitial);
  const [categorie, setCategorie] = useState(categorieInitiale ?? "");
  const [refus, setRefus] = useState<RuleEditFailure | null>(null);

  function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setRefus(onEnregistrer(motif, categorie));
  }

  return (
    <form onSubmit={soumettre} noValidate className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <FormField
          id={`${prefixe}-motif`}
          label="Le libellé contient"
          error={refus === "invalidPattern" ? RULE_EDIT_ERROR_MESSAGES.invalidPattern : undefined}
          className="min-w-40 flex-1"
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

        {categorieInitiale !== undefined ? (
          <FormField
            id={`${prefixe}-categorie`}
            label="Catégorie"
            error={
              refus === "invalidCategory" ? RULE_EDIT_ERROR_MESSAGES.invalidCategory : undefined
            }
            className="min-w-40 flex-1"
          >
            {(props) => (
              <input
                {...props}
                type="text"
                autoComplete="off"
                className={inputClassName}
                value={categorie}
                onChange={(e) => setCategorie(e.target.value)}
              />
            )}
          </FormField>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClassName}>
          Enregistrer
        </button>
        <button type="button" className={buttonClassName} onClick={onAnnuler}>
          Annuler
        </button>
      </div>
    </form>
  );
}

/**
 * Règles de classement des opérations bancaires (specs/006-bank-sync, récit 6).
 *
 * Deux listes, chacune dans son **ordre d'évaluation** — la première règle qui correspond
 * l'emporte. Les règles fournies d'office se modifient et se suppriment comme les autres : ce
 * sont celles de l'utilisateur, pas celles du code.
 *
 * N'apparaît que si la synchronisation bancaire sert à quelque chose : serveur configuré, ou
 * import déjà commencé.
 */
export function RuleList() {
  const {
    document,
    bankStatus,
    updateTreatmentRule,
    updateCategoryRule,
    removeBankRule,
  } = useBudget();
  const [geste, setGeste] = useState<Geste>(null);

  const banking = document.banking;
  if (bankStatus?.configured !== true && banking.importFrom === null) return null;

  function resumeTraitement(regle: TreatmentRule): string {
    const banque = regle.bank === null ? "Toutes les banques" : BANK_LABELS[regle.bank];
    let action = TREATMENT_ACTION_LABELS[regle.action.type];
    if (regle.action.type === "subscription") {
      const identifiant = regle.action.subscriptionId;
      const abonnement = document.subscriptions.find((a) => a.id === identifiant);
      if (abonnement) action = `${action} (${abonnement.label})`;
    }
    return `${banque} · ${action}`;
  }

  function ligne(
    regle: TreatmentRule | CategoryRule,
    resume: string,
    categorie: string | undefined,
    enregistrer: (motif: string, categorie: string) => RuleEditFailure | null,
  ) {
    const enCours = geste?.id === regle.id ? geste.mode : null;
    return (
      <li key={regle.id} className="space-y-2 py-3">
        {enCours === "modifier" ? (
          <FormulaireRegle
            motifInitial={regle.contains}
            categorieInitiale={categorie}
            onEnregistrer={(motif, nouvelleCategorie) => {
              const refus = enregistrer(motif, nouvelleCategorie);
              if (refus === null) setGeste(null);
              return refus;
            }}
            onAnnuler={() => setGeste(null)}
          />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-sm">
              <span className="font-medium">« {regle.contains} »</span>
              <span className="text-[var(--muted)]"> — {resume}</span>
            </p>
            {enCours === null ? (
              <Actions
                motif={regle.contains}
                onModifier={() => setGeste({ id: regle.id, mode: "modifier" })}
                onSupprimer={() => setGeste({ id: regle.id, mode: "supprimer" })}
              />
            ) : null}
          </div>
        )}

        {enCours === "supprimer" ? (
          <ConfirmationSuppression
            motif={regle.contains}
            onConfirmer={() => {
              removeBankRule(regle.id);
              setGeste(null);
            }}
            onConserver={() => setGeste(null)}
          />
        ) : null}
      </li>
    );
  }

  return (
    <section
      aria-labelledby="titre-regles"
      className="space-y-4 rounded-lg border border-[var(--border)] p-4"
    >
      <div>
        <h2 id="titre-regles" className="text-lg font-semibold">
          Règles de classement
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{RULES_EXPLANATION}</p>
      </div>

      <div>
        <h3 id="titre-regles-traitement" className="font-medium">
          Opérations à ignorer ou à compter
        </h3>
        {banking.rules.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">Aucune règle.</p>
        ) : (
          <ol aria-labelledby="titre-regles-traitement" className="divide-y divide-[var(--border)]">
            {banking.rules.map((regle) =>
              ligne(regle, resumeTraitement(regle), undefined, (motif) =>
                updateTreatmentRule(regle.id, motif),
              ),
            )}
          </ol>
        )}
      </div>

      <div>
        <h3 id="titre-regles-categorie" className="font-medium">
          Catégories automatiques
        </h3>
        {banking.categoryRules.length === 0 ? (
          <p className="mt-1 text-sm text-[var(--muted)]">Aucune règle.</p>
        ) : (
          <ol aria-labelledby="titre-regles-categorie" className="divide-y divide-[var(--border)]">
            {banking.categoryRules.map((regle) =>
              ligne(regle, regle.category, regle.category, (motif, categorie) =>
                updateCategoryRule(regle.id, motif, categorie),
              ),
            )}
          </ol>
        )}
      </div>
    </section>
  );
}
