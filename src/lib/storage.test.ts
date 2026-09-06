import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CORRUPTED_KEY_PREFIX,
  STORAGE_KEY,
  loadDocument,
  parseDocument,
  saveDocument,
} from "@/lib/storage";
import { DOCUMENT_VERSION, emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

const documentValide: BudgetDocument = {
  version: 1,
  incomes: [
    {
      id: "revenu-1",
      label: "Salaire",
      amountCents: 240000,
      kind: "recurring",
      periodicity: "monthly",
      startDate: "2026-01-05",
      endDate: null,
    },
    {
      id: "revenu-2",
      label: "Prime",
      amountCents: 50000,
      kind: "oneOff",
      date: "2026-03-15",
    },
  ],
  subscriptions: [
    {
      id: "abo-1",
      label: "Assurance habitation",
      periodicity: "annual",
      startDate: "2026-09-10",
      endDate: null,
      amounts: [{ amountCents: 12000, effectiveFrom: "2026-09-10" }],
      pauses: [],
    },
  ],
};

beforeEach(() => {
  localStorage.clear();
});

describe("parseDocument — documents acceptés", () => {
  it("accepte un document conforme et le restitue à l’identique", () => {
    const resultat = parseDocument(structuredClone(documentValide));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value).toEqual(documentValide);
  });

  it("accepte un document vide", () => {
    const resultat = parseDocument({ version: 1, incomes: [], subscriptions: [] });
    expect(resultat.ok).toBe(true);
  });
});

describe("parseDocument — documents refusés", () => {
  function refus(valeur: unknown, motif: string) {
    const resultat = parseDocument(valeur);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe(motif);
  }

  it("refuse ce qui n’est pas un objet", () => {
    refus(null, "notAnObject");
    refus("texte", "notAnObject");
    refus([], "notAnObject");
  });

  it("refuse une version absente ou non entière", () => {
    refus({ incomes: [], subscriptions: [] }, "unknownVersion");
    refus({ version: "1", incomes: [], subscriptions: [] }, "unknownVersion");
    refus({ version: 1.5, incomes: [], subscriptions: [] }, "unknownVersion");
  });

  it("refuse une version postérieure à celle que sait lire l’application", () => {
    refus({ version: 99, incomes: [], subscriptions: [] }, "futureVersion");
  });

  it("refuse un montant non entier, négatif ou nul", () => {
    for (const montant of [12.5, -100, 0]) {
      refus(
        {
          version: 1,
          incomes: [
            { id: "a", label: "X", amountCents: montant, kind: "oneOff", date: "2026-01-01" },
          ],
          subscriptions: [],
        },
        "invalidData",
      );
    }
  });

  it("refuse une date calendairement impossible", () => {
    refus(
      {
        version: 1,
        incomes: [
          { id: "a", label: "X", amountCents: 100, kind: "oneOff", date: "2026-02-31" },
        ],
        subscriptions: [],
      },
      "invalidData",
    );
  });

  it("refuse une date de fin antérieure à la date de début", () => {
    refus(
      {
        version: 1,
        incomes: [
          {
            id: "a",
            label: "X",
            amountCents: 100,
            kind: "recurring",
            periodicity: "monthly",
            startDate: "2026-03-01",
            endDate: "2026-02-01",
          },
        ],
        subscriptions: [],
      },
      "invalidData",
    );
  });

  it("refuse un identifiant en double", () => {
    refus(
      {
        version: 1,
        incomes: [
          { id: "meme", label: "A", amountCents: 100, kind: "oneOff", date: "2026-01-01" },
          { id: "meme", label: "B", amountCents: 200, kind: "oneOff", date: "2026-01-02" },
        ],
        subscriptions: [],
      },
      "invalidData",
    );
  });

  it("refuse un abonnement sans historique de montants", () => {
    refus(
      {
        version: 1,
        incomes: [],
        subscriptions: [
          {
            id: "s",
            label: "X",
            periodicity: "monthly",
            startDate: "2026-01-10",
            endDate: null,
            amounts: [],
            pauses: [],
          },
        ],
      },
      "invalidData",
    );
  });

  it("refuse un historique de montants non trié", () => {
    refus(
      {
        version: 1,
        incomes: [],
        subscriptions: [
          {
            id: "s",
            label: "X",
            periodicity: "monthly",
            startDate: "2026-01-10",
            endDate: null,
            amounts: [
              { amountCents: 200, effectiveFrom: "2026-06-10" },
              { amountCents: 100, effectiveFrom: "2026-01-10" },
            ],
            pauses: [],
          },
        ],
      },
      "invalidData",
    );
  });

  it("refuse des périodes de suspension qui se chevauchent", () => {
    refus(
      {
        version: 1,
        incomes: [],
        subscriptions: [
          {
            id: "s",
            label: "X",
            periodicity: "monthly",
            startDate: "2026-01-10",
            endDate: null,
            amounts: [{ amountCents: 100, effectiveFrom: "2026-01-10" }],
            pauses: [
              { from: "2026-02-01", to: "2026-04-01" },
              { from: "2026-03-01", to: "2026-05-01" },
            ],
          },
        ],
      },
      "invalidData",
    );
  });

  it("refuse une périodicité inconnue", () => {
    refus(
      {
        version: 1,
        incomes: [],
        subscriptions: [
          {
            id: "s",
            label: "X",
            periodicity: "weekly",
            startDate: "2026-01-10",
            endDate: null,
            amounts: [{ amountCents: 100, effectiveFrom: "2026-01-10" }],
            pauses: [],
          },
        ],
      },
      "invalidData",
    );
  });
});

