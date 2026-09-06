import { describe, expect, it } from "vitest";
import {
  addMonthsClamped,
  compareIso,
  dayOfMonth,
  daysInMonth,
  endOfMonth,
  isValidIsoDate,
  monthKeyOf,
  startOfMonth,
} from "@/lib/date";

describe("isValidIsoDate", () => {
  it("accepte une date calendaire valide", () => {
    expect(isValidIsoDate("2026-03-15")).toBe(true);
    expect(isValidIsoDate("2028-02-29")).toBe(true); // année bissextile
  });

  it("refuse une date syntaxiquement correcte mais calendairement impossible", () => {
    expect(isValidIsoDate("2026-02-31")).toBe(false);
    expect(isValidIsoDate("2026-02-29")).toBe(false); // 2026 n’est pas bissextile
    expect(isValidIsoDate("2026-04-31")).toBe(false);
  });

  it("refuse un mois ou un jour hors bornes", () => {
    expect(isValidIsoDate("2026-13-01")).toBe(false);
    expect(isValidIsoDate("2026-00-10")).toBe(false);
    expect(isValidIsoDate("2026-01-00")).toBe(false);
  });

  it("refuse une syntaxe non conforme", () => {
    expect(isValidIsoDate("15/03/2026")).toBe(false);
    expect(isValidIsoDate("2026-3-15")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("2026-03-15T10:00:00Z")).toBe(false);
  });
});

describe("daysInMonth", () => {
  it("renvoie la longueur réelle du mois", () => {
    expect(daysInMonth("2026-01")).toBe(31);
    expect(daysInMonth("2026-02")).toBe(28);
    expect(daysInMonth("2028-02")).toBe(29);
    expect(daysInMonth("2026-04")).toBe(30);
    expect(daysInMonth("2026-12")).toBe(31);
  });

  it("traite correctement les années séculaires", () => {
    expect(daysInMonth("2000-02")).toBe(29);
    expect(daysInMonth("2100-02")).toBe(28);
  });
});

describe("monthKeyOf, startOfMonth, endOfMonth", () => {
  it("extrait le mois d’une date", () => {
    expect(monthKeyOf("2026-03-15")).toBe("2026-03");
  });

  it("borne un mois", () => {
    expect(startOfMonth("2026-02")).toBe("2026-02-01");
    expect(endOfMonth("2026-02")).toBe("2026-02-28");
    expect(endOfMonth("2028-02")).toBe("2028-02-29");
    expect(endOfMonth("2026-04")).toBe("2026-04-30");
  });
});

describe("addMonthsClamped", () => {
  it("rabat sur le dernier jour du mois cible quand le jour n’y existe pas (EF-013)", () => {
    expect(addMonthsClamped("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsClamped("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsClamped("2026-03-31", 1)).toBe("2026-04-30");
  });

  it("ne dérive pas : le jour de référence reste celui de la date d’origine", () => {
    // Le piège classique : un rabattement qui s’applique en cascade donnerait 2026-03-28.
    expect(addMonthsClamped("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsClamped("2026-01-31", 3)).toBe("2026-04-30");
    expect(addMonthsClamped("2026-01-31", 4)).toBe("2026-05-31");
  });

  it("franchit l’année", () => {
    expect(addMonthsClamped("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-01-15", 12)).toBe("2027-01-15");
    expect(addMonthsClamped("2026-01-15", 24)).toBe("2028-01-15");
  });

  it("accepte un décalage nul ou négatif", () => {
    expect(addMonthsClamped("2026-03-15", 0)).toBe("2026-03-15");
    expect(addMonthsClamped("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsClamped("2027-01-15", -1)).toBe("2026-12-15");
  });
});

describe("compareIso", () => {
  it("ordonne chronologiquement", () => {
    expect(compareIso("2026-01-01", "2026-01-02")).toBeLessThan(0);
    expect(compareIso("2026-02-01", "2026-01-31")).toBeGreaterThan(0);
    expect(compareIso("2026-01-01", "2026-01-01")).toBe(0);
  });
});

describe("dayOfMonth", () => {
  it("extrait le quantième", () => {
    expect(dayOfMonth("2026-03-05")).toBe(5);
    expect(dayOfMonth("2026-03-31")).toBe(31);
  });
});
