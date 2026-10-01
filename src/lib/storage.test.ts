import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CORRUPTED_KEY_PREFIX,
  STORAGE_KEY,
  loadDocument,
  newId,
  parseDocument,
  saveDocument,
} from "@/lib/storage";
import { DOCUMENT_VERSION, emptyBankingState, emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

// Document témoin, au format courant. Porté en version 3 par la fonctionnalité 001 ; les
// migrations 1 → 2 et 2 → 3 sont vérifiées séparément par leurs blocs dédiés plus bas.
const documentValide: BudgetDocument = {
  ...emptyDocument(),
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
  expenses: [
    { id: "depense-1", amountCents: 1240, date: "2026-09-06", label: "Boulangerie", category: "Courses" },
  ],
  envelopes: [
    { id: "enveloppe-1", category: "Courses", month: "2026-09", limitCents: 40000 },
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

// --- Fonctionnalité 003 : migration 1 → 2 et dépenses ---------------------------------

/**
 * Document en version 1, tel qu'il existe chez un utilisateur ayant employé la
 * fonctionnalité 002. C'est ce que la migration ne doit sous aucun prétexte abîmer.
 */
const documentV1 = {
  version: 1,
  incomes: [
    {
      id: "salaire",
      label: "Salaire",
      amountCents: 240000,
      kind: "recurring",
      periodicity: "monthly",
      startDate: "2026-01-05",
      endDate: null,
    },
    { id: "prime", label: "Prime", amountCents: 50000, kind: "oneOff", date: "2026-03-15" },
    { id: "bonus", label: "Bonus", amountCents: 12345, kind: "oneOff", date: "2026-05-02" },
  ],
  subscriptions: [
    {
      id: "assurance",
      label: "Assurance habitation",
      periodicity: "annual",
      startDate: "2026-09-10",
      endDate: null,
      amounts: [{ amountCents: 12000, effectiveFrom: "2026-09-10" }],
      pauses: [],
    },
    {
      id: "streaming",
      label: "Streaming",
      periodicity: "monthly",
      startDate: "2026-01-05",
      endDate: null,
      amounts: [
        { amountCents: 999, effectiveFrom: "2026-01-05" },
        { amountCents: 1299, effectiveFrom: "2026-06-01" },
      ],
      pauses: [{ from: "2026-03-01", to: "2026-03-31" }],
    },
  ],
};

describe("Migration 1 → 2", () => {
  it("ne perd aucun revenu ni aucun abonnement", () => {
    const resultat = parseDocument(structuredClone(documentV1));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    // La version terminale est 3 depuis la fonctionnalité 001 : le document traverse les
    // deux migrations d'affilée.
    expect(resultat.value.version).toBe(DOCUMENT_VERSION);
    expect(resultat.value.incomes).toHaveLength(3);
    expect(resultat.value.subscriptions).toHaveLength(2);
  });

  it("reprend chaque élément à l’identique, historiques de tarifs et pauses compris", () => {
    const resultat = parseDocument(structuredClone(documentV1));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.value.incomes).toEqual(documentV1.incomes);
    expect(resultat.value.subscriptions).toEqual(documentV1.subscriptions);
  });

  it("initialise la collection des dépenses à vide", () => {
    const resultat = parseDocument(structuredClone(documentV1));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value.expenses).toEqual([]);
  });

  it("migre aussi un document v1 entièrement vide", () => {
    const resultat = parseDocument({ version: 1, incomes: [], subscriptions: [] });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.value.version).toBe(DOCUMENT_VERSION);
      expect(resultat.value.expenses).toEqual([]);
      expect(resultat.value.envelopes).toEqual([]);
    }
  });

  it("poursuit la migration d'un document v2 jusqu'en v3", () => {
    const v2 = { ...structuredClone(documentV1), version: 2, expenses: [] };
    const resultat = parseDocument(v2);
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.value.version).toBe(DOCUMENT_VERSION);
      expect(resultat.value.incomes).toEqual(v2.incomes);
      expect(resultat.value.subscriptions).toEqual(v2.subscriptions);
    }
  });

  it("survit à un aller-retour complet par le stockage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documentV1));
    const charge = loadDocument();

    expect(charge.quarantined).toBe(false);
    expect(charge.document.incomes).toEqual(documentV1.incomes);
    expect(charge.document.subscriptions).toEqual(documentV1.subscriptions);
    expect(charge.document.version).toBe(DOCUMENT_VERSION);
  });
});

