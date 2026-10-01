/**
 * Présentation de l'état bancaire au navigateur.
 *
 * Voir specs/006-bank-sync/contracts/api-banking.md (§1).
 *
 * **Seul chemin** par lequel l'état bancaire du serveur sort vers le navigateur : il ne retient
 * que des champs sans danger. Ni `sessionId`, ni `accountUid`, ni `ibanHash`, ni opération. Un
 * champ ajouté à `BankConnection` n'atteint donc le navigateur que s'il est explicitement
 * recopié ici.
 */

import { BANK_SOURCES } from "@/features/banking/types";
import type { BankConnectionStatus, BankStatus } from "@/features/banking/types";
import { findConnection } from "@/lib/server/banking/banking-store";
import type { StoredBanking } from "@/lib/server/banking/banking-store";
import type { BankSource } from "@/features/budget/types";

function nonRelie(bank: BankSource): BankConnectionStatus {
  return {
    bank,
    connected: false,
    ibanSuffix: null,
    validUntil: null,
    lastFetchAt: null,
    lastError: null,
    discardedCount: 0,
    historyGap: false,
  };
}

export function publicStatus(
  etat: StoredBanking | null,
  trous: ReadonlySet<BankSource> = new Set(),
): BankStatus {
  if (!etat) return { configured: false, banks: BANK_SOURCES.map(nonRelie) };

  return {
    configured: true,
    banks: BANK_SOURCES.map((bank) => {
      const connexion = findConnection(etat, bank);
      if (!connexion) return nonRelie(bank);
      return {
        bank,
        connected: true,
        ibanSuffix: connexion.ibanSuffix,
        validUntil: connexion.validUntil,
        lastFetchAt: connexion.lastFetchAt,
        lastError: connexion.lastError,
        discardedCount: connexion.discardedCount,
        historyGap: trous.has(bank),
      };
    }),
  };
}
