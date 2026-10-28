import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askAssistant } from "@/features/assistant/client";
import type { ClientEvent } from "@/features/assistant/types";

const fetchSimule = vi.fn<typeof fetch>();
const encodeur = new TextEncoder();

beforeEach(() => {
  fetchSimule.mockReset();
  vi.stubGlobal("fetch", fetchSimule);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ENTREE = {
  month: "2026-10",
  today: "2026-10-24",
  messages: [{ role: "user" as const, content: "Bonjour" }],
};

function evt(objet: unknown): string {
  return `${JSON.stringify(objet)}\n`;
}

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

async function tout(source: AsyncGenerator<ClientEvent, void, void>): Promise<ClientEvent[]> {
  const evenements: ClientEvent[] = [];
  for await (const e of source) evenements.push(e);
  return evenements;
}

describe("askAssistant — requête", () => {
  it("envoie le mois, la date et la conversation, en same-origin et sans cache", async () => {
    fetchSimule.mockResolvedValueOnce(flux([evt({ type: "done", unverified: [] }), ""]));
    await tout(askAssistant(ENTREE));

    const [entree, init] = fetchSimule.mock.calls[0];
    expect(entree).toBe("/api/assistant");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect(init?.cache).toBe("no-store");
    expect(JSON.parse(String(init?.body))).toEqual({
      month: "2026-10",
      today: "2026-10-24",
      messages: [{ role: "user", content: "Bonjour" }],
    });
  });

  it("transmet le signal d'annulation", async () => {
    const controleur = new AbortController();
    fetchSimule.mockResolvedValueOnce(flux([evt({ type: "done", unverified: [] })]));
    await tout(askAssistant({ ...ENTREE, signal: controleur.signal }));

    expect(fetchSimule.mock.calls[0][1]?.signal).toBe(controleur.signal);
  });
});

describe("askAssistant — lecture du flux", () => {
  it("rend les événements dans l'ordre et s'arrête au terminal", async () => {
    fetchSimule.mockResolvedValueOnce(
      flux([
        evt({ type: "status", state: "loading" }),
        evt({ type: "text", text: "Bon" }),
        evt({ type: "text", text: "jour" }),
        evt({ type: "done", unverified: ["12,00 €"] }),
        evt({ type: "text", text: "ignoré" }),
      ]),
    );

    expect(await tout(askAssistant(ENTREE))).toEqual([
      { type: "status", state: "loading" },
      { type: "text", text: "Bon" },
      { type: "text", text: "jour" },
      { type: "done", unverified: ["12,00 €"] },
    ]);
  });

  it("reconstitue une ligne coupée entre deux morceaux réseau", async () => {
    const ligne = evt({ type: "text", text: "Bonjour" });
    fetchSimule.mockResolvedValueOnce(
      flux([ligne.slice(0, 10), ligne.slice(10), evt({ type: "done", unverified: [] })]),
    );

    expect(await tout(askAssistant(ENTREE))).toEqual([
      { type: "text", text: "Bonjour" },
      { type: "done", unverified: [] },
    ]);
  });

  it("ne traite que les lignes terminées par un saut de ligne", async () => {
    fetchSimule.mockResolvedValueOnce(
      flux([evt({ type: "text", text: "A" }), JSON.stringify({ type: "text", text: "B" })]),
    );

    // « B » n'est pas terminée : elle est ignorée, et le flux sans terminal vaut « interrompu ».
    expect(await tout(askAssistant(ENTREE))).toEqual([
      { type: "text", text: "A" },
      { type: "error", code: "interrupted" },
    ]);
  });

  it("lit des accents coupés au milieu d'un octet", async () => {
    const octets = encodeur.encode(evt({ type: "text", text: "café" }));
    const coupe = octets.indexOf(0xc3) + 1;
    fetchSimule.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(octets.slice(0, coupe));
            c.enqueue(octets.slice(coupe));
            c.enqueue(encodeur.encode(evt({ type: "done", unverified: [] })));
            c.close();
          },
        }),
      ),
    );

    expect((await tout(askAssistant(ENTREE)))[0]).toEqual({ type: "text", text: "café" });
  });

  it("ignore les lignes vides", async () => {
    fetchSimule.mockResolvedValueOnce(
      flux(["\n", evt({ type: "text", text: "A" }), "\n\n", evt({ type: "done", unverified: [] })]),
    );
    expect(await tout(askAssistant(ENTREE))).toHaveLength(2);
  });

  it.each([
    ["JSON invalide", "pas du json\n"],
    ["événement inconnu", evt({ type: "inconnu" })],
    ["texte vide", evt({ type: "text", text: "" })],
    ["texte non chaîne", evt({ type: "text", text: 42 })],
    ["statut inconnu", evt({ type: "status", state: "autre" })],
    ["done sans liste", evt({ type: "done" })],
    ["done avec liste de nombres", evt({ type: "done", unverified: [1] })],
    ["erreur de code inconnu", evt({ type: "error", code: "boum" })],
    ["ligne qui est un nombre", "12\n"],
    ["ligne qui est un tableau", "[]\n"],
  ])("traite une ligne invalide comme une réponse interrompue : %s", async (_nom, ligne) => {
    fetchSimule.mockResolvedValueOnce(flux([evt({ type: "text", text: "A" }), ligne, evt({ type: "text", text: "B" })]));

    expect(await tout(askAssistant(ENTREE))).toEqual([
      { type: "text", text: "A" },
      { type: "error", code: "interrupted" },
    ]);
  });

  it.each(["unavailable", "timeout", "interrupted"] as const)(
    "transmet l'erreur de flux « %s » et s'arrête",
    async (code) => {
      fetchSimule.mockResolvedValueOnce(
        flux([evt({ type: "error", code }), evt({ type: "text", text: "ignoré" })]),
      );
      expect(await tout(askAssistant(ENTREE))).toEqual([{ type: "error", code }]);
    },
  );

  it("signale une réponse interrompue quand le flux se ferme sans terminal", async () => {
    fetchSimule.mockResolvedValueOnce(flux([evt({ type: "text", text: "A" })]));

    expect(await tout(askAssistant(ENTREE))).toEqual([
      { type: "text", text: "A" },
      { type: "error", code: "interrupted" },
    ]);
  });

  it("signale une réponse interrompue quand la connexion tombe", async () => {
    let appels = 0;
    fetchSimule.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          pull(c) {
            appels += 1;
            if (appels === 1) c.enqueue(encodeur.encode(evt({ type: "text", text: "A" })));
            else c.error(new TypeError("terminated"));
          },
        }),
      ),
    );

    expect(await tout(askAssistant(ENTREE))).toEqual([
      { type: "text", text: "A" },
      { type: "error", code: "interrupted" },
    ]);
  });
});