describe("Analyseur de dépense", () => {
  function avecDepense(depense: unknown) {
    return parseDocument({ version: 2, incomes: [], subscriptions: [], expenses: [depense] });
  }

  const depenseValide = {
    id: "d1",
    amountCents: 1240,
    date: "2026-09-06",
    label: "Boulangerie",
    category: "Courses",
  };

  it("accepte une dépense complète", () => {
    const resultat = avecDepense(depenseValide);
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value.expenses[0]).toEqual(depenseValide);
  });

  it("accepte une dépense sans libellé ni catégorie", () => {
    const resultat = avecDepense({ id: "d1", amountCents: 500, date: "2026-09-06" });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value.expenses[0].category).toBeNull();
  });

  it("accepte une catégorie à null", () => {
    const resultat = avecDepense({ ...depenseValide, category: null });
    expect(resultat.ok).toBe(true);
  });

  it("refuse un montant négatif, nul ou non entier", () => {
    for (const montant of [-1, 0, 12.5, "1240", null]) {
      expect(avecDepense({ ...depenseValide, amountCents: montant }).ok).toBe(false);
    }
  });

  it("refuse une date calendairement impossible ou mal formée", () => {
    for (const date of ["2026-02-31", "2026-13-01", "06/09/2026", "", 42]) {
      expect(avecDepense({ ...depenseValide, date }).ok).toBe(false);
    }
  });

  it("refuse un libellé vide ou trop long", () => {
    expect(avecDepense({ ...depenseValide, label: "" }).ok).toBe(false);
    expect(avecDepense({ ...depenseValide, label: "x".repeat(81) }).ok).toBe(false);
  });

  it("refuse une catégorie trop longue", () => {
    expect(avecDepense({ ...depenseValide, category: "x".repeat(81) }).ok).toBe(false);
  });

  it("refuse un identifiant en doublon avec un revenu", () => {
    const resultat = parseDocument({
      version: 2,
      incomes: [
        { id: "meme", label: "Salaire", amountCents: 100, kind: "oneOff", date: "2026-01-01" },
      ],
      subscriptions: [],
      expenses: [{ id: "meme", amountCents: 500, date: "2026-09-06", category: null }],
    });
    expect(resultat.ok).toBe(false);
  });

  it("refuse le document entier si une seule dépense est invalide", () => {
    const resultat = parseDocument({
      version: 2,
      incomes: [],
      subscriptions: [],
      expenses: [
        depenseValide,
        { id: "d2", amountCents: -1, date: "2026-09-06", category: null },
      ],
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("invalidData");
  });

  it("refuse un document v2 dont la collection des dépenses est absente", () => {
    expect(parseDocument({ version: 2, incomes: [], subscriptions: [] }).ok).toBe(false);
  });
});

// --- Fonctionnalité 001 : migration 2 → 3 et enveloppes -------------------------------

