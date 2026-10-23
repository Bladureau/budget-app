"use client";

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";
import { buttonClassName, inputClassName, primaryButtonClassName } from "@/features/budget/components/form-field";
import { checkQuestion } from "@/features/assistant/conversation";
import {
  CANCELLED,
  CANCEL_EDIT,
  EDIT,
  EDIT_LABEL,
  FAILED,
  INTERRUPTED,
  LOADING,
  QUESTION_EMPTY,
  QUESTION_TOO_LONG,
  RETRY,
  SEND_EDIT,
  UNAUTHORIZED,
  UNAVAILABLE,
  UNAVAILABLE_EXPLANATION,
  WAITING,
  questionCounter,
  unverifiedWarning,
} from "@/features/assistant/messages";
import { isInFlight } from "@/features/assistant/types";
import type { Exchange } from "@/features/assistant/types";

interface ExchangeViewProps {
  exchange: Exchange;
  /** Aucune réponse n'est en cours dans la conversation : on peut modifier, relancer (EF-020). */
  idle: boolean;
  onEdit: (nouvelleQuestion: string) => void;
  onRetry: () => void;
}

/** Formulaire en place d'une question modifiée (EF-025). */
function EditionEnPlace({
  initiale,
  onValidate,
  onAbandon,
}: {
  initiale: string;
  onValidate: (question: string) => void;
  onAbandon: () => void;
}) {
  const id = useId();
  const [valeur, setValeur] = useState(initiale);
  const verification = checkQuestion(valeur);
  const erreur = verification.ok
    ? null
    : verification.reason === "tooLong"
      ? QUESTION_TOO_LONG
      : QUESTION_EMPTY;

  function valider() {
    if (verification.ok) onValidate(verification.question);
  }

  function surTouche(evenement: KeyboardEvent<HTMLTextAreaElement>) {
    if (evenement.key === "Enter" && !evenement.shiftKey && !evenement.nativeEvent.isComposing) {
      evenement.preventDefault();
      valider();
    }
  }

  return (
    <form
      className="mt-1 space-y-2"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        valider();
      }}
    >
      <label htmlFor={`${id}-champ`} className="sr-only">
        {EDIT_LABEL}
      </label>
      <textarea
        id={`${id}-champ`}
        rows={3}
        value={valeur}
        autoFocus
        aria-invalid={erreur !== null}
        aria-describedby={`${id}-compteur${erreur ? ` ${id}-erreur` : ""}`}
        onChange={(evenement) => setValeur(evenement.target.value)}
        onKeyDown={surTouche}
        className={`${inputClassName} resize-y`}
      />
      <p id={`${id}-compteur`} className="text-sm text-[var(--muted)] tabular-nums">
        {questionCounter(valeur.trim().length)}
      </p>
      {erreur ? (
        <p id={`${id}-erreur`} className="text-sm text-[var(--deficit)]">
          {erreur}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!verification.ok}
          className={`${primaryButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {SEND_EDIT}
        </button>
        <button type="button" onClick={onAbandon} className={buttonClassName}>
          {CANCEL_EDIT}
        </button>
      </div>
    </form>
  );
}

/** Ligne d'état d'un échange, dite en texte (jamais par la seule couleur : principe VII). */
function EtatDeLaReponse({ exchange, idle, onRetry }: { exchange: Exchange; idle: boolean; onRetry: () => void }) {
  const reessayer = (
    <button type="button" onClick={onRetry} disabled={!idle} className={`${buttonClassName} mt-2 disabled:opacity-50`}>
      {RETRY}
    </button>
  );

  switch (exchange.status) {
    case "waiting":
      return <p className="text-sm text-[var(--muted)]">{WAITING}</p>;
    case "loading":
      return <p className="text-sm text-[var(--muted)]">{LOADING}</p>;
    case "cancelled":
      return <p className="text-sm font-medium">{CANCELLED}</p>;
    case "interrupted":
      return (
        <div>
          <p className="text-sm font-medium">{INTERRUPTED}</p>
          {reessayer}
        </div>
      );
    case "unavailable":
      return (
        <div>
          <p className="text-sm font-semibold">{UNAVAILABLE}</p>
          <p className="text-sm text-[var(--muted)]">{UNAVAILABLE_EXPLANATION}</p>
          {reessayer}
        </div>
      );
    case "unauthorized":
      return <p className="text-sm font-semibold">{UNAUTHORIZED}</p>;
    case "failed":
      return (
        <div>
          <p className="text-sm font-semibold">{FAILED}</p>
          {reessayer}
        </div>
      );
    case "streaming":
    case "done":
      return null;
  }
}

/**
 * Un échange : la question de l'utilisateur, puis la réponse de l'assistant.
 *
 * « Vous » et « Assistant » sont du texte visible : la position ou la couleur ne portent jamais
 * seules l'information. Le texte des réponses est conservé tel quel (`pre-wrap`), sans rendu
 * Markdown (contrat d'interface §6).
 */
export function ExchangeView({ exchange, idle, onEdit, onRetry }: ExchangeViewProps) {
  const [enEdition, setEnEdition] = useState(false);
  const enCours = isInFlight(exchange.status);

  return (
    <li aria-busy={enCours} className="space-y-3 rounded-lg border border-[var(--border)] p-3">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold tracking-wide uppercase">Vous</p>
          {!enEdition ? (
            <button
              type="button"
              onClick={() => setEnEdition(true)}
              disabled={!idle}
              className={`${buttonClassName} min-h-11 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {EDIT}
            </button>
          ) : null}
        </div>
        {enEdition ? (
          <EditionEnPlace
            initiale={exchange.question}
            onValidate={(question) => {
              setEnEdition(false);
              onEdit(question);
            }}
            onAbandon={() => setEnEdition(false)}
          />
        ) : (
          <p className="mt-1 text-sm break-words whitespace-pre-wrap">{exchange.question}</p>
        )}
      </div>

      <div>
        <p className="text-xs font-semibold tracking-wide uppercase">Assistant</p>
        {exchange.answer !== "" ? (
          <p className="mt-1 text-sm break-words whitespace-pre-wrap">{exchange.answer}</p>
        ) : null}
        <div className="mt-1">
          <EtatDeLaReponse exchange={exchange} idle={idle} onRetry={onRetry} />
        </div>
        {exchange.unverified.map((valeur) => (
          <p key={valeur} className="mt-2 text-sm font-medium">
            {unverifiedWarning(valeur)}
          </p>
        ))}
      </div>
    </li>
  );
}
