import { describe, expect, it } from "vitest";
import {
  amountAt,
  averageMonthlyCostCents,
  duesInMonth,
  computeMonthlyBudget,
  forecast,
  isActiveSubscription,
  listUpcomingDues,
  occurrencesInMonth,
  totalChargesCentsForMonth,
  totalIncomeCentsForMonth,
  withAmountChange,
  withPause,
  withTermination,
} from "@/features/budget/calculs";
import type {
  BudgetDocument,
  Income,
  RecurringIncome,
  Subscription,
} from "@/features/budget/types";

const salaire: RecurringIncome = {
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

describe("occurrencesInMonth — revenu ponctuel", () => {
  it("est compté dans son seul mois", () => {
    expect(occurrencesInMonth(prime, "2026-03")).toEqual(["2026-03-15"]);
    expect(occurrencesInMonth(prime, "2026-02")).toEqual([]);
    expect(occurrencesInMonth(prime, "2026-04")).toEqual([]);
  });
});

describe("occurrencesInMonth — revenu récurrent", () => {
  it("est présent à chaque mois à partir de sa date de début", () => {
    expect(occurrencesInMonth(salaire, "2026-01")).toEqual(["2026-01-05"]);
    expect(occurrencesInMonth(salaire, "2026-02")).toEqual(["2026-02-05"]);
    expect(occurrencesInMonth(salaire, "2027-06")).toEqual(["2027-06-05"]);
  });

  it("n’est pas compté avant sa date de début", () => {
    expect(occurrencesInMonth(salaire, "2025-12")).toEqual([]);
  });

  it("est borné par sa date de fin, incluse", () => {
    const borne: RecurringIncome = { ...salaire, endDate: "2026-03-05" };
    expect(occurrencesInMonth(borne, "2026-03")).toEqual(["2026-03-05"]);
    expect(occurrencesInMonth(borne, "2026-04")).toEqual([]);
  });

  it("cesse d’être compté si la date de fin tombe avant l’échéance du mois", () => {
    const borne: RecurringIncome = { ...salaire, endDate: "2026-03-01" };
    expect(occurrencesInMonth(borne, "2026-02")).toEqual(["2026-02-05"]);
    expect(occurrencesInMonth(borne, "2026-03")).toEqual([]);
  });

  it("respecte la périodicité trimestrielle", () => {
    const trimestriel: RecurringIncome = { ...salaire, periodicity: "quarterly" };
    expect(occurrencesInMonth(trimestriel, "2026-01")).toEqual(["2026-01-05"]);
    expect(occurrencesInMonth(trimestriel, "2026-02")).toEqual([]);
    expect(occurrencesInMonth(trimestriel, "2026-04")).toEqual(["2026-04-05"]);
    expect(occurrencesInMonth(trimestriel, "2026-07")).toEqual(["2026-07-05"]);
  });

  it("rabat sur le dernier jour du mois quand le quantième n’existe pas", () => {
    const finDeMois: RecurringIncome = { ...salaire, startDate: "2026-01-31" };
    expect(occurrencesInMonth(finDeMois, "2026-02")).toEqual(["2026-02-28"]);
    expect(occurrencesInMonth(finDeMois, "2026-03")).toEqual(["2026-03-31"]);
  });
});

describe("totalIncomeCentsForMonth", () => {
  it("additionne revenus récurrents et ponctuels du mois", () => {
    expect(totalIncomeCentsForMonth([salaire, prime], "2026-03")).toBe(290000);
    expect(totalIncomeCentsForMonth([salaire, prime], "2026-04")).toBe(240000);
  });

  it("renvoie zéro sans revenu", () => {
    expect(totalIncomeCentsForMonth([], "2026-03")).toBe(0);
  });

  it("reste exact au centime sur au moins 50 revenus (CS-002)", () => {
    // 50 revenus de 33,33 € valent exactement 1 666,50 €. En virgule flottante décimale,
    // 50 × 33,33 donne 1666,4999999999998 ; en centimes entiers le total est exact.
    const revenus: Income[] = Array.from({ length: 50 }, (_, index) => ({
      id: `r${index}`,
      label: `Revenu ${index}`,
      amountCents: 3333,
      kind: "oneOff" as const,
      date: "2026-03-10",
    }));
    expect(totalIncomeCentsForMonth(revenus, "2026-03")).toBe(166650);
  });
});

// --- Récit 2 : abonnements -----------------------------------------------------------

const assurance: Subscription = {
  id: "assurance",
  label: "Assurance habitation",
  periodicity: "annual",
  startDate: "2026-09-10",
  endDate: null,
  amounts: [{ amountCents: 12000, effectiveFrom: "2026-09-10" }],
  pauses: [],
};

const streaming: Subscription = {
  id: "streaming",
  label: "Streaming",
  periodicity: "monthly",
  startDate: "2026-01-05",
  endDate: null,
  amounts: [{ amountCents: 1399, effectiveFrom: "2026-01-05" }],
  pauses: [],
};

describe("duesInMonth", () => {
  it("impute un abonnement annuel au seul mois de son échéance (scénario 2 du récit 2)", () => {
    expect(duesInMonth(assurance, "2026-09")).toEqual([
      { dueDate: "2026-09-10", amountCents: 12000 },
    ]);
    for (const mois of [
      "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
      "2027-04", "2027-05", "2027-06", "2027-07", "2027-08",
    ]) {
      expect(duesInMonth(assurance, mois)).toEqual([]);
    }
    expect(duesInMonth(assurance, "2027-09")).toEqual([
      { dueDate: "2027-09-10", amountCents: 12000 },
    ]);
  });

  it("impute un abonnement mensuel à chaque mois", () => {
    expect(duesInMonth(streaming, "2026-01")).toEqual([
      { dueDate: "2026-01-05", amountCents: 1399 },
    ]);
    expect(duesInMonth(streaming, "2026-02")).toEqual([
      { dueDate: "2026-02-05", amountCents: 1399 },
    ]);
  });

  it("n’est pas compté avant la date de début", () => {
    expect(duesInMonth(assurance, "2026-08")).toEqual([]);
    expect(duesInMonth(streaming, "2025-12")).toEqual([]);
  });

  it("n’est plus compté après la date de résiliation", () => {
    const resilie: Subscription = { ...streaming, endDate: "2026-03-31" };
    expect(duesInMonth(resilie, "2026-03")).toEqual([
      { dueDate: "2026-03-05", amountCents: 1399 },
    ]);
    expect(duesInMonth(resilie, "2026-04")).toEqual([]);
  });

  it("rabat l’échéance au dernier jour du mois quand le quantième n’existe pas (EF-013)", () => {
    const finDeMois: Subscription = {
      ...streaming,
      startDate: "2026-01-31",
      amounts: [{ amountCents: 1000, effectiveFrom: "2026-01-31" }],
    };
    expect(duesInMonth(finDeMois, "2026-02")).toEqual([
      { dueDate: "2026-02-28", amountCents: 1000 },
    ]);
    expect(duesInMonth(finDeMois, "2026-03")).toEqual([
      { dueDate: "2026-03-31", amountCents: 1000 },
    ]);
  });

  it("ignore une échéance tombant dans une période de suspension (EF-011)", () => {
    const suspendu: Subscription = {
      ...streaming,
      pauses: [{ from: "2026-02-01", to: "2026-03-31" }],
    };
    expect(duesInMonth(suspendu, "2026-01")).toHaveLength(1);
    expect(duesInMonth(suspendu, "2026-02")).toEqual([]);
    expect(duesInMonth(suspendu, "2026-03")).toEqual([]);
    expect(duesInMonth(suspendu, "2026-04")).toHaveLength(1);
  });

  it("gère une suspension sans terme", () => {
    const suspendu: Subscription = {
      ...streaming,
      pauses: [{ from: "2026-02-01", to: null }],
    };
    expect(duesInMonth(suspendu, "2026-02")).toEqual([]);
    expect(duesInMonth(suspendu, "2030-01")).toEqual([]);
  });
});

describe("amountAt", () => {
  const evolutif: Subscription = {
    ...streaming,
    amounts: [
      { amountCents: 999, effectiveFrom: "2026-01-05" },
      { amountCents: 1299, effectiveFrom: "2026-06-01" },
    ],
  };

  it("applique le montant de la dernière période effective (EF-010)", () => {
    expect(amountAt(evolutif, "2026-05-05")).toBe(999);
    expect(amountAt(evolutif, "2026-06-01")).toBe(1299);
    expect(amountAt(evolutif, "2026-06-05")).toBe(1299);
  });

  it("renvoie null avant la première période, sans valeur par défaut masquante", () => {
    expect(amountAt(evolutif, "2025-12-31")).toBeNull();
  });

  it("ne réécrit pas les mois antérieurs au changement de tarif (CS-006)", () => {
    expect(duesInMonth(evolutif, "2026-03")).toEqual([
      { dueDate: "2026-03-05", amountCents: 999 },
    ]);
    expect(duesInMonth(evolutif, "2026-05")).toEqual([
      { dueDate: "2026-05-05", amountCents: 999 },
    ]);
    expect(duesInMonth(evolutif, "2026-06")).toEqual([
      { dueDate: "2026-06-05", amountCents: 1299 },
    ]);
  });
});

describe("averageMonthlyCostCents", () => {
  it("ramène une échéance annuelle au mois (scénario 3 du récit 2)", () => {
    expect(averageMonthlyCostCents(assurance, "2026-09-10")).toBe(1000);
  });

  it("laisse inchangée une échéance mensuelle", () => {
    expect(averageMonthlyCostCents(streaming, "2026-01-05")).toBe(1399);
  });

  it("arrondit au centime le plus proche", () => {
    const trimestriel: Subscription = {
      ...streaming,
      periodicity: "quarterly",
      amounts: [{ amountCents: 1000, effectiveFrom: "2026-01-05" }],
    };
    expect(averageMonthlyCostCents(trimestriel, "2026-01-05")).toBe(333);
  });

  it("arrondit un demi-centime au supérieur", () => {
    const semestriel: Subscription = {
      ...streaming,
      periodicity: "semiannual",
      amounts: [{ amountCents: 1001, effectiveFrom: "2026-01-05" }],
    };
    // 1001 / 6 = 166,833… → 167
    expect(averageMonthlyCostCents(semestriel, "2026-01-05")).toBe(167);

    const semestrielPile: Subscription = {
      ...streaming,
      periodicity: "semiannual",
      amounts: [{ amountCents: 999, effectiveFrom: "2026-01-05" }],
    };
    // 999 / 6 = 166,5 → 167 (demi-centime au supérieur)
    expect(averageMonthlyCostCents(semestrielPile, "2026-01-05")).toBe(167);
  });

  it("n’est jamais consommé par le total des charges du mois", () => {
    // L’assurance annuelle vaut 120,00 € en septembre et 0 € ailleurs : si le coût mensuel
    // moyen entrait dans le total, septembre vaudrait 10,00 € et octobre 10,00 € aussi.
    expect(totalChargesCentsForMonth([assurance], "2026-09")).toBe(12000);
    expect(totalChargesCentsForMonth([assurance], "2026-10")).toBe(0);
  });
});

describe("totalChargesCentsForMonth", () => {
  it("additionne les échéances réellement imputées au mois", () => {
    expect(totalChargesCentsForMonth([assurance, streaming], "2026-09")).toBe(13399);
    expect(totalChargesCentsForMonth([assurance, streaming], "2026-10")).toBe(1399);
  });

  it("renvoie zéro sans abonnement", () => {
    expect(totalChargesCentsForMonth([], "2026-09")).toBe(0);
  });
});

describe("isActiveSubscription", () => {
  it("considère actif un abonnement sans date de fin", () => {
    expect(isActiveSubscription(streaming, "2030-01-01")).toBe(true);
  });

  it("considère actif un abonnement dont la fin est à venir ou aujourd’hui", () => {
    const resilie: Subscription = { ...streaming, endDate: "2026-06-30" };
    expect(isActiveSubscription(resilie, "2026-06-30")).toBe(true);
    expect(isActiveSubscription(resilie, "2026-07-01")).toBe(false);
  });
});

// --- Récit 3 : budget mensuel --------------------------------------------------------

function documentAvec(
  incomes: Income[],
  subscriptions: Subscription[],
): BudgetDocument {
  return { version: 2, incomes, subscriptions, expenses: [] };
}

describe("computeMonthlyBudget", () => {
  it("calcule le reste disponible en excédent", () => {
    const budget = computeMonthlyBudget(
      documentAvec([salaire], [streaming]),
      "2026-03",
      "2026-03-20",
    );
    expect(budget.totalIncomeCents).toBe(240000);
    expect(budget.totalChargesCents).toBe(1399);
    expect(budget.remainingCents).toBe(238601);
    expect(budget.status).toBe("surplus");
  });

  it("reconnaît l’équilibre exact à zéro", () => {
    const revenuExact: Income = {
      id: "exact",
      label: "Revenu exact",
      amountCents: 1399,
      kind: "oneOff",
      date: "2026-03-01",
    };
    const budget = computeMonthlyBudget(
      documentAvec([revenuExact], [streaming]),
      "2026-03",
      "2026-03-20",
    );
    expect(budget.remainingCents).toBe(0);
    expect(budget.status).toBe("balanced");
  });

  it("présente un déficit quand les charges dépassent les revenus", () => {
    const petitRevenu: Income = {
      id: "petit",
      label: "Petit revenu",
      amountCents: 1000,
      kind: "oneOff",
      date: "2026-03-01",
    };
    const budget = computeMonthlyBudget(
      documentAvec([petitRevenu], [streaming]),
      "2026-03",
      "2026-03-20",
    );
    expect(budget.remainingCents).toBe(-399);
    expect(budget.status).toBe("deficit");
  });

  it("ne divise jamais par zéro quand les revenus sont nuls (EF-018)", () => {
    const budget = computeMonthlyBudget(
      documentAvec([], [streaming]),
      "2026-03",
      "2026-03-20",
    );
    expect(budget.totalIncomeCents).toBe(0);
    expect(budget.commitmentRate).toBeNull();
    expect(budget.status).toBe("deficit");
  });

  it("calcule le taux d’engagement", () => {
    const revenu: Income = {
      id: "r",
      label: "Revenu",
      amountCents: 200000,
      kind: "oneOff",
      date: "2026-03-01",
    };
    const charge: Subscription = {
      ...streaming,
      amounts: [{ amountCents: 50000, effectiveFrom: "2026-01-05" }],
    };
    const budget = computeMonthlyBudget(
      documentAvec([revenu], [charge]),
      "2026-03",
      "2026-03-20",
    );
    expect(budget.commitmentRate).toBeCloseTo(0.25, 5);
  });

  it("trie la ventilation par montant décroissant puis par libellé (EF-017)", () => {
    const cher: Subscription = {
      ...streaming,
      id: "cher",
      label: "Loyer",
      amounts: [{ amountCents: 80000, effectiveFrom: "2026-01-05" }],
    };
    const egalB: Subscription = {
      ...streaming,
      id: "egal-b",
      label: "Bravo",
      amounts: [{ amountCents: 1000, effectiveFrom: "2026-01-05" }],
    };
    const egalA: Subscription = {
      ...streaming,
      id: "egal-a",
      label: "Alpha",
      amounts: [{ amountCents: 1000, effectiveFrom: "2026-01-05" }],
    };
    const budget = computeMonthlyBudget(
      documentAvec([], [egalB, cher, egalA]),
      "2026-03",
      "2026-03-20",
    );
    expect(budget.breakdown.map((ligne) => ligne.label)).toEqual([
      "Loyer",
      "Alpha",
      "Bravo",
    ]);
  });

  it("marque comme projection un mois postérieur au mois courant (EF-022)", () => {
    const doc = documentAvec([salaire], []);
    expect(computeMonthlyBudget(doc, "2026-03", "2026-03-20").isProjection).toBe(false);
    expect(computeMonthlyBudget(doc, "2026-04", "2026-03-20").isProjection).toBe(true);
    expect(computeMonthlyBudget(doc, "2026-02", "2026-03-20").isProjection).toBe(false);
  });

  it("reste exact au centime sur plus de 50 éléments combinés (CS-002)", () => {
    const revenus: Income[] = Array.from({ length: 30 }, (_, index) => ({
      id: `r${index}`,
      label: `Revenu ${index}`,
      amountCents: 3333,
      kind: "oneOff" as const,
      date: "2026-03-10",
    }));
    const abonnements: Subscription[] = Array.from({ length: 25 }, (_, index) => ({
      id: `s${index}`,
      label: `Abonnement ${index}`,
      periodicity: "monthly" as const,
      startDate: "2026-01-07",
      endDate: null,
      amounts: [{ amountCents: 777, effectiveFrom: "2026-01-07" }],
      pauses: [],
    }));

    const budget = computeMonthlyBudget(
      documentAvec(revenus, abonnements),
      "2026-03",
      "2026-03-20",
    );

    expect(budget.totalIncomeCents).toBe(30 * 3333);
    expect(budget.totalChargesCents).toBe(25 * 777);
    expect(budget.remainingCents).toBe(30 * 3333 - 25 * 777);
    expect(budget.breakdown).toHaveLength(25);
  });

  it("renvoie un budget vide exploitable pour un mois sans données (EF-020)", () => {
    const budget = computeMonthlyBudget(documentAvec([], []), "2026-03", "2026-03-20");
    expect(budget.totalIncomeCents).toBe(0);
    expect(budget.totalChargesCents).toBe(0);
    expect(budget.remainingCents).toBe(0);
    expect(budget.status).toBe("balanced");
    expect(budget.breakdown).toEqual([]);
  });

  it("n’altère jamais un autre mois (CS-007)", () => {
    const doc = documentAvec([salaire], [assurance]);
    const septembre = computeMonthlyBudget(doc, "2026-09", "2026-09-20");
    const octobre = computeMonthlyBudget(doc, "2026-10", "2026-09-20");
    const novembre = computeMonthlyBudget(doc, "2026-11", "2026-09-20");
    expect(septembre.totalChargesCents).toBe(12000);
    expect(octobre.totalChargesCents).toBe(0);
    expect(novembre.totalChargesCents).toBe(0);
  });
});

// --- Récit 4 : navigation et anticipation ---------------------------------------------

describe("forecast", () => {
  it("projette douze mois consécutifs", () => {
    const mois = forecast(documentAvec([salaire], []), "2026-03", 12, "2026-03-20");
    expect(mois).toHaveLength(12);
    expect(mois[0].month).toBe("2026-03");
    expect(mois[11].month).toBe("2027-02");
  });

  it("ne fait apparaître une échéance annuelle qu’une seule fois sur douze mois (CS-003)", () => {
    const mois = forecast(documentAvec([], [assurance]), "2026-09", 12, "2026-09-20");
    const avecCharge = mois.filter((budget) => budget.totalChargesCents > 0);
    expect(avecCharge).toHaveLength(1);
    expect(avecCharge[0].month).toBe("2026-09");
    expect(avecCharge[0].totalChargesCents).toBe(12000);
  });

  it("compte correctement les périodicités mixtes sur douze mois (CS-003)", () => {
    const mois = forecast(
      documentAvec([], [assurance, streaming]),
      "2026-09",
      12,
      "2026-09-20",
    );
    const totalAnnuel = mois.reduce((somme, budget) => somme + budget.totalChargesCents, 0);
    // 12 échéances mensuelles à 13,99 € + 1 échéance annuelle à 120,00 €
    expect(totalAnnuel).toBe(12 * 1399 + 12000);
  });

  it("marque comme projections les mois postérieurs au mois courant", () => {
    const mois = forecast(documentAvec([salaire], []), "2026-02", 4, "2026-03-20");
    expect(mois.map((budget) => budget.isProjection)).toEqual([false, false, true, true]);
  });

  it("signale les mois déficitaires (EF-023)", () => {
    const mois = forecast(
      documentAvec([{ ...salaire, amountCents: 10000 }], [assurance]),
      "2026-09",
      3,
      "2026-09-20",
    );
    expect(mois[0].status).toBe("deficit"); // 100,00 € de revenu contre 120,00 € de charge
    expect(mois[1].status).toBe("surplus");
  });

  it("n’altère aucun mois antérieur lorsqu’un changement est postérieur (EF-025)", () => {
    const evolutif: Subscription = {
      ...streaming,
      amounts: [
        { amountCents: 999, effectiveFrom: "2026-01-05" },
        { amountCents: 1299, effectiveFrom: "2026-06-01" },
      ],
    };
    const mois = forecast(documentAvec([], [evolutif]), "2026-03", 6, "2026-03-20");
    expect(mois.map((budget) => budget.totalChargesCents)).toEqual([
      999, 999, 999, 1299, 1299, 1299,
    ]);
  });
});

describe("listUpcomingDues", () => {
  it("liste les prochaines échéances par date croissante (EF-024)", () => {
    const echeances = listUpcomingDues(
      documentAvec([], [assurance, streaming]),
      "2026-09-01",
      4,
    );
    expect(echeances.map((e) => e.dueDate)).toEqual([
      "2026-09-05",
      "2026-09-10",
      "2026-10-05",
      "2026-11-05",
    ]);
  });

  it("respecte le nombre demandé", () => {
    expect(listUpcomingDues(documentAvec([], [streaming]), "2026-09-01", 2)).toHaveLength(2);
    expect(listUpcomingDues(documentAvec([], [streaming]), "2026-09-01", 0)).toHaveLength(0);
  });

  it("inclut une échéance tombant exactement à la date de départ", () => {
    const echeances = listUpcomingDues(documentAvec([], [streaming]), "2026-09-05", 1);
    expect(echeances[0].dueDate).toBe("2026-09-05");
  });

  it("exclut un abonnement résilié", () => {
    const resilie: Subscription = { ...streaming, endDate: "2026-08-31" };
    expect(listUpcomingDues(documentAvec([], [resilie]), "2026-09-01", 5)).toEqual([]);
  });

  it("départage les échéances de même date par libellé", () => {
    const alpha: Subscription = { ...streaming, id: "a", label: "Alpha" };
    const bravo: Subscription = { ...streaming, id: "b", label: "Bravo" };
    const echeances = listUpcomingDues(documentAvec([], [bravo, alpha]), "2026-09-01", 2);
    expect(echeances.map((e) => e.label)).toEqual(["Alpha", "Bravo"]);
  });
});

// --- Récit 5 : évolution d’un abonnement ----------------------------------------------

describe("withAmountChange", () => {
  it("ajoute une période sans écraser l’historique (EF-010)", () => {
    const evolue = withAmountChange(streaming, 1299, "2026-06-01");
    expect(evolue.amounts).toEqual([
      { amountCents: 1399, effectiveFrom: "2026-01-05" },
      { amountCents: 1299, effectiveFrom: "2026-06-01" },
    ]);
  });

  it("laisse les mois antérieurs strictement inchangés (CS-006)", () => {
    const avant = ["2026-03", "2026-04", "2026-05"].map(
      (mois) => duesInMonth(streaming, mois)[0].amountCents,
    );
    const evolue = withAmountChange(streaming, 1299, "2026-06-01");
    const apres = ["2026-03", "2026-04", "2026-05"].map(
      (mois) => duesInMonth(evolue, mois)[0].amountCents,
    );
    expect(apres).toEqual(avant);
    expect(duesInMonth(evolue, "2026-06")[0].amountCents).toBe(1299);
  });

  it("remplace la période existante si la date d’effet est identique", () => {
    const evolue = withAmountChange(streaming, 1500, "2026-01-05");
    expect(evolue.amounts).toEqual([{ amountCents: 1500, effectiveFrom: "2026-01-05" }]);
  });

  it("conserve les périodes triées par date croissante", () => {
    const evolue = withAmountChange(
      withAmountChange(streaming, 1600, "2026-09-01"),
      1299,
      "2026-06-01",
    );
    expect(evolue.amounts.map((p) => p.effectiveFrom)).toEqual([
      "2026-01-05",
      "2026-06-01",
      "2026-09-01",
    ]);
  });
});

/** Lève si la transformation a échoué : dans ces cas, l’échec est un défaut du test. */
function requis(valeur: Subscription | null): Subscription {
  if (valeur === null) throw new Error("La transformation aurait dû réussir.");
  return valeur;
}

describe("withPause", () => {
  it("suspend les échéances de la période puis les reprend (EF-011)", () => {
    const suspendu = requis(withPause(streaming, "2026-02-01", "2026-03-31"));
    expect(duesInMonth(suspendu, "2026-01")).toHaveLength(1);
    expect(duesInMonth(suspendu, "2026-02")).toEqual([]);
    expect(duesInMonth(suspendu, "2026-03")).toEqual([]);
    expect(duesInMonth(suspendu, "2026-04")).toHaveLength(1);
  });

  it("maintient les périodes triées et disjointes", () => {
    const suspendu = requis(
      withPause(
        requis(withPause(streaming, "2026-06-01", "2026-07-31")),
        "2026-02-01",
        "2026-03-31",
      ),
    );
    expect(suspendu.pauses.map((p) => p.from)).toEqual(["2026-02-01", "2026-06-01"]);
  });

  it("refuse une période qui en chevauche une autre", () => {
    const suspendu = requis(withPause(streaming, "2026-02-01", "2026-04-30"));
    expect(withPause(suspendu, "2026-03-01", "2026-05-31")).toBeNull();
  });

  it("refuse une fin antérieure au début", () => {
    expect(withPause(streaming, "2026-04-01", "2026-02-01")).toBeNull();
  });
});

describe("withTermination", () => {
  it("arrête les échéances après la date de résiliation", () => {
    const resilie = requis(withTermination(streaming, "2026-03-31"));
    expect(duesInMonth(resilie, "2026-03")).toHaveLength(1);
    expect(duesInMonth(resilie, "2026-04")).toEqual([]);
  });

  it("laisse l’abonnement consultable dans les mois où il s’appliquait (EF-012)", () => {
    const resilie = requis(withTermination(streaming, "2026-03-31"));
    expect(duesInMonth(resilie, "2026-01")).toHaveLength(1);
    expect(isActiveSubscription(resilie, "2026-04-01")).toBe(false);
  });

  it("refuse une résiliation antérieure à la première échéance", () => {
    expect(withTermination(streaming, "2025-12-31")).toBeNull();
  });
});
