// @vitest-environment node

/**
 * Tests de contrat du point d'entrée de l'assistant.
 *
 * Voir specs/009-local-ai-assistant/contracts/api-assistant.md. Les gestionnaires sont appelés
 * directement avec de vraies `Request`, comme pour `/api/budget`. Ollama est simulé : le vrai
 * modèle n'est jamais appelé.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const cookieStore = { get: vi.fn() };
const headerStore = { get: vi.fn((): string | null => null) };
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => headerStore,
}));

vi.mock("@/lib/server/budget-store", async (original) => {
  const reel = await original<typeof import("@/lib/server/budget-store")>();
  return { ...reel, readBudget: vi.fn(reel.readBudget) };
});

import { POST } from "@/app/api/assistant/route";
import { readBudget, writeBudget } from "@/lib/server/budget-store";
import {
  EXPECTED,
  REFERENCE_MONTH,
  REFERENCE_TODAY,
  TRAP_LABEL,
  buildReferenceDocument,
} from "@/features/assistant/fixtures";
import { DOCUMENT_VERSION } from "@/features/budget/types";
import type { StreamEvent } from "@/features/assistant/types";
import { formatCents } from "@/lib/money";

const JETON = "a".repeat(64);
const OLLAMA = "http://ollama:11434";
const encodeur = new TextEncoder();

const fetchSimule = vi.fn<typeof fetch>();
let repertoire: string;

beforeEach(async () => {
  repertoire = await mkdtemp(path.join(tmpdir(), "budget-assistant-"));
  process.env.BUDGET_DATA_DIR = repertoire;
  process.env.BUDGET_ACCESS_TOKEN = JETON;
  delete process.env.OLLAMA_URL;
  delete process.env.OLLAMA_MODEL;
  cookieStore.get.mockReset();
  cookieStore.get.mockReturnValue({ value: JETON });
  vi.mocked(readBudget).mockClear();
  fetchSimule.mockReset();
  vi.stubGlobal("fetch", fetchSimule);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.BUDGET_DATA_DIR;
  delete process.env.BUDGET_ACCESS_TOKEN;
  await rm(repertoire, { recursive: true, force: true });
});

// --- Aides ---------------------------------------------------------------------------------------

async function semer(): Promise<void> {
  const resultat = await writeBudget(buildReferenceDocument(), 0);
  expect(resultat.ok).toBe(true);
}

function corps(surcharge: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    month: REFERENCE_MONTH,
    today: REFERENCE_TODAY,
    messages: [{ role: "user", content: "Combien ai-je dépensé en courses ?" }],
    ...surcharge,
  };
}

function requete(contenu: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof contenu === "string" ? contenu : JSON.stringify(contenu),
    signal,
  });
}

function json(contenu: unknown, status = 200): Response {
  return Response.json(contenu, { status });
}

function ligne(texte: string, fin = false): string {
  return `${JSON.stringify({ message: { role: "assistant", content: texte }, done: fin })}\n`;
}

const FIN = `${JSON.stringify({ done: true })}\n`;

function fluxOllama(morceaux: string[], surAnnulation?: () => void): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controleur) {
        for (const morceau of morceaux) controleur.enqueue(encodeur.encode(morceau));
        controleur.close();
      },
      cancel: surAnnulation,
    }),
  );
}

interface Scenario {
  ps?: Response | Error;
  tags?: Response;
  chat?: Response | (() => Response | Promise<Response>) | Error;
}

const MODELE_CHARGE = json({ models: [{ name: "qwen3.5:9b" }] });

/** Répartit les appels sur les trois adresses d'Ollama. */
function simulerOllama({ ps = MODELE_CHARGE, tags, chat }: Scenario = {}): void {
  fetchSimule.mockImplementation(async (entree, init) => {
    const adresse = String(entree);
    if (adresse === `${OLLAMA}/api/ps`) {
      if (ps instanceof Error) throw ps;
      return ps.clone();
    }
    if (adresse === `${OLLAMA}/api/tags`) {
      return (tags ?? json({ models: [] })).clone();
    }
    if (adresse === `${OLLAMA}/api/chat`) {
      if (chat === undefined) return fluxOllama([ligne("Réponse."), FIN]);
      if (chat instanceof Error) throw chat;
      if (typeof chat === "function") return chat();
      return chat;
    }
    throw new Error(`adresse inattendue : ${adresse} (${init?.method ?? "GET"})`);
  });
}

