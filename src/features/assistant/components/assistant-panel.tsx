"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import { buttonClassName } from "@/features/budget/components/form-field";
import { askAssistant } from "@/features/assistant/client";
import {
  EMPTY_CONVERSATION,
  buildHistory,
  checkQuestion,
  conversationReducer,
  hasInFlight,
} from "@/features/assistant/conversation";
import { ExchangeView } from "@/features/assistant/components/exchange-view";
import { QuestionForm } from "@/features/assistant/components/question-form";
import {
  ASSISTANT_INTRO,
  ASSISTANT_TITLE,
  CONFIRM_RESET,
  CONFIRM_RESET_NO,
  CONFIRM_RESET_YES,
  EXAMPLE_QUESTIONS,
  PENDING_CHANGES_NOTICE,
  STATUS_ANNOUNCEMENTS,
  displayedMonth,
} from "@/features/assistant/messages";
import { compareIso, monthKeyOf } from "@/lib/date";
import { formatMonthFr } from "@/lib/format";

/**
 * Onglet « Assistant » (specs/009-local-ai-assistant).
 *
 * La conversation vit dans l'état de ce composant et nulle part ailleurs (EF-014) : le panneau est
 * remonté à chaque changement de mois (`key={selectedMonth}` dans `budget-view.tsx`), ce qui la
 * remet à zéro sans code dédié. Rien n'est stocké, exporté ni synchronisé.
 *
 * Une seule réponse à la fois : pendant qu'elle est en cours, envoyer et modifier sont impossibles,
 * annuler reste possible (EF-020, EF-026). Annuler ferme la connexion, ce qui arrête la génération
 * côté serveur.
 */
