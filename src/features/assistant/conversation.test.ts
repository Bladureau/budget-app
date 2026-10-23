import { describe, expect, it } from "vitest";
import {
  EMPTY_CONVERSATION,
  buildHistory,
  checkQuestion,
  conversationReducer,
  hasInFlight,
} from "@/features/assistant/conversation";
import type { ConversationAction } from "@/features/assistant/conversation";
import type { ClientEvent, ConversationState, Exchange } from "@/features/assistant/types";

function appliquer(etat: ConversationState, ...actions: ConversationAction[]): ConversationState {
  return actions.reduce(conversationReducer, etat);
}

function recevoir(exchangeId: string, ...events: ClientEvent[]): ConversationAction[] {
  return events.map((event) => ({ type: "receive", exchangeId, event }));
}

/** Un échange terminé, répondu par `reponse`. */
function termine(id: string, question: string, reponse: string): ConversationAction[] {
  return [
    { type: "send", id, question },
    ...recevoir(id, { type: "text", text: reponse }, { type: "done", unverified: [] }),
  ];
}

function echange(etat: ConversationState, id: string): Exchange {
  const trouve = etat.exchanges.find((e) => e.id === id);
  if (trouve === undefined) throw new Error(`échange ${id} introuvable`);
  return trouve;
}

describe("checkQuestion", () => {
  it("accepte 1 et 500 caractères, après suppression des espaces", () => {
    expect(checkQuestion("a")).toEqual({ ok: true, question: "a" });
    expect(checkQuestion(`  ${"a".repeat(500)}  `).ok).toBe(true);
  });

  it("refuse le vide et 501 caractères", () => {
    expect(checkQuestion("   ")).toEqual({ ok: false, reason: "empty" });
    expect(checkQuestion("a".repeat(501))).toEqual({ ok: false, reason: "tooLong" });
  });
});

