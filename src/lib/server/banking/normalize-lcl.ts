/**
 * Normalisation d'une transaction LCL.
 *
 * Voir specs/006-bank-sync/contracts/normalisation.md (§2).
 *
 * LCL ne fournit ni nature structurée, ni nom de commerçant, ni date de paiement : tout est
 * dans le libellé multiligne. La première ligne donne la nature ; pour une carte, la ligne
 * `CB  <COMMERÇANT>  <JJ/MM/AA>` donne le commerçant et le **jour réel du paiement**, différent
 * du jour de débit (EF-014).
 *
 * Depuis fin octobre 2026, LCL renvoie un format **court** : une seule ligne (la ligne `CB …`
 * pour une carte, le bénéficiaire pour un virement) et aucune `entry_reference`. Les deux
 * formats sont lus ; sans référence, une référence est construite à partir du contenu (§2).
 */

import { createHash } from "node:crypto";

import { compareIso, isValidIsoDate } from "@/lib/date";
import type { BankOperation, BankOperationKind } from "@/features/banking/types";
import {
  LABEL_MAX,
  champsCommuns,
  compacter,
  libelleBrut,
  lignesDuLibelle,
  normaliserLot,
  tronquer,
} from "@/lib/server/banking/normalize-common";
import type { NormalizedBatch } from "@/lib/server/banking/normalize-common";

const LIGNE_CARTE = /^CB\s+/i;
const DATE_EN_FIN = /\s(\d{2})\/(\d{2})\/(\d{2})\s*$/;
/** Références techniques à ne jamais prendre pour un bénéficiaire : `SCR…`, `SCA…`, chiffres. */
const REFERENCE_TECHNIQUE = /^(SC[AR][0-9A-Z]*|\d+)$/i;

function nature(premiereLigne: string, direction: "debit" | "credit"): BankOperationKind {
  const ligne = premiereLigne.toUpperCase();
  // L'ordre compte : `CARTE ANNUL` est testé avant `CARTE`.
  if (ligne.startsWith("CARTE ANNUL")) return "cardRefund";
  // Format court : la ligne `CB …` est la seule, sans la ligne `CARTE` qui la précédait.
  if (ligne.startsWith("CARTE") || LIGNE_CARTE.test(ligne)) {
    return direction === "debit" ? "card" : "cardRefund";
  }
  if (ligne.startsWith("VIREMENT") || ligne.startsWith("VIR ")) {
    return direction === "debit" ? "transferOut" : "transferIn";
  }
  if (ligne.startsWith("PRELVT") || ligne.startsWith("PRLV")) {
    return direction === "debit" ? "directDebit" : "transferIn";
  }
  if (ligne.startsWith("COTISATION") || ligne.startsWith("FRAIS") || ligne.startsWith("COMMISSION")) {
    return "bankFee";
  }
  return "other";
}

/**
 * `26/09/26` → `2026-09-26`, validée comme date réelle. Une date postérieure au débit est
 * impossible pour un paiement carte : elle trahit une lecture erronée, et rend `null`.
 */
function datePaiement(ligne: string, bookingDate: string): string | null {
  const correspondance = DATE_EN_FIN.exec(` ${ligne}`);
  if (!correspondance) return null;
  const [, jour, mois, annee] = correspondance;
  const date = `20${annee}-${mois}-${jour}`;
  if (!isValidIsoDate(date)) return null;
  return compareIso(date, bookingDate) <= 0 ? date : null;
}

function commercant(ligne: string): string {
  return compacter(ligne.replace(LIGNE_CARTE, "").replace(DATE_EN_FIN, "").replace(/\s\d{2}\/\d{2}\/\d{1,2}$/, ""));
}

/**
 * Référence d'une transaction sans `entry_reference` : empreinte de ce qui la décrit. Deux
 * transactions identiques le même jour ont la même ; le lot les départage (`normalizeLclBatch`).
 */
function referenceConstruite(operation: Omit<BankOperation, "ref">): string {
  const contenu = [
    operation.bookingDate,
    operation.direction,
    operation.amountCents,
    operation.currency,
    operation.rawLabel.toUpperCase(),
  ].join("|");
  return `lcl:sans-ref:${createHash("sha256").update(contenu).digest("hex").slice(0, 24)}`;
}

export function normalizeLcl(brut: unknown): BankOperation | "pending" | null {
  const communs = champsCommuns("lcl", brut, { referenceFacultative: true });
  if (communs === null || communs === "pending") return communs;

  const lignes = lignesDuLibelle(brut as Record<string, unknown>);
  if (lignes.length === 0) return null;

  const kind = nature(lignes[0], communs.direction);
  let label = "";
  let paymentDate: string | null = null;

  if (kind === "card" || kind === "cardRefund") {
    const ligneCarte = lignes.find((ligne) => LIGNE_CARTE.test(ligne));
    if (ligneCarte) {
      label = commercant(ligneCarte);
      // Seul un paiement porte une date de paiement utile ; un remboursement compte au jour où
      // l'argent revient (contrat des règles, §2).
      if (kind === "card") paymentDate = datePaiement(ligneCarte, communs.bookingDate);
    }
  }

  if (label === "") {
    label = compacter(
      lignes.slice(1).find((ligne) => !REFERENCE_TECHNIQUE.test(ligne)) ?? lignes[0],
    );
  }

  const operation = {
    ...communs,
    paymentDate,
    kind,
    label: tronquer(label, LABEL_MAX),
    rawLabel: libelleBrut(lignes),
  };
  return operation.ref === "" ? { ...operation, ref: referenceConstruite(operation) } : operation;
}

/**
 * Deux transactions sans référence et identiques (deux recharges de 10 € le même jour) reçoivent
 * la même référence construite : la n-ième est suffixée `-n`, pour qu'aucune ne soit perdue.
 */
export function normalizeLclBatch(brutes: readonly unknown[]): NormalizedBatch {
  const lot = normaliserLot(brutes, normalizeLcl);
  const vues = new Map<string, number>();
  const operations = lot.operations.map((operation) => {
    if (!operation.ref.startsWith("lcl:sans-ref:")) return operation;
    const rang = (vues.get(operation.ref) ?? 0) + 1;
    vues.set(operation.ref, rang);
    return rang === 1 ? operation : { ...operation, ref: `${operation.ref}-${rang}` };
  });
  return { ...lot, operations };
}
