import { describe, expect, it } from "vitest";
import { createValueRegistry, findUnverifiedValues } from "@/features/assistant/verify-amounts";
import { formatCents } from "@/lib/money";
import type { KnownValues } from "@/features/assistant/types";

function connus(cents: number[], percents: number[] = []): KnownValues {
  return { cents: new Set(cents), percents: new Set(percents) };
}

describe("createValueRegistry", () => {
  it("formate un montant comme l'application et retient sa valeur absolue", () => {
    const registre = createValueRegistry();
    expect(registre.montant(31247)).toBe(formatCents(31247));
    expect(registre.montant(-1250)).toBe(formatCents(-1250));
    expect(registre.montant(0)).toBe(formatCents(0));
    expect([...registre.known.cents].sort((a, b) => a - b)).toEqual([0, 1250, 31247]);
  });

  it("formate un taux comme l'écran et retient sa valeur à une décimale", () => {
    const registre = createValueRegistry();
    expect(registre.pourcentage(0.604)).toBe("60,4 %");
    expect([...registre.known.percents]).toEqual([60.4]);
  });

  it("retient les très grands montants", () => {
    const registre = createValueRegistry();
    registre.montant(9_000_000_000);
    expect(registre.known.cents.has(9_000_000_000)).toBe(true);
  });
});

