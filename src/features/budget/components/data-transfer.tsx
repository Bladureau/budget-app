"use client";

import { useId, useRef, useState } from "react";
import { useBudget } from "@/features/budget/budget-provider";
import {
  inputClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import {
  ImportPreview,
  type PreviewData,
} from "@/features/budget/components/import-preview";
import {
  ImportReport,
  type ReportData,
} from "@/features/budget/components/import-report";
import {
  DATA_STAYS_LOCAL,
  EXPORT_FAILED,
  EXPORT_REFLECTS_SAVED_DATA,
  IMPORT_REFUSAL_MESSAGES,
  IMPORT_WRITE_FAILED,
} from "@/features/budget/messages";

type Etape =
  | { nom: "repos" }
  | { nom: "lecture" }
  | { nom: "apercu"; donnees: PreviewData }
  | { nom: "importe"; compteRendu: ReportData };

/**
 * Section « Vos données » : export et import (fonctionnalité 004).
 *
 * INVARIANT CENTRAL : aucun chemin ne mène de la sélection d'un fichier à une écriture sans
 * passage par l'aperçu et confirmation explicite. `prepareImport` n'écrit rien ; seul
 * `confirmImport`, appelé depuis l'aperçu, écrit.
 */
export function DataTransfer() {
  const { document: documentCourant, exportData, prepareImport, confirmImport } = useBudget();
  const idFichier = useId();
  const champFichier = useRef<HTMLInputElement>(null);

  const [etape, setEtape] = useState<Etape>({ nom: "repos" });
  const [erreur, setErreur] = useState<string | null>(null);

  function reinitialiserChamp() {
    // Sans cela, resélectionner le même fichier ne déclencherait aucun événement.
    if (champFichier.current) champFichier.current.value = "";
  }

  function exporter() {
    setErreur(exportData() ? null : EXPORT_FAILED);
  }

  async function choisirFichier(evenement: React.ChangeEvent<HTMLInputElement>) {
    const fichier = evenement.target.files?.[0];
    if (!fichier) return;

    setErreur(null);
    setEtape({ nom: "lecture" });

    let contenu: string;
    try {
      contenu = await fichier.text();
    } catch {
      setErreur(IMPORT_REFUSAL_MESSAGES.notAnExport);
      setEtape({ nom: "repos" });
      reinitialiserChamp();
      return;
    }

    const resultat = prepareImport(contenu);
    reinitialiserChamp();

    if (!resultat.ok) {
      // Refus : aucune donnée n'a été touchée, `prepareImport` n'écrit jamais.
      setErreur(IMPORT_REFUSAL_MESSAGES[resultat.reason]);
      setEtape({ nom: "repos" });
      return;
    }

    setEtape({
      nom: "apercu",
      donnees: { document: resultat.document, exportedAt: resultat.exportedAt },
    });
  }

  function confirmer(donnees: PreviewData) {
    if (!confirmImport(donnees.document)) {
      setErreur(IMPORT_WRITE_FAILED);
      setEtape({ nom: "repos" });
      return;
    }
    setErreur(null);
    setEtape({
      nom: "importe",
      compteRendu: {
        restoredIncomes: donnees.document.incomes.length,
        restoredSubscriptions: donnees.document.subscriptions.length,
      },
    });
  }

  return (
    <section aria-labelledby="titre-donnees" className="space-y-4">
      <div>
        <h2 id="titre-donnees" className="text-lg font-semibold">
          Vos données
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">{DATA_STAYS_LOCAL}</p>
      </div>

      <div className="space-y-3 rounded-lg border border-[var(--border)] p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={primaryButtonClassName} onClick={exporter}>
            Télécharger une sauvegarde
          </button>
          <p className="text-sm text-[var(--muted)]">{EXPORT_REFLECTS_SAVED_DATA}</p>
        </div>

        <div className="border-t border-[var(--border)] pt-3">
          <label htmlFor={idFichier} className="block text-sm font-medium">
            Restaurer une sauvegarde
          </label>
          <input
            ref={champFichier}
            id={idFichier}
            type="file"
            accept="application/json,.json"
            className={`${inputClassName} mt-1 file:mr-3 file:rounded file:border-0 file:bg-[var(--surface)] file:px-3 file:py-1 file:text-sm`}
            onChange={choisirFichier}
            disabled={etape.nom === "lecture"}
            aria-describedby={erreur ? "erreur-import" : undefined}
            aria-invalid={Boolean(erreur)}
          />
        </div>

        {etape.nom === "lecture" ? (
          <p role="status" className="text-sm text-[var(--muted)]">
            Lecture du fichier en cours…
          </p>
        ) : null}

        {erreur ? (
          <p id="erreur-import" role="alert" className="text-sm text-[var(--deficit)]">
            {erreur}
          </p>
        ) : null}
      </div>

      {etape.nom === "apercu" ? (
        <ImportPreview
          preview={etape.donnees}
          currentDocument={documentCourant}
          onConfirm={() => confirmer(etape.donnees)}
          onCancel={() => setEtape({ nom: "repos" })}
        />
      ) : null}

      {etape.nom === "importe" ? (
        <ImportReport
          report={etape.compteRendu}
          onUndone={() => setEtape({ nom: "repos" })}
        />
      ) : null}
    </section>
  );
}