/** Document v2 tel qu'il existe chez un utilisateur ayant employé les fonctionnalités 002 et 003. */
const documentV2 = {
  version: 2,
  incomes: [
    {
      id: "salaire-v2",
      label: "Salaire",
      amountCents: 240000,
      kind: "recurring",
      periodicity: "monthly",
      startDate: "2026-01-05",
      endDate: null,
    },
  ],
  subscriptions: [
    {
      id: "abo-v2",
      label: "Streaming",
      periodicity: "monthly",
      startDate: "2026-01-05",
      endDate: null,
      amounts: [{ amountCents: 1399, effectiveFrom: "2026-01-05" }],
      pauses: [],
    },
  ],
  expenses: [
    { id: "dep-1", amountCents: 1240, date: "2026-09-06", label: "Boulangerie", category: "Courses" },
    { id: "dep-2", amountCents: 3500, date: "2026-09-05", label: "Pharmacie", category: null },
    { id: "dep-3", amountCents: 890, date: "2026-08-30", label: "Café", category: "Sorties" },
  ],
};

describe("Migration 2 → 3", () => {
  it("ne perd aucune dépense", () => {
    const resultat = parseDocument(structuredClone(documentV2));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.value.version).toBe(DOCUMENT_VERSION);
    expect(resultat.value.expenses).toHaveLength(3);
    expect(resultat.value.expenses).toEqual(documentV2.expenses);
  });

  it("ne perd ni revenu ni abonnement", () => {
    const resultat = parseDocument(structuredClone(documentV2));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.value.incomes).toEqual(documentV2.incomes);
    expect(resultat.value.subscriptions).toEqual(documentV2.subscriptions);
  });

  it("initialise la collection des enveloppes à vide", () => {
    const resultat = parseDocument(structuredClone(documentV2));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value.envelopes).toEqual([]);
  });

  it("fait traverser les deux migrations à un document v1", () => {
    const v1 = {
      version: 1,
      incomes: documentV2.incomes,
      subscriptions: documentV2.subscriptions,
    };
    const resultat = parseDocument(structuredClone(v1));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.value.version).toBe(DOCUMENT_VERSION);
    expect(resultat.value.expenses).toEqual([]);
    expect(resultat.value.envelopes).toEqual([]);
    expect(resultat.value.incomes).toEqual(v1.incomes);
    expect(resultat.value.subscriptions).toEqual(v1.subscriptions);
  });

  it("migre un document en version 3 sans toucher à son contenu", () => {
    // Depuis la fonctionnalité 006, la version 3 n'est plus la version courante : elle ne
    // reçoit que les deux ajouts de la migration 3 → 4, tout le reste est repris à l'identique.
    const v3 = { ...structuredClone(documentV2), version: 3, envelopes: [] };
    const resultat = parseDocument(v3);
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.value).toEqual({
        ...v3,
        version: DOCUMENT_VERSION,
        refunds: [],
        banking: emptyBankingState(),
      });
    }
  });

  it("refuse une version postérieure sans y toucher", () => {
    const resultat = parseDocument({
      version: DOCUMENT_VERSION + 1,
      incomes: [],
      subscriptions: [],
      expenses: [],
      envelopes: [],
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("futureVersion");
  });

  it("survit à un aller-retour complet par le stockage", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documentV2));
    const charge = loadDocument();

    expect(charge.quarantined).toBe(false);
    expect(charge.document.version).toBe(DOCUMENT_VERSION);
    expect(charge.document.expenses).toEqual(documentV2.expenses);
  });
});