export function AssistantPanel() {
  const { selectedMonth, today, pendingChanges } = useBudget();

  const [conversation, dispatch] = useReducer(conversationReducer, EMPTY_CONVERSATION);
  const [brouillon, setBrouillon] = useState("");
  const [envoiAVide, setEnvoiAVide] = useState(false);
  const [confirmeEffacement, setConfirmeEffacement] = useState(false);

  const controleur = useRef<AbortController | null>(null);
  const compteur = useRef(0);
  const champ = useRef<HTMLTextAreaElement | null>(null);
  const boutonAnnuler = useRef<HTMLButtonElement | null>(null);
  const etaitEnCours = useRef(false);

  const enCours = hasInFlight(conversation);
  const dernier = conversation.exchanges.at(-1);

  // Le focus suit la réponse : « Annuler » quand elle démarre, le champ quand elle se termine.
  useEffect(() => {
    if (enCours) boutonAnnuler.current?.focus();
    else if (etaitEnCours.current) champ.current?.focus();
    etaitEnCours.current = enCours;
  }, [enCours]);

  // Quitter l'onglet n'est pas le démonter ; fermer la page ou changer de mois, si : la réponse en
  // cours est alors abandonnée, et l'IA cesse de générer.
  useEffect(
    () => () => {
      controleur.current?.abort();
    },
    [],
  );

  const lancer = useCallback(
    async (exchangeId: string, question: string, historique: ReturnType<typeof buildHistory>) => {
      const cetAppel = new AbortController();
      controleur.current = cetAppel;
      try {
        for await (const event of askAssistant({
          month: selectedMonth,
          today,
          messages: [...historique, { role: "user", content: question }],
          signal: cetAppel.signal,
        })) {
          dispatch({ type: "receive", exchangeId, event });
        }
      } finally {
        if (controleur.current === cetAppel) controleur.current = null;
      }
    },
    [selectedMonth, today],
  );

  function nouvelIdentifiant(): string {
    compteur.current += 1;
    return `echange-${compteur.current}`;
  }

  function envoyer() {
    if (hasInFlight(conversation)) return;
    const verification = checkQuestion(brouillon);
    if (!verification.ok) {
      setEnvoiAVide(verification.reason === "empty");
      return;
    }

    const id = nouvelIdentifiant();
    const historique = buildHistory(conversation);
    dispatch({ type: "send", id, question: verification.question });
    setBrouillon("");
    setEnvoiAVide(false);
    void lancer(id, verification.question, historique);
  }

  function modifier(exchangeId: string, nouvelleQuestion: string) {
    if (hasInFlight(conversation)) return;
    const verification = checkQuestion(nouvelleQuestion);
    const original = conversation.exchanges.find((e) => e.id === exchangeId);
    // Une modification identique ne relance rien (le réducteur l'ignore, la requête non plus).
    if (!verification.ok || original === undefined || verification.question === original.question) return;

    const id = nouvelIdentifiant();
    const historique = buildHistory(conversation, exchangeId);
    dispatch({ type: "edit", exchangeId, id, question: verification.question });
    void lancer(id, verification.question, historique);
  }

  function reessayer(exchangeId: string) {
    if (hasInFlight(conversation)) return;
    const echange = conversation.exchanges.find((e) => e.id === exchangeId);
    if (echange === undefined) return;

    const historique = buildHistory(conversation, exchangeId);
    dispatch({ type: "retry", exchangeId });
    void lancer(exchangeId, echange.question, historique);
  }

  function annuler() {
    controleur.current?.abort();
    dispatch({ type: "cancel" });
  }

  function effacer() {
    dispatch({ type: "reset" });
    setConfirmeEffacement(false);
    champ.current?.focus();
  }

  // Échap annule la réponse en cours, comme le bouton « Annuler ».
  function surTouche(evenement: KeyboardEvent<HTMLElement>) {
    if (evenement.key === "Escape" && hasInFlight(conversation)) {
      evenement.preventDefault();
      annuler();
    }
  }

  const periode =
    selectedMonth === monthKeyOf(today)
      ? "courant"
      : compareIso(selectedMonth, monthKeyOf(today)) < 0
        ? "passé"
        : "à venir";

  return (
    <section
      aria-labelledby="titre-assistant"
      className="space-y-4"
      onKeyDown={surTouche}
    >
      <div>
        <h2 id="titre-assistant" className="text-lg font-semibold">
          {ASSISTANT_TITLE}
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{displayedMonth(formatMonthFr(selectedMonth), periode)}</p>
      </div>

      {pendingChanges ? (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
          {PENDING_CHANGES_NOTICE}
        </p>
      ) : null}

      {/* Annonces des changements d'état : la liste elle-même n'est pas « live », lire chaque
          morceau d'un texte en flux rendrait l'écoute impossible (contrat d'interface §5). */}
      <p role="status" className="sr-only">
        {dernier === undefined ? "" : STATUS_ANNOUNCEMENTS[dernier.status]}
      </p>

      {conversation.exchanges.length === 0 ? (
        <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm">{ASSISTANT_INTRO}</p>
          <ul className="flex flex-wrap gap-2" aria-label="Exemples de questions">
            {EXAMPLE_QUESTIONS.map((exemple) => (
              <li key={exemple}>
                <button
                  type="button"
                  className={buttonClassName}
                  onClick={() => {
                    // Remplit le champ, sans envoyer : l'utilisateur garde la main.
                    setBrouillon(exemple);
                    setEnvoiAVide(false);
                    champ.current?.focus();
                  }}
                >
                  {exemple}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol aria-label="Conversation" className="space-y-3">
          {conversation.exchanges.map((echange) => (
            <ExchangeView
              key={echange.id}
              exchange={echange}
              idle={!enCours}
              onEdit={(question) => modifier(echange.id, question)}
              onRetry={() => reessayer(echange.id)}
            />
          ))}
        </ol>
      )}

      {confirmeEffacement ? (
        <div role="alertdialog" aria-label={CONFIRM_RESET} className="space-y-2 rounded-lg border border-[var(--border)] p-3">
          <p className="text-sm font-medium">{CONFIRM_RESET}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClassName} onClick={effacer}>
              {CONFIRM_RESET_YES}
            </button>
            <button type="button" className={buttonClassName} onClick={() => setConfirmeEffacement(false)}>
              {CONFIRM_RESET_NO}
            </button>
          </div>
        </div>
      ) : null}

      <QuestionForm
        value={brouillon}
        onChange={(valeur) => {
          setBrouillon(valeur);
          setEnvoiAVide(false);
        }}
        onSubmit={envoyer}
        onCancel={annuler}
        onReset={() => setConfirmeEffacement(true)}
        busy={enCours}
        hasExchanges={conversation.exchanges.length > 0}
        showEmptyError={envoiAVide}
        textareaRef={champ}
        cancelRef={boutonAnnuler}
      />
    </section>
  );
}
