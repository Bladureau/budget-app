"use client";

import { useBudget } from "@/features/budget/budget-provider";

/**
 * Bandeaux des états de stockage décrits dans contracts/interface.md.
 *
 * Aucun échec n’est silencieux : ni un document illisible mis en quarantaine, ni une
 * écriture refusée.
 */
export function StorageNotice() {
  const { notice, dismissNotice } = useBudget();
  if (!notice) return null;

  const contenu =
    notice === "quarantined"
      ? {
          titre: "Données précédentes illisibles",
          texte:
            "Les données enregistrées sur cet appareil n’ont pas pu être lues. Elles ont été conservées et n’ont pas été détruites. L’application redémarre sur un budget vide.",
        }
      : {
          titre: "Modification non enregistrée",
          texte:
            "La dernière modification n’a pas pu être enregistrée sur cet appareil. Le stockage est peut-être plein ou indisponible. Ce qui est affiché reste correct, mais sera perdu à la fermeture.",
        };

  return (
    <div
      role="alert"
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{contenu.titre}</p>
          <p className="mt-1 text-[var(--muted)]">{contenu.texte}</p>
        </div>
        <button
          type="button"
          onClick={dismissNotice}
          className="shrink-0 rounded-md border border-[var(--border)] px-3 py-1.5 font-medium hover:bg-[var(--background)]"
        >
          Masquer
        </button>
      </div>
    </div>
  );
}