describe("Analyseur d'enveloppe", () => {
  const enveloppeValide = {
    id: "env-1",
    category: "Courses",
    month: "2026-03",
    limitCents: 40000,
  };

  function avecEnveloppe(enveloppe: unknown) {
    return parseDocument({
      version: 3,
      incomes: [],
      subscriptions: [],
      expenses: [],
      envelopes: [enveloppe],
    });
  }

  it("accepte une enveloppe conforme", () => {
    const resultat = avecEnveloppe(enveloppeValide);
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value.envelopes[0]).toEqual(enveloppeValide);
  });

  it("accepte un plafond nul, qui signifie « ne rien dépenser ici »", () => {
    const resultat = avecEnveloppe({ ...enveloppeValide, limitCents: 0 });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value.envelopes[0].limitCents).toBe(0);
  });

  it("refuse un plafond négatif ou non entier", () => {
    for (const plafond of [-1, -40000, 12.5, "40000", null]) {
      expect(avecEnveloppe({ ...enveloppeValide, limitCents: plafond }).ok).toBe(false);
    }
  });

  it("refuse une catégorie vide, absente ou trop longue", () => {
    for (const categorie of ["", "   ", undefined, null, "x".repeat(81), 42]) {
      expect(avecEnveloppe({ ...enveloppeValide, category: categorie }).ok).toBe(false);
    }
  });

  it("refuse un mois mal formé", () => {
    for (const mois of ["2026-13", "2026", "03-2026", "2026-03-01", "", 202603]) {
      expect(avecEnveloppe({ ...enveloppeValide, month: mois }).ok).toBe(false);
    }
  });

  it("refuse un doublon du couple catégorie / mois (EF-005)", () => {
    const resultat = parseDocument({
      version: 3,
      incomes: [],
      subscriptions: [],
      expenses: [],
      envelopes: [
        { id: "a", category: "Courses", month: "2026-03", limitCents: 40000 },
        { id: "b", category: "Courses", month: "2026-03", limitCents: 50000 },
      ],
    });
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("invalidData");
  });

  it("accepte la même catégorie sur deux mois différents", () => {
    const resultat = parseDocument({
      version: 3,
      incomes: [],
      subscriptions: [],
      expenses: [],
      envelopes: [
        { id: "a", category: "Courses", month: "2026-03", limitCents: 40000 },
        { id: "b", category: "Courses", month: "2026-04", limitCents: 50000 },
      ],
    });
    expect(resultat.ok).toBe(true);
  });

  it("refuse un identifiant en doublon avec une dépense", () => {
    const resultat = parseDocument({
      version: 3,
      incomes: [],
      subscriptions: [],
      expenses: [{ id: "meme", amountCents: 500, date: "2026-03-01", category: null }],
      envelopes: [{ id: "meme", category: "Courses", month: "2026-03", limitCents: 40000 }],
    });
    expect(resultat.ok).toBe(false);
  });

  it("refuse le document entier si une seule enveloppe est invalide", () => {
    const resultat = parseDocument({
      version: 3,
      incomes: [],
      subscriptions: [],
      expenses: [],
      envelopes: [
        enveloppeValide,
        { id: "env-2", category: "Transport", month: "2026-03", limitCents: -1 },
      ],
    });
    expect(resultat.ok).toBe(false);
  });

  it("refuse un document v3 dont la collection des enveloppes est absente", () => {
    expect(
      parseDocument({ version: 3, incomes: [], subscriptions: [], expenses: [] }).ok,
    ).toBe(false);
  });
});

// --- Identifiants hors contexte sécurisé (fonctionnalité 005) ---------------------------

describe("newId hors contexte sécurisé", () => {
  const UUID_V4 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  it("produit un UUID v4 quand crypto.randomUUID est disponible", () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it("produit encore un UUID v4 quand crypto.randomUUID est absent", () => {
    // C'est exactement la situation d'un téléphone ouvrant http://10.0.0.4:3000 : hors
    // contexte sécurisé, `randomUUID` n'existe pas. Sans repli, la première saisie
    // échouerait — et c'est précisément l'usage que la fonctionnalité 005 rend courant.
    const original = crypto.randomUUID;
    // @ts-expect-error — on simule un contexte non sécurisé, où la méthode est absente.
    delete crypto.randomUUID;

    try {
      expect(newId()).toMatch(UUID_V4);
    } finally {
      crypto.randomUUID = original;
    }
  });

  it("ne produit pas deux fois le même identifiant sans randomUUID", () => {
    const original = crypto.randomUUID;
    // @ts-expect-error — voir ci-dessus.
    delete crypto.randomUUID;

    try {
      const identifiants = new Set(Array.from({ length: 500 }, () => newId()));
      expect(identifiants.size).toBe(500);
    } finally {
      crypto.randomUUID = original;
    }
  });
});
