import { describe, expect, it } from "vitest";
import {
  availableCentsForMonth,
  computeDailyAllowance,
  computeMonthlySpending,
  computeReserveState,
  openingBalanceFor,
} from "@/features/budget/expenses";
import { computeMonthlyBudget } from "@/features/budget/calculs";
import { withDeclaration, withoutReserve } from "@/features/budget/reserve";
import { emptyDocument } from "@/features/budget/types";
import type {
  BudgetDocument,
  Expense,
  Refund,
  ReserveDeclaration,
  Subscription,
} from "@/features/budget/types";
import { addMonthsToKey } from "@/lib/date";

/**
 * Cascade de la réserve d'épargne, au centime.
 *
 * Reproduit le jeu de référence de specs/008-savings-reserve/contracts/calcul-reserve.md (§4)
 * et vérifie ses invariants (§3). Les fonctions feuilles sont testées dans `reserve.test.ts`.
 */

const AUJOURDHUI = "2026-10-15";

function depense(id: string, amountCents: number, date: string): Expense {
  return { id, amountCents, date, category: null };
}

function remboursement(id: string, amountCents: number, date: string): Refund {
  return { id, amountCents, date, category: null, source: "lcl", bankRef: `lcl:${id}` };
}

function abonnement(amountCents: number): Subscription {
  return {
    id: "loyer",
    label: "Loyer",
    periodicity: "monthly",
    startDate: "2026-01-01",
    endDate: null,
    amounts: [{ amountCents, effectiveFrom: "2026-01-01" }],
    pauses: [],
  };
}

const OUVERTURE: ReserveDeclaration = {
  fromMonth: "2026-10",
  kind: "open",
  balanceCents: 600000,
  months: 12,
};

/** Revenus nets de 900,00 € chaque mois, sans abonnement. */
function documentDeReference(surcharge: Partial<BudgetDocument> = {}): BudgetDocument {
  return {
    ...emptyDocument(),
    incomes: [
      {
        id: "salaire",
        label: "Salaire",
        amountCents: 90000,
        kind: "recurring",
        periodicity: "monthly",
        startDate: "2026-01-01",
        endDate: null,
      },
    ],
    expenses: [
      depense("sep", 40000, "2026-09-10"),
      depense("oct", 110000, "2026-10-10"),
      depense("nov", 70000, "2026-11-10"),
      depense("dec", 200000, "2026-12-10"),
    ],
    reserve: [OUVERTURE],
    ...surcharge,
  };
}

function etat(doc: BudgetDocument, mois: string) {
  const resultat = computeReserveState(doc, mois, AUJOURDHUI);
  if (resultat === null) throw new Error(`Aucune réserve pour ${mois}`);
  return resultat;
}

// --- Jeu de référence (contrat §4) ---------------------------------------------------------

describe("jeu de référence", () => {
  const doc = documentDeReference();

  it("laisse intact le mois qui précède la déclaration (FR-013)", () => {
    expect(computeReserveState(doc, "2026-09", AUJOURDHUI)).toBeNull();
    const bilan = computeMonthlySpending(doc, "2026-09", AUJOURDHUI);
    expect(bilan.reserve).toBeNull();
    expect(bilan.availableCents).toBe(90000);
    expect(bilan.spentCents).toBe(40000);
    expect(bilan.overspentCents).toBe(0);
  });

  const lignes = [
    // mois, ouverture, restants, part, disponible, dépensé, entamée, dépassement, clôture
    ["2026-10", 600000, 12, 50000, 140000, 110000, 20000, 0, 580000],
    ["2026-11", 580000, 11, 52727, 142727, 70000, 0, 0, 600000],
    ["2026-12", 600000, 10, 60000, 150000, 200000, 110000, 50000, 490000],
    ["2027-01", 490000, 9, 54444, 144444, 0, 0, 0, 580000],
  ] as const;

  it.each(lignes)(
    "%s : ouverture %i, %i mois restants, part %i",
    (mois, ouverture, restants, part, disponible, depenseAttendu, entamee, depassement, cloture) => {
      const bilan = computeMonthlySpending(doc, mois, AUJOURDHUI);

      expect(bilan.reserve).toEqual({
        openingCents: ouverture,
        shortfallCents: 0,
        monthsRemaining: restants,
        horizonReached: false,
        shareCents: part,
        drawnCents: entamee,
        closingCents: cloture,
      });
      expect(bilan.incomeNetCents).toBe(90000);
      expect(bilan.availableCents).toBe(disponible);
      expect(bilan.spentCents).toBe(depenseAttendu);
      expect(bilan.overspentCents).toBe(depassement);
      expect(bilan.remainingCents).toBe(disponible - depenseAttendu);
      expect(availableCentsForMonth(doc, mois, AUJOURDHUI)).toBe(disponible);
    },
  );
});

