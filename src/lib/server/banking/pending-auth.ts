/**
 * Liaisons bancaires en cours : le paramètre `state`.
 *
 * Voir specs/006-bank-sync/research.md (R4).
 *
 * **Pourquoi le retour de banque n'est pas autorisé par le cookie.** Le cookie d'accès est
 * posé en `SameSite=Strict` : un navigateur ne l'envoie pas lors d'une navigation venue d'un
 * autre site, et le retour de la banque en est précisément une. Le retour est donc autorisé par
 * le `state` : émis seulement pour un appareil autorisé (`POST /api/banking/connect` exige le
 * cookie), aléatoire, valable 15 minutes, et **consommé** à la lecture.
 *
 * Conservé **en mémoire** : un redémarrage du serveur pendant les quinze minutes d'une liaison
 * oblige seulement à recommencer. Cela suppose une instance unique, ce qu'un déploiement
 * auto-hébergé garantit.
 */

import { randomBytes } from "node:crypto";

import type { BankSource } from "@/features/budget/types";

const DUREE_MS = 15 * 60 * 1000;

export interface PendingAuth {
  bank: BankSource;
  /** Fin de l'autorisation demandée à la banque, reprise à l'enregistrement de la session. */
  validUntil: string;
}

const enAttente = new Map<string, PendingAuth & { expiresAt: number }>();

function purger(maintenant: number): void {
  for (const [state, liaison] of enAttente) {
    if (liaison.expiresAt <= maintenant) enAttente.delete(state);
  }
}

/** Engendre un `state` de 32 octets aléatoires pour une liaison en cours. */
export function createPendingAuth(liaison: PendingAuth, maintenant: Date): string {
  purger(maintenant.getTime());
  const state = randomBytes(32).toString("base64url");
  enAttente.set(state, { ...liaison, expiresAt: maintenant.getTime() + DUREE_MS });
  return state;
}

/**
 * Rend la liaison associée à `state` et le **retire** : un `state` ne sert qu'une fois, qu'il
 * soit valide ou expiré. `null` s'il est inconnu, expiré ou déjà consommé.
 */
export function consumePendingAuth(state: string, maintenant: Date): PendingAuth | null {
  const liaison = enAttente.get(state);
  enAttente.delete(state);
  if (!liaison || liaison.expiresAt <= maintenant.getTime()) return null;
  return { bank: liaison.bank, validUntil: liaison.validUntil };
}
