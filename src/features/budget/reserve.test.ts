import { describe, expect, it } from "vitest";
import {
  activeDeclaration,
  horizonReached,
  monthsRemaining,
  parseMonthsInput,
  shareCents,
  withDeclaration,
  withoutReserve,
} from "@/features/budget/reserve";
import type { OpenDeclaration } from "@/features/budget/reserve";
import type { ReserveDeclaration } from "@/features/budget/types";

/**
 * Voir specs/008-savings-reserve/contracts/calcul-reserve.md. Les cas qui demandent la cascade
 * d'un mois sur l'autre sont dans `expenses.test.ts`.
 */

const ouverture: OpenDeclaration = {
  fromMonth: "2026-10",
  kind: "open",
  balanceCents: 600000,
  months: 12,
};

describe("activeDeclaration", () => {
  const reserve: ReserveDeclaration[] = [
    ouverture,
    { fromMonth: "2026-12", kind: "open", balanceCents: 300000, months: 6 },
    { fromMonth: "2027-02", kind: "closed" },
  ];

  it("ne rend rien sans déclaration, ni avant la première", () => {
    expect(activeDeclaration([], "2026-10")).toBeNull();
    expect(activeDeclaration(reserve, "2026-09")).toBeNull();
  });

  it("rend la déclaration du mois même", () => {
    expect(activeDeclaration(reserve, "2026-10")).toBe(reserve[0]);
    expect(activeDeclaration(reserve, "2026-12")).toBe(reserve[1]);
  });

  it("rend la dernière déclaration antérieure, entre deux déclarations", () => {
    expect(activeDeclaration(reserve, "2026-11")).toBe(reserve[0]);
    expect(activeDeclaration(reserve, "2027-01")).toBe(reserve[1]);
  });

  it("rend le retrait à partir de son mois, et pour toujours", () => {
    expect(activeDeclaration(reserve, "2027-02")).toBe(reserve[2]);
    expect(activeDeclaration(reserve, "2030-01")).toBe(reserve[2]);
  });

  it("ignore une déclaration postérieure au mois demandé (I6)", () => {
    expect(activeDeclaration(reserve, "2026-11")).not.toBe(reserve[1]);
  });
});

describe("monthsRemaining et horizonReached", () => {
  it("vaut la durée déclarée le premier mois", () => {
    expect(monthsRemaining(ouverture, "2026-10")).toBe(12);
    expect(horizonReached(ouverture, "2026-10")).toBe(false);
  });

  it("décroît d'un mois par mois écoulé, année suivante comprise", () => {
    expect(monthsRemaining(ouverture, "2026-11")).toBe(11);
    expect(monthsRemaining(ouverture, "2027-01")).toBe(9);
    expect(monthsRemaining(ouverture, "2027-09")).toBe(1);
    expect(horizonReached(ouverture, "2027-09")).toBe(false);
  });

  it("ne descend pas sous 1 une fois la durée écoulée, et le signale", () => {
    expect(monthsRemaining(ouverture, "2027-10")).toBe(1);
    expect(horizonReached(ouverture, "2027-10")).toBe(true);
    expect(monthsRemaining(ouverture, "2029-01")).toBe(1);
    expect(horizonReached(ouverture, "2029-01")).toBe(true);
  });

  it("gère une durée d'un seul mois", () => {
    const unMois: OpenDeclaration = { ...ouverture, months: 1 };
    expect(monthsRemaining(unMois, "2026-10")).toBe(1);
    expect(horizonReached(unMois, "2026-10")).toBe(false);
    expect(horizonReached(unMois, "2026-11")).toBe(true);
  });
});

describe("shareCents", () => {
  it("divise la réserve par les mois restants", () => {
    expect(shareCents(600000, 12)).toBe(50000);
  });

  it("tronque au centime inférieur : le reste demeure dans la réserve", () => {
    expect(shareCents(100000, 3)).toBe(33333);
    expect(shareCents(580000, 11)).toBe(52727);
    expect(shareCents(2, 3)).toBe(0);
  });

  it("donne la réserve entière au dernier mois (I4)", () => {
    expect(shareCents(33334, 1)).toBe(33334);
  });

  it("vaut zéro pour une réserve vide", () => {
    expect(shareCents(0, 12)).toBe(0);
  });

  it("impute toute la dette au mois quand la réserve est négative, sans diviser (FR-012)", () => {
    expect(shareCents(-5000, 6)).toBe(-5000);
    expect(shareCents(-1, 120)).toBe(-1);
  });

  it("reste exact sur le plus grand montant", () => {
    expect(shareCents(9_000_000_000, 1)).toBe(9_000_000_000);
    expect(shareCents(9_000_000_000, 7)).toBe(1_285_714_285);
  });

  it("ne distribue jamais plus que la réserve (I3)", () => {
    for (const ouvertureCents of [1, 99, 100, 33334, 600000, 999_999_999, 9_000_000_000]) {
      for (const restants of [1, 2, 3, 7, 12, 119, 120]) {
        const part = shareCents(ouvertureCents, restants);
        expect(Number.isInteger(part)).toBe(true);
        expect(part).toBeGreaterThanOrEqual(0);
        expect(part).toBeLessThanOrEqual(ouvertureCents);
        expect(part * restants).toBeLessThanOrEqual(ouvertureCents);
        // Le reste non réparti est strictement inférieur à un centime par mois restant.
        expect(ouvertureCents - part * restants).toBeLessThan(restants);
      }
    }
  });
});

