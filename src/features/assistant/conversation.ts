/**
 * État de la conversation avec l'assistant : réducteur pur.
 *
 * Voir specs/009-local-ai-assistant/data-model.md §3. La conversation vit dans l'état d'un composant
 * et n'est jamais persistée (EF-014) : ni stockée, ni exportée, ni synchronisée.
 *
 * Une action dont les préconditions ne sont pas remplies est **ignorée** : le réducteur ne lève pas.
 * C'est l'interface qui désactive les boutons correspondants et en donne la raison en texte.
 */

import { MESSAGES_MAX, QUESTION_MAX_LENGTH, RESPONSE_TURN_MAX_CHARS, isInFlight } from "@/features/assistant/types";
import type {
  ChatTurn,
  ClientEvent,
  ConversationState,
  Exchange,
} from "@/features/assistant/types";

export const EMPTY_CONVERSATION: ConversationState = { exchanges: [] };

export type QuestionCheck =
  | { ok: true; question: string }
  | { ok: false; reason: "empty" | "tooLong" };

/** Une question valide fait de 1 à 500 caractères une fois les espaces retirés (EF-019). */
export function checkQuestion(brute: string): QuestionCheck {
  const question = brute.trim();
  if (question === "") return { ok: false, reason: "empty" };
  if (question.length > QUESTION_MAX_LENGTH) return { ok: false, reason: "tooLong" };
  return { ok: true, question };
}

export type ConversationAction =
  | { type: "send"; id: string; question: string }
  | { type: "edit"; exchangeId: string; id: string; question: string }
  | { type: "retry"; exchangeId: string }
  | { type: "cancel" }
  | { type: "reset" }
  | { type: "receive"; exchangeId: string; event: ClientEvent };

export function hasInFlight(state: ConversationState): boolean {
  return state.exchanges.some((echange) => isInFlight(echange.status));
}

function nouvelEchange(id: string, question: string): Exchange {
  return { id, question, answer: "", status: "waiting", unverified: [] };
}

/** Statut final d'un échange selon le code d'une erreur de flux. */
function statutDErreur(code: Extract<ClientEvent, { type: "error" }>["code"]): Exchange["status"] {
  switch (code) {
    case "interrupted":
      return "interrupted";
    case "unauthorized":
      return "unauthorized";
    case "failed":
      return "failed";
    case "unavailable":
    case "timeout":
      return "unavailable";
  }
}

function recevoir(echange: Exchange, evenement: ClientEvent): Exchange {
  switch (evenement.type) {
    case "status":
      return echange.status === "waiting" ? { ...echange, status: "loading" } : echange;
    case "text":
      return { ...echange, status: "streaming", answer: echange.answer + evenement.text };
    case "done":
      return { ...echange, status: "done", unverified: evenement.unverified };
    case "error":
      return { ...echange, status: statutDErreur(evenement.code) };
  }
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case "send": {
      if (hasInFlight(state)) return state;
      const verification = checkQuestion(action.question);
      if (!verification.ok) return state;
      return {
        exchanges: [...state.exchanges, nouvelEchange(action.id, verification.question)],
      };
    }

    case "edit": {
      if (hasInFlight(state)) return state;
      const index = state.exchanges.findIndex((e) => e.id === action.exchangeId);
      if (index === -1) return state;
      const verification = checkQuestion(action.question);
      if (!verification.ok) return state;
      // Une modification identique à l'original ne relance rien.
      if (verification.question === state.exchanges[index].question) return state;
      // L'échange modifié et tous ceux qui le suivent sont remplacés (EF-025).
      return {
        exchanges: [
          ...state.exchanges.slice(0, index),
          nouvelEchange(action.id, verification.question),
        ],
      };
    }

    case "retry": {
      if (hasInFlight(state)) return state;
      const cible = state.exchanges.find((e) => e.id === action.exchangeId);
      const reessayable =
        cible !== undefined &&
        (cible.status === "unavailable" ||
          cible.status === "failed" ||
          cible.status === "interrupted");
      if (!reessayable) return state;
      return {
        exchanges: state.exchanges.map((e) =>
          e.id === action.exchangeId ? nouvelEchange(e.id, e.question) : e,
        ),
      };
    }

    case "cancel":
      return {
        exchanges: state.exchanges.map((e) =>
          isInFlight(e.status) ? { ...e, status: "cancelled" } : e,
        ),
      };

    case "reset":
      return hasInFlight(state) ? state : EMPTY_CONVERSATION;

    case "receive":
      return {
        exchanges: state.exchanges.map((e) =>
          // Un événement tardif — arrivé après une annulation — est ignoré.
          e.id === action.exchangeId && isInFlight(e.status) ? recevoir(e, action.event) : e,
        ),
      };
  }
}

/**
 * Historique à envoyer avec la prochaine question : les échanges **terminés** qui précèdent
 * `avantId` (tous, si absent), en rôles alternés. Les échanges annulés, interrompus ou en erreur
 * n'y figurent pas.
 *
 * Borné pour que la requête reste valide : au plus 19 échanges (40 messages avec la question), et
 * jamais une réponse plus longue que la borne du contrat.
 */
export function buildHistory(state: ConversationState, avantId?: string): ChatTurn[] {
  const limite = avantId === undefined ? state.exchanges.length : state.exchanges.findIndex((e) => e.id === avantId);
  const fin = limite === -1 ? state.exchanges.length : limite;

  const termines = state.exchanges
    .slice(0, fin)
    .filter((e) => e.status === "done" && e.answer.length <= RESPONSE_TURN_MAX_CHARS);

  const maxEchanges = Math.floor((MESSAGES_MAX - 1) / 2);
  return termines.slice(-maxEchanges).flatMap((e): ChatTurn[] => [
    { role: "user", content: e.question },
    { role: "assistant", content: e.answer },
  ]);
}
