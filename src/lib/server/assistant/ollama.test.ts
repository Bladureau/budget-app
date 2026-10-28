// @vitest-environment node

/**
 * Tests du client Ollama. Le vrai modèle n'est jamais appelé : `fetch` est simulé avec des réponses
 * du format documenté dans specs/009-local-ai-assistant/contracts/api-assistant.md.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OllamaError,
  checkAvailability,
  streamChat,
} from "@/lib/server/assistant/ollama";
import type { OllamaFailureCode, OllamaMessage } from "@/lib/server/assistant/ollama";

const fetchSimule = vi.fn<typeof fetch>();
const encodeur = new TextEncoder();

beforeEach(() => {
  fetchSimule.mockReset();
  vi.stubGlobal("fetch", fetchSimule);
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_MODEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_MODEL;
});

const MESSAGES: OllamaMessage[] = [
  { role: "system", content: "consignes" },
  { role: "user", content: "Bonjour" },
];

function json(corps: unknown, status = 200): Response {
  return new Response(JSON.stringify(corps), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Flux NDJSON dont chaque élément de `morceaux` arrive comme un morceau réseau distinct. */
function flux(morceaux: string[], surAnnulation?: () => void): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controleur) {
        for (const morceau of morceaux) controleur.enqueue(encodeur.encode(morceau));
        controleur.close();
      },
      cancel: surAnnulation,
    }),
    { status: 200 },
  );
}

function ligne(texte: string, fin = false): string {
  return `${JSON.stringify({ message: { role: "assistant", content: texte }, done: fin })}\n`;
}

const FIN = `${JSON.stringify({ done: true })}\n`;

async function lire(source: AsyncGenerator<string, void, void>): Promise<string[]> {
  const morceaux: string[] = [];
  for await (const morceau of source) morceaux.push(morceau);
  return morceaux;
}

async function codeDEchec(action: () => Promise<unknown>): Promise<OllamaFailureCode> {
  try {
    await action();
  } catch (erreur) {
    if (erreur instanceof OllamaError) return erreur.code;
    throw erreur;
  }
  throw new Error("aucune erreur levée");
}

describe("checkAvailability", () => {
  it("rend « disponible et chargé » quand le modèle est en mémoire", async () => {
    fetchSimule.mockResolvedValueOnce(json({ models: [{ name: "qwen3.5:9b" }] }));

    await expect(checkAvailability()).resolves.toEqual({ available: true, modelLoaded: true });
    expect(fetchSimule).toHaveBeenCalledTimes(1);
    expect(String(fetchSimule.mock.calls[0][0])).toBe("http://ollama:11434/api/ps");
  });

  it("rend « disponible, pas chargé » quand le modèle est installé mais absent de la mémoire", async () => {
    fetchSimule
      .mockResolvedValueOnce(json({ models: [] }))
      .mockResolvedValueOnce(json({ models: [{ name: "qwen3.5:9b" }] }));

    await expect(checkAvailability()).resolves.toEqual({ available: true, modelLoaded: false });
    expect(String(fetchSimule.mock.calls[1][0])).toBe("http://ollama:11434/api/tags");
  });

  it("rend « indisponible » quand le modèle n'est installé nulle part", async () => {
    fetchSimule
      .mockResolvedValueOnce(json({ models: [] }))
      .mockResolvedValueOnce(json({ models: [{ name: "autre:1b" }] }));

    await expect(checkAvailability()).resolves.toEqual({ available: false });
  });

  it("accepte le nom du modèle suffixé de « :latest »", async () => {
    process.env.OLLAMA_MODEL = "mistral";
    fetchSimule.mockResolvedValueOnce(json({ models: [{ name: "mistral:latest" }] }));

    await expect(checkAvailability()).resolves.toEqual({ available: true, modelLoaded: true });
  });

  it("rend « indisponible » quand /api/ps répond une erreur", async () => {
    fetchSimule.mockResolvedValueOnce(json({ error: "boum" }, 500));
    await expect(checkAvailability()).resolves.toEqual({ available: false });
  });

  it("rend « indisponible » quand le réseau échoue", async () => {
    fetchSimule.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(checkAvailability()).resolves.toEqual({ available: false });
  });

  it("rend « indisponible » quand la réponse n'est pas du JSON de la bonne forme", async () => {
    fetchSimule.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(checkAvailability()).resolves.toEqual({ available: false });

    fetchSimule.mockResolvedValueOnce(json({ models: "non" }));
    await expect(checkAvailability()).resolves.toEqual({ available: false });

    fetchSimule.mockResolvedValueOnce(json(null));
    await expect(checkAvailability()).resolves.toEqual({ available: false });
  });

  it("ignore les entrées de modèles mal formées", async () => {
    fetchSimule.mockResolvedValueOnce(json({ models: [null, 12, { name: 4 }, { name: "qwen3.5:9b" }] }));
    await expect(checkAvailability()).resolves.toEqual({ available: true, modelLoaded: true });
  });

  it("abandonne au-delà du délai", async () => {
    fetchSimule.mockImplementation(
      (_entree, init) =>
        new Promise((_resolve, rejeter) => {
          init?.signal?.addEventListener("abort", () => rejeter(init.signal?.reason));
        }),
    );

    await expect(checkAvailability(undefined, 20)).resolves.toEqual({ available: false });
  });

  it("rend « indisponible » quand l'appelant a déjà renoncé", async () => {
    fetchSimule.mockImplementation((_entree, init) => Promise.reject(init?.signal?.reason));
    await expect(checkAvailability(AbortSignal.abort())).resolves.toEqual({ available: false });
  });

  it("lit l'adresse et le modèle à chaque appel, sans barre oblique finale", async () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434/";
    fetchSimule.mockResolvedValueOnce(json({ models: [] }));
    fetchSimule.mockResolvedValueOnce(json({ models: [] }));
    await checkAvailability();
    expect(String(fetchSimule.mock.calls[0][0])).toBe("http://127.0.0.1:11434/api/ps");

    process.env.OLLAMA_URL = "http://autre:9999";
    fetchSimule.mockResolvedValueOnce(json({ models: [] }));
    fetchSimule.mockResolvedValueOnce(json({ models: [] }));
    await checkAvailability();
    expect(String(fetchSimule.mock.calls[2][0])).toBe("http://autre:9999/api/ps");
  });

  it("ne contacte que l'adresse configurée", async () => {
    fetchSimule.mockResolvedValue(json({ models: [{ name: "qwen3.5:9b" }] }));
    await checkAvailability();
    for (const [entree] of fetchSimule.mock.calls) {
      expect(String(entree).startsWith("http://ollama:11434/")).toBe(true);
    }
  });
});

