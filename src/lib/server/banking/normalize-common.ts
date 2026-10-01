/**
 * Règles de normalisation communes aux deux banques.
 *
 * Voir specs/006-bank-sync/contracts/normalisation.md (§1).
 *
 * Fonctions **pures**. Une transaction mal formée rend `null` : elle est écartée et comptée par
 * l'appelant, jamais devinée.
 */

import { isValidIsoDate } from "@/lib/date";
import type { BankOperation } from "@/features/banking/types";
import type { BankSource, Cents } from "@/features/budget/types";

const MAX_CENTS = 9_000_000_000;
export const LABEL_MAX = 80;
const RAW_MAX = 500;

export function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/**
 * Convertit un montant **textuel** en centimes, sans jamais passer par un nombre à virgule
 * flottante (principe II, EF-036).
 *
 * Formes acceptées : `"50"`, `"35.8"`, `"33.82"`. Un signe éventuel est ignoré : le sens vient
 * de `credit_debit_indicator`. Tout le reste — virgule décimale, trois décimales, texte —
 * est refusé.
 */
export function montantEnCentimes(texte: unknown): Cents | null {
  if (typeof texte !== "string") return null;
  const correspondance = /^[+-]?(\d{1,10})(?:\.(\d{1,2}))?$/.exec(texte.trim());
  if (!correspondance) return null;

  const entier = Number.parseInt(correspondance[1], 10);
  const decimales = Number.parseInt((correspondance[2] ?? "").padEnd(2, "0"), 10);
  const centimes = entier * 100 + decimales;
  return centimes <= MAX_CENTS ? centimes : null;
}

/** Réduit les espaces multiples et retire ceux des bords. */
export function compacter(texte: string): string {
  return texte.replace(/\s+/g, " ").trim();
}

export function tronquer(texte: string, max: number): string {
  return texte.length <= max ? texte : texte.slice(0, max).trimEnd();
}

/** Lignes non vides de `remittance_information`, qu'elles soient en éléments ou en `\n`. */
export function lignesDuLibelle(brut: Record<string, unknown>): string[] {
  const elements = Array.isArray(brut.remittance_information) ? brut.remittance_information : [];
  return elements
    .filter((element): element is string => typeof element === "string")
    .flatMap((element) => element.split("\n"))
    .map((ligne) => ligne.trim())
    .filter((ligne) => ligne !== "");
}

export function libelleBrut(lignes: readonly string[]): string {
  return tronquer(lignes.map(compacter).join(" · "), RAW_MAX);
}

export type CommonFields = Pick<
  BankOperation,
  "ref" | "bank" | "bookingDate" | "amountCents" | "currency" | "direction"
>;

/**
 * Champs communs d'une transaction comptabilisée. `null` si la transaction est mal formée ;
 * `"pending"` si elle n'est pas comptabilisée (elle n'est alors ni traitée, ni comptée comme
 * illisible : elle reviendra comptabilisée, EF-009).
 */
export function champsCommuns(bank: BankSource, brut: unknown): CommonFields | "pending" | null {
  if (!estObjet(brut)) return null;
  if (brut.status !== "BOOK") return typeof brut.status === "string" ? "pending" : null;

  const reference = brut.entry_reference;
  if (typeof reference !== "string" || reference === "" || reference.length > 150) return null;

  const montant = estObjet(brut.transaction_amount) ? brut.transaction_amount : null;
  if (!montant) return null;
  const amountCents = montantEnCentimes(montant.amount);
  if (amountCents === null) return null;
  const currency = typeof montant.currency === "string" ? montant.currency.toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(currency)) return null;

  const direction =
    brut.credit_debit_indicator === "DBIT"
      ? "debit"
      : brut.credit_debit_indicator === "CRDT"
        ? "credit"
        : null;
  if (!direction) return null;

  const bookingDate = [brut.booking_date, brut.value_date].find(
    (date): date is string => typeof date === "string" && isValidIsoDate(date),
  );
  if (!bookingDate) return null;

  return { ref: `${bank}:${reference}`, bank, bookingDate, amountCents, currency, direction };
}

export interface NormalizedBatch {
  operations: BankOperation[];
  /** Transactions illisibles écartées : jamais devinées, mais comptées (normalisation §4). */
  discarded: number;
}

export function normaliserLot(
  brutes: readonly unknown[],
  normaliser: (brut: unknown) => BankOperation | "pending" | null,
): NormalizedBatch {
  const operations: BankOperation[] = [];
  let discarded = 0;
  for (const brut of brutes) {
    const resultat = normaliser(brut);
    if (resultat === null) discarded += 1;
    else if (resultat !== "pending") operations.push(resultat);
  }
  return { operations, discarded };
}