describe("loadDocument", () => {
  it("démarre à vide quand la clé est absente, sans quarantaine", () => {
    const resultat = loadDocument();
    expect(resultat.document).toEqual(emptyDocument());
    expect(resultat.quarantined).toBe(false);
  });

  it("démarre à vide quand la valeur est une chaîne vide", () => {
    localStorage.setItem(STORAGE_KEY, "");
    expect(loadDocument().document).toEqual(emptyDocument());
  });

  it("charge un document valide", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documentValide));
    const resultat = loadDocument();
    expect(resultat.document).toEqual(documentValide);
    expect(resultat.quarantined).toBe(false);
  });

  it("met en quarantaine un JSON illisible et conserve la valeur brute intacte", () => {
    const brut = '{"version":1,"incomes":[';
    localStorage.setItem(STORAGE_KEY, brut);

    const resultat = loadDocument();

    expect(resultat.document).toEqual(emptyDocument());
    expect(resultat.quarantined).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    const clesQuarantaine = Object.keys(localStorage).filter((c) =>
      c.startsWith(CORRUPTED_KEY_PREFIX),
    );
    expect(clesQuarantaine).toHaveLength(1);
    expect(localStorage.getItem(clesQuarantaine[0])).toBe(brut);
  });

  it("met en quarantaine une version inconnue sans détruire les données", () => {
    const brut = JSON.stringify({ version: 99, incomes: [], subscriptions: [] });
    localStorage.setItem(STORAGE_KEY, brut);

    const resultat = loadDocument();

    expect(resultat.quarantined).toBe(true);
    const cle = Object.keys(localStorage).find((c) => c.startsWith(CORRUPTED_KEY_PREFIX));
    expect(cle).toBeDefined();
    expect(localStorage.getItem(cle as string)).toBe(brut);
  });

  it("met en quarantaine un document dont un seul champ est invalide, sans import partiel", () => {
    const brut = JSON.stringify({
      version: 1,
      incomes: [
        { id: "bon", label: "OK", amountCents: 100, kind: "oneOff", date: "2026-01-01" },
        { id: "mauvais", label: "KO", amountCents: -1, kind: "oneOff", date: "2026-01-02" },
      ],
      subscriptions: [],
    });
    localStorage.setItem(STORAGE_KEY, brut);

    const resultat = loadDocument();

    expect(resultat.document.incomes).toHaveLength(0);
    expect(resultat.quarantined).toBe(true);
  });
});

describe("saveDocument", () => {
  it("écrit un document valide et le relit à l’identique", () => {
    expect(saveDocument(documentValide)).toEqual({ ok: true });
    expect(loadDocument().document).toEqual(documentValide);
  });

  it("refuse d’écrire un document invalide", () => {
    const invalide = {
      version: DOCUMENT_VERSION,
      incomes: [{ id: "a", label: "", amountCents: 100, kind: "oneOff", date: "2026-01-01" }],
      subscriptions: [],
    } as unknown as BudgetDocument;

    const resultat = saveDocument(invalide);

    expect(resultat.ok).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("signale un échec d’écriture au lieu de le taire", () => {
    const espion = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    const resultat = saveDocument(documentValide);

    expect(resultat).toEqual({ ok: false, reason: "writeFailed" });
    espion.mockRestore();
  });
});
