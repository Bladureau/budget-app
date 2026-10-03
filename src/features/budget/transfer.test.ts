import { describe, expect, it } from "vitest";
import {
  APPLICATION_MARKER,
  FORMAT_VERSION,
  buildExportFilename,
  parseImport,
  serializeExport,
} from "@/features/budget/transfer";
import { DOCUMENT_VERSION, emptyDocument } from "@/features/budget/types";
import type { BudgetDocument, Income, Subscription } from "@/features/budget/types";

const salaire: Income = {
  id: "salaire",
  label: "Salaire",
  amountCents: 240000,
  kind: "recurring",
  periodicity: "monthly",
  startDate: "2026-01-05",
  endDate: null,
};

const prime: Income = {
  id: "prime",
  label: "Prime",
  amountCents: 50000,
  kind: "oneOff",
  date: "2026-03-15",
};

const assurance: Subscription = {
  id: "assurance",
  label: "Assurance habitation",
  periodicity: "annual",
  startDate: "2026-09-10",
  endDate: null,
  amounts: [{ amountCents: 12000, effectiveFrom: "2026-09-10" }],
  pauses: [],
};

const documentComplet: BudgetDocument = {
  ...emptyDocument(),
  incomes: [salaire, prime],
  subscriptions: [assurance],
  expenses: [],
  envelopes: [],
};

const documentVide: BudgetDocument = {
  ...emptyDocument(),
  incomes: [],
  subscriptions: [],
  expenses: [],
  envelopes: [],
};

const DATE_EXPORT = new Date("2026-09-06T09:12:33.000Z");

/** Contenu d'un fichier valide, dont on peut ensuite altérer un champ pour les tests de refus. */
function fichierValide(surcharge: Record<string, unknown> = {}): string {
  return JSON.stringify({
    application: APPLICATION_MARKER,
    formatVersion: FORMAT_VERSION,
    exportedAt: DATE_EXPORT.toISOString(),
    data: documentComplet,
    ...surcharge,
  });
}

// --- T003 : sérialisation --------------------------------------------------------------

describe("serializeExport", () => {
  it("produit une enveloppe portant l’en-tête complet", () => {
    const enveloppe = JSON.parse(serializeExport(documentComplet, DATE_EXPORT));
    expect(enveloppe.application).toBe("budget-app");
    expect(enveloppe.formatVersion).toBe(FORMAT_VERSION);
    expect(enveloppe.exportedAt).toBe("2026-09-06T09:12:33.000Z");
    expect(enveloppe.data).toEqual(documentComplet);
  });

  it("indente de deux espaces pour rester lisible dans un éditeur (EF-003)", () => {
    const texte = serializeExport(documentComplet, DATE_EXPORT);
    expect(texte).toContain('\n  "application"');
    expect(texte.split("\n").length).toBeGreaterThan(10);
  });

  it("exporte un document vide sans erreur (EF-006)", () => {
    const enveloppe = JSON.parse(serializeExport(documentVide, DATE_EXPORT));
    expect(enveloppe.data.incomes).toEqual([]);
    expect(enveloppe.data.subscriptions).toEqual([]);
  });

  it("conserve les montants en centimes entiers, jamais en décimales", () => {
    const texte = serializeExport(documentComplet, DATE_EXPORT);
    expect(texte).toContain('"amountCents": 240000');
    expect(texte).not.toContain("2400.00");
  });
});

// --- T004 : nom du fichier -------------------------------------------------------------

describe("buildExportFilename", () => {
  it("comporte la date et l’heure (EF-005)", () => {
    // Construite en heure locale, comme le nom produit.
    const locale = new Date(2026, 8, 6, 11, 12);
    expect(buildExportFilename(locale)).toBe("budget-2026-09-06-1112.json");
  });

  it("remplit à deux chiffres les mois, jours, heures et minutes", () => {
    const locale = new Date(2026, 0, 5, 7, 3);
    expect(buildExportFilename(locale)).toBe("budget-2026-01-05-0703.json");
  });

  it("produit des noms triables chronologiquement", () => {
    const janvier = buildExportFilename(new Date(2026, 0, 5, 7, 3));
    const septembre = buildExportFilename(new Date(2026, 8, 6, 11, 12));
    expect([septembre, janvier].sort()).toEqual([janvier, septembre]);
  });
});

