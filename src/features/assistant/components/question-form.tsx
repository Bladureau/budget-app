"use client";

import { useId } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { buttonClassName, inputClassName, primaryButtonClassName } from "@/features/budget/components/form-field";
import {
  BUSY_EXPLANATION,
  CANCEL_ANSWER,
  NEW_CONVERSATION,
  QUESTION_EMPTY,
  QUESTION_LABEL,
  QUESTION_TOO_LONG,
  SEND,
  questionCounter,
} from "@/features/assistant/messages";
import { QUESTION_MAX_LENGTH } from "@/features/assistant/types";

interface QuestionFormProps {
  value: string;
  onChange: (valeur: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onReset: () => void;
  /** Une réponse est en cours : l'envoi est impossible, seule l'annulation reste (EF-020). */
  busy: boolean;
  /** La conversation contient des échanges : « Nouvelle conversation » a quelque chose à effacer. */
  hasExchanges: boolean;
  /** Vrai après un envoi à vide : affiche « Saisissez une question. » */
  showEmptyError: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  cancelRef: RefObject<HTMLButtonElement | null>;
}

/**
 * Saisie d'une question (specs/009-local-ai-assistant/contracts/interface.md §2, §3 et §5).
 *
 * Entrée envoie, Maj+Entrée saute une ligne. Pendant une réponse, le champ et « Envoyer » sont
 * désactivés **et** une explication visible, reliée au champ, dit pourquoi : un grisé seul ne
 * dirait rien à un lecteur d'écran (principe VII).
 */
export function QuestionForm({
  value,
  onChange,
  onSubmit,
  onCancel,
  onReset,
  busy,
  hasExchanges,
  showEmptyError,
  textareaRef,
  cancelRef,
}: QuestionFormProps) {
  const prefixe = useId();
  const idChamp = `${prefixe}-question`;
  const idCompteur = `${prefixe}-compteur`;
  const idExplication = `${prefixe}-explication`;
  const idErreur = `${prefixe}-erreur`;

  const tropLongue = value.trim().length > QUESTION_MAX_LENGTH;
  const erreur = tropLongue ? QUESTION_TOO_LONG : showEmptyError ? QUESTION_EMPTY : null;

  const decrit = [idCompteur, busy ? idExplication : null, erreur ? idErreur : null]
    .filter((id): id is string => id !== null)
    .join(" ");

  function surTouche(evenement: KeyboardEvent<HTMLTextAreaElement>) {
    // Pendant une composition (clavier de saisie assistée), Entrée valide le mot, pas la question.
    if (evenement.key !== "Enter" || evenement.shiftKey || evenement.nativeEvent.isComposing) return;
    evenement.preventDefault();
    if (!busy) onSubmit();
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(evenement) => {
        evenement.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      <div>
        <label htmlFor={idChamp} className="block text-sm font-medium">
          {QUESTION_LABEL}
        </label>
        <textarea
          id={idChamp}
          ref={textareaRef}
          rows={3}
          value={value}
          disabled={busy}
          aria-invalid={erreur !== null}
          aria-describedby={decrit}
          onChange={(evenement) => onChange(evenement.target.value)}
          onKeyDown={surTouche}
          className={`${inputClassName} mt-1 resize-y`}
        />
        <div className="mt-1 flex flex-wrap justify-between gap-2 text-sm">
          <span id={idCompteur} className="text-[var(--muted)] tabular-nums">
            {questionCounter(value.trim().length)}
          </span>
        </div>
        {erreur ? (
          <p id={idErreur} className="mt-1 text-sm text-[var(--deficit)]">
            {erreur}
          </p>
        ) : null}
        {busy ? (
          <p id={idExplication} className="mt-1 text-sm text-[var(--muted)]">
            {BUSY_EXPLANATION}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy || tropLongue}
          className={`${primaryButtonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {SEND}
        </button>
        {busy ? (
          <button type="button" ref={cancelRef} onClick={onCancel} className={buttonClassName}>
            {CANCEL_ANSWER}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onReset}
          disabled={busy || !hasExchanges}
          className={`${buttonClassName} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {NEW_CONVERSATION}
        </button>
      </div>
    </form>
  );
}