describe("streamChat", () => {
  it("rend le texte morceau par morceau et envoie la requête attendue", async () => {
    fetchSimule.mockResolvedValueOnce(flux([ligne("Bon"), ligne("jour"), FIN]));

    await expect(lire(streamChat(MESSAGES))).resolves.toEqual(["Bon", "jour"]);

    const [entree, init] = fetchSimule.mock.calls[0];
    expect(String(entree)).toBe("http://ollama:11434/api/chat");
    expect(init?.method).toBe("POST");
    const corps = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(corps).toMatchObject({
      model: "qwen3.5:9b",
      stream: true,
      think: false,
      messages: MESSAGES,
      options: { num_ctx: 8192, temperature: 0.2 },
    });
  });

  it("n'envoie rien avant la première lecture", () => {
    fetchSimule.mockResolvedValueOnce(flux([FIN]));
    streamChat(MESSAGES);
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("reconstitue une ligne coupée entre deux morceaux réseau", async () => {
    const complete = ligne("Bonjour");
    fetchSimule.mockResolvedValueOnce(flux([complete.slice(0, 20), complete.slice(20), FIN]));

    await expect(lire(streamChat(MESSAGES))).resolves.toEqual(["Bonjour"]);
  });

  it("lit plusieurs lignes arrivées dans un seul morceau", async () => {
    fetchSimule.mockResolvedValueOnce(flux([ligne("A") + ligne("B") + FIN]));
    await expect(lire(streamChat(MESSAGES))).resolves.toEqual(["A", "B"]);
  });

  it("lit une dernière ligne sans saut de ligne final", async () => {
    fetchSimule.mockResolvedValueOnce(flux([ligne("A"), FIN.trimEnd()]));
    await expect(lire(streamChat(MESSAGES))).resolves.toEqual(["A"]);
  });

  it("lit les caractères accentués coupés au milieu d'un octet", async () => {
    const octets = encodeur.encode(ligne("café"));
    const coupe = octets.indexOf(0xc3) + 1;
    const reponse = new Response(
      new ReadableStream<Uint8Array>({
        start(controleur) {
          controleur.enqueue(octets.slice(0, coupe));
          controleur.enqueue(octets.slice(coupe));
          controleur.enqueue(encodeur.encode(FIN));
          controleur.close();
        },
      }),
    );
    fetchSimule.mockResolvedValueOnce(reponse);

    await expect(lire(streamChat(MESSAGES))).resolves.toEqual(["café"]);
  });

  it("ignore les lignes vides et les contenus vides", async () => {
    fetchSimule.mockResolvedValueOnce(flux(["\n", ligne(""), ligne("A"), "\n\n", FIN]));
    await expect(lire(streamChat(MESSAGES))).resolves.toEqual(["A"]);
  });

  it("s'arrête à l'annonce de fin, même si le flux continue", async () => {
    fetchSimule.mockResolvedValueOnce(flux([ligne("A"), FIN, ligne("ignoré")]));
    await expect(lire(streamChat(MESSAGES))).resolves.toEqual(["A"]);
  });

  it("lève « unavailable » quand l'IA signale une erreur avant tout texte", async () => {
    fetchSimule.mockResolvedValueOnce(flux([`${JSON.stringify({ error: "modèle absent" })}\n`]));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("unavailable");
  });

  it("lève « interrupted » quand l'IA signale une erreur après du texte", async () => {
    fetchSimule.mockResolvedValueOnce(
      flux([ligne("Début"), `${JSON.stringify({ error: "mémoire" })}\n`]),
    );
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("interrupted");
  });

  it("lève une erreur sur une ligne malformée, selon qu'il y a eu du texte ou non", async () => {
    fetchSimule.mockResolvedValueOnce(flux(["pas du json\n"]));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("unavailable");

    fetchSimule.mockResolvedValueOnce(flux([ligne("A"), "{coupé\n"]));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("interrupted");
  });

  it.each([
    ["contenu non texte", { message: { content: 42 } }],
    ["message non objet", { message: "texte" }],
    ["done non booléen", { message: { content: "A" }, done: "oui" }],
    ["ligne qui est un tableau", ["A"]],
    ["ligne qui est un nombre", 12],
  ])("refuse une ligne de forme invalide : %s", async (_nom, objet) => {
    fetchSimule.mockResolvedValueOnce(flux([`${JSON.stringify(objet)}\n`]));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("unavailable");
  });

  it("lève « unavailable » quand la réponse n'est pas un 200", async () => {
    fetchSimule.mockResolvedValueOnce(json({ error: "model not found" }, 404));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("unavailable");
  });

  it("lève « unavailable » quand le réseau échoue", async () => {
    fetchSimule.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("unavailable");
  });

  it("lève « unavailable » quand le flux se ferme sans rien dire", async () => {
    fetchSimule.mockResolvedValueOnce(flux([]));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("unavailable");
  });

  it("lève « interrupted » quand le flux se ferme après du texte, sans annoncer sa fin", async () => {
    fetchSimule.mockResolvedValueOnce(flux([ligne("Début")]));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("interrupted");
  });

  it("lève « interrupted » quand la connexion tombe en cours de lecture", async () => {
    let appels = 0;
    fetchSimule.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controleur) {
            appels += 1;
            if (appels === 1) controleur.enqueue(encodeur.encode(ligne("Début")));
            else controleur.error(new TypeError("terminated"));
          },
        }),
      ),
    );
    await expect(codeDEchec(() => lire(streamChat(MESSAGES)))).resolves.toBe("interrupted");
  });

  it("lève « aborted » quand l'appelant a renoncé", async () => {
    fetchSimule.mockImplementation((_entree, init) => Promise.reject(init?.signal?.reason));
    await expect(
      codeDEchec(() => lire(streamChat(MESSAGES, AbortSignal.abort()))),
    ).resolves.toBe("aborted");
  });

  it("lève « timeout » quand le délai est écoulé", async () => {
    const delai = AbortSignal.abort(new DOMException("délai", "TimeoutError"));
    fetchSimule.mockImplementation((_entree, init) => Promise.reject(init?.signal?.reason));
    await expect(codeDEchec(() => lire(streamChat(MESSAGES, delai)))).resolves.toBe("timeout");
  });

  it("distingue le délai d'une annulation quand les deux signaux sont combinés", async () => {
    const annulation = new AbortController();
    const combine = AbortSignal.any([annulation.signal, AbortSignal.timeout(60_000)]);
    fetchSimule.mockImplementation(
      (_entree, init) =>
        new Promise((_resolve, rejeter) => {
          init?.signal?.addEventListener("abort", () => rejeter(init.signal?.reason));
        }),
    );

    const attente = codeDEchec(() => lire(streamChat(MESSAGES, combine)));
    annulation.abort();
    await expect(attente).resolves.toBe("aborted");
  });

  it("ferme la connexion quand le lecteur renonce (annulation, EF-026)", async () => {
    const surAnnulation = vi.fn();
    fetchSimule.mockResolvedValueOnce(flux([ligne("A"), ligne("B"), ligne("C"), FIN], surAnnulation));

    const source = streamChat(MESSAGES);
    const premier = await source.next();
    expect(premier.value).toBe("A");
    await source.return();

    await vi.waitFor(() => {
      expect(surAnnulation).toHaveBeenCalledTimes(1);
    });
  });

  it("ferme aussi la connexion à l'annonce de fin, si l'IA a encore des octets à envoyer", async () => {
    const surAnnulation = vi.fn();
    fetchSimule.mockResolvedValueOnce(flux([ligne("A"), FIN, ligne("reste")], surAnnulation));
    await lire(streamChat(MESSAGES));

    await vi.waitFor(() => {
      expect(surAnnulation).toHaveBeenCalled();
    });
  });

  it("utilise le modèle configuré", async () => {
    process.env.OLLAMA_MODEL = "autre-modele:7b";
    fetchSimule.mockResolvedValueOnce(flux([FIN]));
    await lire(streamChat(MESSAGES));

    const corps = JSON.parse(String(fetchSimule.mock.calls[0][1]?.body)) as { model: string };
    expect(corps.model).toBe("autre-modele:7b");
  });
});