// --- T005 : refus ----------------------------------------------------------------------

describe("parseImport — fichier non reconnu (EF-022)", () => {
  function refus(contenu: string, motif: string) {
    const resultat = parseImport(contenu);
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe(motif);
  }

  it("refuse un contenu qui n’est pas du JSON", () => {
    refus("ceci n’est pas du JSON", "notAnExport");
    refus("<html></html>", "notAnExport");
  });

  it("refuse un fichier vide", () => {
    refus("", "notAnExport");
    refus("   ", "notAnExport");
  });

  it("refuse un JSON valide sans marqueur d’application", () => {
    refus(JSON.stringify({ formatVersion: 1, data: documentComplet }), "notAnExport");
    refus(JSON.stringify({ incomes: [], subscriptions: [] }), "notAnExport");
  });

  it("refuse un marqueur d’application différent", () => {
    refus(fichierValide({ application: "autre-app" }), "notAnExport");
  });

  it("refuse une racine qui n’est pas un objet", () => {
    refus("[]", "notAnExport");
    refus("null", "notAnExport");
    refus('"texte"', "notAnExport");
  });
});

describe("parseImport — version postérieure (EF-025)", () => {
  it("refuse une version de format supérieure", () => {
    const resultat = parseImport(fichierValide({ formatVersion: 99 }));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("futureVersion");
  });

  it("refuse un document dont la version est supérieure", () => {
    const resultat = parseImport(
      fichierValide({ data: { ...documentComplet, version: 99 } }),
    );
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("futureVersion");
  });

  it("refuse une version de format absente ou non entière", () => {
    for (const version of [undefined, "1", 1.5, 0, -1]) {
      const resultat = parseImport(fichierValide({ formatVersion: version }));
      expect(resultat.ok).toBe(false);
    }
  });
});

describe("parseImport — fichier abîmé (EF-023)", () => {
  function corrompu(data: unknown) {
    const resultat = parseImport(fichierValide({ data }));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("corrupted");
  }

  it("refuse un montant négatif, nul ou non entier", () => {
    for (const montant of [-1, 0, 12.5]) {
      corrompu({
        version: 1,
        incomes: [
          { id: "a", label: "X", amountCents: montant, kind: "oneOff", date: "2026-01-01" },
        ],
        subscriptions: [],
      });
    }
  });

  it("refuse une date calendairement impossible", () => {
    corrompu({
      version: 1,
      incomes: [{ id: "a", label: "X", amountCents: 100, kind: "oneOff", date: "2026-02-31" }],
      subscriptions: [],
    });
  });

  it("refuse un identifiant en double", () => {
    corrompu({
      version: 1,
      incomes: [
        { id: "meme", label: "A", amountCents: 100, kind: "oneOff", date: "2026-01-01" },
        { id: "meme", label: "B", amountCents: 200, kind: "oneOff", date: "2026-01-02" },
      ],
      subscriptions: [],
    });
  });

  it("refuse une périodicité inconnue", () => {
    corrompu({
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
    });
  });

  it("refuse un contenu absent ou du mauvais type", () => {
    corrompu(undefined);
    corrompu("texte");
    corrompu([]);
  });

  it("refuse un fichier tronqué portant pourtant le marqueur", () => {
    const tronque = fichierValide().slice(0, -30);
    const resultat = parseImport(tronque);
    expect(resultat.ok).toBe(false);
    // Tronqué, le JSON n’est plus analysable : le marqueur devient illisible.
    if (!resultat.ok) expect(resultat.reason).toBe("notAnExport");
  });
});

// --- T006 : acceptation ----------------------------------------------------------------