describe("askAssistant — erreurs avant le flux", () => {
  it.each([
    [401, "unauthorized"],
    [503, "unavailable"],
    [400, "failed"],
    [500, "failed"],
    [404, "failed"],
  ] as const)("traduit le statut %i en « %s »", async (statut, code) => {
    fetchSimule.mockResolvedValueOnce(Response.json({ error: "x" }, { status: statut }));
    expect(await tout(askAssistant(ENTREE))).toEqual([{ type: "error", code }]);
  });

  it("rend « unavailable » quand le réseau échoue (hors ligne)", async () => {
    fetchSimule.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await tout(askAssistant(ENTREE))).toEqual([{ type: "error", code: "unavailable" }]);
  });
});

describe("askAssistant — annulation locale", () => {
  it("ne produit aucun événement quand la requête est annulée", async () => {
    const controleur = new AbortController();
    fetchSimule.mockImplementation(
      (_entree, init) =>
        new Promise((_resolve, rejeter) => {
          init?.signal?.addEventListener("abort", () => rejeter(init.signal?.reason));
        }),
    );

    const attente = tout(askAssistant({ ...ENTREE, signal: controleur.signal }));
    controleur.abort();

    expect(await attente).toEqual([]);
  });

  it("ne produit aucune erreur quand l'annulation interrompt la lecture", async () => {
    const controleur = new AbortController();
    fetchSimule.mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(encodeur.encode(evt({ type: "text", text: "A" })));
            controleur.signal.addEventListener("abort", () => c.error(controleur.signal.reason));
          },
        }),
      ),
    );

    const evenements: ClientEvent[] = [];
    for await (const e of askAssistant({ ...ENTREE, signal: controleur.signal })) {
      evenements.push(e);
      controleur.abort();
    }

    expect(evenements).toEqual([{ type: "text", text: "A" }]);
  });

  it("ferme la connexion quand le consommateur renonce", async () => {
    const surAnnulation = vi.fn();
    fetchSimule.mockResolvedValueOnce(
      flux([evt({ type: "text", text: "A" }), evt({ type: "text", text: "B" })], surAnnulation),
    );

    const source = askAssistant(ENTREE);
    await source.next();
    await source.return();

    await vi.waitFor(() => {
      expect(surAnnulation).toHaveBeenCalledTimes(1);
    });
  });
});