describe("findUnverifiedValues — montants", () => {
  it("ne signale rien quand tous les montants sont connus", () => {
    const texte = "Vous avez dépensé 312,47 € sur un plafond de 400,00 €.";
    expect(findUnverifiedValues(texte, connus([31247, 40000]))).toEqual([]);
  });

  it("signale un montant inventé, formaté comme l'application", () => {
    expect(findUnverifiedValues("Il reste 87,53 €.", connus([31247]))).toEqual([
      formatCents(8753),
    ]);
  });

  it("signale une somme calculée par le modèle", () => {
    const texte = "Courses et loisirs font 478,67 € au total.";
    expect(findUnverifiedValues(texte, connus([31247, 16420]))).toEqual([formatCents(47867)]);
  });

  it("reconnaît zéro quand il est connu, et le signale sinon", () => {
    expect(findUnverifiedValues("Il reste 0,00 €.", connus([0]))).toEqual([]);
    expect(findUnverifiedValues("Il reste 0,00 €.", connus([100]))).toEqual([formatCents(0)]);
  });

  it("ignore le signe : la valeur absolue est comparée", () => {
    const texte = "Un dépassement de \u221212,50 € puis de -12,50 €.";
    expect(findUnverifiedValues(texte, connus([1250]))).toEqual([]);
  });

  it("garde le signe d'un montant négatif non vérifié", () => {
    expect(findUnverifiedValues("Solde de \u221299,00 €.", connus([]))).toEqual([formatCents(-9900)]);
  });

  it.each([
    ["espace fine insécable", "12\u202f345,67\u00a0€"],
    ["espace insécable", "12\u00a0345,67 €"],
    ["espace ordinaire", "12 345,67 €"],
    ["point des milliers", "12.345,67 €"],
  ])("lit les milliers : %s", (_nom, ecrit) => {
    expect(findUnverifiedValues(`Total ${ecrit}.`, connus([1_234_567]))).toEqual([]);
  });

  it("lit un montant du formateur de l'application, quel que soit son séparateur", () => {
    const registre = createValueRegistry();
    const ecrit = registre.montant(1_234_567);
    expect(findUnverifiedValues(`Total ${ecrit}.`, registre.known)).toEqual([]);
  });

  it("lit un montant entier, ou à une seule décimale", () => {
    expect(findUnverifiedValues("Il reste 5 € et 12,5 €.", connus([500, 1250]))).toEqual([]);
    expect(findUnverifiedValues("Il reste 5 €.", connus([]))).toEqual([formatCents(500)]);
  });

  it("lit le mot « euros » comme le symbole", () => {
    expect(findUnverifiedValues("Il reste 12 euros.", connus([1200]))).toEqual([]);
    expect(findUnverifiedValues("Il reste 1 euro.", connus([]))).toEqual([formatCents(100)]);
  });

  it("lit un montant écrit sans partie entière", () => {
    expect(findUnverifiedValues("Il reste ,50 €.", connus([50]))).toEqual([]);
  });

  it("ne signale qu'une fois un montant cité plusieurs fois", () => {
    const texte = "999,99 € ici, puis encore 999,99 € là.";
    expect(findUnverifiedValues(texte, connus([]))).toEqual([formatCents(99999)]);
  });

  it("garde l'ordre d'apparition", () => {
    const texte = "D'abord 3,00 €, ensuite 1,00 €, enfin 2,00 €.";
    expect(findUnverifiedValues(texte, connus([]))).toEqual([
      formatCents(300),
      formatCents(100),
      formatCents(200),
    ]);
  });

  it("ne signale rien dans un texte sans nombre", () => {
    expect(findUnverifiedValues("Je n'ai pas cette information.", connus([]))).toEqual([]);
  });

  it("ignore les nombres sans unité : dates, comptes, jours", () => {
    const texte = "Le 24/10/2026, 3 opérations, il reste 7 jours, en 2026.";
    expect(findUnverifiedValues(texte, connus([]))).toEqual([]);
  });

  describe("écritures malformées", () => {
    it("ne lève pas sur « 1,2,3 € » et signale ce qui n'est pas connu", () => {
      const resultat = findUnverifiedValues("Soit 1,2,3 € environ.", connus([]));
      expect(resultat.length).toBeGreaterThan(0);
    });

    it("ignore un symbole seul", () => {
      expect(findUnverifiedValues("Le symbole € seul, et % aussi.", connus([]))).toEqual([]);
    });

    it("signale tel quel un montant à plus de deux décimales", () => {
      expect(findUnverifiedValues("Il reste 12,345 €.", connus([1234, 1235]))).toEqual([
        "12,345 €",
      ]);
    });

    it("signale tel quel un montant supérieur au plafond de saisie", () => {
      const resultat = findUnverifiedValues("Il reste 99 999 999 999 €.", connus([]));
      expect(resultat).toHaveLength(1);
      expect(resultat[0]).toContain("99");
    });

    it("signale un nombre de plus de douze chiffres sans perte de précision", () => {
      const resultat = findUnverifiedValues("Il reste 1234567890123456 €.", connus([]));
      expect(resultat).toEqual(["1234567890123456 €"]);
    });
  });

  it("accepte un montant au plafond de saisie quand il est connu", () => {
    const texte = `Il reste ${formatCents(9_000_000_000)}.`;
    expect(findUnverifiedValues(texte, connus([9_000_000_000]))).toEqual([]);
  });
});

describe("findUnverifiedValues — pourcentages", () => {
  it("reconnaît un pourcentage connu, avec sa décimale ou arrondi", () => {
    expect(findUnverifiedValues("Taux de 60,4 %.", connus([], [60.4]))).toEqual([]);
    expect(findUnverifiedValues("Environ 60 %.", connus([], [60.4]))).toEqual([]);
  });

  it("signale un pourcentage absent", () => {
    expect(findUnverifiedValues("C'est 78 % du plafond.", connus([], [60.4]))).toEqual(["78 %"]);
    expect(findUnverifiedValues("C'est 61 %.", connus([], [60.4]))).toEqual(["61 %"]);
  });

  it("signale tout pourcentage quand aucun n'est connu", () => {
    expect(findUnverifiedValues("78,1 %", connus([]))).toEqual(["78,1 %"]);
  });

  it("ne confond pas un pourcentage et un montant", () => {
    expect(findUnverifiedValues("60 % de 400,00 €", connus([40000], [60]))).toEqual([]);
  });
});
