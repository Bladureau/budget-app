import { describe, expect, it } from "vitest";
import {
  computeMonthlyEnvelopes,
  consumedRatio,
  copyEnvelopesToMonth,
  envelopeState,
  envelopesForMonth,
  findEnvelope,
} from "@/features/budget/envelopes";
import type { BudgetDocument, Envelope, Expense } from "@/features/budget/types";

function enveloppe(id: string, category: string, month: string, limitCents: number): Envelope {
  return { id, category, month, limitCents };
}

function depense(
  id: string,
  amountCents: number,
  date: string,
  category: string | null = null,
): Expense {
  return { id, amountCents, date, label: `Dépense ${id}`, category };
}

function documentAvec(envelopes: Envelope[], expenses: Expense[]): BudgetDocument {
  return { version: 3, incomes: [], subscriptions: [], expenses, envelopes };
}

// --- T012 : états et seuil ---------------------------------------------------------------

describe("envelopeState — les quatre états et le seuil de 85 %", () => {
  const PLAFOND = 40000; // 400,00 €

  it("est non entamée sans dépense", () => {
    expect(envelopeState(0, PLAFOND)).toBe("unused");
  });

  it("est maîtrisée en deçà du seuil", () => {
    expect(envelopeState(1, PLAFOND)).toBe("onTrack");
    expect(envelopeState(20000, PLAFOND)).toBe("onTrack");
  });

  it("bascule exactement à 85 % du plafond, et pas avant", () => {
    // 340,00 € = 85 % de 400,00 €.
    expect(envelopeState(33999, PLAFOND)).toBe("onTrack");
    expect(envelopeState(34000, PLAFOND)).toBe("nearingLimit");
  });

  it("reste « proche du plafond » jusqu'au plafond inclus", () => {
    expect(envelopeState(39999, PLAFOND)).toBe("nearingLimit");
    expect(envelopeState(40000, PLAFOND)).toBe("nearingLimit");
  });

  it("passe en dépassement dès le premier centime au-delà", () => {
    expect(envelopeState(40001, PLAFOND)).toBe("overBudget");
    expect(envelopeState(42000, PLAFOND)).toBe("overBudget");
  });

  it("traite le plafond nul comme une intention « ne rien dépenser ici »", () => {
    expect(envelopeState(0, 0)).toBe("unused");
    expect(envelopeState(1, 0)).toBe("overBudget");
  });

  it("évalue le seuil sur des plafonds non divisibles sans dériver", () => {
    // 85 % de 333 = 283,05 → le seuil est franchi à 284, pas à 283.
    expect(envelopeState(283, 333)).toBe("onTrack");
    expect(envelopeState(284, 333)).toBe("nearingLimit");
  });
});

// --- T013 : taux de consommation ---------------------------------------------------------

describe("consumedRatio", () => {
  it("est proportionnel en deçà du plafond", () => {
    expect(consumedRatio(20000, 40000)).toBeCloseTo(0.5, 5);
    expect(consumedRatio(10000, 40000)).toBeCloseTo(0.25, 5);
  });

  it("vaut zéro sans dépense", () => {
    expect(consumedRatio(0, 40000)).toBe(0);
  });

  it("est plafonné à 1 en dépassement", () => {
    expect(consumedRatio(100000, 40000)).toBe(1);
  });

  it("gère le plafond nul sans jamais diviser", () => {
    expect(consumedRatio(0, 0)).toBe(0);
    expect(consumedRatio(1, 0)).toBe(1);
  });

  it("n'est jamais NaN ni Infinity", () => {
    for (const [depense, plafond] of [
      [0, 0],
      [1, 0],
      [0, 40000],
      [999999, 1],
    ]) {
      const r = consumedRatio(depense, plafond);
      expect(Number.isFinite(r)).toBe(true);
      expect(Number.isNaN(r)).toBe(false);
    }
  });
});

// --- Sélection ----------------------------------------------------------------------------

