// @vitest-environment node

/**
 * Normalisation Revolut et fusion des arrondis — contrat de normalisation §3.
 */

import { describe, expect, it } from "vitest";

import {
  mergeRoundUps,
  normalizeRevolut,
  normalizeRevolutBatch,
} from "@/lib/server/banking/normalize-revolut";
import { REVOLUT_SEPTEMBRE, revolutBrute } from "@/lib/server/banking/fixtures";
import type { BankOperation } from "@/features/banking/types";

function lot(brutes: readonly unknown[]): BankOperation[] {
  return normalizeRevolutBatch(brutes).operations;
}

describe("normalizeRevolut — natures", () => {
  it.each([
    [revolutBrute("a", "2026-09-29", "5.45", "DBIT", "CARD_PAYMENT", "Casino Shop"), "card", "Casino Shop"],
    [revolutBrute("b", "2026-09-29", "5.45", "CRDT", "CARD_PAYMENT", "Casino Shop"), "cardRefund", "Casino Shop"],
    [revolutBrute("c", "2026-09-29", "10.00", "CRDT", "TOPUP", "Top-Up by *0000", null), "topUp", "Top-Up by *0000"],
    [revolutBrute("d", "2026-09-29", "0.55", "DBIT", "TRANSFER", "Revpoints Spare Change", "Jean Dupont"), "roundUp", "Revpoints Spare Change"],
    [revolutBrute("e", "2026-09-29", "20.00", "DBIT", "TRANSFER", "Vers Jean"), "transferOut", "Vers Jean"],
    [revolutBrute("f", "2026-09-29", "20.00", "CRDT", "TRANSFER", "De Jean"), "transferIn", "De Jean"],
    [revolutBrute("g", "2026-09-29", "1.00", "DBIT", "FEE", "Frais"), "other", "Frais"],
  ] as const)("%#", (brut, kind, label) => {
    const operation = normalizeRevolut(brut);
    expect(operation).toMatchObject({ kind, label, paymentDate: "2026-09-29" });
  });
});

describe("mergeRoundUps — septembre 2026", () => {
  const operations = mergeRoundUps(lot(REVOLUT_SEPTEMBRE));
  const parCommercant = (label: string, jour: string) =>
    operations.find((o) => o.label === label && o.bookingDate === jour);

  it("rattache les 9 arrondis et les retire de la liste", () => {
    expect(operations.filter((o) => o.kind === "roundUp")).toEqual([]);
    expect(operations).toHaveLength(28 - 9);
  });

  it.each([
    ["Casino Shop", "2026-09-29", 545, 55],
    ["Carrefour City", "2026-09-28", 199, 1],
    ["Bunq", "2026-09-27", 5000, 100],
    ["Volterra", "2026-09-26", 1400, 100],
    ["Burger King", "2026-09-22", 155, 45],
    ["Tisseo Voyageur", "2026-09-21", 720, 80],
    ["Carrefourmarket", "2026-09-16", 484, 16],
    ["Sncf-voyageurs", "2026-09-15", 1530, 70],
    ["Carrefourmarket", "2026-09-12", 3060, 40],
  ])("%s du %s : %i + %i centimes, total rond", (label, jour, montant, arrondi) => {
    const paiement = parCommercant(label, jour);
    expect(paiement?.amountCents).toBe(montant);
    expect(paiement?.roundUpCents).toBe(arrondi);
    expect((montant + arrondi) % 100).toBe(0);
  });

  it("ne rattache jamais un arrondi à une pré-autorisation à 0,00 €", () => {
    expect(parCommercant("Fairtiq", "2026-09-27")?.roundUpCents).toBeUndefined();
    expect(operations.filter((o) => o.label === "Google *temporary Hold" && o.roundUpCents)).toEqual([]);
  });

  it("est idempotente", () => {
    expect(mergeRoundUps(operations)).toEqual(operations);
  });
});

describe("mergeRoundUps — cas limites", () => {
  it("laisse un arrondi ambigu seul", () => {
    const operations = mergeRoundUps(
      lot([
        revolutBrute("p1", "2026-10-02", "2.30", "DBIT", "CARD_PAYMENT", "A"),
        revolutBrute("p2", "2026-10-02", "4.30", "DBIT", "CARD_PAYMENT", "B"),
        revolutBrute("a", "2026-10-02", "0.70", "DBIT", "TRANSFER", "Revpoints Spare Change"),
      ]),
    );
    expect(operations.find((o) => o.ref === "revolut:a")?.kind).toBe("roundUp");
    expect(operations.every((o) => o.roundUpCents === undefined)).toBe(true);
  });

  it("laisse seul un arrondi sans paiement le même jour", () => {
    const operations = mergeRoundUps(
      lot([
        revolutBrute("p1", "2026-10-01", "2.30", "DBIT", "CARD_PAYMENT", "A"),
        revolutBrute("a", "2026-10-02", "0.70", "DBIT", "TRANSFER", "Revpoints Spare Change"),
      ]),
    );
    expect(operations).toHaveLength(2);
  });

  it("refuse un arrondi au-delà d'un euro", () => {
    const operations = mergeRoundUps(
      lot([
        revolutBrute("p1", "2026-10-02", "8.00", "DBIT", "CARD_PAYMENT", "A"),
        revolutBrute("a", "2026-10-02", "2.00", "DBIT", "TRANSFER", "Revpoints Spare Change"),
      ]),
    );
    expect(operations.find((o) => o.ref === "revolut:a")?.kind).toBe("roundUp");
  });
});