// --- Cas isolés à cascade (contrat §4) ------------------------------------------------------

describe("cas isolés", () => {
  it("durée écoulée : un seul mois restant, toute la réserve disponible, et signalée", () => {
    const doc = documentDeReference({
      expenses: [],
      reserve: [{ fromMonth: "2026-10", kind: "open", balanceCents: 30000, months: 3 }],
    });
    // 5ᵉ mois : 30 000 + 4 × 90 000 de revenus nets non dépensés.
    const fevrier = etat(doc, "2027-02");
    expect(fevrier.monthsRemaining).toBe(1);
    expect(fevrier.horizonReached).toBe(true);
    expect(fevrier.openingCents).toBe(390000);
    expect(fevrier.shareCents).toBe(390000);
  });

  it("revenus nets négatifs : la part comble d'abord le manque, compté comme épargne entamée", () => {
    const doc = documentDeReference({
      subscriptions: [abonnement(110000)],
      expenses: [depense("oct", 10000, "2026-10-10")],
    });
    const bilan = computeMonthlySpending(doc, "2026-10", AUJOURDHUI);
    expect(bilan.incomeNetCents).toBe(-20000);
    expect(bilan.reserve?.shareCents).toBe(50000);
    expect(bilan.availableCents).toBe(30000);
    expect(bilan.reserve?.drawnCents).toBe(30000);
    expect(bilan.reserve?.closingCents).toBe(570000);
  });

  it("réserve négative : toute la dette est imputée au mois, sans division (FR-012)", () => {
    const doc = documentDeReference({
      expenses: [depense("oct", 695000, "2026-10-10")],
    });
    // Octobre : 600 000 + 90 000 − 695 000 = −5 000.
    const novembre = computeMonthlySpending(doc, "2026-11", AUJOURDHUI);
    expect(novembre.reserve).toMatchObject({
      openingCents: -5000,
      shortfallCents: 5000,
      monthsRemaining: 11,
      shareCents: -5000,
    });
    expect(novembre.availableCents).toBe(85000);
  });

  it("solde de zéro : report simple du reste d'un mois sur l'autre", () => {
    const doc = documentDeReference({
      expenses: [depense("oct", 70000, "2026-10-10")],
      reserve: [{ fromMonth: "2026-10", kind: "open", balanceCents: 0, months: 1 }],
    });
    expect(etat(doc, "2026-10").shareCents).toBe(0);
    expect(computeMonthlySpending(doc, "2026-10", AUJOURDHUI).availableCents).toBe(90000);
    // Les 200,00 € non dépensés en octobre sont disponibles en novembre.
    expect(etat(doc, "2026-11").openingCents).toBe(20000);
    expect(computeMonthlySpending(doc, "2026-11", AUJOURDHUI).availableCents).toBe(110000);
  });

  it("plus grand montant : aucune perte de précision", () => {
    const doc = documentDeReference({
      expenses: [],
      reserve: [{ fromMonth: "2026-10", kind: "open", balanceCents: 9_000_000_000, months: 1 }],
    });
    expect(etat(doc, "2026-10").shareCents).toBe(9_000_000_000);
    expect(etat(doc, "2026-10").closingCents).toBe(9_000_090_000);
  });

  it("recalage : le mois recalé repart du nouveau solde, les mois antérieurs ne bougent pas", () => {
    const avant = documentDeReference();
    const apres = documentDeReference({
      reserve: withDeclaration(avant.reserve, "2026-12", 300000, 6),
    });

    for (const mois of ["2026-09", "2026-10", "2026-11"]) {
      expect(computeMonthlySpending(apres, mois, AUJOURDHUI)).toEqual(
        computeMonthlySpending(avant, mois, AUJOURDHUI),
      );
    }
    expect(etat(apres, "2026-12")).toMatchObject({
      openingCents: 300000,
      monthsRemaining: 6,
      shareCents: 50000,
    });
  });

  it("retrait : plus de réserve à partir du mois, les mois antérieurs ne bougent pas", () => {
    const avant = documentDeReference();
    const apres = documentDeReference({ reserve: withoutReserve(avant.reserve, "2026-12") });

    for (const mois of ["2026-10", "2026-11"]) {
      expect(computeMonthlySpending(apres, mois, AUJOURDHUI)).toEqual(
        computeMonthlySpending(avant, mois, AUJOURDHUI),
      );
    }
    const decembre = computeMonthlySpending(apres, "2026-12", AUJOURDHUI);
    expect(decembre.reserve).toBeNull();
    expect(decembre.availableCents).toBe(90000);
    expect(computeMonthlySpending(apres, "2027-03", AUJOURDHUI).reserve).toBeNull();
  });

  it("correction tardive : corriger une dépense passée se répercute sans action (FR-011)", () => {
    const doc = documentDeReference();
    const corrige = documentDeReference({
      expenses: doc.expenses.map((d) => (d.id === "oct" ? { ...d, amountCents: 100000 } : d)),
    });
    expect(etat(corrige, "2026-11").openingCents).toBe(590000);
  });

  it("mois futur : calculé par la même cascade, sans dépense", () => {
    const doc = documentDeReference({ expenses: [] });
    // Six mois de revenus nets non dépensés s'ajoutent à la réserve.
    expect(etat(doc, "2027-04").openingCents).toBe(600000 + 6 * 90000);
  });

  it("application rouverte après plusieurs mois : chaque mois écoulé est compté", () => {
    const doc = documentDeReference();
    const plusTard = computeReserveState(doc, "2027-01", "2027-01-20");
    expect(plusTard?.openingCents).toBe(490000);
  });
});