describe("envelopesForMonth et findEnvelope", () => {
  const liste = [
    enveloppe("a", "Transport", "2026-03", 10000),
    enveloppe("b", "Courses", "2026-03", 40000),
    enveloppe("c", "Courses", "2026-04", 50000),
  ];

  it("ne retient que les enveloppes du mois, triées par catégorie", () => {
    expect(envelopesForMonth(liste, "2026-03").map((e) => e.category)).toEqual([
      "Courses",
      "Transport",
    ]);
  });

  it("trouve l'enveloppe d'un couple catégorie / mois", () => {
    expect(findEnvelope(liste, "Courses", "2026-03")?.id).toBe("b");
    expect(findEnvelope(liste, "Courses", "2026-04")?.id).toBe("c");
  });

  it("renvoie null pour un couple inexistant", () => {
    expect(findEnvelope(liste, "Loisirs", "2026-03")).toBeNull();
    expect(findEnvelope(liste, "Courses", "2026-05")).toBeNull();
  });

  it("compare la catégorie de façon sensible à la casse et aux accents", () => {
    // Conséquence assumée de la décision D3 : la comparaison est celle du texte, à
    // l'identique de ce qui est fait ailleurs dans l'application.
    expect(findEnvelope(liste, "courses", "2026-03")).toBeNull();
  });
});

// --- T014 : calcul du mois ----------------------------------------------------------------

describe("computeMonthlyEnvelopes", () => {
  it("somme les dépenses de la catégorie dans le mois", () => {
    const doc = documentAvec(
      [enveloppe("e1", "Courses", "2026-03", 40000)],
      [
        depense("d1", 12050, "2026-03-05", "Courses"),
        depense("d2", 7950, "2026-03-20", "Courses"),
      ],
    );
    const mois = computeMonthlyEnvelopes(doc, "2026-03");

    expect(mois.envelopes[0].spentCents).toBe(20000);
    expect(mois.envelopes[0].remainingCents).toBe(20000);
    expect(mois.envelopes[0].overspentCents).toBe(0);
  });

  it("ignore une dépense datée d'un autre mois", () => {
    const doc = documentAvec(
      [enveloppe("e1", "Courses", "2026-03", 40000)],
      [depense("d1", 5000, "2026-04-01", "Courses")],
    );
    expect(computeMonthlyEnvelopes(doc, "2026-03").envelopes[0].spentCents).toBe(0);
  });

  it("conserve une enveloppe sans dépense, avec un dépensé nul", () => {
    const doc = documentAvec([enveloppe("e1", "Loisirs", "2026-03", 15000)], []);
    const mois = computeMonthlyEnvelopes(doc, "2026-03");

    expect(mois.envelopes).toHaveLength(1);
    expect(mois.envelopes[0].spentCents).toBe(0);
    expect(mois.envelopes[0].state).toBe("unused");
  });

  it("expose le dépassement sans jamais exiger d'afficher un reste négatif", () => {
    const doc = documentAvec(
      [enveloppe("e1", "Courses", "2026-03", 40000)],
      [depense("d1", 42000, "2026-03-05", "Courses")],
    );
    const statut = computeMonthlyEnvelopes(doc, "2026-03").envelopes[0];

    expect(statut.state).toBe("overBudget");
    expect(statut.overspentCents).toBe(2000);
    expect(statut.consumedRatio).toBe(1);
  });

  it("calcule les totaux de la synthèse", () => {
    const doc = documentAvec(
      [
        enveloppe("e1", "Courses", "2026-03", 40000),
        enveloppe("e2", "Transport", "2026-03", 10000),
      ],
      [
        depense("d1", 20000, "2026-03-05", "Courses"),
        depense("d2", 3000, "2026-03-06", "Transport"),
      ],
    );
    const mois = computeMonthlyEnvelopes(doc, "2026-03");

    expect(mois.totalPlannedCents).toBe(50000);
    expect(mois.totalSpentBudgetedCents).toBe(23000);
    expect(mois.totalRemainingCents).toBe(27000);
  });

  it("compte et totalise les dépassements (EF-018)", () => {
    const doc = documentAvec(
      [
        enveloppe("e1", "Courses", "2026-03", 40000),
        enveloppe("e2", "Transport", "2026-03", 10000),
        enveloppe("e3", "Loisirs", "2026-03", 5000),
      ],
      [
        depense("d1", 42000, "2026-03-05", "Courses"), // +20,00 €
        depense("d2", 13000, "2026-03-06", "Transport"), // +30,00 €
        depense("d3", 1000, "2026-03-07", "Loisirs"), // dans les clous
      ],
    );
    const mois = computeMonthlyEnvelopes(doc, "2026-03");

    expect(mois.overBudgetCount).toBe(2);
    expect(mois.overBudgetTotalCents).toBe(2000 + 3000);
  });

  it("trie par dépensé décroissant puis par catégorie, de façon déterministe", () => {
    const doc = documentAvec(
      [
        enveloppe("e1", "Bravo", "2026-03", 40000),
        enveloppe("e2", "Zoulou", "2026-03", 40000),
        enveloppe("e3", "Alpha", "2026-03", 40000),
      ],
      [
        depense("d1", 5000, "2026-03-05", "Bravo"),
        depense("d2", 5000, "2026-03-06", "Alpha"),
        depense("d3", 9000, "2026-03-07", "Zoulou"),
      ],
    );
    expect(computeMonthlyEnvelopes(doc, "2026-03").envelopes.map((e) => e.category)).toEqual([
      "Zoulou",
      "Alpha",
      "Bravo",
    ]);
  });

  it("reste exact au centime sur 200 dépenses (CS-003)", () => {
    const depenses = Array.from({ length: 200 }, (_, i) =>
      depense(`d${i}`, 137, "2026-03-10", "Courses"),
    );
    const doc = documentAvec([enveloppe("e1", "Courses", "2026-03", 100000)], depenses);
    const statut = computeMonthlyEnvelopes(doc, "2026-03").envelopes[0];

    expect(statut.spentCents).toBe(200 * 137);
    expect(statut.remainingCents).toBe(100000 - 200 * 137);
  });

  it("renvoie une synthèse exploitable pour un mois sans enveloppe", () => {
    const mois = computeMonthlyEnvelopes(documentAvec([], []), "2026-03");
    expect(mois.envelopes).toEqual([]);
    expect(mois.totalPlannedCents).toBe(0);
    expect(mois.overBudgetCount).toBe(0);
    expect(mois.unbudgeted.totalCents).toBe(0);
  });
});