describe("parseImport — fichiers acceptés", () => {
  it("accepte un fichier valide et restitue le document", () => {
    const resultat = parseImport(fichierValide());
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.document).toEqual(documentComplet);
      expect(resultat.exportedAt).toBe("2026-09-06T09:12:33.000Z");
    }
  });

  it("accepte un fichier dont les collections sont vides", () => {
    const resultat = parseImport(fichierValide({ data: documentVide }));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.document.incomes).toEqual([]);
      expect(resultat.document.subscriptions).toEqual([]);
    }
  });

  it("tolère un horodatage absent ou illisible sans refuser le fichier", () => {
    for (const valeur of [undefined, 42, "", null]) {
      const resultat = parseImport(fichierValide({ exportedAt: valeur }));
      expect(resultat.ok).toBe(true);
      if (resultat.ok) {
        expect(resultat.exportedAt).toBeNull();
        // Les données, elles, sont bien là : un horodatage abîmé ne coûte aucune donnée.
        expect(resultat.document).toEqual(documentComplet);
      }
    }
  });
});

// --- T007 : aller-retour ---------------------------------------------------------------

describe("Aller-retour (EF-011, CS-003)", () => {
  it("export → import → export produit des données identiques", () => {
    const premier = serializeExport(documentComplet, DATE_EXPORT);

    const importe = parseImport(premier);
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;

    // Une date d’export différente : seul l’en-tête doit changer.
    const second = serializeExport(importe.document, new Date("2027-01-01T00:00:00.000Z"));

    expect(JSON.parse(second).data).toEqual(JSON.parse(premier).data);
    expect(JSON.stringify(JSON.parse(second).data)).toBe(
      JSON.stringify(JSON.parse(premier).data),
    );
  });

  it("normalise l’ordre des clés : un fichier désordonné produit le même export", () => {
    // Mêmes données, clés dans un autre ordre — ce qu’un éditeur manuel produirait.
    const desordonne = JSON.stringify({
      data: {
        subscriptions: [
          {
            pauses: [],
            amounts: [{ effectiveFrom: "2026-09-10", amountCents: 12000 }],
            endDate: null,
            startDate: "2026-09-10",
            periodicity: "annual",
            label: "Assurance habitation",
            id: "assurance",
          },
        ],
        incomes: [
          {
            endDate: null,
            startDate: "2026-01-05",
            periodicity: "monthly",
            kind: "recurring",
            amountCents: 240000,
            label: "Salaire",
            id: "salaire",
          },
          { date: "2026-03-15", kind: "oneOff", amountCents: 50000, label: "Prime", id: "prime" },
        ],
        version: 1,
      },
      exportedAt: DATE_EXPORT.toISOString(),
      formatVersion: FORMAT_VERSION,
      application: APPLICATION_MARKER,
    });

    const importe = parseImport(desordonne);
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;

    const reexporte = serializeExport(importe.document, DATE_EXPORT);
    expect(reexporte).toBe(serializeExport(documentComplet, DATE_EXPORT));
  });

  it("importer deux fois le même fichier donne le même résultat, sans doublon", () => {
    const fichier = serializeExport(documentComplet, DATE_EXPORT);
    const premier = parseImport(fichier);
    const second = parseImport(fichier);
    expect(premier.ok && second.ok).toBe(true);
    if (premier.ok && second.ok) {
      expect(second.document).toEqual(premier.document);
      expect(second.document.incomes).toHaveLength(2);
    }
  });
});

// --- T008 : exactitude et fidélité -----------------------------------------------------

