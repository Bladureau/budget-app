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

// --- Dépenses et anneau (fonctionnalité 003) ------------------------------------------

import type { RingStatus } from "@/features/budget/types";

/**
 * Libellés des quatre états de l'anneau. Le principe VII interdit que la couleur porte
 * seule l'information : ces libellés sont la source, la couleur ne fait que renforcer.
 */
export const RING_STATUS_LABELS: Readonly<Record<RingStatus, string>> = {
  untouched: "Rien de dépensé",
  inProgress: "En cours",
  exhausted: "Budget épuisé",
  overspent: "Dépassement",
};

// Sans « ci-dessous » ni « ci-dessus » : revenus, saisie et journal vivent dans des onglets
// différents (fonctionnalité 007). Le composant ajoute un lien vers l'onglet concerné.
export const NO_BUDGET_YET =
  "Renseignez vos revenus et vos abonnements pour connaître ce qu’il vous reste à dépenser.";

export const NOTHING_LEFT_TO_SPREAD =
  "Il n’y a plus rien à répartir sur les jours restants de ce mois.";

export const NO_CARRY_OVER = "Premier jour du mois : pas de report.";

export const EMPTY_JOURNAL = "Aucune dépense enregistrée.";

export const NO_SEARCH_RESULT = "Aucune dépense ne correspond à cette recherche.";

export const EXPENSE_DELETE_CONFIRM =
  "Supprimer cette dépense ? Elle sera retirée de vos totaux.";

// --- Enveloppes budgétaires (fonctionnalité 001) --------------------------------------

import type { EnvelopeState } from "@/features/budget/types";
import type { LimitError } from "@/lib/money";

/**
 * Libellés des quatre états d'enveloppe (EF-017). Comme pour l'anneau, ils sont la source de
 * l'information : la couleur ne fait que renforcer ce que le texte dit déjà.
 */
export const ENVELOPE_STATE_LABELS: Readonly<Record<EnvelopeState, string>> = {
  unused: "Non entamée",
  onTrack: "Maîtrisée",
  nearingLimit: "Proche du plafond",
  overBudget: "En dépassement",
};

export const NO_ENVELOPE_YET =
  "Aucun plafond défini pour ce mois. Ajoutez-en un pour suivre vos dépenses par catégorie.";

export const UNBUDGETED_EXPLANATION =
  "Dépenses sans plafond : catégories non budgétées et dépenses sans catégorie.";

export const ZERO_LIMIT_MEANING =
  "Un plafond de 0,00 € signifie « ne rien dépenser dans cette catégorie ».";

export const ENVELOPE_DELETE_HINT =
  "Ses dépenses basculeront dans « Non budgété ».";

export const NOTHING_TO_COPY =
  "Le mois précédent ne comporte aucun plafond : il n’y a rien à copier.";

export const COPY_REPLACE_CONFIRM =
  "Ce mois comporte déjà des plafonds. Les copier remplacera ceux qui existent.";

export const CATEGORY_REQUIRED = "Saisissez une catégorie.";

/**
 * Refus d'un plafond. Le message du négatif dit « négatif » et non « supérieur à zéro » :
 * zéro est ici accepté, et un message qui l'exclurait serait faux.
 */
export const LIMIT_ERROR_MESSAGES: Readonly<Record<LimitError, string>> = {
  empty: "Saisissez un plafond.",
  notANumber: "Le plafond doit être un nombre, par exemple 400 ou 250,50.",
  tooManyDecimals: "Le plafond ne peut pas comporter plus de deux décimales.",
  negative: "Le plafond ne peut pas être négatif. Zéro est accepté.",
  tooLarge: "Le plafond est trop élevé.",
};

// --- Réserve d'épargne (fonctionnalité 008) --------------------------------------------

import type { MonthsError } from "@/features/budget/reserve";

/** Refus du solde. Comme pour un plafond, zéro est accepté : le message ne doit pas l'exclure. */
export const RESERVE_BALANCE_ERROR_MESSAGES: Readonly<Record<LimitError, string>> = {
  empty: "Saisissez le solde de votre épargne.",
  notANumber: "Le solde doit être un nombre, par exemple 6000 ou 5250,50.",
  tooManyDecimals: "Le solde ne peut pas comporter plus de deux décimales.",
  negative: "Le solde ne peut pas être négatif. Zéro est accepté.",
  tooLarge: "Le solde est trop élevé.",
};

export const RESERVE_MONTHS_ERROR_MESSAGES: Readonly<Record<MonthsError, string>> = {
  empty: "Saisissez un nombre de mois.",
  notAnInteger: "Le nombre de mois doit être un nombre entier, par exemple 12.",
  outOfRange: "Le nombre de mois doit être compris entre 1 et 120.",
};

