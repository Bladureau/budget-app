import { afterEach, describe, expect, it } from "vitest";
import { STORAGE_KEY, loadDocument, parseDocument } from "@/lib/storage";
import { parseImport } from "@/features/budget/transfer";
import { APPLICATION_MARKER, FORMAT_VERSION } from "@/features/budget/transfer";

/**
 * Tests de sûreté des deux **entrées non fiables** de l'application.
 *
 * Elles sont exactement deux :
 *
 * 1. le fichier d'import, choisi par l'utilisateur mais pouvant provenir de n'importe où ;
 * 2. le contenu du `localStorage`, qu'une extension de navigateur ou un script tiers peut
 *    avoir réécrit à l'insu de l'application.
 *
 * Les deux traversent `parseDocument`, qui ne lit jamais l'objet reçu directement : il
 * **reconstruit** un document neuf champ par champ. Ces tests vérifient que cette propriété
 * tient face à des charges hostiles, et non seulement face à des documents mal formés.
 *
 * Ils ne remplacent pas les tests de validation existants : ceux-ci prouvent qu'un document
 * invalide est refusé, ceux-là qu'un document malveillant ne peut rien corrompre au passage.
 */

/** Document minimal valide, servant de porteur aux charges hostiles. */
function documentValide() {
  return {
    version: 3,
    incomes: [
      {
        id: "revenu",
        label: "Salaire",
        amountCents: 200000,
        kind: "oneOff",
        date: "2026-09-01",
      },
    ],
    subscriptions: [],
    expenses: [],
    envelopes: [],
  };
}

function fichierExport(data: unknown): string {
  return JSON.stringify({
    application: APPLICATION_MARKER,
    formatVersion: FORMAT_VERSION,
    exportedAt: "2026-09-07T09:00:00.000Z",
    data,
  });
}

afterEach(() => {
  localStorage.clear();
  // Nettoyage de précaution : si un test venait à polluer réellement le prototype, les
  // suivants hériteraient de la pollution et masqueraient l'échec.
  delete (Object.prototype as Record<string, unknown>).pollue;
  delete (Object.prototype as Record<string, unknown>).isAdmin;
});

describe("Pollution de prototype par le fichier d'import", () => {
  it("ne propage pas un `__proto__` place a la racine du document", () => {
    const charge = JSON.parse(
      `{"__proto__": {"pollue": "oui"}, "version": 3, "incomes": [], "subscriptions": [], "expenses": [], "envelopes": []}`,
    );

    const resultat = parseImport(fichierExport(charge));
    expect(resultat.ok).toBe(true);

    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("pollue");
  });

  it("ne propage pas un `__proto__` place dans une entite", () => {
    const charge = JSON.parse(
      `{"version": 3, "incomes": [{"__proto__": {"isAdmin": true}, "id": "r", "label": "S", "amountCents": 100, "kind": "oneOff", "date": "2026-09-01"}], "subscriptions": [], "expenses": [], "envelopes": []}`,
    );

    parseImport(fichierExport(charge));

    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect(Object.prototype).not.toHaveProperty("isAdmin");
  });

  it("ne propage pas un `__proto__` a travers la migration v1 vers v3", () => {
    // La migration recopie le document par diffusion (`{...brut}`) : c'est le seul endroit
    // ou une cle attaquante voyage avec le document, il merite donc son propre test.
    const charge = JSON.parse(
      `{"__proto__": {"pollue": "migration"}, "version": 1, "incomes": [], "subscriptions": []}`,
    );

    const resultat = parseImport(fichierExport(charge));
    expect(resultat.ok).toBe(true);

    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
  });

  it("n'expose aucun champ etranger dans le document reconstruit", () => {
    const charge = {
      ...documentValide(),
      champEtranger: "ne doit pas survivre",
      constructor: "ecrase",
    };

    const resultat = parseImport(fichierExport(charge));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    // Le document reconstruit ne porte QUE les sept champs du modele.
    expect(Object.keys(resultat.document).sort()).toEqual([
      "banking",
      "envelopes",
      "expenses",
      "incomes",
      "refunds",
      "subscriptions",
      "version",
    ]);
    expect(resultat.document).not.toHaveProperty("champEtranger");
  });

  it("n'expose aucun champ etranger dans une entite reconstruite", () => {
    const charge = documentValide();
    const revenu = charge.incomes[0] as Record<string, unknown>;
    revenu.champEtranger = "ne doit pas survivre";

    const resultat = parseImport(fichierExport(charge));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;

    expect(resultat.document.incomes[0]).not.toHaveProperty("champEtranger");
  });
});

describe("Pollution de prototype par le stockage local", () => {
  it("ne propage pas un `__proto__` ecrit directement dans le localStorage", () => {
    localStorage.setItem(
      STORAGE_KEY,
      `{"__proto__": {"pollue": "stockage"}, "version": 3, "incomes": [], "subscriptions": [], "expenses": [], "envelopes": []}`,
    );

    loadDocument();

    expect(({} as Record<string, unknown>).pollue).toBeUndefined();
  });

  it("met en quarantaine un contenu illisible sans jamais l'ecraser", () => {
    localStorage.setItem(STORAGE_KEY, "{ceci n'est pas du JSON");

    const resultat = loadDocument();
    expect(resultat.quarantined).toBe(true);

    // L'original doit subsister quelque part : le perdre serait pire que l'anomalie.
    const cles = Object.keys(localStorage).filter((c) => c.startsWith("budget-app:corrupted"));
    expect(cles.length).toBeGreaterThan(0);
    expect(localStorage.getItem(cles[0])).toBe("{ceci n'est pas du JSON");
  });
});

describe("Robustesse face a des entrees hostiles", () => {
  it("refuse sans lever d'exception des valeurs structurellement absurdes", () => {
    const hostiles: unknown[] = [
      null,
      [],
      "chaine",
      42,
      { version: "3" },
      { version: 3, incomes: "pas un tableau" },
      { version: 3, incomes: [null], subscriptions: [], expenses: [], envelopes: [] },
      { version: Number.NaN },
      { version: Number.POSITIVE_INFINITY },
      { version: -1 },
      { version: 3.5 },
    ];

    for (const hostile of hostiles) {
      expect(() => parseDocument(hostile)).not.toThrow();
      expect(parseDocument(hostile).ok).toBe(false);
    }
  });

  it("ne s'etouffe pas sur une chaine JSON tres profondement imbriquee", () => {
    // Une imbrication extreme fait echouer `JSON.parse` avant tout traitement : la garde
    // doit convertir cela en refus, pas en exception remontant jusqu'a l'interface.
    const profond = "[".repeat(50_000) + "]".repeat(50_000);
    expect(() => parseImport(profond)).not.toThrow();
    expect(parseImport(profond).ok).toBe(false);
  });

  it("refuse une chaine vide et du texte arbitraire", () => {
    for (const entree of ["", "   ", "undefined", "<script>alert(1)</script>"]) {
      expect(() => parseImport(entree)).not.toThrow();
      expect(parseImport(entree).ok).toBe(false);
    }
  });
});
