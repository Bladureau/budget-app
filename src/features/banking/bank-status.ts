/**
 * État affichable d'une banque reliée (récit 5).
 *
 * Voir specs/006-bank-sync/spec.md (EF-004, EF-005, CS-008) et contracts/api-banking.md (§5).
 *
 * Fonction **pure** : la date courante est passée en paramètre, ce qui rend le seuil des
 * 14 jours testable sans simuler l'horloge — comme l'allocation quotidienne.
 *
 * L'expiration est déduite de `validUntil` **et** de l'erreur rapportée par la banque : une
 * autorisation échue pendant que le serveur était éteint doit se voir dès l'ouverture, avant
 * même qu'une récupération n'ait échoué.
 */

import { BANK_ERROR_MESSAGES } from "@/features/banking/messages";
import { BANK_LABELS } from "@/features/banking/types";
import type { BankConnectionStatus } from "@/features/banking/types";

/** Délai d'avertissement avant l'expiration (EF-004). */
export const EXPIRY_WARNING_DAYS = 14;

const JOUR_MS = 86_400_000;

export type BankHealth =
  | "notConnected"
  | "ok"
  | "expiringSoon"
  | "expired"
  | "revoked"
  | "noAccount"
  | "rateLimited"
  | "unavailable";

export interface BankDisplay {
  health: BankHealth;
  /** Vrai si l'utilisateur doit agir : relier ou reconnecter la banque. */
  needsReconnect: boolean;
  /** Vrai si l'état mérite d'être signalé dès l'ouverture, hors du panneau des banques. */
  alert: boolean;
  /** Message complet, en toutes lettres (principe VII). `null` quand tout va bien. */
  message: string | null;
}

const formateurDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
const formateurHorodatage = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

/** Jours entiers restants avant `validUntil`, arrondis à l'inférieur. Négatif si échue. */
export function daysUntil(validUntil: string, now: Date): number {
  return Math.floor((Date.parse(validUntil) - now.getTime()) / JOUR_MS);
}

function derniereRecuperation(etat: BankConnectionStatus): string {
  return etat.lastFetchAt
    ? ` Dernière récupération réussie le ${formateurHorodatage.format(new Date(etat.lastFetchAt))}.`
    : " Aucune récupération réussie pour l’instant.";
}

export function bankDisplay(etat: BankConnectionStatus, now: Date): BankDisplay {
  const nom = BANK_LABELS[etat.bank];

  if (!etat.connected) {
    return { health: "notConnected", needsReconnect: true, alert: false, message: null };
  }

  const expireLe = etat.validUntil ? formateurDate.format(new Date(etat.validUntil)) : null;
  const dateDepassee = etat.validUntil !== null && Date.parse(etat.validUntil) <= now.getTime();

  if (dateDepassee || etat.lastError === "expired") {
    // La date n'est citée que si elle est passée : une banque peut déclarer l'accès expiré
    // avant le terme prévu, et « a expiré le 30 mars » serait faux un 1er mars.
    return {
      health: "expired",
      needsReconnect: true,
      alert: true,
      message: `L’accès à ${nom} a expiré${dateDepassee ? ` le ${expireLe}` : ""}. Reconnectez la banque.${derniereRecuperation(etat)}`,
    };
  }

  if (etat.lastError === "revoked" || etat.lastError === "noAccount") {
    return {
      health: etat.lastError,
      needsReconnect: true,
      alert: true,
      message: `${nom} : ${BANK_ERROR_MESSAGES[etat.lastError]}${derniereRecuperation(etat)}`,
    };
  }

  if (etat.lastError === "rateLimited" || etat.lastError === "unavailable") {
    // Passager : l'utilisateur n'a rien à faire, la prochaine récupération réessaiera. Signalé
    // dans le panneau, pas en alerte à l'ouverture.
    return {
      health: etat.lastError,
      needsReconnect: false,
      alert: false,
      message: `${nom} : ${BANK_ERROR_MESSAGES[etat.lastError]}${derniereRecuperation(etat)}`,
    };
  }

  if (etat.validUntil !== null) {
    const jours = daysUntil(etat.validUntil, now);
    if (jours < EXPIRY_WARNING_DAYS) {
      const delai = jours <= 0 ? "aujourd’hui" : jours === 1 ? "demain" : `dans ${jours} jours`;
      return {
        health: "expiringSoon",
        needsReconnect: true,
        alert: true,
        message: `L’accès à ${nom} expire ${delai}, le ${expireLe}. Reconnectez la banque pour ne pas interrompre la synchronisation.`,
      };
    }
  }

  return { health: "ok", needsReconnect: false, alert: false, message: null };
}
