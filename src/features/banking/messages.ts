/**
 * Textes de la synchronisation bancaire (fonctionnalité 006).
 *
 * Voir specs/006-bank-sync/contracts/api-banking.md (§4 et §5).
 *
 * Chaque état est dit **en toutes lettres** (principe VII) : aucun ne repose sur une couleur ou
 * une icône seule.
 */

import type { ClientFailure } from "@/features/banking/client";
import type { BankError, InboxReason } from "@/features/banking/types";

export const BANKING_NOT_CONFIGURED =
  "Synchronisation bancaire non configurée sur ce serveur. Le reste du budget fonctionne normalement.";

export const IMPORT_FROM_HELP =
  "Les paiements faits à partir de cette date seront importés. Ne saisissez plus vos paiements carte à la main à partir de ce jour.";

export const BANK_ERROR_MESSAGES: Readonly<Record<BankError, string>> = {
  expired: "L’accès a expiré. Reconnectez la banque.",
  revoked: "L’accès a été retiré par la banque. Reconnectez-la.",
  noAccount:
    "La banque n’a renvoyé aucun compte utilisable. Vérifiez qu’il est lié dans le portail Enable Banking, puis reconnectez-la.",
  rateLimited: "La banque limite les consultations. Nouvel essai plus tard.",
  unavailable: "La banque est momentanément indisponible. Nouvel essai plus tard.",
};

export const CLIENT_FAILURE_MESSAGES: Readonly<Record<ClientFailure, string>> = {
  offline: "Serveur injoignable : les opérations bancaires seront récupérées au retour du réseau.",
  unauthorized: "Cet appareil n’est pas autorisé.",
  notConfigured: BANKING_NOT_CONFIGURED,
  invalidResponse: "Réponse du serveur illisible. Réessayez plus tard.",
  serverError: "Le serveur n’a pas pu interroger les banques. Réessayez plus tard.",
};

/** Retour de la banque, transmis par le paramètre `?banking=`. */
export const CALLBACK_MESSAGES: Readonly<Record<string, string>> = {
  connected: "Banque reliée. Ses opérations vont être récupérées.",
  error: "La liaison n’a pas abouti. Réessayez ; si l’erreur persiste, elle vient sans doute de la banque.",
  noAccount: BANK_ERROR_MESSAGES.noAccount,
  invalidState: "Cette liaison a expiré ou a déjà servi. Recommencez depuis le bouton « Relier ».",
};

export const INBOX_REASON_MESSAGES: Readonly<Record<InboxReason, string>> = {
  noRule: "Aucune règle ne s’applique.",
  possibleSubscription: "Ressemble à un abonnement déjà saisi.",
  ambiguousRoundUp: "Arrondi Revolut impossible à rattacher à un seul paiement.",
  foreignCurrency: "Montant dans une autre devise que l’euro.",
  unreadableDate: "Date de paiement illisible ; la date indiquée est celle du débit.",
};

export const INVALID_PATTERN = "Le motif doit faire au moins 2 caractères.";
