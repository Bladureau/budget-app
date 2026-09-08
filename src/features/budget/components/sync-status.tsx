"use client";

import { useBudget } from "@/features/budget/budget-provider";
import {
  SYNC_OFFLINE_PENDING,
  SYNC_STATE_MESSAGES,
} from "@/features/budget/messages";

/**
 * État de la synchronisation avec le stockage central (EF-018).
 *
 * **Porté par du texte, jamais par la couleur ou une icône seule** (principe VII) : retirer
 * la couleur ne doit rien faire perdre. La couleur ne fait que renforcer ce que le texte dit
 * déjà, exactement comme pour les libellés d'état des enveloppes.
 *
 * `aria-live="polite"` plutôt qu'`alert` : passer hors connexion mérite d'être annoncé, pas
 * d'interrompre la saisie en cours.
 */
export function SyncStatus() {
  const { syncState, pendingChanges, refreshFromServer } = useBudget();

  // Le cumul « hors connexion **et** modifications en attente » est le cas nominal du
  // récit 3. Il mérite son propre message : l'utilisateur doit apprendre d'un coup que sa
  // saisie est conservée et qu'elle n'est pas encore partie.
  const message =
    syncState === "offline" && pendingChanges
      ? SYNC_OFFLINE_PENDING
      : SYNC_STATE_MESSAGES[syncState];

  const enDefaut =
    syncState === "offline" ||
    syncState === "failed" ||
    syncState === "conflict" ||
    syncState === "unauthorized" ||
    pendingChanges;

  return (
    <div
      aria-live="polite"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
        enDefaut
          ? "border-amber-500/60 bg-amber-500/10"
          : "border-[var(--border)] bg-[var(--surface)]"
      }`}
    >
      <p className={enDefaut ? "font-medium" : "text-[var(--muted)]"}>{message}</p>

      {syncState === "unauthorized" ? (
        <a
          href="/authorize"
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 font-medium hover:bg-[var(--background)]"
        >
          Autoriser cet appareil
        </a>
      ) : syncState !== "syncing" && syncState !== "conflict" ? (
        <button
          type="button"
          onClick={refreshFromServer}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 font-medium hover:bg-[var(--background)]"
        >
          Synchroniser maintenant
        </button>
      ) : null}
    </div>
  );
}
