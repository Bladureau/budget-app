"use client";

import { useId, useState } from "react";
import {
  buttonClassName,
  primaryButtonClassName,
} from "@/features/budget/components/form-field";
import type { BudgetDocument } from "@/features/budget/types";
import { formatIsoDateFr } from "@/lib/format";

export interface PreviewData {
  document: BudgetDocument;
  exportedAt: string | null;
}

/**
 * Aperçu présenté AVANT tout remplacement (EF-016 à EF-018).
 *
 * C'est la protection centrale de la fonctionnalité : un import est destructeur par nature,
 * et sans cet écran la fonctionnalité censée protéger les données deviendrait le moyen le
 * plus rapide de les détruire.
 */
export function ImportPreview({
  preview,
  currentDocument,
  onConfirm,
  onCancel,
}: {
  preview: PreviewData;
  currentDocument: BudgetDocument;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const idConfirmation = useId();
  const [confirme, setConfirme] = useState(false);

  const entrants = {
    revenus: preview.document.incomes.length,
    abonnements: preview.document.subscriptions.length,
  };
  const actuels = {
    revenus: currentDocument.incomes.length,
    abonnements: currentDocument.subscriptions.length,
  };

  const fichierVide = entrants.revenus === 0 && entrants.abonnements === 0;
  const applicationVide = actuels.revenus === 0 && actuels.abonnements === 0;

  const dateExport = preview.exportedAt
    ? formatIsoDateFr(preview.exportedAt.slice(0, 10))
    : null;

  return (
    <div className="space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div>
        <h3 className="font-semibold">Contenu de la sauvegarde</h3>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {dateExport
            ? `Sauvegarde du ${dateExport}.`
            : "La date de cette sauvegarde n’a pas pu être lue."}
        </p>
      </div>

      {/*
        Les compteurs « actuellement » ne sont pas décoratifs : sans eux, l’utilisateur ne
        peut pas mesurer ce qu’il perd.
      */}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
            <th scope="col" className="py-2 font-medium">
              Élément
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Dans le fichier
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Actuellement
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[var(--border)]">
            <th scope="row" className="py-2 text-left font-normal">
              Revenus
            </th>
            <td className="py-2 text-right tabular-nums">{entrants.revenus}</td>
            <td className="py-2 text-right tabular-nums">{actuels.revenus}</td>
          </tr>
          <tr>
            <th scope="row" className="py-2 text-left font-normal">
              Abonnements
            </th>
            <td className="py-2 text-right tabular-nums">{entrants.abonnements}</td>
            <td className="py-2 text-right tabular-nums">{actuels.abonnements}</td>
          </tr>
        </tbody>
      </table>

      <p className="rounded-md border border-[var(--deficit)] p-3 text-sm">
        <strong>Le contenu actuel sera remplacé</strong>, et non fusionné avec la sauvegarde.
        {fichierVide && !applicationVide ? (
          <>
            {" "}
            Cette sauvegarde est vide : <strong>l’application se retrouvera sans données.</strong>
          </>
        ) : null}
      </p>

      <label htmlFor={idConfirmation} className="flex items-start gap-2 text-sm">
        <input
          id={idConfirmation}
          type="checkbox"
          className="mt-0.5 size-4"
          checked={confirme}
          onChange={(e) => setConfirme(e.target.checked)}
        />
        <span>Je confirme le remplacement de mes données actuelles par cette sauvegarde.</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={primaryButtonClassName}
          disabled={!confirme}
          onClick={onConfirm}
        >
          Restaurer cette sauvegarde
        </button>
        <button type="button" className={buttonClassName} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}
