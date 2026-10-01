import { describe, expect, it } from "vitest";
import {
  computeDailyAllowance,
  computeMonthlySpending,
  expensesInMonth,
  groupByDay,
  normalizeForSearch,
  searchExpenses,
  spentBeforeDayCents,
  spentOnDayCents,
  totalSpentCentsForMonth,
} from "@/features/budget/expenses";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument, Expense, Income } from "@/features/budget/types";
import { daysInMonth } from "@/lib/date";

function depense(
  id: string,
  amountCents: number,
  date: string,
  label = `Dépense ${id}`,
  category: string | null = null,
): Expense {
  return { id, amountCents, date, label, category };
}

/** Revenu ponctuel servant à fixer le montant disponible d'un mois, sans charge engagée. */
function documentAvec(disponibleCents: number, expenses: Expense[]): BudgetDocument {
  const revenu: Income = {
    id: "revenu",
    label: "Revenu",
    amountCents: disponibleCents,
    kind: "oneOff",
    date: "2026-03-01",
  };
  return {
    ...emptyDocument(),
    incomes: disponibleCents > 0 ? [revenu] : [],
    subscriptions: [],
    expenses,
    envelopes: [],
  };
}

// --- T010 : agrégation -----------------------------------------------------------------

describe("expensesInMonth", () => {
  const liste = [
    depense("a", 1000, "2026-03-05"),
    depense("b", 2000, "2026-03-20"),
    depense("c", 3000, "2026-04-01"),
    depense("d", 4000, "2026-02-28"),
  ];

  it("ne retient que les dépenses du mois", () => {
    expect(expensesInMonth(liste, "2026-03").map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("ordonne de la plus récente à la plus ancienne", () => {
    expect(expensesInMonth(liste, "2026-03")[0].date).toBe("2026-03-20");
  });

  it("renvoie une liste vide pour un mois sans dépense", () => {
    expect(expensesInMonth(liste, "2026-01")).toEqual([]);
  });
});

describe("totalSpentCentsForMonth", () => {
  it("additionne les dépenses du mois", () => {
    const liste = [
      depense("a", 1000, "2026-03-05"),
      depense("b", 2000, "2026-03-20"),
      depense("c", 9999, "2026-04-01"),
    ];
    expect(totalSpentCentsForMonth(liste, "2026-03")).toBe(3000);
  });

  it("renvoie zéro sans dépense", () => {
    expect(totalSpentCentsForMonth([], "2026-03")).toBe(0);
  });

  it("reste exact au centime sur 200 dépenses (CS-003)", () => {
    const liste = Array.from({ length: 200 }, (_, i) => depense(`d${i}`, 3333, "2026-03-10"));
    expect(totalSpentCentsForMonth(liste, "2026-03")).toBe(200 * 3333);
  });
});

describe("spentOnDayCents et spentBeforeDayCents", () => {
  const liste = [
    depense("a", 1000, "2026-03-05"),
    depense("b", 2000, "2026-03-05"),
    depense("c", 4000, "2026-03-10"),
    depense("d", 8000, "2026-02-25"),
  ];

  it("somme les dépenses d’une journée exactement", () => {
    expect(spentOnDayCents(liste, "2026-03-05")).toBe(3000);
    expect(spentOnDayCents(liste, "2026-03-06")).toBe(0);
  });

  it("somme les dépenses antérieures, strictement", () => {
    expect(spentBeforeDayCents(liste, "2026-03-10")).toBe(3000);
    expect(spentBeforeDayCents(liste, "2026-03-05")).toBe(0);
  });

  it("est cantonné au mois : une dépense du mois précédent n’entre jamais dans le calcul", () => {
    // 80,00 € dépensés le 25 février ne doivent pas amputer le budget de mars.
    expect(spentBeforeDayCents(liste, "2026-03-01")).toBe(0);
  });
});

// --- T011 : allocation quotidienne -----------------------------------------------------

describe("computeDailyAllowance — les quatre scénarios du récit 3", () => {
  // Mars 2026 compte 31 jours. Se placer au 22 laisse 10 jours restants (22 → 31).
  const JOUR = "2026-03-22";
  expect(daysInMonth("2026-03") - 22 + 1).toBe(10);

  it("300,00 € sur 10 jours donnent 30,00 € (scénario 1)", () => {
    const a = computeDailyAllowance(documentAvec(30000, []), JOUR);
    expect(a.daysRemaining).toBe(10);
    expect(a.allowanceCents).toBe(3000);
  });

  it("après 10,00 € dépensés, le lendemain donne 32,22 € (scénario 3)", () => {
    const doc = documentAvec(30000, [depense("a", 1000, JOUR)]);
    const lendemain = computeDailyAllowance(doc, "2026-03-23");
    expect(lendemain.daysRemaining).toBe(9);
    expect(lendemain.allowanceCents).toBe(3222);
  });

  it("après 80,00 € dépensés, le lendemain donne 24,44 € (scénario 4)", () => {
    const doc = documentAvec(30000, [depense("a", 8000, JOUR)]);
    expect(computeDailyAllowance(doc, "2026-03-23").allowanceCents).toBe(2444);
  });

  it("le dernier jour du mois, l’allocation vaut la totalité du reste (scénario 8)", () => {
    const doc = documentAvec(30000, [depense("a", 12345, "2026-03-01")]);
    const dernier = computeDailyAllowance(doc, "2026-03-31");
    expect(dernier.daysRemaining).toBe(1);
    expect(dernier.allowanceCents).toBe(30000 - 12345);
  });

  it("affiche le reste de la journée après dépense (scénario 2)", () => {
    const doc = documentAvec(30000, [depense("a", 1000, JOUR)]);
    const a = computeDailyAllowance(doc, JOUR);
    expect(a.spentTodayCents).toBe(1000);
    expect(a.remainingTodayCents).toBe(2000);
  });
});

describe("computeDailyAllowance — report de la veille", () => {
  it("présente un gain quand la veille a sous-dépensé (scénario 5)", () => {
    const doc = documentAvec(30000, [depense("a", 1000, "2026-03-22")]);
    const a = computeDailyAllowance(doc, "2026-03-23");
    // Allocation de la veille 30,00 € − 10,00 € dépensés = 20,00 € de gain.
    expect(a.carryOverCents).toBe(2000);
  });

  it("présente une perte quand la veille a dépassé (scénario 6)", () => {
    const doc = documentAvec(30000, [depense("a", 8000, "2026-03-22")]);
    const a = computeDailyAllowance(doc, "2026-03-23");
    expect(a.carryOverCents).toBe(3000 - 8000);
  });

  it("n’a pas de report le premier jour du mois : null, et non zéro", () => {
    const a = computeDailyAllowance(documentAvec(30000, []), "2026-03-01");
    expect(a.carryOverCents).toBeNull();
  });
});

describe("computeDailyAllowance — bornes", () => {
  it("renvoie une allocation nulle quand le reste est nul (scénario 7, EF-021)", () => {
    const doc = documentAvec(30000, [depense("a", 30000, "2026-03-01")]);
    expect(computeDailyAllowance(doc, "2026-03-22").allowanceCents).toBe(0);
  });

  it("renvoie une allocation nulle quand le reste est négatif", () => {
    const doc = documentAvec(30000, [depense("a", 45000, "2026-03-01")]);
    const a = computeDailyAllowance(doc, "2026-03-22");
    expect(a.allowanceCents).toBe(0);
  });

  it("renvoie une allocation nulle sans budget du tout", () => {
    expect(computeDailyAllowance(documentAvec(0, []), "2026-03-22").allowanceCents).toBe(0);
  });

  it("traite correctement février, bissextile ou non", () => {
    expect(computeDailyAllowance(documentAvec(28000, []), "2026-02-01").daysRemaining).toBe(28);
    expect(computeDailyAllowance(documentAvec(29000, []), "2028-02-01").daysRemaining).toBe(29);
  });
});

// --- T012 : propriétés monétaires ------------------------------------------------------

describe("Propriété CS-004 — la somme des allocations n’excède jamais le reste", () => {
  /**
   * Rejoue un mois en dépensant **exactement l’allocation** chaque jour, et cumule ce qui a
   * été servi. C’est la lecture correcte de CS-004 : l’application ne doit jamais avoir
   * promis, au total, plus d’argent qu’il n’en existait.
   */
  function totalServiSiOnSuitLAllocation(mois: string, disponible: number): number {
    const jours = daysInMonth(mois);
    const expenses: Expense[] = [];
    let total = 0;

    for (let jour = 1; jour <= jours; jour += 1) {
      const date = `${mois}-${String(jour).padStart(2, "0")}`;
      const allocation = computeDailyAllowance(documentAvec(disponible, [...expenses]), date)
        .allowanceCents;
      total += allocation;
      if (allocation > 0) expenses.push(depense(`d${jour}`, allocation, date));
    }
    return total;
  }

  it("tient sur plusieurs longueurs de mois, février bissextile compris", () => {
    for (const mois of ["2026-02", "2028-02", "2026-04", "2026-03"]) {
      expect(totalServiSiOnSuitLAllocation(mois, 30000)).toBeLessThanOrEqual(30000);
    }
  });

  it("tient sur des montants non divisibles par le nombre de jours", () => {
    for (const disponible of [1, 7, 99, 12345, 99999, 1_000_000]) {
      expect(totalServiSiOnSuitLAllocation("2026-03", disponible)).toBeLessThanOrEqual(
        disponible,
      );
    }
  });

  it("sert la quasi-totalité du budget : la troncature ne fait rien perdre au dernier jour", () => {
    // Le dernier jour reçoit tout le reliquat, donc le total servi égale le disponible.
    for (const disponible of [30000, 12345, 99999]) {
      expect(totalServiSiOnSuitLAllocation("2026-03", disponible)).toBe(disponible);
    }
  });

  it("ne sert jamais plus que le reste après une journée de forte dépense", () => {
    const disponible = 30000;
    const expenses = [depense("gros", 25000, "2026-03-02")];
    let restantServi = 0;

    for (let jour = 3; jour <= 31; jour += 1) {
      const date = `2026-03-${String(jour).padStart(2, "0")}`;
      const a = computeDailyAllowance(documentAvec(disponible, [...expenses]), date);
      restantServi += a.allowanceCents;
      if (a.allowanceCents > 0) expenses.push(depense(`d${jour}`, a.allowanceCents, date));
    }
    expect(restantServi).toBeLessThanOrEqual(disponible - 25000);
  });
});

describe("Propriété CS-005 — l’écart se répartit sur les jours restants", () => {
  it("sous-dépenser augmente l’allocation du lendemain de l’écart réparti", () => {
    const disponible = 30000;
    let expenses: Expense[] = [];

    for (let jour = 22; jour <= 26; jour += 1) {
      const date = `2026-03-${jour}`;
      const lendemain = `2026-03-${jour + 1}`;

      const aujourdHui = computeDailyAllowance(documentAvec(disponible, [...expenses]), date);
      const depenseDuJour = 1000;
      const suivantes = [...expenses, depense(`d${jour}`, depenseDuJour, date)];

      const reference = computeDailyAllowance(
        documentAvec(disponible, [...expenses, depense(`r${jour}`, aujourdHui.allowanceCents, date)]),
        lendemain,
      ).allowanceCents;
      const obtenue = computeDailyAllowance(documentAvec(disponible, suivantes), lendemain)
        .allowanceCents;

      const ecart = aujourdHui.allowanceCents - depenseDuJour;
      const joursRestantsDemain = daysInMonth("2026-03") - (jour + 1) + 1;
      // La troncature peut coûter au plus un centime sur la répartition.
      expect(obtenue - reference).toBeGreaterThanOrEqual(
        Math.floor(ecart / joursRestantsDemain) - 1,
      );
      expect(obtenue - reference).toBeLessThanOrEqual(
        Math.floor(ecart / joursRestantsDemain) + 1,
      );

      expenses = suivantes;
    }
  });
});

describe("Propriété CS-006 — aucun reliquat ne franchit la fin du mois", () => {
  it("le premier jour du mois suivant repart du budget de ce mois", () => {
    // Mars : 300,00 € disponibles, rien dépensé. Avril : aucun revenu, donc rien à répartir.
    const doc = documentAvec(30000, []);
    expect(computeDailyAllowance(doc, "2026-03-31").allowanceCents).toBe(30000);
    expect(computeDailyAllowance(doc, "2026-04-01").allowanceCents).toBe(0);
  });
});

// --- T013 : anneau ---------------------------------------------------------------------

describe("computeMonthlySpending", () => {
  const AUJOURD_HUI = "2026-03-15";

  it("est intact sans dépense", () => {
    const s = computeMonthlySpending(documentAvec(90000, []), "2026-03", AUJOURD_HUI);
    expect(s.remainingCents).toBe(90000);
    expect(s.consumedRatio).toBe(0);
    expect(s.status).toBe("untouched");
    expect(s.overspentCents).toBe(0);
  });

  it("est en cours avec un quart consommé", () => {
    const doc = documentAvec(90000, [depense("a", 22500, "2026-03-05")]);
    const s = computeMonthlySpending(doc, "2026-03", AUJOURD_HUI);
    expect(s.remainingCents).toBe(67500);
    expect(s.consumedRatio).toBeCloseTo(0.25, 5);
    expect(s.status).toBe("inProgress");
  });

  it("est épuisé au centime près", () => {
    const doc = documentAvec(90000, [depense("a", 90000, "2026-03-05")]);
    const s = computeMonthlySpending(doc, "2026-03", AUJOURD_HUI);
    expect(s.remainingCents).toBe(0);
    expect(s.consumedRatio).toBe(1);
    expect(s.status).toBe("exhausted");
  });

  it("plafonne l’anneau et expose le dépassement (EF-012)", () => {
    const doc = documentAvec(90000, [depense("a", 102000, "2026-03-05")]);
    const s = computeMonthlySpending(doc, "2026-03", AUJOURD_HUI);
    expect(s.status).toBe("overspent");
    expect(s.consumedRatio).toBe(1); // jamais au-delà du tour complet
    expect(s.overspentCents).toBe(12000);
    expect(s.remainingCents).toBe(-12000); // la vue n’affichera pas cette valeur brute
  });

  it("ne divise jamais par zéro sans budget (EF-014)", () => {
    const s = computeMonthlySpending(documentAvec(0, []), "2026-03", AUJOURD_HUI);
    expect(s.availableCents).toBe(0);
    expect(s.consumedRatio).toBe(0);
    expect(Number.isFinite(s.consumedRatio)).toBe(true);
  });

  it("ignore les dépenses d’un autre mois", () => {
    const doc = documentAvec(90000, [depense("a", 5000, "2026-04-02")]);
    expect(computeMonthlySpending(doc, "2026-03", AUJOURD_HUI).spentCents).toBe(0);
  });

  it("reste exact au centime sur 200 dépenses (CS-003)", () => {
    const liste = Array.from({ length: 200 }, (_, i) => depense(`d${i}`, 137, "2026-03-10"));
    const s = computeMonthlySpending(documentAvec(90000, liste), "2026-03", AUJOURD_HUI);
    expect(s.spentCents).toBe(200 * 137);
    expect(s.remainingCents).toBe(90000 - 200 * 137);
  });
});

// --- T014 : journal --------------------------------------------------------------------

describe("groupByDay", () => {
  it("regroupe par journée avec un sous-total exact", () => {
    const liste = [
      depense("a", 1000, "2026-03-05"),
      depense("b", 2500, "2026-03-05"),
      depense("c", 4000, "2026-03-03"),
    ];
    const jours = groupByDay(liste);
    expect(jours).toHaveLength(2);
    expect(jours[0].date).toBe("2026-03-05");
    expect(jours[0].subtotalCents).toBe(3500);
    expect(jours[1].subtotalCents).toBe(4000);
  });

  it("ordonne les journées de la plus récente à la plus ancienne", () => {
    const liste = [
      depense("a", 100, "2026-01-10"),
      depense("b", 100, "2026-03-10"),
      depense("c", 100, "2026-02-10"),
    ];
    expect(groupByDay(liste).map((j) => j.date)).toEqual([
      "2026-03-10",
      "2026-02-10",
      "2026-01-10",
    ]);
  });

  it("renvoie une liste vide sans dépense", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("normalizeForSearch et searchExpenses", () => {
  const liste = [
    depense("a", 1000, "2026-03-05", "Café du coin", "Sorties"),
    depense("b", 2000, "2026-03-06", "Boulangerie", "Courses"),
    depense("c", 3000, "2026-03-07", "Électricité", null),
  ];

  it("retire les accents et abaisse la casse", () => {
    expect(normalizeForSearch("Café")).toBe("cafe");
    expect(normalizeForSearch("ÉLECTRICITÉ")).toBe("electricite");
    expect(normalizeForSearch("  Où  ")).toBe("ou");
  });

  it("trouve « Café » en tapant « cafe » (EF-026)", () => {
    expect(searchExpenses(liste, "cafe").map((e) => e.id)).toEqual(["a"]);
  });

  it("cherche aussi dans la catégorie", () => {
    expect(searchExpenses(liste, "courses").map((e) => e.id)).toEqual(["b"]);
  });

  it("ignore la casse", () => {
    expect(searchExpenses(liste, "BOULANGERIE").map((e) => e.id)).toEqual(["b"]);
  });

  it("renvoie la liste inchangée sur une requête vide", () => {
    expect(searchExpenses(liste, "")).toEqual(liste);
    expect(searchExpenses(liste, "   ")).toEqual(liste);
  });

  it("renvoie une liste vide sans correspondance", () => {
    expect(searchExpenses(liste, "introuvable")).toEqual([]);
  });

  it("tolère une dépense sans libellé", () => {
    const sansLibelle: Expense = { id: "x", amountCents: 100, date: "2026-03-01", category: null };
    expect(() => searchExpenses([sansLibelle], "quelque chose")).not.toThrow();
  });
});
