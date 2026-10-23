/**
 * Validation du corps de la requête `POST /api/assistant`.
 *
 * Le corps est une frontière de confiance (principe IV) : il part d'`unknown` et n'est jamais
 * transtypé. Voir specs/009-local-ai-assistant/contracts/api-assistant.md, « Requête ».
 */

import { isValidIsoDate, isValidMonthKey } from "@/lib/date";
import {
  MESSAGES_MAX,
  QUESTION_MAX_LENGTH,
  RESPONSE_TURN_MAX_CHARS,
} from "@/features/assistant/types";
import type { AssistantRequest, ChatTurn } from "@/features/assistant/types";

export type RequestFailure = "invalidRequest" | "questionEmpty" | "questionTooLong";

export type ParseRequestResult =
  | { ok: true; value: AssistantRequest }
  | { ok: false; reason: RequestFailure };

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/** Un message passé : une question reste dans la borne d'une question, une réponse dans la sienne. */
function lireMessage(brut: unknown): ChatTurn | null {
  if (!estObjet(brut)) return null;
  const { role, content } = brut;
  if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;

  const borne = role === "user" ? QUESTION_MAX_LENGTH : RESPONSE_TURN_MAX_CHARS;
  if (content.length > borne) return null;

  return { role, content };
}

export function parseAssistantRequest(brut: unknown): ParseRequestResult {
  if (!estObjet(brut)) return { ok: false, reason: "invalidRequest" };

  const { month, today, messages } = brut;
  if (typeof month !== "string" || !isValidMonthKey(month)) {
    return { ok: false, reason: "invalidRequest" };
  }
  if (typeof today !== "string" || !isValidIsoDate(today)) {
    return { ok: false, reason: "invalidRequest" };
  }
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MESSAGES_MAX) {
    return { ok: false, reason: "invalidRequest" };
  }

  // La dernière question est contrôlée à part : elle seule porte les motifs « vide » et « trop
  // longue », que l'interface sait expliquer. Un message passé démesuré est une requête invalide.
  const derniere = messages[messages.length - 1];
  if (!estObjet(derniere) || derniere.role !== "user" || typeof derniere.content !== "string") {
    return { ok: false, reason: "invalidRequest" };
  }
  const question = derniere.content.trim();
  if (question === "") return { ok: false, reason: "questionEmpty" };
  if (question.length > QUESTION_MAX_LENGTH) return { ok: false, reason: "questionTooLong" };

  const tours: ChatTurn[] = [];
  for (let i = 0; i < messages.length - 1; i += 1) {
    const tour = lireMessage(messages[i]);
    if (tour === null) return { ok: false, reason: "invalidRequest" };
    tours.push(tour);
  }
  tours.push({ role: "user", content: question });

  // Rôles alternés, en commençant par l'utilisateur.
  const alternes = tours.every((tour, i) => tour.role === (i % 2 === 0 ? "user" : "assistant"));
  if (!alternes || tours.length % 2 === 0) return { ok: false, reason: "invalidRequest" };

  return { ok: true, value: { month, today, messages: tours } };
}
