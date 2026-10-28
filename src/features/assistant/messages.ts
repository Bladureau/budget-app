/**
 * Textes de l'interface de l'assistant (fonctionnalité 009).
 *
 * Voir specs/009-local-ai-assistant/contracts/interface.md §3 : ces textes sont normatifs, les tests
 * les vérifient. Aucun code HTTP ni trace technique n'est jamais affiché à l'utilisateur.
 */

import { QUESTION_MAX_LENGTH } from "@/features/assistant/types";
import type { ExchangeStatus } from "@/features/assistant/types";

export const ASSISTANT_TITLE = "Assistant";

export const ASSISTANT_INTRO =
  "Posez une question sur votre budget. L'assistant lit vos chiffres, il ne modifie rien.";

export const EXAMPLE_QUESTIONS: readonly string[] = [
  "Combien ai-je dépensé en courses ?",
  "Combien puis-je dépenser aujourd'hui ?",
  "Quels sont mes abonnements ?",
];

export const QUESTION_LABEL = "Votre question";
export const EDIT_LABEL = "Modifier votre question";
export const SEND = "Envoyer";
export const CANCEL_ANSWER = "Annuler";
export const NEW_CONVERSATION = "Nouvelle conversation";
export const CONFIRM_RESET = "Effacer la conversation ?";
export const CONFIRM_RESET_YES = "Effacer";
export const CONFIRM_RESET_NO = "Garder";
export const EDIT = "Modifier";
export const SEND_EDIT = "Envoyer la modification";
export const CANCEL_EDIT = "Annuler la modification";
export const RETRY = "Réessayer";

export const QUESTION_EMPTY = "Saisissez une question.";
export const QUESTION_TOO_LONG = `La question dépasse ${QUESTION_MAX_LENGTH} caractères.`;

export const BUSY_EXPLANATION =
  "Vous pourrez poser une autre question quand la réponse sera terminée, ou en l'annulant.";

export const PENDING_CHANGES_NOTICE =
  "Des modifications ne sont pas encore synchronisées : l'assistant répond d'après la dernière version enregistrée sur le serveur.";

export const WAITING = "L'assistant réfléchit…";
export const LOADING = "Chargement de l'assistant…";
export const CANCELLED = "Réponse annulée";
export const INTERRUPTED = "Réponse interrompue";
export const UNAVAILABLE = "Assistant indisponible";
export const UNAVAILABLE_EXPLANATION =
  "L'IA du serveur ne répond pas pour le moment. Le reste du budget fonctionne normalement.";
export const UNAUTHORIZED = "Accès refusé. Autorisez à nouveau cet appareil.";
export const FAILED = "Une erreur est survenue. Réessayez.";

/** Un montant ou un pourcentage de la réponse que l'application n'a pas fourni (EF-024). */
export function unverifiedWarning(valeur: string): string {
  return `Attention : ce montant n'a pas pu être vérifié : ${valeur}.`;
}

export function questionCounter(longueur: number): string {
  return `${longueur}/${QUESTION_MAX_LENGTH}`;
}

/** « Mois affiché : septembre 2026 (passé) » — le mois interrogé est toujours dit (EF-007). */
export function displayedMonth(mois: string, periode: "passé" | "courant" | "à venir"): string {
  return periode === "courant" ? `Mois affiché : ${mois}` : `Mois affiché : ${mois} (${periode})`;
}

/** Annonce faite aux technologies d'assistance quand l'état du dernier échange change. */
export const STATUS_ANNOUNCEMENTS: Readonly<Record<ExchangeStatus, string>> = {
  waiting: "L'assistant répond…",
  loading: "L'assistant répond…",
  streaming: "L'assistant répond…",
  done: "Réponse terminée",
  cancelled: CANCELLED,
  interrupted: INTERRUPTED,
  unavailable: UNAVAILABLE,
  unauthorized: UNAUTHORIZED,
  failed: FAILED,
};
