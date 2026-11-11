// @vitest-environment node

/**
 * Tests du tour d'outil. Le vrai modèle n'est jamais appelé : `fetch` est simulé avec le format
 * NDJSON d'Ollama, y compris `message.tool_calls` (relevé sur Ollama 0.40 avec qwen3.5:9b).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaError, streamChatChunks } from "@/lib/server/assistant/ollama";
import type { OllamaMessage } from "@/lib/server/assistant/ollama";
import { MAX_TOOL_CALLS, answerWithTools } from "@/lib/server/assistant/tool-loop";

const fetchSimule = vi.fn<typeof fetch>();
const encodeur = new TextEncoder();

beforeEach(() => {
  fetchSimule.mockReset();
  vi.stubGlobal("fetch", fetchSimule);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const MESSAGES: OllamaMessage[] = [
  { role: "system", content: "consignes" },
  { role: "user", content: "Combien ce soir si je ne dépense rien ce week-end ?" },
];
const OUTILS = [{ type: "function", function: { name: "calcul" } }];

function flux(lignes: unknown[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controleur) {
        for (const l of lignes) controleur.enqueue(encodeur.encode(`${JSON.stringify(l)}\n`));
        controleur.close();
      },
    }),
    { status: 200 },
  );
}

const texte = (t: string, fin = false) => ({ message: { role: "assistant", content: t }, done: fin });
const appel = (name: string, args: unknown) => ({
  message: {
    role: "assistant",
    content: "",
    tool_calls: [{ id: "call_1", function: { index: 0, name, arguments: args } }],
  },
  done: false,
});
const FIN = { message: { role: "assistant", content: "" }, done: true };

/** Corps JSON de la n-ième requête envoyée à l'IA. */
function corps(n: number): { tools?: unknown; messages: OllamaMessage[] } {
  return JSON.parse(String(fetchSimule.mock.calls[n][1]?.body));
}

async function lire(gen: AsyncGenerator<string>): Promise<string> {
  let tout = "";
  for await (const t of gen) tout += t;
  return tout;
}

describe("streamChatChunks", () => {
  it("rend les appels d'outils, arguments en objet ou en chaîne JSON", async () => {
    fetchSimule.mockResolvedValueOnce(
      flux([appel("calcul", { n: 3 }), appel("calcul", '{"n":4}'), FIN]),
    );
    const morceaux = [];
    for await (const m of streamChatChunks(MESSAGES, { tools: OUTILS })) morceaux.push(m);
    expect(morceaux).toEqual([
      { kind: "toolCalls", calls: [{ function: { name: "calcul", arguments: { n: 3 } } }] },
      { kind: "toolCalls", calls: [{ function: { name: "calcul", arguments: { n: 4 } } }] },
    ]);
    expect(corps(0).tools).toEqual(OUTILS);
  });

  it("n'envoie pas de champ « tools » sans outils", async () => {
    fetchSimule.mockResolvedValueOnce(flux([texte("ok", true)]));
    for await (const _ of streamChatChunks(MESSAGES)) void _;
    expect(corps(0)).not.toHaveProperty("tools");
  });

  it("interrompt sur des appels mal formés", async () => {
    fetchSimule.mockResolvedValueOnce(
      flux([{ message: { role: "assistant", content: "", tool_calls: [{ function: { name: 3 } }] }, done: false }]),
    );
    await expect(async () => {
      for await (const _ of streamChatChunks(MESSAGES, { tools: OUTILS })) void _;
    }).rejects.toEqual(new OllamaError("unavailable"));
  });
});

describe("answerWithTools", () => {
  it("sans appel d'outil, rend la réponse en une seule génération", async () => {
    fetchSimule.mockResolvedValueOnce(flux([texte("Il vous "), texte("reste 10,00 €.", true)]));
    const execute = vi.fn(() => "{}");
    const reponse = await lire(answerWithTools({ messages: MESSAGES, tools: OUTILS, execute }));
    expect(reponse).toBe("Il vous reste 10,00 €.");
    expect(execute).not.toHaveBeenCalled();
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });

  it("exécute l'outil, puis relance sans outils avec son résultat", async () => {
    fetchSimule
      .mockResolvedValueOnce(flux([appel("calcul", { n: 3 }), FIN]))
      .mockResolvedValueOnce(flux([texte("Ce soir : 46,08 €.", true)]));
    const execute = vi.fn(() => '{"resteAujourdhui":"46,08 €"}');

    const reponse = await lire(answerWithTools({ messages: MESSAGES, tools: OUTILS, execute }));

    expect(reponse).toBe("Ce soir : 46,08 €.");
    expect(execute).toHaveBeenCalledWith({ function: { name: "calcul", arguments: { n: 3 } } });
    const second = corps(1);
    expect(second).not.toHaveProperty("tools");
    expect(second.messages.slice(0, 2)).toEqual(MESSAGES);
    expect(second.messages[2]).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: "calcul", arguments: { n: 3 } } }],
    });
    expect(second.messages[3]).toEqual({
      role: "tool",
      tool_name: "calcul",
      content: '{"resteAujourdhui":"46,08 €"}',
    });
  });

  it("n'exécute pas un appel qui suit du texte déjà écrit", async () => {
    fetchSimule.mockResolvedValueOnce(flux([texte("Bonjour."), appel("calcul", {}), FIN]));
    const execute = vi.fn(() => "{}");
    expect(await lire(answerWithTools({ messages: MESSAGES, tools: OUTILS, execute }))).toBe("Bonjour.");
    expect(execute).not.toHaveBeenCalled();
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });

  it(`n'exécute pas plus de ${MAX_TOOL_CALLS} appels`, async () => {
    const appels = Array.from({ length: MAX_TOOL_CALLS + 2 }, () => appel("calcul", {}));
    fetchSimule
      .mockResolvedValueOnce(flux([...appels, FIN]))
      .mockResolvedValueOnce(flux([texte("ok", true)]));
    const execute = vi.fn(() => "{}");
    await lire(answerWithTools({ messages: MESSAGES, tools: OUTILS, execute }));
    expect(execute).toHaveBeenCalledTimes(MAX_TOOL_CALLS);
  });

  it("n'appelle pas l'IA avant la première lecture", () => {
    answerWithTools({ messages: MESSAGES, tools: OUTILS, execute: () => "{}" });
    expect(fetchSimule).not.toHaveBeenCalled();
  });
});