describe("withDeclaration", () => {
  it("ajoute une première déclaration", () => {
    expect(withDeclaration([], "2026-10", 600000, 12)).toEqual([ouverture]);
  });

  it("remplace la déclaration du même mois", () => {
    expect(withDeclaration([ouverture], "2026-10", 300000, 6)).toEqual([
      { fromMonth: "2026-10", kind: "open", balanceCents: 300000, months: 6 },
    ]);
  });

  it("ajoute un recalage sans toucher aux déclarations antérieures (FR-021)", () => {
    const apres = withDeclaration([ouverture], "2026-12", 300000, 6);
    expect(apres).toEqual([
      ouverture,
      { fromMonth: "2026-12", kind: "open", balanceCents: 300000, months: 6 },
    ]);
    expect(apres[0]).toBe(ouverture);
  });

  it("rouvre une réserve après un retrait du même mois", () => {
    const retiree: ReserveDeclaration[] = [ouverture, { fromMonth: "2026-12", kind: "closed" }];
    expect(withDeclaration(retiree, "2026-12", 100000, 3)).toEqual([
      ouverture,
      { fromMonth: "2026-12", kind: "open", balanceCents: 100000, months: 3 },
    ]);
  });

  it("rend une liste triée et ne modifie pas la liste reçue", () => {
    const tardive: ReserveDeclaration[] = [
      { fromMonth: "2027-03", kind: "open", balanceCents: 1, months: 1 },
    ];
    const apres = withDeclaration(tardive, "2026-10", 600000, 12);
    expect(apres.map((d) => d.fromMonth)).toEqual(["2026-10", "2027-03"]);
    expect(tardive).toHaveLength(1);
  });

  it("accepte un solde de zéro", () => {
    expect(withDeclaration([], "2026-10", 0, 1)).toEqual([
      { fromMonth: "2026-10", kind: "open", balanceCents: 0, months: 1 },
    ]);
  });
});

describe("withoutReserve", () => {
  it("clôt la réserve à partir du mois, en gardant les déclarations antérieures", () => {
    expect(withoutReserve([ouverture], "2026-12")).toEqual([
      ouverture,
      { fromMonth: "2026-12", kind: "closed" },
    ]);
  });

  it("retire simplement la déclaration quand elle date du mois même, sans antécédent", () => {
    expect(withoutReserve([ouverture], "2026-10")).toEqual([]);
  });

  it("remplace un recalage du mois par un retrait quand une déclaration le précède", () => {
    const recalee: ReserveDeclaration[] = [
      ouverture,
      { fromMonth: "2026-12", kind: "open", balanceCents: 300000, months: 6 },
    ];
    expect(withoutReserve(recalee, "2026-12")).toEqual([
      ouverture,
      { fromMonth: "2026-12", kind: "closed" },
    ]);
  });

  it("ne fait rien d'une liste vide et ne modifie pas la liste reçue", () => {
    expect(withoutReserve([], "2026-10")).toEqual([]);
    const reserve = [ouverture];
    withoutReserve(reserve, "2026-12");
    expect(reserve).toEqual([ouverture]);
  });
});

describe("parseMonthsInput", () => {
  it("accepte un entier de 1 à 120, espaces autour tolérés", () => {
    expect(parseMonthsInput("1")).toEqual({ ok: true, months: 1 });
    expect(parseMonthsInput("12")).toEqual({ ok: true, months: 12 });
    expect(parseMonthsInput("120")).toEqual({ ok: true, months: 120 });
    expect(parseMonthsInput(" 12 ")).toEqual({ ok: true, months: 12 });
  });

  it("refuse une saisie vide", () => {
    expect(parseMonthsInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseMonthsInput("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuse ce qui n'est pas un entier", () => {
    for (const saisie of ["1,5", "1.5", "-3", "abc", "12 mois", "1e2", "+5"]) {
      expect(parseMonthsInput(saisie)).toEqual({ ok: false, reason: "notAnInteger" });
    }
  });

  it("refuse zéro et au-delà de 120", () => {
    expect(parseMonthsInput("0")).toEqual({ ok: false, reason: "outOfRange" });
    expect(parseMonthsInput("121")).toEqual({ ok: false, reason: "outOfRange" });
    expect(parseMonthsInput("99999999999999999999")).toEqual({ ok: false, reason: "outOfRange" });
  });
});