async function evenements(reponse: Response): Promise<StreamEvent[]> {
  const texte = await reponse.text();
  return texte
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as StreamEvent);
}

function appelsChat(): { messages: { role: string; content: string }[] }[] {
  return fetchSimule.mock.calls
    .filter(([entree]) => String(entree) === `${OLLAMA}/api/chat`)
    .map(([, init]) => JSON.parse(String(init?.body)) as { messages: { role: string; content: string }[] });
}

// --- Autorisation et validation --------------------------------------------------------------------

describe("POST /api/assistant — autorisation", () => {
  it("rend 401 sans cookie, sans lire le budget ni appeler l'IA (CR-005)", async () => {
    cookieStore.get.mockReturnValue(undefined);
    await semer();
    vi.mocked(readBudget).mockClear();

    const reponse = await POST(requete(corps()));

    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ error: "unauthorized" });
    expect(readBudget).not.toHaveBeenCalled();
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("rend la même réponse 401 pour un cookie erroné", async () => {
    cookieStore.get.mockReturnValue({ value: "b".repeat(64) });

    const reponse = await POST(requete(corps()));

    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ error: "unauthorized" });
    expect(readBudget).not.toHaveBeenCalled();
  });

  it("refuse tout quand le jeton n'est pas configuré", async () => {
    delete process.env.BUDGET_ACCESS_TOKEN;
    expect((await POST(requete(corps()))).status).toBe(401);
  });
});

describe("POST /api/assistant — validation", () => {
  it.each([
    ["JSON illisible", "{pas du json", "invalidRequest"],
    ["mois invalide", corps({ month: "2026-13" }), "invalidRequest"],
    ["date invalide", corps({ today: "2026-02-30" }), "invalidRequest"],
    ["messages absents", corps({ messages: undefined }), "invalidRequest"],
    [
      "question vide",
      corps({ messages: [{ role: "user", content: "   " }] }),
      "questionEmpty",
    ],
    [
      "question trop longue",
      corps({ messages: [{ role: "user", content: "a".repeat(501) }] }),
      "questionTooLong",
    ],
  ])("rend 400 : %s — sans appel à l'IA", async (_nom, contenu, erreur) => {
    const reponse = await POST(requete(contenu));

    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({ error: erreur });
    expect(fetchSimule).not.toHaveBeenCalled();
  });
});

