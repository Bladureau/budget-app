"use client";

import { useId, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  buttonClassName,
  inputClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import { BANK_LABELS } from "@/features/banking/types";
import type { InboxItem } from "@/features/banking/types";
import { INBOX_REASON_MESSAGES, INVALID_PATTERN } from "@/features/banking/messages";
import { formatIsoDateFr } from "@/lib/format";
import { formatCents } from "@/lib/money";

type Mode = "aucun" | "depense" | "regle" | "abonnement";

/**
 * Un élément « À classer » et ses quatre choix (contrat des règles, §4).
 *
 * Les choix sont des **boutons libellés**, utilisables au clavier ; chacun qui demande une
 * précision ouvre un petit formulaire en place, sans boîte de dialogue.
 */
function ElementAClasser({ item }: { item: InboxItem }) {
  const {
    document,
    classifyInboxAsExpense,
    classifyInboxAsIgnored,
    classifyInboxWithRule,
  } = useBudget();
  const prefixe = useId();

  const [mode, setMode] = useState<Mode>("aucun");
  const [categorie, setCategorie] = useState("");
  const [motif, setMotif] = useState(item.label);
  const [abonnement, setAbonnement] = useState(document.subscriptions[0]?.id ?? "");
  const [erreur, setErreur] = useState<string | null>(null);

  const titre = `${item.label} du ${formatIsoDateFr(item.date)}`;

  function avecRegle(abonnementId: string | null) {
    if (!classifyInboxWithRule(item.ref, motif, abonnementId)) setErreur(INVALID_PATTERN);
  }

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{item.label}</p>
          <p className="text-sm text-[var(--muted)]">
            {formatIsoDateFr(item.date)} · {BANK_LABELS[item.bank]} ·{" "}
            {INBOX_REASON_MESSAGES[item.why]}
          </p>
        </div>
        <span className="font-semibold tabular-nums">
          {item.direction === "credit" ? "+ " : ""}
          {formatCents(item.amountCents)}
        </span>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--muted)]">Libellé bancaire complet</summary>
        <p className="mt-1 break-words">{item.rawLabel}</p>
      </details>

      {mode === "aucun" ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Classer ${titre}`}>
          <button type="button" className={buttonClassName} onClick={() => setMode("depense")}>
            Dépense
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => classifyInboxAsIgnored(item.ref)}
          >
            Ignorer
          </button>
          <button type="button" className={buttonClassName} onClick={() => setMode("regle")}>
            Toujours ignorer…
          </button>
          {document.subscriptions.length > 0 ? (
            <button
              type="button"
              className={buttonClassName}
              onClick={() => setMode("abonnement")}
            >
              Rattacher à un abonnement…
            </button>
          ) : null}
        </div>
      ) : (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setErreur(null);
            if (mode === "depense") {
              classifyInboxAsExpense(item.ref, categorie.trim() === "" ? null : categorie);
            } else if (mode === "regle") {
              avecRegle(null);
            } else if (abonnement !== "") {
              avecRegle(abonnement);
            }
          }}
        >
          {mode === "depense" ? (
            <div className="min-w-48 flex-1">
              <label htmlFor={`${prefixe}-categorie`} className="block text-sm font-medium">
                Catégorie (facultative)
              </label>
              <input
                id={`${prefixe}-categorie`}
                className={`${inputClassName} mt-1`}
                value={categorie}
                maxLength={80}
                onChange={(e) => setCategorie(e.target.value)}
              />
            </div>
          ) : (
            <>
              {mode === "abonnement" ? (
                <div>
                  <label htmlFor={`${prefixe}-abonnement`} className="block text-sm font-medium">
                    Abonnement
                  </label>
                  <select
                    id={`${prefixe}-abonnement`}
                    className={`${inputClassName} mt-1`}
                    value={abonnement}
                    onChange={(e) => setAbonnement(e.target.value)}
                  >
                    {document.subscriptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="min-w-48 flex-1">
                <label htmlFor={`${prefixe}-motif`} className="block text-sm font-medium">
                  Pour les opérations dont le libellé contient
                </label>
                <input
                  id={`${prefixe}-motif`}
                  className={`${inputClassName} mt-1`}
                  value={motif}
                  maxLength={80}
                  aria-invalid={erreur !== null}
                  aria-describedby={erreur ? `${prefixe}-erreur` : undefined}
                  onChange={(e) => setMotif(e.target.value)}
                />
              </div>
            </>
          )}
          <button type="submit" className={primaryButtonClassName}>
            Valider
          </button>
          <button
            type="button"
            className={buttonClassName}
            onClick={() => {
              setErreur(null);
              setMode("aucun");
            }}
          >
            Annuler
          </button>
          {erreur ? (
            <p id={`${prefixe}-erreur`} className="w-full text-sm text-[var(--deficit)]">
              {erreur}
            </p>
          ) : null}
        </form>
      )}
    </li>
  );
}

/**
 * Liste « À classer » (récit 3). Rien de ce qui s'y trouve n'affecte le budget tant que
 * l'utilisateur n'a pas décidé (EF-025).
 */
export function Inbox() {
  const { document } = useBudget();
  const elements = [...document.banking.inbox].sort((a, b) => b.date.localeCompare(a.date));
  if (elements.length === 0) return null;

  return (
    <section id="a-classer" aria-labelledby="titre-a-classer" className="space-y-2">
      <h2 id="titre-a-classer" className="text-lg font-semibold">
        À classer
      </h2>
      <p className="text-sm text-[var(--muted)]">
        Ces opérations ne sont pas comptées tant que vous ne les avez pas classées.
      </p>
      <ul className="divide-y divide-[var(--border)]">
        {elements.map((item) => (
          <ElementAClasser key={item.ref} item={item} />
        ))}
      </ul>
    </section>
  );
}

/** Compteur visible dès l'ouverture (EF-026), avec un lien vers la liste. */
export function InboxCount() {
  const { document } = useBudget();
  const nombre = document.banking.inbox.length;
  if (nombre === 0) return null;

  return (
    <p className="rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-sm font-medium">
      <a href="#a-classer" className="underline">
        {nombre === 1 ? "1 opération bancaire à classer" : `${nombre} opérations bancaires à classer`}
      </a>
    </p>
  );
}
