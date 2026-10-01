/**
 * Normalisation d'une transaction Revolut, et fusion des arrondis.
 *
 * Voir specs/006-bank-sync/contracts/normalisation.md (§3) et research.md (R8).
 *
 * Revolut fournit une nature structurée (`bank_transaction_code.code`) et un nom de commerçant
 * propre. Sa particularité est l'**arrondi** « Revpoints Spare Change » : un virement distinct
 * qui complète chaque paiement à l'euro supérieur, et que l'utilisateur veut voir compté avec
 * son paiement (5,45 € + 0,55 € → 6,00 €).
 */

import type { BankOperation, BankOperationKind } from "@/features/banking/types";
import {
  LABEL_MAX,
  champsCommuns,
  compacter,
  estObjet,
  libelleBrut,
  lignesDuLibelle,
  normaliserLot,
  tronquer,
} from "@/lib/server/banking/normalize-common";
import type { NormalizedBatch } from "@/lib/server/banking/normalize-common";

const ARRONDI = /spare change/i;

function nature(code: unknown, direction: "debit" | "credit", lignes: readonly string[]): BankOperationKind {
  if (code === "CARD_PAYMENT") return direction === "debit" ? "card" : "cardRefund";
  if (code === "TOPUP") return "topUp";
  if (code === "TRANSFER") {
    if (lignes.some((ligne) => ARRONDI.test(ligne))) return "roundUp";
    return direction === "debit" ? "transferOut" : "transferIn";
  }
  return "other";
}

export function normalizeRevolut(brut: unknown): BankOperation | "pending" | null {
  const communs = champsCommuns("revolut", brut);
  if (communs === null || communs === "pending") return communs;

  const valeur = brut as Record<string, unknown>;
  const lignes = lignesDuLibelle(valeur);
  const code = estObjet(valeur.bank_transaction_code) ? valeur.bank_transaction_code.code : null;
  const kind = nature(code, communs.direction, lignes);

  const creancier = estObjet(valeur.creditor) ? valeur.creditor.name : null;
  const label = compacter(
    kind !== "roundUp" && typeof creancier === "string" && creancier.trim() !== ""
      ? creancier
      : (lignes[0] ?? ""),
  );

  return {
    ...communs,
    // Chez Revolut, la date de comptabilisation est celle du paiement (constaté).
    paymentDate: communs.bookingDate,
    kind,
    label: tronquer(label, LABEL_MAX),
    rawLabel: libelleBrut(lignes),
  };
}

export function normalizeRevolutBatch(brutes: readonly unknown[]): NormalizedBatch {
  return normaliserLot(brutes, normalizeRevolut);
}

/**
 * Rattache chaque arrondi à son paiement, sur **l'ensemble** des opérations en cache.
 *
 * Un arrondi va à un paiement si et seulement si : même jour, paiement de montant strictement
 * positif (une pré-autorisation à 0,00 € ne déclenche pas d'arrondi), arrondi de 1 à 100
 * centimes, somme multiple exact de 100 centimes, et **un seul** paiement candidat. Sinon,
 * l'arrondi reste seul (`roundUp`) et les règles l'enverront « À classer ».
 *
 * Idempotente : un paiement déjà complété n'est plus candidat, un arrondi déjà rattaché a
 * disparu de la liste.
 */
export function mergeRoundUps(operations: readonly BankOperation[]): BankOperation[] {
  const resultat = operations.map((operation) => ({ ...operation }));
  const rattaches = new Set<string>();

  for (const arrondi of resultat) {
    if (arrondi.kind !== "roundUp") continue;
    if (arrondi.amountCents < 1 || arrondi.amountCents > 100) continue;

    const candidats = resultat.filter(
      (paiement) =>
        paiement.kind === "card" &&
        paiement.direction === "debit" &&
        paiement.amountCents > 0 &&
        paiement.bookingDate === arrondi.bookingDate &&
        paiement.roundUpRef === undefined &&
        (paiement.amountCents + arrondi.amountCents) % 100 === 0,
    );
    if (candidats.length !== 1) continue;

    candidats[0].roundUpCents = arrondi.amountCents;
    candidats[0].roundUpRef = arrondi.ref;
    rattaches.add(arrondi.ref);
  }

  return resultat.filter((operation) => !rattaches.has(operation.ref));
}
