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

  const CONTENUS = {
    quarantined: {
      titre: "Données précédentes illisibles",
      texte:
        "Les données enregistrées sur cet appareil n’ont pas pu être lues. Elles ont été conservées et n’ont pas été détruites. L’application redémarre sur un budget vide.",
    },
    writeFailed: {
      titre: "Modification non enregistrée",
      texte:
        "La dernière modification n’a pas pu être enregistrée sur cet appareil. Le stockage est peut-être plein ou indisponible. Ce qui est affiché reste correct, mais sera perdu à la fermeture.",
    },
    // Les deux motifs venus du serveur appellent des gestes opposés : les confondre
    // laisserait l’utilisateur sans savoir lequel s’applique.
    remoteUnreadable: {
      titre: "Budget central illisible",
      texte:
        "Le contenu du stockage central n’a pas pu être lu. Il a été conservé de côté et n’a pas été écrasé. Ce que vous voyez ici reste votre copie de travail : téléchargez-en une sauvegarde avant toute autre manipulation.",
    },
    remoteFutureVersion: {
      titre: "Budget central plus récent que cette application",
      texte:
        "Le stockage central a été écrit par une version plus récente de l’application. Il n’a pas été modifié ni déplacé. Mettez cette application à jour plutôt que d’enregistrer par-dessus.",
    },
  } as const;

  const contenu = CONTENUS[notice];

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