describe("Fidélité de l’aller-retour", () => {
  it("restitue 100 % des éléments sur un jeu de plus de 200 (CS-002)", () => {
    const incomes: Income[] = Array.from({ length: 120 }, (_, i) => ({
      id: `revenu-${i}`,
      label: `Revenu ${i}`,
      amountCents: 3333 + i,
      kind: "oneOff" as const,
      date: "2026-03-10",
    }));
    const subscriptions: Subscription[] = Array.from({ length: 100 }, (_, i) => ({
      id: `abo-${i}`,
      label: `Abonnement ${i}`,
      periodicity: "monthly" as const,
      startDate: "2026-01-07",
      endDate: null,
      amounts: [{ amountCents: 777 + i, effectiveFrom: "2026-01-07" }],
      pauses: [],
    }));
    const volumineux: BudgetDocument = {
      ...emptyDocument(),
      incomes,
      subscriptions,
      expenses: [],
      envelopes: [],
    };

    const importe = parseImport(serializeExport(volumineux, DATE_EXPORT));
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;

    expect(importe.document.incomes).toHaveLength(120);
    expect(importe.document.subscriptions).toHaveLength(100);
    expect(importe.document).toEqual(volumineux);
  });

  it("conserve les montants exacts au centime, montant maximal inclus (CS-004)", () => {
    const extremes: BudgetDocument = {
      ...emptyDocument(),
      incomes: [
        { id: "min", label: "Un centime", amountCents: 1, kind: "oneOff", date: "2026-01-01" },
        {
          id: "max",
          label: "Montant maximal",
          amountCents: 9_000_000_000,
          kind: "oneOff",
          date: "2026-01-02",
        },
        { id: "impair", label: "Impair", amountCents: 3333, kind: "oneOff", date: "2026-01-03" },
      ],
      subscriptions: [],
      expenses: [],
      envelopes: [],
    };

    const importe = parseImport(serializeExport(extremes, DATE_EXPORT));
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;

    expect(importe.document.incomes.map((r) => r.amountCents)).toEqual([
      1, 9_000_000_000, 3333,
    ]);
  });

  it("restitue accents et emoji à l’identique (CS-010)", () => {
    const accentue: BudgetDocument = {
      ...emptyDocument(),
      incomes: [
        {
          id: "accents",
          label: "Prime d’été — café & thé 🎉",
          amountCents: 5000,
          kind: "oneOff",
          date: "2026-07-01",
        },
      ],
      subscriptions: [
        {
          id: "emoji",
          label: "Électricité ⚡ (à régler)",
          periodicity: "monthly",
          startDate: "2026-01-15",
          endDate: null,
          amounts: [{ amountCents: 8900, effectiveFrom: "2026-01-15" }],
          pauses: [],
        },
      ],
      expenses: [],
      envelopes: [],
    };

    const importe = parseImport(serializeExport(accentue, DATE_EXPORT));
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;

    expect(importe.document.incomes[0].label).toBe("Prime d’été — café & thé 🎉");
    expect(importe.document.subscriptions[0].label).toBe("Électricité ⚡ (à régler)");
  });
});

// --- T018 : EF-024 de la fonctionnalité 004, activée par le passage en version 2 --------
// Portée en version 3 par la fonctionnalité 001 : la migration compte désormais deux étapes.

describe("parseImport — fichier d’une version antérieure (EF-024)", () => {
  /**
   * Jusqu'au passage du document en version 2, EF-024 était sans objet : il n'existait
   * aucune version antérieure. Le document étant passé en version 3, ce fichier de format 1
   * traverse maintenant **les deux** migrations d'affilée.
   */
  const fichierFormat1 = JSON.stringify({
    application: APPLICATION_MARKER,
    formatVersion: 1,
    exportedAt: "2026-09-06T09:12:33.000Z",
    data: {
      version: 1,
      incomes: [
        { id: "salaire", label: "Salaire", amountCents: 240000, kind: "oneOff", date: "2026-03-01" },
      ],
      subscriptions: [
        {
          id: "abo",
          label: "Streaming",
          periodicity: "monthly",
          startDate: "2026-01-05",
          endDate: null,
          amounts: [{ amountCents: 1399, effectiveFrom: "2026-01-05" }],
          pauses: [],
        },
      ],
    },
  });

  it("accepte un export de format 1 et migre son contenu en version 3", () => {
    const resultat = parseImport(fichierFormat1);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.document.version).toBe(DOCUMENT_VERSION);
    expect(resultat.document.expenses).toEqual([]);
    expect(resultat.document.envelopes).toEqual([]);
  });

  it("ne perd aucun revenu ni aucun abonnement à la migration", () => {
    const resultat = parseImport(fichierFormat1);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.document.incomes).toHaveLength(1);
    expect(resultat.document.subscriptions).toHaveLength(1);
    expect(resultat.document.incomes[0].amountCents).toBe(240000);
    expect(resultat.document.subscriptions[0].amounts[0].amountCents).toBe(1399);
  });

  it("réexporte le contenu migré au format courant", () => {
    const resultat = parseImport(fichierFormat1);
    if (!resultat.ok) return;

    const enveloppe = JSON.parse(serializeExport(resultat.document, DATE_EXPORT));
    expect(enveloppe.formatVersion).toBe(FORMAT_VERSION);
    expect(enveloppe.data.version).toBe(DOCUMENT_VERSION);
  });
});