export const RESERVE_WRITE_FAILED =
  "La réserve n’a pas pu être enregistrée. Rien n’a été modifié.";

export const RESERVE_EXPLANATION =
  "Déclarez l’épargne sur laquelle vous vivez : elle est répartie sur le nombre de mois choisi et s’ajoute chaque mois à vos revenus. Ce que vous ne dépensez pas un mois reste disponible les mois suivants.";

export const RESERVE_BALANCE_HELP =
  "Saisissez le solde réel de votre épargne aujourd’hui. Vos revenus du mois sont toujours dépensés avant elle.";

export const RESERVE_UPDATE_HELP =
  "Saisissez le solde réel de votre épargne aujourd’hui. Le mois en cours repartira de ce solde ; les mois passés ne changent pas.";

/** FR-004 : l'épargne a pu être saisie comme revenu ponctuel, faute de mieux. */
export const RESERVE_ONE_OFF_REMINDER =
  "Ce mois-ci comporte un revenu ponctuel. Vérifiez que votre épargne n’y est pas déjà comptée, pour ne pas la compter deux fois.";

export const RESERVE_REMOVE_CONFIRM =
  "Retirer la réserve ? À partir de ce mois, le budget ne comptera plus que vos revenus, sans report d’un mois sur l’autre. Les mois passés gardent leurs montants.";

export const RESERVE_HORIZON_REACHED =
  "La durée prévue pour votre réserve est atteinte : tout ce qu’il en reste est désormais disponible chaque mois.";

export const RESERVE_OVERSPEND_NOTE = "Ce dépassement sera retiré de la réserve.";

/** États de l'épargne dans l'anneau (FR-016). Les montants arrivent déjà formatés. */
export function reserveUntouchedMessage(incomeLeft: string): string {
  return `Épargne non entamée — encore ${incomeLeft} de revenus avant d’y toucher.`;
}

export const RESERVE_UNTOUCHED_NO_MARGIN = "Épargne non entamée.";

export function reserveDrawnMessage(drawn: string, share: string): string {
  return `Épargne entamée : ${drawn} sur ${share}.`;
}

/** Réserve négative : jamais de montant négatif brut (FR-018). */
export function reserveShortfallMessage(shortfall: string): string {
  return `Réserve épuisée — découvert de ${shortfall}`;
}

// --- Synchronisation avec le stockage central (fonctionnalité 005) ---------------------

import type { SyncState } from "@/features/budget/types";

/**
 * Un libellé par état de synchronisation (EF-018, principe VII).
 *
 * Chaque message dit **où sont les données**, pas seulement ce qui se passe : « hors
 * connexion » n'apprend rien à qui veut savoir si sa dépense est perdue. C'est ce que
 * demande CS-008 — comprendre en moins de cinq secondes que ce qu'on voit n'est pas
 * synchronisé.
 */
export const SYNC_STATE_MESSAGES: Readonly<Record<SyncState, string>> = {
  idle: "Synchronisé",
  syncing: "Synchronisation en cours…",
  offline:
    "Hors connexion : ce budget est celui de la dernière synchronisation et peut ne pas être à jour.",
  pending: "Modifications enregistrées sur cet appareil, pas encore synchronisées.",
  conflict:
    "Un autre appareil a modifié ce budget. Vos modifications sont conservées ici : choisissez laquelle garder.",
  failed: "Échec de l’enregistrement. Vos saisies sont conservées sur cet appareil.",
  unauthorized: "Cet appareil n’est pas autorisé à accéder au budget central.",
};

/**
 * Cumul de `offline` et `pending`, cas nominal du récit 3. Il mérite son propre message :
 * l'utilisateur doit apprendre d'un coup les deux choses qui l'intéressent — sa saisie est
 * conservée, et elle n'est pas encore partie.
 */
export const SYNC_OFFLINE_PENDING =
  "Hors connexion : vos saisies sont conservées sur cet appareil et rejoindront le budget central au retour du réseau.";

export const SYNC_CONFLICT_KEEP_LOCAL = "Conserver mes modifications";
export const SYNC_CONFLICT_KEEP_LOCAL_HINT =
  "Les modifications faites sur l’autre appareil seront perdues.";
export const SYNC_CONFLICT_TAKE_REMOTE = "Reprendre la version du serveur";
export const SYNC_CONFLICT_TAKE_REMOTE_HINT =
  "Les modifications faites sur cet appareil seront perdues.";
export const SYNC_CONFLICT_EXPORT_HINT =
  "Vous pouvez télécharger une sauvegarde avant de choisir.";