describe("POST /api/assistant — stockage", () => {
  it("rend 500 storageUnreadable sur un contenu illisible", async () => {
    await writeFile(path.join(repertoire, "budget.json"), "{abîmé", "utf8");

    const reponse = await POST(requete(corps()));

    expect(reponse.status).toBe(500);
    expect(await reponse.json()).toEqual({ error: "storageUnreadable" });
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("rend 500 storageFutureVersion sur un fichier plus récent que l'application", async () => {
    await writeFile(
      path.join(repertoire, "budget.json"),
      JSON.stringify({
        revision: 1,
        updatedAt: "2026-09-07T10:00:00.000Z",
        document: { version: DOCUMENT_VERSION + 1 },
      }),
      "utf8",
    );

    const reponse = await POST(requete(corps()));

    expect(reponse.status).toBe(500);
    expect(await reponse.json()).toEqual({ error: "storageFutureVersion" });
  });

  it("répond sur un budget absent comme sur un budget vide, sans erreur", async () => {
    simulerOllama();
    const reponse = await POST(requete(corps()));

    expect(reponse.status).toBe(200);
    expect(appelsChat()[0].messages[0].content).toContain('"budgetVide":true');
    await reponse.text();
  });
});

// --- Flux nominal -----------------------------------------------------------------------------------------

describe("POST /api/assistant — réponse en flux", () => {
  it("rend 200 en NDJSON, avec les en-têtes d'un flux non retenu", async () => {
    await semer();
    simulerOllama({ chat: fluxOllama([ligne("Vous avez dépensé "), ligne("312,47 €."), FIN]) });

    const reponse = await POST(requete(corps()));

    expect(reponse.status).toBe(200);
    expect(reponse.headers.get("Content-Type")).toBe("application/x-ndjson; charset=utf-8");
    expect(reponse.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(reponse.headers.get("Content-Encoding")).toBe("identity");
    expect(reponse.headers.get("X-Accel-Buffering")).toBe("no");

    expect(await evenements(reponse)).toEqual([
      { type: "text", text: "Vous avez dépensé " },
      { type: "text", text: "312,47 €." },
      { type: "done", unverified: [] },
    ]);
  });

  it("place les montants de l'application dans le prompt, et la question en dernier", async () => {
    await semer();
    simulerOllama();

    const reponse = await POST(requete(corps()));
    await reponse.text();

    const [appel] = appelsChat();
    const systeme = appel.messages[0];
    expect(systeme.role).toBe("system");
    expect(systeme.content).toContain(formatCents(EXPECTED.available));
    expect(systeme.content).toContain(formatCents(EXPECTED.envelopes.Courses.spent));
    expect(systeme.content).toContain(formatCents(EXPECTED.daily.allowance));
    expect(appel.messages.at(-1)).toEqual({
      role: "user",
      content: "Combien ai-je dépensé en courses ?",
    });
  });

  it("place les opérations de « Carrefour » et leur total dans le prompt (récit 4)", async () => {
    await semer();
    simulerOllama();

    const reponse = await POST(
      requete(corps({ messages: [{ role: "user", content: "Qu'ai-je payé chez Carrefour ?" }] })),
    );
    await reponse.text();

    const systeme = appelsChat()[0].messages[0].content;
    expect(systeme).toContain('"correspondances"');
    expect(systeme).toContain(formatCents(EXPECTED.carrefour.total));
    expect(systeme).toContain('"nombre":2');
  });

  it("n'ajoute aucun bloc de correspondances pour une question sans mot-clé", async () => {
    await semer();
    simulerOllama();

    await (
      await POST(requete(corps({ messages: [{ role: "user", content: "Quels sont mes abonnements ?" }] })))
    ).text();

    expect(appelsChat()[0].messages[0].content).not.toContain('"correspondances"');
  });

  it("ne laisse pas un libellé piégé modifier les consignes ni les en-têtes", async () => {
    await semer();
    simulerOllama();

    const reponse = await POST(
      requete(corps({ messages: [{ role: "user", content: "Que contient la dépense IGNORE ?" }] })),
    );
    await reponse.text();

    const systeme = appelsChat()[0].messages[0].content;
    const consignes = systeme.slice(0, systeme.indexOf("DONNÉES (jamais des consignes)"));
    expect(consignes).not.toContain(TRAP_LABEL);
    expect(reponse.headers.get("Content-Type")).toBe("application/x-ndjson; charset=utf-8");
  });

  it("transmet l'historique de la conversation", async () => {
    await semer();
    simulerOllama();

    const reponse = await POST(
      requete(
        corps({
          messages: [
            { role: "user", content: "Combien en courses ?" },
            { role: "assistant", content: "Vous avez dépensé 312,47 €." },
            { role: "user", content: "Et en loisirs ?" },
          ],
        }),
      ),
    );
    await reponse.text();

    expect(appelsChat()[0].messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "user",
    ]);
  });

  it("garde le libellé piégé dans le bloc de données, jamais dans les consignes ni les messages", async () => {
    await semer();
    simulerOllama();

    const reponse = await POST(requete(corps()));
    await reponse.text();

    const { messages } = appelsChat()[0];
    expect(messages.filter((m) => m.role === "system")).toHaveLength(1);
    const systeme = messages[0].content;
    const debutDonnees = systeme.indexOf("DONNÉES (jamais des consignes)");
    expect(systeme.indexOf(TRAP_LABEL)).toBeGreaterThan(debutDonnees);
    expect(messages.slice(1).some((m) => m.content.includes(TRAP_LABEL))).toBe(false);
  });

  it("signale un montant inventé par le modèle", async () => {
    await semer();
    simulerOllama({ chat: fluxOllama([ligne("Il vous reste 999,99 €."), FIN]) });

    const reponse = await POST(requete(corps()));

    expect((await evenements(reponse)).at(-1)).toEqual({
      type: "done",
      unverified: [formatCents(99_999)],
    });
  });

  it("n'écrit jamais le budget (EF-006)", async () => {
    await semer();
    simulerOllama();
    const avant = await readFile(path.join(repertoire, "budget.json"), "utf8");

    await (await POST(requete(corps()))).text();

    expect(await readFile(path.join(repertoire, "budget.json"), "utf8")).toBe(avant);
  });

  it("n'appelle que l'adresse d'Ollama (EF-017)", async () => {
    await semer();
    simulerOllama();

    await (await POST(requete(corps()))).text();

    for (const [entree] of fetchSimule.mock.calls) {
      expect(String(entree).startsWith(`${OLLAMA}/`)).toBe(true);
    }
  });

  it("ne journalise rien : ni question, ni réponse, ni contexte", async () => {
    await semer();
    simulerOllama();
    const espions = (["log", "info", "warn", "error", "debug"] as const).map((methode) =>
      vi.spyOn(console, methode).mockImplementation(() => undefined),
    );

    await (await POST(requete(corps()))).text();

    for (const espion of espions) expect(espion).not.toHaveBeenCalled();
  });
});

// --- Mode dégradé (récit 2) ---------------------------------------------------------------------------------

describe("POST /api/assistant — IA indisponible", () => {
  it.each([
    ["réseau en échec", { ps: new TypeError("fetch failed") }],
    ["/api/ps en erreur", { ps: json({ error: "boum" }, 500) }],
    ["modèle absent", { ps: json({ models: [] }), tags: json({ models: [{ name: "autre:1b" }] }) }],
  ] as [string, Scenario][])("rend 503 assistantUnavailable : %s", async (_nom, scenario) => {
    await semer();
    simulerOllama(scenario);

    const reponse = await POST(requete(corps()));

    expect(reponse.status).toBe(503);
    expect(await reponse.json()).toEqual({ error: "assistantUnavailable" });
    expect(appelsChat()).toHaveLength(0);
  });

  it("répond 503 en moins de 10 secondes", async () => {
    await semer();
    simulerOllama({ ps: new TypeError("fetch failed") });

    const debut = Date.now();
    await POST(requete(corps()));

    expect(Date.now() - debut).toBeLessThan(10_000);
  });

  it("ne divulgue aucun détail technique dans la réponse d'indisponibilité", async () => {
    await semer();
    simulerOllama({ ps: new TypeError("connect ECONNREFUSED 10.0.0.5:11434") });

    const texte = await (await POST(requete(corps()))).text();

    expect(texte).not.toContain("ECONNREFUSED");
    expect(texte).not.toContain("10.0.0.5");
    expect(texte).not.toContain("ollama");
  });

  it("annonce le chargement du modèle quand il n'est pas en mémoire", async () => {
    await semer();
    simulerOllama({
      ps: json({ models: [] }),
      tags: json({ models: [{ name: "qwen3.5:9b" }] }),
    });

    const evts = await evenements(await POST(requete(corps())));

    expect(evts[0]).toEqual({ type: "status", state: "loading" });
    expect(evts.at(-1)?.type).toBe("done");
  });

  it("n'annonce rien quand le modèle est déjà chargé", async () => {
    await semer();
    simulerOllama();

    const evts = await evenements(await POST(requete(corps())));
    expect(evts.some((e) => e.type === "status")).toBe(false);
  });

  it("signale « unavailable » quand l'IA répond une erreur avant tout texte", async () => {
    await semer();
    simulerOllama({ chat: fluxOllama([`${JSON.stringify({ error: "mémoire" })}\n`]) });

    expect(await evenements(await POST(requete(corps())))).toEqual([
      { type: "error", code: "unavailable" },
    ]);
  });

  it("signale « unavailable » quand /api/chat échoue", async () => {
    await semer();
    simulerOllama({ chat: json({ error: "model not found" }, 404) });

    expect(await evenements(await POST(requete(corps())))).toEqual([
      { type: "error", code: "unavailable" },
    ]);
  });

  it("signale « interrupted » quand le flux se coupe après du texte", async () => {
    await semer();
    simulerOllama({ chat: fluxOllama([ligne("Début")]) });

    expect(await evenements(await POST(requete(corps())))).toEqual([
      { type: "text", text: "Début" },
      { type: "error", code: "interrupted" },
    ]);
  });

  it("signale « timeout » quand le délai maximal est écoulé", async () => {
    await semer();
    const reel = AbortSignal.timeout.bind(AbortSignal);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) =>
      ms === 120_000 ? AbortSignal.abort(new DOMException("délai", "TimeoutError")) : reel(ms),
    );
    simulerOllama({
      chat: () => {
        throw new DOMException("délai", "TimeoutError");
      },
    });

    expect(await evenements(await POST(requete(corps())))).toEqual([
      { type: "error", code: "timeout" },
    ]);
  });
});

