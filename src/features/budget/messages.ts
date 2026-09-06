/**
 * Messages d’erreur de saisie, en français (principe VIII).
 *
 * Ils sont textuels et rattachés au champ concerné : le principe VII interdit de signaler
 * une erreur par la seule couleur.
 */

import type { AmountError } from "@/lib/money";

export const AMOUNT_ERROR_MESSAGES: Readonly<Record<AmountError, string>> = {
  empty: "Saisissez un montant.",
  notANumber: "Le montant doit être un nombre, par exemple 12,40.",
  tooManyDecimals: "Le montant ne peut pas comporter plus de deux décimales.",
  notPositive: "Le montant doit être supérieur à zéro.",
  tooLarge: "Le montant est trop élevé.",
};

export const DATE_INVALID = "Saisissez une date valide.";
export const LABEL_REQUIRED = "Saisissez un libellé.";
export const LABEL_TOO_LONG = "Le libellé ne peut pas dépasser 80 caractères.";
export const END_BEFORE_START =
  "La date de fin ne peut pas être antérieure à la date de début.";