describe("envoi", () => {
  it("ajoute un échange en attente, question nettoyée", () => {
    const etat = appliquer(EMPTY_CONVERSATION, { type: "send", id: "e1", question: "  Bonjour  " });

    expect(etat.exchanges).toEqual([
      { id: "e1", question: "Bonjour", answer: "", status: "waiting", unverified: [] },
    ]);
    expect(hasInFlight(etat)).toBe(true);
  });

  it("ignore une question vide ou de plus de 500 caractères", () => {
    for (const question of ["", "   ", "a".repeat(501)]) {
      expect(appliquer(EMPTY_CONVERSATION, { type: "send", id: "e1", question })).toBe(
        EMPTY_CONVERSATION,
      );
    }
  });

  it("ignore un envoi pendant qu'une réponse est en cours (EF-020)", () => {
    const enCours = appliquer(EMPTY_CONVERSATION, { type: "send", id: "e1", question: "A" });
    expect(appliquer(enCours, { type: "send", id: "e2", question: "B" })).toBe(enCours);

    for (const evenement of [
      { type: "status", state: "loading" },
      { type: "text", text: "x" },
    ] as ClientEvent[]) {
      const etat = appliquer(enCours, ...recevoir("e1", evenement));
      expect(appliquer(etat, { type: "send", id: "e2", question: "B" })).toBe(etat);
    }
  });

  it("permet un nouvel envoi une fois la réponse terminée", () => {
    const etat = appliquer(EMPTY_CONVERSATION, ...termine("e1", "A", "R"), {
      type: "send",
      id: "e2",
      question: "B",
    });
    expect(etat.exchanges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

describe("réception", () => {
  const enCours = appliquer(EMPTY_CONVERSATION, { type: "send", id: "e1", question: "A" });

  it("passe par « loading » puis « streaming » et concatène le texte", () => {
    let etat = appliquer(enCours, ...recevoir("e1", { type: "status", state: "loading" }));
    expect(echange(etat, "e1").status).toBe("loading");

    etat = appliquer(
      etat,
      ...recevoir("e1", { type: "text", text: "Bon" }, { type: "text", text: "jour" }),
    );
    expect(echange(etat, "e1")).toMatchObject({ status: "streaming", answer: "Bonjour" });
  });

  it("termine avec les montants non vérifiés", () => {
    const etat = appliquer(
      enCours,
      ...recevoir("e1", { type: "text", text: "R" }, { type: "done", unverified: ["12,00 €"] }),
    );
    expect(echange(etat, "e1")).toMatchObject({ status: "done", unverified: ["12,00 €"] });
    expect(hasInFlight(etat)).toBe(false);
  });

  it.each([
    ["unavailable", "unavailable"],
    ["timeout", "unavailable"],
    ["interrupted", "interrupted"],
    ["unauthorized", "unauthorized"],
    ["failed", "failed"],
  ] as const)("traduit l'erreur %s en état « %s »", (code, statut) => {
    const etat = appliquer(
      enCours,
      ...recevoir("e1", { type: "text", text: "début" }, { type: "error", code }),
    );
    // Le texte déjà reçu est conservé.
    expect(echange(etat, "e1")).toMatchObject({ status: statut, answer: "début" });
    expect(hasInFlight(etat)).toBe(false);
  });

  it("ignore les événements d'un échange inconnu ou déjà terminé", () => {
    const fini = appliquer(EMPTY_CONVERSATION, ...termine("e1", "A", "R"));
    expect(appliquer(fini, ...recevoir("e1", { type: "text", text: "tardif" }))).toEqual(fini);
    expect(appliquer(enCours, ...recevoir("absent", { type: "text", text: "x" }))).toEqual(enCours);
  });

  it("ignore le statut « loading » une fois le texte commencé", () => {
    const etat = appliquer(
      enCours,
      ...recevoir("e1", { type: "text", text: "x" }, { type: "status", state: "loading" }),
    );
    expect(echange(etat, "e1").status).toBe("streaming");
  });
});

describe("annulation", () => {
  it("garde le texte reçu et marque l'échange annulé", () => {
    const etat = appliquer(
      EMPTY_CONVERSATION,
      { type: "send", id: "e1", question: "A" },
      ...recevoir("e1", { type: "text", text: "Début" }),
      { type: "cancel" },
    );

    expect(echange(etat, "e1")).toMatchObject({ status: "cancelled", answer: "Début" });
    expect(hasInFlight(etat)).toBe(false);
  });

  it("annule aussi avant tout texte : la question reste, sans réponse", () => {
    for (const evenements of [[], [{ type: "status", state: "loading" } as ClientEvent]]) {
      const etat = appliquer(
        EMPTY_CONVERSATION,
        { type: "send", id: "e1", question: "A" },
        ...recevoir("e1", ...evenements),
        { type: "cancel" },
      );
      expect(echange(etat, "e1")).toMatchObject({ status: "cancelled", answer: "", question: "A" });
    }
  });

  it("n'a aucun effet quand rien n'est en cours", () => {
    const fini = appliquer(EMPTY_CONVERSATION, ...termine("e1", "A", "R"));
    expect(appliquer(fini, { type: "cancel" })).toEqual(fini);
  });

  it("ignore les événements qui arrivent après l'annulation", () => {
    const etat = appliquer(
      EMPTY_CONVERSATION,
      { type: "send", id: "e1", question: "A" },
      { type: "cancel" },
      ...recevoir("e1", { type: "text", text: "tardif" }, { type: "done", unverified: [] }),
    );
    expect(echange(etat, "e1")).toMatchObject({ status: "cancelled", answer: "" });
  });

  it("permet d'envoyer aussitôt après une annulation", () => {
    const etat = appliquer(
      EMPTY_CONVERSATION,
      { type: "send", id: "e1", question: "A" },
      { type: "cancel" },
      { type: "send", id: "e2", question: "B" },
    );
    expect(etat.exchanges.map((e) => e.id)).toEqual(["e1", "e2"]);
  });
});

describe("modification d'un message (EF-025)", () => {
  const troisEchanges = appliquer(
    EMPTY_CONVERSATION,
    ...termine("e1", "Q1", "R1"),
    ...termine("e2", "Q2", "R2"),
    ...termine("e3", "Q3", "R3"),
  );

  it("remplace l'échange modifié et tous les suivants", () => {
    const etat = appliquer(troisEchanges, {
      type: "edit",
      exchangeId: "e1",
      id: "e4",
      question: "Q1 modifiée",
    });

    expect(etat.exchanges).toEqual([
      { id: "e4", question: "Q1 modifiée", answer: "", status: "waiting", unverified: [] },
    ]);
  });

  it("ne remplace que la suite quand on modifie un échange du milieu", () => {
    const etat = appliquer(troisEchanges, {
      type: "edit",
      exchangeId: "e2",
      id: "e4",
      question: "Q2 modifiée",
    });
    expect(etat.exchanges.map((e) => e.id)).toEqual(["e1", "e4"]);
  });

  it("ne fait rien si la question est identique à l'originale", () => {
    const etat = appliquer(troisEchanges, {
      type: "edit",
      exchangeId: "e1",
      id: "e4",
      question: "  Q1  ",
    });
    expect(etat).toBe(troisEchanges);
  });

  it("ignore une modification vide, trop longue ou d'un échange inconnu", () => {
    for (const [exchangeId, question] of [
      ["e1", ""],
      ["e1", "a".repeat(501)],
      ["absent", "autre"],
    ]) {
      expect(appliquer(troisEchanges, { type: "edit", exchangeId, id: "e4", question })).toBe(
        troisEchanges,
      );
    }
  });

  it("ignore une modification pendant une réponse", () => {
    const enCours = appliquer(troisEchanges, { type: "send", id: "e4", question: "Q4" });
    expect(
      appliquer(enCours, { type: "edit", exchangeId: "e1", id: "e5", question: "autre" }),
    ).toBe(enCours);
  });

  it("permet de modifier la question d'un échange annulé", () => {
    const etat = appliquer(
      EMPTY_CONVERSATION,
      { type: "send", id: "e1", question: "Q" },
      { type: "cancel" },
      { type: "edit", exchangeId: "e1", id: "e2", question: "Q bis" },
    );
    expect(etat.exchanges).toHaveLength(1);
    expect(etat.exchanges[0]).toMatchObject({ id: "e2", question: "Q bis", status: "waiting" });
  });
});

describe("réinitialisation", () => {
  it("vide la conversation", () => {
    const etat = appliquer(EMPTY_CONVERSATION, ...termine("e1", "A", "R"), { type: "reset" });
    expect(etat.exchanges).toEqual([]);
  });

  it("est ignorée tant qu'une réponse est en cours", () => {
    const enCours = appliquer(EMPTY_CONVERSATION, { type: "send", id: "e1", question: "A" });
    expect(appliquer(enCours, { type: "reset" })).toBe(enCours);
  });

  it("est possible après une annulation", () => {
    const etat = appliquer(
      EMPTY_CONVERSATION,
      { type: "send", id: "e1", question: "A" },
      { type: "cancel" },
      { type: "reset" },
    );
    expect(etat.exchanges).toEqual([]);
  });
});

describe("nouvel essai", () => {
  it.each(["unavailable", "failed", "interrupted"] as const)(
    "relance la même question d'un échange en état « %s »",
    (code) => {
      const echoue = appliquer(
        EMPTY_CONVERSATION,
        { type: "send", id: "e1", question: "A" },
        ...recevoir("e1", { type: "text", text: "début" }, { type: "error", code }),
      );
      const etat = appliquer(echoue, { type: "retry", exchangeId: "e1" });

      expect(echange(etat, "e1")).toEqual({
        id: "e1",
        question: "A",
        answer: "",
        status: "waiting",
        unverified: [],
      });
    },
  );

  it("ne relance ni un échange terminé ni un échange en cours", () => {
    const fini = appliquer(EMPTY_CONVERSATION, ...termine("e1", "A", "R"));
    expect(appliquer(fini, { type: "retry", exchangeId: "e1" })).toBe(fini);

    const enCours = appliquer(EMPTY_CONVERSATION, { type: "send", id: "e1", question: "A" });
    expect(appliquer(enCours, { type: "retry", exchangeId: "e1" })).toBe(enCours);
  });
});

describe("buildHistory", () => {
  it("rend les échanges terminés, en rôles alternés", () => {
    const etat = appliquer(EMPTY_CONVERSATION, ...termine("e1", "Q1", "R1"), ...termine("e2", "Q2", "R2"));
    expect(buildHistory(etat)).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "R1" },
      { role: "user", content: "Q2" },
      { role: "assistant", content: "R2" },
    ]);
  });

  it("omet les échanges annulés, interrompus, indisponibles et en erreur", () => {
    const etat = appliquer(
      EMPTY_CONVERSATION,
      ...termine("e1", "Q1", "R1"),
      { type: "send", id: "e2", question: "Q2" },
      { type: "cancel" },
      { type: "send", id: "e3", question: "Q3" },
      ...recevoir("e3", { type: "text", text: "x" }, { type: "error", code: "interrupted" }),
      { type: "send", id: "e4", question: "Q4" },
      ...recevoir("e4", { type: "error", code: "unavailable" }),
      { type: "send", id: "e5", question: "Q5" },
      ...recevoir("e5", { type: "error", code: "failed" }),
      { type: "send", id: "e6", question: "Q6" },
      ...recevoir("e6", { type: "error", code: "unauthorized" }),
    );

    expect(buildHistory(etat)).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "R1" },
    ]);
  });

  it("s'arrête avant l'échange demandé", () => {
    const etat = appliquer(
      EMPTY_CONVERSATION,
      ...termine("e1", "Q1", "R1"),
      ...termine("e2", "Q2", "R2"),
      ...termine("e3", "Q3", "R3"),
    );
    expect(buildHistory(etat, "e2")).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "R1" },
    ]);
    expect(buildHistory(etat, "e1")).toEqual([]);
  });

  it("n'inclut jamais l'échange en cours", () => {
    const etat = appliquer(EMPTY_CONVERSATION, ...termine("e1", "Q1", "R1"), {
      type: "send",
      id: "e2",
      question: "Q2",
    });
    expect(buildHistory(etat)).toHaveLength(2);
  });

  it("ne dépasse jamais ce qu'accepte le serveur : 19 échanges au plus", () => {
    const actions = Array.from({ length: 30 }, (_, i) => termine(`e${i}`, `Q${i}`, `R${i}`)).flat();
    const historique = buildHistory(appliquer(EMPTY_CONVERSATION, ...actions));

    expect(historique).toHaveLength(38);
    expect(historique[0].content).toBe("Q11");
    expect(historique.at(-1)?.content).toBe("R29");
  });

  it("omet une réponse trop longue pour le contrat plutôt que de rendre la requête invalide", () => {
    const etat = appliquer(
      EMPTY_CONVERSATION,
      ...termine("e1", "Q1", "r".repeat(6001)),
      ...termine("e2", "Q2", "R2"),
    );
    expect(buildHistory(etat).map((t) => t.content)).toEqual(["Q2", "R2"]);
  });
});
