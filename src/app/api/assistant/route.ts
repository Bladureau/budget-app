/**
 * Point d'entrée HTTP de l'assistant du budget (fonctionnalité 009).
 *
 * Voir specs/009-local-ai-assistant/contracts/api-assistant.md.
 *
 * Un seul chemin, une seule méthode : toute autre méthode reçoit `405` de Next.js sans code ici.
 *
 * **Lecture seule** (EF-006) : la route lit le budget central et ne l'écrit jamais. L'IA n'a aucun
 * outil, donc rien à détourner.
 *
 * **Aucun `export const runtime`** : `'nodejs'` est le défaut de la version installée et le runtime
 * Edge y est déprécié. **Aucun `export const dynamic`** : le contrôle d'autorisation lit
 * `cookies()`, la route est donc dynamique par construction.
 *
 * **Aucune journalisation** : questions, réponses et contexte contiennent des chiffres personnels.
 */

import { buildAssistantContext } from "@/features/assistant/context";
import { buildMessages } from "@/features/assistant/prompt";
import { parseAssistantRequest } from "@/features/assistant/request";
import { isAuthorized, unauthorizedResponse } from "@/lib/server/authorization";
import { readBudget } from "@/lib/server/budget-store";
import { checkAvailability, streamChat } from "@/lib/server/assistant/ollama";
import { buildResponseStream } from "@/lib/server/assistant/stream";

/**
 * Délai maximal d'une génération (EF-011). Il court à partir du moment où l'IA est jugée
 * disponible : il borne l'attente d'un GPU occupé ou d'un chargement de modèle, pas la vérification.
 */
const DELAI_MAX_MS = 120_000;

/** En-têtes d'un flux qui doit arriver morceau par morceau. */
const ENTETES_FLUX = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  // `no-transform` et un encodage déjà posé empêchent la compression gzip de Next.js de retenir les
  // morceaux dans un tampon ; `X-Accel-Buffering` en fait autant pour les mandataires inverses.
  "Cache-Control": "no-cache, no-transform",
  "Content-Encoding": "identity",
  "X-Accel-Buffering": "no",
} as const;

export async function POST(request: Request): Promise<Response> {
  // Avant toute lecture du budget : sans autorisation, aucune donnée n'est même chargée (CR-005).
  if (!(await isAuthorized())) return unauthorizedResponse();

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return Response.json({ error: "invalidRequest" }, { status: 400 });
  }

  const analyse = parseAssistantRequest(corps);
  if (!analyse.ok) return Response.json({ error: analyse.reason }, { status: 400 });
  const { month, today, messages } = analyse.value;

  const budget = await readBudget();
  if (!budget.ok) {
    return Response.json(
      { error: budget.reason === "futureVersion" ? "storageFutureVersion" : "storageUnreadable" },
      { status: 500 },
    );
  }

  // Le navigateur a déjà abandonné : personne ne lira la réponse, inutile de solliciter l'IA.
  if (request.signal.aborted) return new Response(null, { status: 499 });

  // L'IA arrêtée ou injoignable se découvre ici, en quelques secondes : l'utilisateur lit
  // « Assistant indisponible » sans attendre un délai de deux minutes (CR-004).
  const disponibilite = await checkAvailability(request.signal);
  if (!disponibilite.available) {
    return Response.json({ error: "assistantUnavailable" }, { status: 503 });
  }

  const question = messages[messages.length - 1].content;
  const contexte = buildAssistantContext(budget.document, month, today, question);
  const prompt = buildMessages({
    context: contexte,
    history: messages.slice(0, -1),
    question,
  });

  // L'abandon du navigateur (bouton « Annuler », onglet fermé) interrompt l'appel à l'IA, qui cesse
  // alors de générer (EF-026) ; le délai maximal, lui, vaut `timeout`.
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(DELAI_MAX_MS)]);

  const flux = buildResponseStream({
    chunks: streamChat(prompt, signal),
    modelLoading: !disponibilite.modelLoaded,
    known: contexte.known,
  });

  return new Response(flux, { status: 200, headers: ENTETES_FLUX });
}
