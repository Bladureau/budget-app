"use client";

import { useBudget } from "@/features/budget/budget-provider";
import { buttonClassName } from "@/features/budget/components/form-field";

export interface ReportData {
  restoredIncomes: number;
  restoredSubscriptions: number;
}

/**
 * Compte rendu après un import réussi (EF-014) et retour arrière (EF-020).
 *
 * Le retour arrière tient en une seule action tant que la session dure : c'est le filet qui
 * rattrape l'utilisateur ayant confirmé le mauvais fichier.
 */
export function ImportReport({
  report,
  onUndone,
}: {
  report: ReportData;
  onUndone: () => void;
}) {
  const { undoImport, canUndoImport } = useBudget();

  function annuler() {
    if (undoImport()) onUndone();
  }

  return (
    <div
      role="status"
      className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
    >
      <p className="font-semibold">Sauvegarde restaurée</p>
      <p>
        {report.restoredIncomes}{" "}
        {report.restoredIncomes > 1 ? "revenus restaurés" : "revenu restauré"} et{" "}
        {report.restoredSubscriptions}{" "}
        {report.restoredSubscriptions > 1
          ? "abonnements restaurés"
          : "abonnement restauré"}
        .
      </p>

      {canUndoImport ? (
        <>
          <button type="button" className={buttonClassName} onClick={annuler}>
            Annuler cet import
          </button>
          <p className="text-[var(--muted)]">
            Le retour en arrière reste possible jusqu’à la fermeture de l’application.
          </p>
        </>
      ) : null}
    </div>
  );
}
