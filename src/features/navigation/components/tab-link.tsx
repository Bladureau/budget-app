"use client";

import type { MouseEvent, ReactNode } from "react";
import { tabHref } from "@/features/navigation/navigation";
import type { Tab } from "@/features/navigation/navigation";
import { navigateTo } from "@/features/navigation/use-active-tab";

/**
 * Lien vers un onglet, et éventuellement vers une section de cet onglet.
 *
 * Un vrai `<a href>` (principe VII) : clavier, focus et « ouvrir dans un nouvel onglet » viennent
 * du navigateur. Seul le clic simple est intercepté pour changer d'onglet sans rechargement.
 */
export function TabLink({
  tab,
  section,
  className,
  "aria-current": ariaCurrent,
  onNavigate,
  children,
}: {
  tab: Tab;
  section?: string;
  className?: string;
  "aria-current"?: "page";
  onNavigate?: () => void;
  children: ReactNode;
}) {
  const href = tabHref(tab, section);

  function surClic(evenement: MouseEvent<HTMLAnchorElement>) {
    if (
      evenement.button !== 0 ||
      evenement.ctrlKey ||
      evenement.metaKey ||
      evenement.shiftKey ||
      evenement.altKey
    ) {
      return;
    }
    evenement.preventDefault();

    const courante = window.location.pathname + window.location.search + window.location.hash;
    if (courante === href) {
      // Déjà à destination : pas d'entrée d'historique en double, seulement le défilement que
      // l'effet de la vue ne rejouerait pas, l'adresse n'ayant pas changé.
      if (section) document.getElementById(section)?.scrollIntoView({ block: "start" });
    } else {
      navigateTo(href);
    }
    onNavigate?.();
  }

  return (
    <a href={href} className={className} aria-current={ariaCurrent} onClick={surClic}>
      {children}
    </a>
  );
}