// --- Scénario 11 du guide de la fonctionnalité 001 : export après migration ---------------

describe("aller-retour avec des enveloppes (fonctionnalité 001)", () => {
  const avecEnveloppes: BudgetDocument = {
    ...emptyDocument(),
    incomes: [salaire],
    subscriptions: [],
    expenses: [
      { id: "d1", amountCents: 12050, date: "2026-09-03", category: "Courses" },
      { id: "d2", amountCents: 3000, date: "2026-09-04", category: null },
    ],
    envelopes: [
      { id: "e1", category: "Courses", month: "2026-09", limitCents: 40000 },
      { id: "e2", category: "Loisirs", month: "2026-09", limitCents: 0 },
    ],
  };

  it("annonce la version courante dans l'en-tete et dans le document", () => {
    const enveloppe = JSON.parse(serializeExport(avecEnveloppes, DATE_EXPORT));
    expect(enveloppe.formatVersion).toBe(FORMAT_VERSION);
    expect(enveloppe.data.version).toBe(DOCUMENT_VERSION);
    expect(enveloppe.data.envelopes).toHaveLength(2);
  });

  it("restitue les enveloppes a l'identique, plafond nul compris", () => {
    const importe = parseImport(serializeExport(avecEnveloppes, DATE_EXPORT));
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;

    expect(importe.document).toEqual(avecEnveloppes);
    // Le plafond nul est une intention, pas une absence : il doit survivre a l'aller-retour.
    expect(importe.document.envelopes[1].limitCents).toBe(0);
  });

  it("refuse un plafond negatif venu d'un fichier", () => {
    const abime = {
      ...avecEnveloppes,
      envelopes: [{ id: "e1", category: "Courses", month: "2026-09", limitCents: -1 }],
    };
    const resultat = parseImport(fichierValide({ data: abime }));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("corrupted");
  });

  it("refuse un doublon de couple categorie/mois venu d'un fichier (EF-005)", () => {
    const abime = {
      ...avecEnveloppes,
      envelopes: [
        { id: "e1", category: "Courses", month: "2026-09", limitCents: 100 },
        { id: "e2", category: "Courses", month: "2026-09", limitCents: 200 },
      ],
    };
    const resultat = parseImport(fichierValide({ data: abime }));
    expect(resultat.ok).toBe(false);
  });
});

// --- Fonctionnalité 006 : document v4 et données bancaires (EF-035) ------------------------