// --- T015 : regroupement non budgété ------------------------------------------------------

describe("Regroupement « Non budgété » (EF-012)", () => {
  it("absorbe une catégorie sans plafond", () => {
    const doc = documentAvec(
      [enveloppe("e1", "Courses", "2026-03", 40000)],
      [depense("d1", 5000, "2026-03-05", "Loisirs")],
    );
    const mois = computeMonthlyEnvelopes(doc, "2026-03");

    expect(mois.unbudgeted.totalCents).toBe(5000);
    expect(mois.unbudgeted.byCategory).toEqual([{ category: "Loisirs", totalCents: 5000 }]);
  });

  it("absorbe aussi les dépenses sans catégorie", () => {
    const doc = documentAvec(
      [enveloppe("e1", "Courses", "2026-03", 40000)],
      [depense("d1", 3000, "2026-03-05", null)],
    );
    const mois = computeMonthlyEnvelopes(doc, "2026-03");

    expect(mois.unbudgeted.totalCents).toBe(3000);
    expect(mois.unbudgeted.byCategory).toEqual([{ category: null, totalCents: 3000 }]);
  });

  it("distingue les dépenses sans catégorie des catégories nommées", () => {
    const doc = documentAvec(
      [],
      [
        depense("d1", 3000, "2026-03-05", null),
        depense("d2", 5000, "2026-03-06", "Loisirs"),
        depense("d3", 1000, "2026-03-07", null),
      ],
    );
    const mois = computeMonthlyEnvelopes(doc, "2026-03");

    expect(mois.unbudgeted.totalCents).toBe(9000);
    expect(mois.unbudgeted.byCategory).toEqual([
      { category: "Loisirs", totalCents: 5000 },
      { category: null, totalCents: 4000 },
    ]);
  });

  it("exclut le non budgété des totaux budgétés", () => {
    const doc = documentAvec(
      [enveloppe("e1", "Courses", "2026-03", 40000)],
      [
        depense("d1", 20000, "2026-03-05", "Courses"),
        depense("d2", 5000, "2026-03-06", "Loisirs"),
      ],
    );
    const mois = computeMonthlyEnvelopes(doc, "2026-03");

    expect(mois.totalSpentBudgetedCents).toBe(20000);
    expect(mois.unbudgeted.totalCents).toBe(5000);
  });

  it("bascule une dépense en non budgété quand sa catégorie est renommée (décision D3)", () => {
    const avant = documentAvec(
      [enveloppe("e1", "Courses", "2026-03", 40000)],
      [depense("d1", 5000, "2026-03-05", "Courses")],
    );
    const apres = documentAvec(
      [enveloppe("e1", "Courses", "2026-03", 40000)],
      [depense("d1", 5000, "2026-03-05", "Courses alimentaires")],
    );

    expect(computeMonthlyEnvelopes(avant, "2026-03").envelopes[0].spentCents).toBe(5000);
    expect(computeMonthlyEnvelopes(apres, "2026-03").envelopes[0].spentCents).toBe(0);
    expect(computeMonthlyEnvelopes(apres, "2026-03").unbudgeted.totalCents).toBe(5000);
  });
});

