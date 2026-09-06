import { describe, expect, it } from "vitest";
import { centsToInputValue, formatCents, parseAmountInput, sumCents } from "@/lib/money";

describe("parseAmountInput", () => {
  it("interprète la virgule et le point de façon identique (EF-028)", () => {
    expect(parseAmountInput("12,40")).toEqual({ ok: true, cents: 1240 });
    expect(parseAmountInput("12.40")).toEqual({ ok: true, cents: 1240 });
  });

  it("accepte un entier sans décimale", () => {
    expect(parseAmountInput("2400")).toEqual({ ok: true, cents: 240000 });
  });

  it("accepte une seule décimale", () => {
    expect(parseAmountInput("12,4")).toEqual({ ok: true, cents: 1240 });
  });

  it("tolère les espaces de bordure et les séparateurs de milliers", () => {
    expect(parseAmountInput("  1 234,56  ")).toEqual({ ok: true, cents: 123456 });
    // Espace insécable (U+00A0) et espace fine insécable (U+202F), produits par les claviers
    // et par Intl.NumberFormat en français.
    expect(parseAmountInput("1 234,56")).toEqual({ ok: true, cents: 123456 });
    expect(parseAmountInput("1 234,56")).toEqual({ ok: true, cents: 123456 });
  });

  it("refuse une saisie vide", () => {
    expect(parseAmountInput("")).toEqual({ ok: false, reason: "empty" });
    expect(parseAmountInput("   ")).toEqual({ ok: false, reason: "empty" });
  });

  it("refuse une saisie non numérique", () => {
    expect(parseAmountInput("abc")).toEqual({ ok: false, reason: "notANumber" });
    expect(parseAmountInput("12,4,5")).toEqual({ ok: false, reason: "notANumber" });
    expect(parseAmountInput("12€")).toEqual({ ok: false, reason: "notANumber" });
  });

  it("refuse plus de deux décimales", () => {
    expect(parseAmountInput("1,234")).toEqual({ ok: false, reason: "tooManyDecimals" });
    expect(parseAmountInput("0,001")).toEqual({ ok: false, reason: "tooManyDecimals" });
  });

  it("refuse un montant négatif ou nul", () => {
    expect(parseAmountInput("-5")).toEqual({ ok: false, reason: "notPositive" });
    expect(parseAmountInput("0")).toEqual({ ok: false, reason: "notPositive" });
    expect(parseAmountInput("0,00")).toEqual({ ok: false, reason: "notPositive" });
  });

  it("refuse un montant au-delà du domaine représentable exactement", () => {
    expect(parseAmountInput("999999999999")).toEqual({ ok: false, reason: "tooLarge" });
  });

  it("ne renvoie jamais NaN", () => {
    for (const entree of ["", "abc", "-5", "1,234", "1e5", "Infinity", "NaN"]) {
      const resultat = parseAmountInput(entree);
      if (resultat.ok) expect(Number.isNaN(resultat.cents)).toBe(false);
    }
  });

  it("accepte le plus grand montant réaliste sans perte", () => {
    expect(parseAmountInput("90000000,00")).toEqual({ ok: true, cents: 9000000000 });
  });
});

describe("sumCents", () => {
  it("renvoie zéro pour une liste vide", () => {
    expect(sumCents([])).toBe(0);
  });

  it("additionne sans dérive sur un grand volume (CS-002)", () => {
    // 0,01 € additionné 100 000 fois vaut exactement 1 000,00 €. Le même calcul mené en
    // virgule flottante décimale dérive ; en centimes entiers il est exact.
    const valeurs = Array.from({ length: 100_000 }, () => 1);
    expect(sumCents(valeurs)).toBe(100_000);
  });

  it("gère les montants négatifs des valeurs dérivées", () => {
    expect(sumCents([240000, -145000])).toBe(95000);
  });
});

describe("formatCents", () => {
  it("formate en euros au format français", () => {
    // L’espace des milliers produit par Intl est insécable : on le normalise pour comparer.
    expect(formatCents(123456).replace(/\s/g, " ")).toBe("1 234,56 €");
    expect(formatCents(0).replace(/\s/g, " ")).toBe("0,00 €");
  });

  it("conserve le signe d’un montant négatif", () => {
    expect(formatCents(-25000)).toContain("-");
  });
});

describe("centsToInputValue", () => {
  it("rend une valeur réinjectable telle quelle dans parseAmountInput", () => {
    for (const centimes of [1, 40, 100, 1240, 123456, 9000000000]) {
      const chaine = centsToInputValue(centimes);
      expect(parseAmountInput(chaine)).toEqual({ ok: true, cents: centimes });
    }
  });

  it("conserve toujours deux décimales", () => {
    expect(centsToInputValue(1200)).toBe("12,00");
    expect(centsToInputValue(1204)).toBe("12,04");
    expect(centsToInputValue(4)).toBe("0,04");
  });
});
