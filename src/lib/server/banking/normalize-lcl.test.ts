// @vitest-environment node

/**
 * Normalisation LCL — contrat de normalisation §1 et §2.
 */

import { describe, expect, it } from "vitest";

import { normalizeLcl, normalizeLclBatch } from "@/lib/server/banking/normalize-lcl";
import { montantEnCentimes } from "@/lib/server/banking/normalize-common";
import { LCL_NATURES, MALFORMEES, lclCarte } from "@/lib/server/banking/fixtures";
import type { BankOperation } from "@/features/banking/types";

function normaliser(brut: unknown): BankOperation {
  const resultat = normalizeLcl(brut);
  if (resultat === null || resultat === "pending") throw new Error("transaction écartée");
  return resultat;
}

describe("montantEnCentimes (sans virgule flottante, EF-036)", () => {
  it.each([
    ["35.8", 3580],
    ["50", 5000],
    ["0.00", 0],
    ["33.82", 3382],
    ["-33.82", 3382],
    ["0.01", 1],
    ["9000000.00", 900_000_000],
    ["90000000.00", 9_000_000_000],
  ])("%s → %i centimes", (texte, centimes) => {
    expect(montantEnCentimes(texte)).toBe(centimes);
  });

  it.each(["1,5", "abc", "1.234", "", " ", "1e3", "90000000.01", "0x10"])("refuse %j", (texte) => {
    expect(montantEnCentimes(texte)).toBeNull();
  });

  it("refuse un nombre au lieu d'un texte", () => {
    expect(montantEnCentimes(33.82)).toBeNull();
  });

  it("conserve le centime là où la virgule flottante le perdrait", () => {
    // 0.1 + 0.2 en virgule flottante ≠ 0.3 ; ici, chaque montant est exact.
    expect([montantEnCentimes("0.10"), montantEnCentimes("0.20")]).toEqual([10, 20]);
    expect(montantEnCentimes("0.30")).toBe(30);
  });
});

describe("normalizeLcl — paiement carte", () => {
  it("extrait la date de paiement du libellé, distincte du débit", () => {
    expect(normaliser(LCL_NATURES.carte)).toEqual({
      ref: "lcl:l-carte",
      bank: "lcl",
      bookingDate: "2026-09-28",
      paymentDate: "2026-09-26",
      amountCents: 3382,
      currency: "EUR",
      direction: "debit",
      kind: "card",
      label: "PETROLEC SUD",
      rawLabel: "CARTE · 0000000 · CB PETROLEC SUD 26/09/26 · PAIEMENT A TOULOUSE",
    });
  });

  it("réduit les espaces du commerçant", () => {
    const operation = normaliser(LCL_NATURES.carteUberEats);
    expect(operation.label).toBe("UBER *EATS");
    expect(operation.paymentDate).toBe("2026-09-17");
  });

  it("reconnaît une recharge Revolut comme un paiement carte (les règles l'ignoreront)", () => {
    const operation = normaliser(LCL_NATURES.rechargeRevolut);
    expect(operation.kind).toBe("card");
    expect(operation.label).toBe("Revolut**0000*");
  });

  it("rend une date de paiement nulle si elle est invalide", () => {
    expect(normaliser(lclCarte("x", "2026-03-02", "1.00", "ICI", "31/02/26")).paymentDate).toBeNull();
  });

  it("rend une date de paiement nulle si elle est postérieure au débit", () => {
    expect(normaliser(lclCarte("x", "2026-09-28", "1.00", "ICI", "29/09/26")).paymentDate).toBeNull();
  });

  it("rend une date de paiement nulle si le libellé n'en porte pas", () => {
    expect(normaliser(lclCarte("x", "2026-09-28", "1.00", "ICI", "")).paymentDate).toBeNull();
  });
});

describe("normalizeLcl — natures", () => {
  it.each([
    ["remboursement", LCL_NATURES.remboursement, "cardRefund", "credit", "Twitch Interacti"],
    ["virement sortant", LCL_NATURES.virementSortant, "transferOut", "debit", "VIR SEPA Mme JEANNE DUPONT OU"],
    ["virement instantané", LCL_NATURES.virementInstantane, "transferOut", "debit", "VIR INST Jean Dupont"],
    ["virement entrant", LCL_NATURES.virementEntrant, "transferIn", "credit", "VIREMENT CAF EXEMPLE"],
    ["prélèvement", LCL_NATURES.prelevement, "directDebit", "debit", "PRLV SEPA UMS-ULYS MOBILITE"],
    ["cotisation", LCL_NATURES.cotisation, "bankFee", "debit", "COTISATION MENSUELLE CARTE 0000"],
    ["inconnue", LCL_NATURES.inconnue, "other", "debit", "INTERETS DEBITEURS"],
  ] as const)("%s", (_, brut, kind, direction, label) => {
    const operation = normaliser(brut);
    expect(operation.kind).toBe(kind);
    expect(operation.direction).toBe(direction);
    expect(operation.label).toBe(label);
  });

  it("ne date pas un virement ni un remboursement par le libellé", () => {
    expect(normaliser(LCL_NATURES.virementSortant).paymentDate).toBeNull();
    expect(normaliser(LCL_NATURES.remboursement).paymentDate).toBeNull();
  });

  it("garde le motif du virement dans le libellé brut, pour les règles (LOYER)", () => {
    expect(normaliser(LCL_NATURES.virementInstantane).rawLabel).toContain("Loyer Bureau");
  });

  it("n'utilise jamais une référence technique comme bénéficiaire", () => {
    expect(normaliser(LCL_NATURES.virementSortant).label).not.toMatch(/^SCA/);
  });
});

describe("normalizeLcl — transactions écartées", () => {
  it.each([
    ["montant à virgule", MALFORMEES.montantVirgule],
    ["montant en texte", MALFORMEES.montantTexte],
    ["sans référence", MALFORMEES.sansReference],
    ["sens inconnu", MALFORMEES.sensInconnu],
    ["pas un objet", MALFORMEES.pasUnObjet],
  ])("écarte une transaction %s", (_, brut) => {
    expect(normalizeLcl(brut)).toBeNull();
  });

  it("ne traite pas une transaction en attente, sans la compter comme illisible", () => {
    expect(normalizeLcl(MALFORMEES.enAttente)).toBe("pending");
  });

  it("compte les transactions écartées d'un lot sans faire échouer les autres", () => {
    const lot = normalizeLclBatch([
      LCL_NATURES.carte,
      MALFORMEES.montantVirgule,
      MALFORMEES.enAttente,
      LCL_NATURES.prelevement,
    ]);
    expect(lot.operations.map((o) => o.ref)).toEqual(["lcl:l-carte", "lcl:l-prlv"]);
    expect(lot.discarded).toBe(1);
  });
});