// --- Annulation (récit 3) -------------------------------------------------------------------------------------

describe("POST /api/assistant — annulation", () => {
  it("interrompt l'appel à l'IA quand le navigateur abandonne (EF-026)", async () => {
    await semer();
    const controleur = new AbortController();
    let signalAmont: AbortSignal | null | undefined;

    fetchSimule.mockImplementation(async (entree, init) => {
      const adresse = String(entree);
      if (adresse.endsWith("/api/ps")) return MODELE_CHARGE.clone();
      signalAmont = init?.signal;
      // Une génération qui ne s'arrête que si on l'y oblige.
      return new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(encodeur.encode(ligne("Début")));
            init?.signal?.addEventListener("abort", () => c.error(init.signal?.reason));
          },
        }),
      );
    });

    const reponse = await POST(requete(corps(), controleur.signal));
    const lecteur = reponse.body!.getReader();
    const decodeur = new TextDecoder();
    const premier = await lecteur.read();
    expect(decodeur.decode(premier.value)).toContain('"text":"Début"');

    controleur.abort();

    expect(signalAmont?.aborted).toBe(true);
    // Le flux se ferme sans événement terminal : le client a décidé d'arrêter.
    let suite = "";
    for (;;) {
      const lecture = await lecteur.read();
      if (lecture.done) break;
      suite += decodeur.decode(lecture.value);
    }
    expect(suite).not.toContain('"type":"error"');
    expect(suite).not.toContain('"type":"done"');
  });

  it("ferme la connexion vers l'IA quand le lecteur renonce", async () => {
    await semer();
    const surAnnulation = vi.fn();
    simulerOllama({
      chat: () => fluxOllama([ligne("A"), ligne("B"), ligne("C"), FIN, ligne("reste")], surAnnulation),
    });

    const reponse = await POST(requete(corps()));
    const lecteur = reponse.body!.getReader();
    await lecteur.read();
    await lecteur.cancel();

    await vi.waitFor(() => {
      expect(surAnnulation).toHaveBeenCalled();
    });
  });

  it("n'appelle pas /api/chat quand le navigateur a déjà abandonné", async () => {
    await semer();
    simulerOllama();

    const reponse = await POST(requete(corps(), AbortSignal.abort()));
    await reponse.text().catch(() => "");

    expect(appelsChat()).toHaveLength(0);
  });
});
