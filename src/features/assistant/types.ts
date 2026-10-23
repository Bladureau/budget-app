/**
 * Types et constantes de l'assistant du budget (fonctionnalité 009).
 *
 * Voir specs/009-local-ai-assistant/data-model.md. Rien de ce qui est décrit ici n'est persisté :
 * le contexte est dérivé du budget, la conversation vit dans l'état d'un composant.
 */

import type { IsoDate, MonthKey } from "@/lib/date";

// --- Bornes (constantes nommées, non réglables : principe VI) --------------------------------

/** Longueur maximale d'une question, après `trim()` (EF-019). */
export const QUESTION_MAX_LENGTH = 500;

/** Longueur maximale d'une réponse renvoyée dans l'historique d'une requête. */
export const RESPONSE_TURN_MAX_CHARS = 6000;

/** Nombre maximal de messages dans une requête (bornes de sécurité, R5). */
export const MESSAGES_MAX = 40;

/** Part de l'historique transmise au modèle, en caractères (R5). */
export const HISTORY_MAX_CHARS = 3000;

/** Taille maximale du contexte budgétaire sérialisé, en caractères (R5). */
export const CONTEXT_MAX_CHARS = 10_000;

// --- Requête ----------------------------------------------------------------------------------

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/**
 * Un message du prompt envoyé à l'IA. Structurellement identique à celui du client Ollama : le type
 * vit ici pour que la logique pure du prompt ne dépende d'aucun module serveur.
 */
export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AssistantRequest {
  month: MonthKey;
  today: IsoDate;
  /** La conversation ; la dernière entrée est la question posée. */
  messages: ChatTurn[];
}

// --- Flux de réponse (specs/009-local-ai-assistant/contracts/api-assistant.md) ---------------

export type StreamErrorCode = "unavailable" | "timeout" | "interrupted";

export type StreamEvent =
  | { type: "status"; state: "loading" }
  | { type: "text"; text: string }
  | { type: "done"; unverified: string[] }
  | { type: "error"; code: StreamErrorCode };

/**
 * Ce que le navigateur reçoit : les événements du serveur, plus deux échecs détectés côté client
 * avant tout flux (`401`, autre statut inattendu).
 */
export type ClientErrorCode = StreamErrorCode | "unauthorized" | "failed";

export type ClientEvent =
  | Exclude<StreamEvent, { type: "error" }>
  | { type: "error"; code: ClientErrorCode };

// --- Valeurs connues (contrôle des montants, R6) -----------------------------------------------

export interface KnownValues {
  /** Valeur absolue, en centimes, de chaque montant écrit dans le contexte. */
  cents: ReadonlySet<number>;
  /** Chaque pourcentage écrit dans le contexte, à une décimale. */
  percents: ReadonlySet<number>;
}

// --- Conversation (état d'un composant, jamais persisté) -----------------------------------------

export type ExchangeStatus =
  | "waiting"
  | "loading"
  | "streaming"
  | "done"
  | "cancelled"
  | "interrupted"
  | "unavailable"
  | "unauthorized"
  | "failed";

export interface Exchange {
  /** Identifiant local, jamais envoyé. */
  id: string;
  question: string;
  /** Texte reçu jusqu'ici. */
  answer: string;
  status: ExchangeStatus;
  /** Montants non vérifiés, renseignés à la fin de la réponse. */
  unverified: string[];
}

export interface ConversationState {
  exchanges: Exchange[];
}

/** Un échange est en cours tant que sa réponse n'est ni terminée ni abandonnée. */
export function isInFlight(status: ExchangeStatus): boolean {
  return status === "waiting" || status === "loading" || status === "streaming";
}