// --- Remboursements -------------------------------------------------------------------------

describe("remboursements", () => {
  it("un remboursement réduit le dépensé, donc augmente la clôture", () => {
    const doc = documentDeReference({
      expenses: [depense("oct", 110000, "2026-10-10")],
      refunds: [remboursement("r1", 10000, "2026-10-12")],
    });
    const bilan = computeMonthlySpending(doc, "2026-10", AUJOURDHUI);
    expect(bilan.spentCents).toBe(100000);
    expect(bilan.reserve?.drawnCents).toBe(10000);
    expect(bilan.reserve?.closingCents).toBe(590000);
  });

  it("un excédent de remboursement n'augmente pas le disponible du mois, mais entre dans la réserve", () => {
    const doc = documentDeReference({
      expenses: [depense("oct", 50000, "2026-10-10")],
      refunds: [remboursement("r1", 80000, "2026-10-12")],
    });
    const bilan = computeMonthlySpending(doc, "2026-10", AUJOURDHUI);

    // Affichage du mois : règle de la fonctionnalité 006, inchangée.
    expect(bilan.spentCents).toBe(0);
    expect(bilan.refundSurplusCents).toBe(30000);
    expect(bilan.availableCents).toBe(140000);
    expect(bilan.remainingCents).toBe(140000);
    expect(bilan.reserve?.drawnCents).toBe(0);

    // Réserve : 600 000 + 90 000 de revenus nets + 30 000 d'excédent.
    expect(bilan.reserve?.closingCents).toBe(720000);
    expect(etat(doc, "2026-11").openingCents).toBe(720000);
  });
});

// --- Invariants (contrat §3) ----------------------------------------------------------------

