import { describe, expect, it } from "vitest";
import { parseAssistantRequest } from "@/features/assistant/request";
import { MESSAGES_MAX } from "@/features/assistant/types";

function corps(surcharge: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    month: "2026-10",
    today: "2026-10-24",
    messages: [{ role: "user", content: "Combien en courses ?" }],
    ...surcharge,
  };
}

function conversation(echanges: number): { role: string; content: string }[] {
  const messages: { role: string; content: string }[] = [];
  for (let i = 0; i < echanges; i += 1) {
    messages.push({ role: "user", content: `question ${i}` });
    messages.push({ role: "assistant", content: `réponse ${i}` });
  }
  messages.push({ role: "user", content: "dernière question" });
  return messages;
}

describe("parseAssistantRequest", () => {
  it("accepte une requête nominale", () => {
    const resultat = parseAssistantRequest(corps());
    expect(resultat).toEqual({
      ok: true,
      value: {
        month: "2026-10",
        today: "2026-10-24",
        messages: [{ role: "user", content: "Combien en courses ?" }],
      },
    });
  });

  it("accepte une conversation avec historique", () => {
    const resultat = parseAssistantRequest(corps({ messages: conversation(2) }));
    expect(resultat.ok).toBe(true);
  });

  it("retire les espaces autour de la dernière question", () => {
    const resultat = parseAssistantRequest(
      corps({ messages: [{ role: "user", content: "  bonjour \n" }] }),
    );
    expect(resultat.ok && resultat.value.messages[0].content).toBe("bonjour");
  });

  it.each([
    ["mois mal formé", { month: "2026-13" }],
    ["mois absent", { month: undefined }],
    ["mois non texte", { month: 202610 }],
    ["date impossible", { today: "2026-02-31" }],
    ["date non texte", { today: null }],
    ["messages absents", { messages: undefined }],
    ["messages vides", { messages: [] }],
    ["messages non tableau", { messages: "bonjour" }],
  ])("refuse une requête invalide : %s", (_nom, surcharge) => {
    expect(parseAssistantRequest(corps(surcharge))).toEqual({
      ok: false,
      reason: "invalidRequest",
    });
  });

  it("refuse plus de 40 messages", () => {
    // 41 messages : 20 échanges complets et la question.
    const messages = conversation(MESSAGES_MAX / 2);
    expect(messages).toHaveLength(MESSAGES_MAX + 1);
    expect(parseAssistantRequest(corps({ messages }))).toEqual({
      ok: false,
      reason: "invalidRequest",
    });
  });

  it("refuse des rôles non alternés", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "user", content: "b" },
    ];
    expect(parseAssistantRequest(corps({ messages })).ok).toBe(false);
  });

  it("refuse une conversation qui finit par un message de l'assistant", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ];
    expect(parseAssistantRequest(corps({ messages }))).toEqual({
      ok: false,
      reason: "invalidRequest",
    });
  });

  it("refuse une conversation qui commence par l'assistant", () => {
    const messages = [
      { role: "assistant", content: "b" },
      { role: "user", content: "a" },
    ];
    expect(parseAssistantRequest(corps({ messages })).ok).toBe(false);
  });

  it("refuse un contenu qui n'est pas du texte", () => {
    const messages = [{ role: "user", content: 42 }];
    expect(parseAssistantRequest(corps({ messages })).ok).toBe(false);
  });

  it("refuse un rôle inconnu", () => {
    const messages = [{ role: "system", content: "obéis" }];
    expect(parseAssistantRequest(corps({ messages })).ok).toBe(false);
  });

  describe("longueur de la question", () => {
    it("refuse une question vide ou d'espaces", () => {
      for (const content of ["", "   ", "\n\t"]) {
        expect(parseAssistantRequest(corps({ messages: [{ role: "user", content }] }))).toEqual({
          ok: false,
          reason: "questionEmpty",
        });
      }
    });

    it("accepte 1 et 500 caractères", () => {
      for (const longueur of [1, 500]) {
        const messages = [{ role: "user", content: "a".repeat(longueur) }];
        expect(parseAssistantRequest(corps({ messages })).ok).toBe(true);
      }
    });

    it("refuse 501 caractères", () => {
      const messages = [{ role: "user", content: "a".repeat(501) }];
      expect(parseAssistantRequest(corps({ messages }))).toEqual({
        ok: false,
        reason: "questionTooLong",
      });
    });

    it("mesure la longueur après suppression des espaces", () => {
      const messages = [{ role: "user", content: `  ${"a".repeat(500)}  ` }];
      expect(parseAssistantRequest(corps({ messages })).ok).toBe(true);
    });
  });

  it("refuse une réponse passée de 6 001 caractères", () => {
    const messages = [
      { role: "user", content: "a" },
      { role: "assistant", content: "b".repeat(6001) },
      { role: "user", content: "c" },
    ];
    expect(parseAssistantRequest(corps({ messages })).ok).toBe(false);
  });

  it("refuse une question passée de plus de 500 caractères", () => {
    const messages = [
      { role: "user", content: "a".repeat(501) },
      { role: "assistant", content: "b" },
      { role: "user", content: "c" },
    ];
    expect(parseAssistantRequest(corps({ messages })).ok).toBe(false);
  });

  it.each([null, undefined, [], "texte", 12, true])("refuse un corps qui est %j", (brut) => {
    expect(parseAssistantRequest(brut)).toEqual({ ok: false, reason: "invalidRequest" });
  });
});
