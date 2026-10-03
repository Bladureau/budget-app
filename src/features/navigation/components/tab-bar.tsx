"use client";

import { TABS } from "@/features/navigation/navigation";
import { useActiveTab } from "@/features/navigation/use-active-tab";
import { TabLink } from "@/features/navigation/components/tab-link";
import { TAB_ICONS } from "@/features/navigation/components/tab-icons";

/**
 * Menu des onglets (specs/007-navigation-menu, R4 et R5).
 *
 * Un `<nav>` de liens plutôt que le motif ARIA « onglets » : c'est une navigation, et les liens
 * donnent le clavier et l'annonce « page actuelle » sans code (principe VII).
 *
 * Un seul élément, placé selon la largeur : barre fixée en bas sous `sm`, à portée de pouce ;
 * onglets dans le flux, sous l'en-tête, au-delà. La barre respecte la zone système en bas
 * (`safe-area-inset-bottom`, actif grâce à `viewportFit: "cover"` dans `layout.tsx`).
 *
 * L'entrée active se distingue par le gras et un trait, pas seulement par la couleur (FR-008).
 */
export function TabBar() {
  const { tab: actif } = useActiveTab();

  return (
    <nav
      aria-label="Sections du budget"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--border)] bg-[var(--background)] pr-[max(0.5rem,env(safe-area-inset-right))] pb-[env(safe-area-inset-bottom)] pl-[max(0.5rem,env(safe-area-inset-left))] sm:static sm:z-auto sm:mb-8 sm:border-t-0 sm:border-b sm:bg-transparent sm:p-0"
    >
      <ul className="grid auto-cols-fr grid-flow-col sm:flex sm:gap-2">
        {TABS.map(({ tab, label }) => {
          const Icone = TAB_ICONS[tab];
          const estActif = tab === actif;
          return (
            <li key={tab}>
              <TabLink
                tab={tab}
                aria-current={estActif ? "page" : undefined}
                // Retour en haut : sans cela, on arriverait dans le nouvel onglet à la hauteur où
                // l'on avait quitté le précédent. Le bouton retour garde le comportement natif.
                onNavigate={() => window.scrollTo({ top: 0 })}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-2 px-1 py-1.5 text-xs whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)] sm:min-h-11 sm:flex-row sm:gap-2 sm:border-t-0 sm:border-b-2 sm:px-3 sm:text-sm ${
                  estActif
                    ? "border-[var(--accent)] font-semibold text-[var(--accent)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Icone />
                {label}
              </TabLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