describe("invariants sur un parcours de 12 mois", () => {
  // Dépenses et remboursements variés, dont des mois en dépassement et un excédent de
  // remboursement : montants premiers entre eux pour exercer la troncature.
  const depenses = [110017, 70003, 200011, 0, 45551, 133337, 90001, 12, 250049, 60007, 99991, 80021];
  const rembourses = [0, 1234, 0, 5000, 0, 0, 777, 9999, 0, 0, 31, 0];

  const mois = depenses.map((_, i) => addMonthsToKey("2026-10", i));
  const doc = documentDeReference({
    expenses: depenses.flatMap((montant, i) =>
      montant > 0 ? [depense(`d${i}`, montant, `${mois[i]}-10`)] : [],
    ),
    refunds: rembourses.flatMap((montant, i) =>
      montant > 0 ? [remboursement(`r${i}`, montant, `${mois[i]}-12`)] : [],
    ),
    reserve: [{ fromMonth: "2026-10", kind: "open", balanceCents: 600001, months: 12 }],
  });

  it("I1 — clôture = ouverture + revenus nets − sorties nettes, chaque mois", () => {
    mois.forEach((m, i) => {
      const e = etat(doc, m);
      const net = computeMonthlyBudget(doc, m, AUJOURDHUI).remainingCents;
      expect(e.closingCents).toBe(e.openingCents + net - (depenses[i] - rembourses[i]));
    });
  });

  it("I2 / SC-003 — l'ouverture est le solde déclaré plus les nets moins les sorties écoulés", () => {
    let attendu = 600001;
    mois.forEach((m, i) => {
      expect(etat(doc, m).openingCents).toBe(attendu);
      attendu += 90000 - (depenses[i] - rembourses[i]);
    });
  });

  it("la clôture d'un mois est l'ouverture du suivant", () => {
    for (let i = 0; i + 1 < mois.length; i += 1) {
      expect(etat(doc, mois[i + 1]).openingCents).toBe(etat(doc, mois[i]).closingCents);
    }
  });

  it("I3 / SC-004 — la part n'excède jamais la réserve, et tout est en centimes entiers", () => {
    for (const m of mois) {
      const e = etat(doc, m);
      for (const valeur of [e.openingCents, e.shareCents, e.drawnCents, e.closingCents]) {
        expect(Number.isInteger(valeur)).toBe(true);
      }
      if (e.openingCents > 0) {
        expect(e.shareCents).toBeGreaterThanOrEqual(0);
        expect(e.shareCents * e.monthsRemaining).toBeLessThanOrEqual(e.openingCents);
      } else {
        expect(e.shareCents).toBe(e.openingCents);
      }
    }
  });

  it("I4 — au dernier mois de la durée, la part est la réserve entière", () => {
    const dernier = etat(doc, mois[11]);
    expect(dernier.monthsRemaining).toBe(1);
    expect(dernier.horizonReached).toBe(false);
    if (dernier.openingCents > 0) expect(dernier.shareCents).toBe(dernier.openingCents);
  });

  it("I7 / SC-007 — deux calculs sur le même document rendent le même état", () => {
    const copie = structuredClone(doc);
    for (const m of mois) {
      expect(computeMonthlySpending(copie, m, AUJOURDHUI)).toEqual(
        computeMonthlySpending(doc, m, AUJOURDHUI),
      );
    }
  });
});

describe("sans réserve (I5, SC-006)", () => {
  const doc = documentDeReference({ reserve: [] });

  it("le disponible est exactement les revenus nets", () => {
    for (const mois of ["2026-09", "2026-10", "2026-12", "2027-06"]) {
      const bilan = computeMonthlySpending(doc, mois, AUJOURDHUI);
      const net = computeMonthlyBudget(doc, mois, AUJOURDHUI).remainingCents;
      expect(bilan.reserve).toBeNull();
      expect(bilan.incomeNetCents).toBe(net);
      expect(bilan.availableCents).toBe(net);
      expect(availableCentsForMonth(doc, mois, AUJOURDHUI)).toBe(net);
    }
  });

  it("l'allocation du jour se calcule sur les seuls revenus nets", () => {
    // Octobre : 31 jours, 90 000 de disponible, rien de dépensé avant le 1er.
    expect(computeDailyAllowance(doc, "2026-10-01").allowanceCents).toBe(Math.floor(90000 / 31));
  });
});

