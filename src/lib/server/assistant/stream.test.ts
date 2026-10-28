// @vitest-environment node

import { describe, expect, it, vi } from "vitest";
import { OllamaError } from "@/lib/server/assistant/ollama";
import { buildResponseStream } from "@/lib/server/assistant/stream";
import type { KnownValues, StreamEvent } from "@/features/assistant/types";
import { formatCents } from "@/lib/money";

const CONNUS: KnownValues = { cents: new Set([31247, 40000]), percents: new Set() };

async function* source(...morceaux: (string | Error)[]): AsyncGenerator<string, void, void> {
  for (const morceau of morceaux) {
    if (morceau instanceof Error) throw morceau;
    yield morceau;
  }
}

async function lireTout(flux: ReadableStream<Uint8Array>): Promise<{
  evenements: StreamEvent[];
  brut: string;
}> {
  const decodeur = new TextDecoder();
  let brut = "";
  const lecteur = flux.getReader();
  for (;;) {
    const lecture = await lecteur.read();
    if (lecture.done) break;
    brut += decodeur.decode(lecture.value, { stream: true });
  }
  const evenements = brut
    .split("\n")
    .filter((ligne) => ligne !== "")
    .map((ligne) => JSON.parse(ligne) as StreamEvent);
  return { evenements, brut };
}

function construire(chunks: AsyncGenerator<string, void, void>, modelLoading = false) {
  return buildResponseStream({ chunks, modelLoading, known: CONNUS });
}

describe("buildResponseStream", () => {
  it("transmet le texte puis un événement « done » sans montant non vérifié", async () => {
    const { evenements, brut } = await lireTout(
      construire(source("Vous avez dépensé ", `${formatCents(31247)}.`)),
    );

    expect(evenements).toEqual([
      { type: "text", text: "Vous avez dépensé " },
      { type: "text", text: `${formatCents(31247)}.` },
      { type: "done", unverified: [] },
    ]);
    expect(brut.endsWith("\n")).toBe(true);
  });

  it("annonce le chargement du modèle avant le premier morceau", async () => {
    const { evenements } = await lireTout(construire(source("Bonjour"), true));

    expect(evenements[0]).toEqual({ type: "status", state: "loading" });
    expect(evenements.filter((e) => e.type === "status")).toHaveLength(1);
    expect(evenements.map((e) => e.type)).toEqual(["status", "text", "done"]);
  });

  it("n'émet aucun « status » quand le modèle est déjà chargé", async () => {
    const { evenements } = await lireTout(construire(source("Bonjour"), false));
    expect(evenements.some((e) => e.type === "status")).toBe(false);
  });

  it("signale un montant inventé, formaté comme l'application", async () => {
    const { evenements } = await lireTout(
      construire(source("Il reste ", `${formatCents(8753)} sur ${formatCents(40000)}.`)),
    );

    expect(evenements.at(-1)).toEqual({ type: "done", unverified: [formatCents(8753)] });
  });

  it("contrôle le texte complet, même quand un montant est coupé entre deux morceaux", async () => {
    const complet = formatCents(31247);
    const { evenements } = await lireTout(
      construire(source("Dépensé : ", complet.slice(0, 3), complet.slice(3))),
    );

    expect(evenements.at(-1)).toEqual({ type: "done", unverified: [] });
  });

  it("n'émet jamais d'événement « text » vide", async () => {
    const { evenements } = await lireTout(construire(source("", "A", "", "B")));
    const textes = evenements.filter((e) => e.type === "text");
    expect(textes).toEqual([
      { type: "text", text: "A" },
      { type: "text", text: "B" },
    ]);
  });

  it("signale « interrupted » quand la source casse après du texte, puis se ferme", async () => {
    const { evenements } = await lireTout(
      construire(source("Début", new OllamaError("interrupted"), "jamais")),
    );

    expect(evenements).toEqual([
      { type: "text", text: "Début" },
      { type: "error", code: "interrupted" },
    ]);
  });

  it("signale « unavailable » quand la source casse avant tout texte", async () => {
    const { evenements } = await lireTout(construire(source(new OllamaError("unavailable"))));
    expect(evenements).toEqual([{ type: "error", code: "unavailable" }]);
  });

  it("signale « timeout » quand le délai est écoulé", async () => {
    const { evenements } = await lireTout(
      construire(source("Début", new OllamaError("timeout"))),
    );
    expect(evenements.at(-1)).toEqual({ type: "error", code: "timeout" });
  });

  it("signale « unavailable » pour une réponse entièrement vide", async () => {
    const { evenements } = await lireTout(construire(source()));
    expect(evenements).toEqual([{ type: "error", code: "unavailable" }]);
  });

  it("ne signale aucune erreur pour une annulation : le client a décidé d'arrêter", async () => {
    const { evenements } = await lireTout(
      construire(source("Début", new OllamaError("aborted"))),
    );

    expect(evenements).toEqual([{ type: "text", text: "Début" }]);
  });

  it("traite une panne imprévue comme une coupure ou une absence selon le texte reçu", async () => {
    const apresTexte = await lireTout(construire(source("A", new TypeError("boum"))));
    expect(apresTexte.evenements.at(-1)).toEqual({ type: "error", code: "interrupted" });

    const avantTexte = await lireTout(construire(source(new TypeError("boum"))));
    expect(avantTexte.evenements).toEqual([{ type: "error", code: "unavailable" }]);
  });

  it("ne produit qu'un seul événement terminal, jamais d'événement après lui", async () => {
    const { evenements } = await lireTout(construire(source("A", "B")));
    const terminaux = evenements.filter((e) => e.type === "done" || e.type === "error");
    expect(terminaux).toHaveLength(1);
    expect(evenements.at(-1)?.type).toBe("done");
  });

  it("produit une ligne JSON valide par événement, accents compris", async () => {
    const { brut } = await lireTout(construire(source("Réponse accentuée : é à ç œ")));
    for (const ligne of brut.split("\n").filter((l) => l !== "")) {
      expect(() => JSON.parse(ligne)).not.toThrow();
    }
    expect(brut).toContain("Réponse accentuée : é à ç œ");
  });

  it("ne lit pas la source avant que le client lise (paresse)", async () => {
    const suivant = vi.fn();
    async function* surveillee(): AsyncGenerator<string, void, void> {
      suivant();
      yield "A";
    }
    const flux = construire(surveillee());
    expect(suivant).not.toHaveBeenCalled();
    await lireTout(flux);
    expect(suivant).toHaveBeenCalled();
  });

  it("ferme la source quand le lecteur renonce (arrêt de la génération, EF-026)", async () => {
    const fermee = vi.fn();
    async function* infinie(): AsyncGenerator<string, void, void> {
      try {
        for (;;) yield "texte ";
      } finally {
        fermee();
      }
    }

    const lecteur = construire(infinie()).getReader();
    const premier = await lecteur.read();
    expect(premier.done).toBe(false);
    await lecteur.cancel();

    expect(fermee).toHaveBeenCalledTimes(1);
  });

  it("n'échoue pas si le lecteur renonce après la fin de la source", async () => {
    const lecteur = construire(source("A")).getReader();
    for (;;) {
      if ((await lecteur.read()).done) break;
    }
    await expect(lecteur.cancel()).resolves.toBeUndefined();
  });
});
