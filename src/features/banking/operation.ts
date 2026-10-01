/**
 * Validation d'une opération bancaire normalisée.
 *
 * Voir specs/006-bank-sync/data-model.md (§2).
 *
 * Module **pur**, partagé par deux frontières de confiance (principe IV) :
 *  - le navigateur, qui reçoit les opérations de `/api/banking/operations` ;
 *  - le serveur, qui relit son cache `banking.json`.
 *
 * Un seul validateur pour les deux, pour la même raison que l'analyseur du document (D10 de
 * 005) : deux validateurs finiraient par diverger.
 */

import { isValidIsoDate } from "@/lib/date";
import { BANK_SOURCES, OPERATION_KINDS } from "@/features/banking/types";
import type { BankOperation, BankOperationKind, BankSource } from "@/features/banking/types";

/** Plus grand montant accepté, aligné sur l'analyseur du document. */
const MAX_CENTS = 9_000_000_000;
const REF_MAX = 200;
const LABEL_MAX = 80;
const RAW_MAX = 500;

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function centimesValides(valeur: unknown, minimum: number): valeur is number {
  return (
    typeof valeur === "number" &&
    Number.isInteger(valeur) &&
    valeur >= minimum &&
    valeur <= MAX_CENTS
  );
}

function referenceValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && valeur.length > 0 && valeur.length <= REF_MAX;
}

function dateValide(valeur: unknown): valeur is string {
  return typeof valeur === "string" && isValidIsoDate(valeur);
}

/** Rend l'opération validée, ou `null`. Une opération invalide est écartée, jamais devinée. */
export function parseBankOperation(brut: unknown): BankOperation | null {
  if (!estObjet(brut)) return null;

  if (!referenceValide(brut.ref)) return null;
  if (typeof brut.bank !== "string" || !BANK_SOURCES.includes(brut.bank as BankSource)) {
    return null;
  }
  // La référence porte la banque en préfixe : une incohérence trahit une opération altérée.
  if (!brut.ref.startsWith(`${brut.bank}:`)) return null;

  if (!dateValide(brut.bookingDate)) return null;
  if (brut.paymentDate !== null && !dateValide(brut.paymentDate)) return null;
  if (!centimesValides(brut.amountCents, 0)) return null;
  if (typeof brut.currency !== "string" || !/^[A-Z]{3}$/.test(brut.currency)) return null;
  if (brut.direction !== "debit" && brut.direction !== "credit") return null;
  if (typeof brut.kind !== "string" || !OPERATION_KINDS.includes(brut.kind as BankOperationKind)) {
    return null;
  }
  if (typeof brut.label !== "string" || brut.label.length > LABEL_MAX) return null;
  if (typeof brut.rawLabel !== "string" || brut.rawLabel.length > RAW_MAX) return null;

  // L'arrondi fusionné et sa référence vont ensemble (R8).
  const arrondiPresent = brut.roundUpCents !== undefined;
  const referenceArrondiPresente = brut.roundUpRef !== undefined;
  if (arrondiPresent !== referenceArrondiPresente) return null;
  if (arrondiPresent && !centimesValides(brut.roundUpCents, 1)) return null;
  if (referenceArrondiPresente && !referenceValide(brut.roundUpRef)) return null;

  const operation: BankOperation = {
    ref: brut.ref,
    bank: brut.bank as BankSource,
    bookingDate: brut.bookingDate,
    paymentDate: brut.paymentDate,
    amountCents: brut.amountCents,
    currency: brut.currency,
    direction: brut.direction,
    kind: brut.kind as BankOperationKind,
    label: brut.label,
    rawLabel: brut.rawLabel,
  };
  if (centimesValides(brut.roundUpCents, 1) && referenceValide(brut.roundUpRef)) {
    operation.roundUpCents = brut.roundUpCents;
    operation.roundUpRef = brut.roundUpRef;
  }
  return operation;
}