// --- Allocation du jour ---------------------------------------------------------------------

describe("allocation du jour avec une réserve (FR-009)", () => {
  const doc = documentDeReference({ expenses: [depense("j1", 1000, "2026-10-01")] });

  it("répartit le disponible, part d'épargne comprise, sur les jours restants", () => {
    // 140 000 sur 31 jours, tronqué.
    const premier = computeDailyAllowance(doc, "2026-10-01");
    expect(premier.allowanceCents).toBe(4516);
    expect(premier.carryOverCents).toBeNull();
  });

  it("calcule le report de la veille sur le même disponible", () => {
    const deuxieme = computeDailyAllowance(doc, "2026-10-02");
    // (140 000 − 1 000) sur 30 jours ; veille : 4 516 alloués, 1 000 dépensés.
    expect(deuxieme.allowanceCents).toBe(4633);
    expect(deuxieme.carryOverCents).toBe(3516);
  });

  it("n'alloue rien quand la dette de la réserve absorbe les revenus du mois", () => {
    const endette = documentDeReference({
      expenses: [depense("oct", 800000, "2026-10-10")],
    });
    // Novembre : ouverture −110 000, disponible 90 000 − 110 000 < 0.
    expect(computeDailyAllowance(endette, "2026-11-05").allowanceCents).toBe(0);
  });
});

// --- Solde saisi en cours de mois (contrat §2 bis) -------------------------------------------

describe("openingBalanceFor", () => {
  function clotureApresSaisie(doc: BudgetDocument, soldeSaisi: number): number {
    const ouverture = openingBalanceFor(doc, AUJOURDHUI, soldeSaisi);
    const declare = { ...doc, reserve: withDeclaration(doc.reserve, "2026-10", ouverture, 12) };
    return etat(declare, "2026-10").closingCents;
  }

  it("revenus épuisés : rajoute l'épargne déjà entamée, la fin de mois retombe sur le solde saisi", () => {
    const doc = documentDeReference({ reserve: [] });
    expect(openingBalanceFor(doc, AUJOURDHUI, 580000)).toBe(600000);
    expect(clotureApresSaisie(doc, 580000)).toBe(580000);
  });

  it("revenus non épuisés : enregistre le solde saisi tel quel", () => {
    const doc = documentDeReference({
      reserve: [],
      expenses: [depense("oct", 40000, "2026-10-10")],
    });
    expect(openingBalanceFor(doc, AUJOURDHUI, 600000)).toBe(600000);
    // Le reste des revenus du mois ira à la réserve.
    expect(clotureApresSaisie(doc, 600000)).toBe(650000);
  });

  it("revenus nets négatifs : le manque déjà comblé par l'épargne est rajouté", () => {
    const doc = documentDeReference({
      reserve: [],
      subscriptions: [abonnement(110000)],
      expenses: [depense("oct", 10000, "2026-10-10")],
    });
    expect(openingBalanceFor(doc, AUJOURDHUI, 500000)).toBe(530000);
    expect(clotureApresSaisie(doc, 500000)).toBe(500000);
  });

  it("excédent de remboursement : rien n'est entamé, rien n'est rajouté", () => {
    const doc = documentDeReference({
      reserve: [],
      expenses: [depense("oct", 50000, "2026-10-10")],
      refunds: [remboursement("r1", 80000, "2026-10-12")],
    });
    expect(openingBalanceFor(doc, AUJOURDHUI, 600000)).toBe(600000);
  });

  it("ne tient compte que du mois de la saisie", () => {
    const doc = documentDeReference({
      reserve: [],
      expenses: [depense("sep", 999999, "2026-09-10")],
    });
    expect(openingBalanceFor(doc, AUJOURDHUI, 600000)).toBe(600000);
  });

  it("peut dépasser le plafond des montants : à l'appelant de refuser", () => {
    const doc = documentDeReference({
      reserve: [],
      expenses: [depense("oct", 90001, "2026-10-10")],
    });
    expect(openingBalanceFor(doc, AUJOURDHUI, 9_000_000_000)).toBe(9_000_000_001);
  });
});
