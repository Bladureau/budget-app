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

// --- Export et import des données (fonctionnalité 004) --------------------------------

import type { ImportRefusal } from "@/features/budget/transfer";

/**
 * Un message par motif de refus, chacun menant à une action corrective différente (CS-007).
 * Un message générique laisserait l'utilisateur sans savoir s'il s'est trompé de fichier,
 * s'il doit mettre à jour l'application, ou si sa sauvegarde est perdue.
 */
export const IMPORT_REFUSAL_MESSAGES: Readonly<Record<ImportRefusal, string>> = {
  notAnExport:
    "Ce fichier n’est pas une sauvegarde de cette application. Vérifiez que vous avez bien sélectionné un fichier produit par l’export.",
  futureVersion:
    "Ce fichier a été créé par une version plus récente de l’application. Mettez l’application à jour avant de l’importer.",
  corrupted:
    "Ce fichier est bien une sauvegarde de cette application, mais son contenu est abîmé ou incomplet. Utilisez une autre sauvegarde.",
};

export const EXPORT_FAILED =
  "La sauvegarde n’a pas pu être produite. Votre navigateur a peut-être bloqué le téléchargement.";

export const IMPORT_WRITE_FAILED =
  "Les données importées n’ont pas pu être enregistrées. Vos données précédentes sont intactes.";

export const EXPORT_REFLECTS_SAVED_DATA =
  "La sauvegarde porte sur vos données enregistrées. Une saisie en cours non validée n’y figure pas.";

export const DATA_STAYS_LOCAL =
  "Le fichier est enregistré sur cet appareil et n’est envoyé nulle part.";