// --- T016 : isolation des mois ------------------------------------------------------------

describe("Isolation des mois (EF-022, CS-007)", () => {
  const doc = documentAvec(
    [
      enveloppe("e1", "Courses", "2026-03", 40000),
      enveloppe("e2", "Courses", "2026-04", 50000),
    ],
    [
      depense("d1", 20000, "2026-03-05", "Courses"),
      depense("d2", 10000, "2026-04-05", "Courses"),
    ],
  );

  it("n'expose que les plafonds du mois consulté (EF-003)", () => {
    expect(computeMonthlyEnvelopes(doc, "2026-03").envelopes[0].limitCents).toBe(40000);
    expect(computeMonthlyEnvelopes(doc, "2026-04").envelopes[0].limitCents).toBe(50000);
    expect(computeMonthlyEnvelopes(doc, "2026-05").envelopes).toEqual([]);
  });

  it("n'expose que les dépenses du mois consulté", () => {
    expect(computeMonthlyEnvelopes(doc, "2026-03").envelopes[0].spentCents).toBe(20000);
    expect(computeMonthlyEnvelopes(doc, "2026-04").envelopes[0].spentCents).toBe(10000);
  });

  it("laisse les mois antérieurs inchangés quand un plafond ultérieur est modifié", () => {
    const reference = computeMonthlyEnvelopes(doc, "2026-03");

    const modifie = documentAvec(
      [
        enveloppe("e1", "Courses", "2026-03", 40000),
        enveloppe("e2", "Courses", "2026-04", 99999),
      ],
      doc.expenses,
    );

    expect(computeMonthlyEnvelopes(modifie, "2026-03")).toEqual(reference);
  });

  it("garde trois mois consécutifs indépendants", () => {
    const troisMois = documentAvec(
      [
        enveloppe("a", "Courses", "2026-01", 10000),
        enveloppe("b", "Courses", "2026-02", 20000),
        enveloppe("c", "Courses", "2026-03", 30000),
      ],
      [depense("d", 5000, "2026-02-10", "Courses")],
    );

    expect(computeMonthlyEnvelopes(troisMois, "2026-01").envelopes[0].spentCents).toBe(0);
    expect(computeMonthlyEnvelopes(troisMois, "2026-02").envelopes[0].spentCents).toBe(5000);
    expect(computeMonthlyEnvelopes(troisMois, "2026-03").envelopes[0].spentCents).toBe(0);
  });
});

// --- T017 : report des plafonds -----------------------------------------------------------

describe("copyEnvelopesToMonth", () => {
  const source = [
    enveloppe("a", "Courses", "2026-03", 40000),
    enveloppe("b", "Transport", "2026-03", 10000),
    enveloppe("c", "Courses", "2026-04", 99999),
  ];

  it("duplique les plafonds du mois source vers le mois cible", () => {
    const copies = copyEnvelopesToMonth(source, "2026-03", "2026-05");

    expect(copies).toHaveLength(2);
    expect(copies.map((e) => e.category).sort()).toEqual(["Courses", "Transport"]);
    expect(copies.every((e) => e.month === "2026-05")).toBe(true);
    expect(copies.find((e) => e.category === "Courses")?.limitCents).toBe(40000);
  });

  it("attribue de nouveaux identifiants", () => {
    const copies = copyEnvelopesToMonth(source, "2026-03", "2026-05");
    const identifiantsSource = source.map((e) => e.id);
    expect(copies.every((e) => !identifiantsSource.includes(e.id))).toBe(true);
  });

  it("renvoie une liste vide quand le mois source est vide", () => {
    expect(copyEnvelopesToMonth(source, "2026-12", "2027-01")).toEqual([]);
    expect(copyEnvelopesToMonth([], "2026-03", "2026-04")).toEqual([]);
  });

  it("produit des copies indépendantes de leurs originaux", () => {
    const copies = copyEnvelopesToMonth(source, "2026-03", "2026-05");
    copies[0].limitCents = 1;
    // L'original n'a pas bougé : la copie n'est pas une référence partagée.
    expect(source.find((e) => e.id === "a")?.limitCents).toBe(40000);
  });
});