describe("aller-retour avec des données bancaires (fonctionnalité 006)", () => {
  const avecBanque: BudgetDocument = {
    ...emptyDocument(),
    expenses: [
      {
        id: "bank:lcl:c1",
        amountCents: 3382,
        date: "2026-10-03",
        label: "PETROLEC SUD",
        category: null,
        source: "lcl",
        bankRef: "lcl:c1",
      },
    ],
    refunds: [
      {
        id: "bank:lcl:r1",
        amountCents: 499,
        date: "2026-10-07",
        label: "Twitch",
        category: null,
        source: "lcl",
        bankRef: "lcl:r1",
      },
    ],
    banking: {
      ...emptyDocument().banking,
      importFrom: "2026-10-01",
      ledger: [
        { ref: "lcl:c1", outcome: "expense", reason: "structural:card" },
        { ref: "lcl:r1", outcome: "refund", reason: "structural:cardRefund" },
        { ref: "lcl:v1", outcome: "inbox", reason: "structural:unknown" },
      ],
      inbox: [
        {
          ref: "lcl:v1",
          bank: "lcl",
          date: "2026-10-02",
          amountCents: 35000,
          direction: "debit",
          kind: "transferOut",
          label: "VIR SEPA Jean Dupont",
          rawLabel: "VIREMENT · VIR SEPA Jean Dupont",
          why: "noRule",
        },
      ],
    },
  };

  it("restitue registre, règles, « À classer » et remboursements", () => {
    const importe = parseImport(serializeExport(avecBanque, DATE_EXPORT));
    expect(importe.ok).toBe(true);
    if (importe.ok) expect(importe.document).toEqual(avecBanque);
  });

  it("n'exporte aucun secret ni identifiant de session (CS-009)", () => {
    const contenu = serializeExport(avecBanque, DATE_EXPORT);
    expect(contenu).not.toMatch(/sessionId|session_id|accountUid|ibanHash|BEGIN [A-Z ]*PRIVATE KEY/);
  });

  it("réimporte un export de format 3 et le migre en version courante", () => {
    const exportV3 = JSON.stringify({
      application: APPLICATION_MARKER,
      formatVersion: 3,
      exportedAt: DATE_EXPORT.toISOString(),
      data: {
        version: 3,
        incomes: [salaire],
        subscriptions: [],
        expenses: [{ id: "d1", amountCents: 1250, date: "2026-09-03", category: "Courses" }],
        envelopes: [],
      },
    });

    const importe = parseImport(exportV3);
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;
    expect(importe.document.version).toBe(DOCUMENT_VERSION);
    expect(importe.document.expenses[0].amountCents).toBe(1250);
    expect(importe.document.refunds).toEqual([]);
    expect(importe.document.banking.rules.length).toBeGreaterThan(0);
  });

  it("refuse un export d'un format postérieur", () => {
    const resultat = parseImport(
      fichierValide({
        formatVersion: FORMAT_VERSION + 1,
        data: { ...avecBanque, version: DOCUMENT_VERSION + 1 },
      }),
    );
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("futureVersion");
  });
});

// --- Fonctionnalité 008 : document v5 et réserve d'épargne (FR-024, FR-025) -----------------

describe("aller-retour avec une réserve d'épargne (fonctionnalité 008)", () => {
  const avecReserve: BudgetDocument = {
    ...emptyDocument(),
    incomes: [salaire],
    reserve: [
      { fromMonth: "2026-10", kind: "open", balanceCents: 600000, months: 12 },
      { fromMonth: "2026-12", kind: "open", balanceCents: 300000, months: 6 },
      { fromMonth: "2027-02", kind: "closed" },
    ],
  };

  it("exporte au format 5", () => {
    const enveloppe = JSON.parse(serializeExport(avecReserve, DATE_EXPORT));
    expect(enveloppe.formatVersion).toBe(5);
    expect(enveloppe.data.version).toBe(5);
  });

  it("restitue les déclarations à l'identique, au centime", () => {
    const importe = parseImport(serializeExport(avecReserve, DATE_EXPORT));
    expect(importe.ok).toBe(true);
    if (importe.ok) expect(importe.document).toEqual(avecReserve);
  });

  it("réimporte un export de format 4, sans réserve", () => {
    const documentV4: Record<string, unknown> = { ...avecReserve, version: 4 };
    delete documentV4.reserve;
    const exportV4 = JSON.stringify({
      application: APPLICATION_MARKER,
      formatVersion: 4,
      exportedAt: DATE_EXPORT.toISOString(),
      data: documentV4,
    });

    const importe = parseImport(exportV4);
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;
    expect(importe.document.version).toBe(DOCUMENT_VERSION);
    expect(importe.document.reserve).toEqual([]);
    expect(importe.document.incomes).toEqual([salaire]);
  });

  it("refuse un export dont une déclaration est malformée, sans rien restituer", () => {
    const abime = JSON.parse(serializeExport(avecReserve, DATE_EXPORT));
    abime.data.reserve[0].balanceCents = 12.5;
    const resultat = parseImport(JSON.stringify(abime));
    expect(resultat.ok).toBe(false);
    if (!resultat.ok) expect(resultat.reason).toBe("corrupted");
  });
});
