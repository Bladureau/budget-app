"use client";

import { useBudget } from "@/features/budget/budget-provider";
import {
  SYNC_CONFLICT_EXPORT_HINT,
  SYNC_CONFLICT_KEEP_LOCAL,
  SYNC_CONFLICT_KEEP_LOCAL_HINT,
  SYNC_CONFLICT_TAKE_REMOTE,
  SYNC_CONFLICT_TAKE_REMOTE_HINT,
  SYNC_STATE_MESSAGES,
} from "@/features/budget/messages";

/**
 * Conflit entre appareils : l'utilisateur tranche, l'application jamais (EF-024, EF-025).
 *
 * Trois principes tiennent cette interface :
 *
 *  1. **Chaque action énonce ce qu'elle fait perdre.** Un bouton « Garder » qui tairait sa
 *     conséquence transformerait un choix éclairé en piège.
 *  2. **Une troisième voie reste ouverte** : exporter avant de choisir. C'est le rôle que la
 *     constitution assigne à l'export, et il ne coûte ici aucune ligne de code — la section
 *     « Vos données » fonctionne déjà sur l'état courant.
 *  3. **Rien ne bloque.** Tant que l'utilisateur n'a pas choisi, la copie locale reste
 *     intacte et la saisie reste possible. Un conflit n'est pas une panne.
 */
export function ConflictDialog() {
  const { conflict, resolveConflictKeepLocal, resolveConflictTakeRemote } = useBudget();
  if (!conflict) return null;

  return (
    <section
      aria-label="Conflit de synchronisation"
      className="rounded-lg border border-amber-500/60 bg-amber-500/10 p-4 text-sm"
    >
      <h2 className="font-semibold">Modifications concurrentes</h2>
      <p className="mt-1">{SYNC_STATE_MESSAGES.conflict}</p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <div className="flex-1">
          <button
            type="button"
            onClick={resolveConflictKeepLocal}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium hover:bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {SYNC_CONFLICT_KEEP_LOCAL}
          </button>
          <p className="mt-1 text-[var(--muted)]">{SYNC_CONFLICT_KEEP_LOCAL_HINT}</p>
        </div>

        <div className="flex-1">
          <button
            type="button"
            onClick={resolveConflictTakeRemote}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-medium hover:bg-[var(--background)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            {SYNC_CONFLICT_TAKE_REMOTE}
          </button>
          <p className="mt-1 text-[var(--muted)]">{SYNC_CONFLICT_TAKE_REMOTE_HINT}</p>
        </div>
      </div>

      <p className="mt-3 text-[var(--muted)]">{SYNC_CONFLICT_EXPORT_HINT}</p>
    </section>
  );
}
