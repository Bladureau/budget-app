/**
 * Types du domaine bancaire (fonctionnalité 006).
 *
 * Voir specs/006-bank-sync/data-model.md (§2) et contracts/api-banking.md.
 *
 * Les types qui font partie du **document persisté** (registre, « À classer », règles,
 * remboursement) sont définis dans `@/features/budget/types` et seulement réexportés ici :
 * les redéfinir ferait deux sources de vérité pour un même format de stockage.
 */

import type {
  BankOperationKind,
  BankSource,
  Cents,
  IsoDate,
} from "@/features/budget/types";

export type {
  BankOperationKind,
  BankSource,
  BankingState,
  CategoryRule,
  InboxItem,
  InboxReason,
  LedgerEntry,
  LedgerOutcome,
  Refund,
  TreatmentAction,
  TreatmentRule,
} from "@/features/budget/types";

export const BANK_SOURCES: readonly BankSource[] = ["lcl", "revolut"];

export const BANK_LABELS: Readonly<Record<BankSource, string>> = {
  lcl: "LCL",
  revolut: "Revolut",
};

export const OPERATION_KINDS: readonly BankOperationKind[] = [
  "card",
  "cardRefund",
  "transferOut",
  "transferIn",
  "directDebit",
  "bankFee",
  "topUp",
  "roundUp",
  "other",
];

/**
 * Une opération bancaire **normalisée** par le serveur. Le navigateur ne voit jamais le format
 * du fournisseur.
 */
export interface BankOperation {
  /** `"<banque>:<entry_reference>"` — stable d'une autorisation à l'autre (R2). */
  ref: string;
  bank: BankSource;
  bookingDate: IsoDate;
  /** LCL carte : date du libellé ; Revolut : date de comptabilisation ; sinon `null`. */
  paymentDate: IsoDate | null;
  /** Entier ≥ 0. Zéro est possible : une pré-autorisation. */
  amountCents: Cents;
  currency: string;
  direction: "debit" | "credit";
  kind: BankOperationKind;
  label: string;
  rawLabel: string;
  /** Arrondi Revolut fusionné dans ce paiement (R8). */
  roundUpCents?: Cents;
  roundUpRef?: string;
}

export type BankError = "expired" | "revoked" | "noAccount" | "rateLimited" | "unavailable";

/** État d'une banque tel que le serveur le présente. Aucune donnée sensible. */
export interface BankConnectionStatus {
  bank: BankSource;
  connected: boolean;
  ibanSuffix: string | null;
  validUntil: string | null;
  lastFetchAt: string | null;
  lastError: BankError | null;
  /** Opérations illisibles écartées à la normalisation, jamais devinées. */
  discardedCount: number;
  /** Vrai si l'historique récupéré présente probablement un trou (R3, NAS éteint). */
  historyGap: boolean;
}

export interface BankStatus {
  configured: boolean;
  banks: BankConnectionStatus[];
}
