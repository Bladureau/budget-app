/**
 * Génération avec outils : au plus **un** tour d'outil.
 *
 * 1. Première génération, avec les outils offerts. Le texte passe tel quel au lecteur.
 * 2. Si le modèle demande des outils (et n'a écrit aucun texte), l'application les exécute, puis
 *    relance une génération **sans outils**, avec leurs résultats : le modèle ne peut plus que
 *    répondre, ce qui borne la boucle sans compteur.
 *
 * Paresseux comme `streamChat` : rien n'est envoyé avant la première lecture. Quand le lecteur
 * renonce, `for await` referme la génération en cours, ce qui libère le GPU (EF-026).
 */

import { streamChatChunks } from "@/lib/server/assistant/ollama";
import type { OllamaMessage, OllamaToolCall } from "@/lib/server/assistant/ollama";

/** Nombre maximal d'appels exécutés en un tour : au-delà, le modèle s'égare. */
export const MAX_TOOL_CALLS = 3;

export interface AnswerWithToolsOptions {
  messages: readonly OllamaMessage[];
  /** Outils offerts ; vide, on revient à une simple génération. */
  tools: readonly unknown[];
  /** Exécute un appel et rend le texte (JSON) donné au modèle. Ne lève jamais. */
  execute: (call: OllamaToolCall) => string;
  signal?: AbortSignal;
}

export async function* answerWithTools(
  options: AnswerWithToolsOptions,
): AsyncGenerator<string, void, void> {
  const { messages, tools, execute, signal } = options;
  const appels: OllamaToolCall[] = [];
  let texteEcrit = false;

  for await (const morceau of streamChatChunks(messages, { signal, tools })) {
    if (morceau.kind === "text") {
      if (morceau.text !== "") texteEcrit = true;
      yield morceau.text;
    } else {
      appels.push(...morceau.calls);
    }
  }

  // Le modèle a déjà répondu : un appel qui suit son texte n'est pas exécuté, on ne mélange pas
  // deux réponses.
  if (appels.length === 0 || texteEcrit) return;

  const executes = appels.slice(0, MAX_TOOL_CALLS);
  const suite: OllamaMessage[] = [
    ...messages,
    { role: "assistant", content: "", tool_calls: executes },
    ...executes.map(
      (appel): OllamaMessage => ({
        role: "tool",
        tool_name: appel.function.name,
        content: execute(appel),
      }),
    ),
  ];

  for await (const morceau of streamChatChunks(suite, { signal })) {
    if (morceau.kind === "text") yield morceau.text;
  }
}
