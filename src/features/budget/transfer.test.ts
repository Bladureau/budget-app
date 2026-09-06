import { describe, expect, it } from "vitest";
import {
  APPLICATION_MARKER,
  FORMAT_VERSION,
  buildExportFilename,
  parseImport,
  serializeExport,
} from "@/features/budget/transfer";
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
  version: 2,
  incomes: [salaire, prime],
  subscriptions: [assurance],
  expenses: [],
};

const documentVide: BudgetDocument = { version: 2, incomes: [], subscriptions: [], expenses: [] };

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
    const volumineux: BudgetDocument = { version: 2, incomes, subscriptions, expenses: [] };

    const importe = parseImport(serializeExport(volumineux, DATE_EXPORT));
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;

    expect(importe.document.incomes).toHaveLength(120);
    expect(importe.document.subscriptions).toHaveLength(100);
    expect(importe.document).toEqual(volumineux);
  });

  it("conserve les montants exacts au centime, montant maximal inclus (CS-004)", () => {
    const extremes: BudgetDocument = {
      version: 2,
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
      version: 2,
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
    };

    const importe = parseImport(serializeExport(accentue, DATE_EXPORT));
    expect(importe.ok).toBe(true);
    if (!importe.ok) return;

    expect(importe.document.incomes[0].label).toBe("Prime d’été — café & thé 🎉");
    expect(importe.document.subscriptions[0].label).toBe("Électricité ⚡ (à régler)");
  });
});

// --- T018 : EF-024 de la fonctionnalité 004, activée par le passage en version 2 --------

describe("parseImport — fichier d’une version antérieure (EF-024)", () => {
  /**
   * Jusqu'au passage du document en version 2, EF-024 était sans objet : il n'existait
   * aucune version antérieure. Elle devient vérifiable ici.
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

  it("accepte un export de format 1 et migre son contenu en version 2", () => {
    const resultat = parseImport(fichierFormat1);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.document.version).toBe(2);
    expect(resultat.document.expenses).toEqual([]);
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
    expect(enveloppe.formatVersion).toBe(2);
    expect(enveloppe.data.version).toBe(2);
  });
});
