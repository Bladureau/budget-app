"use client";

import { useSyncExternalStore } from "react";
import { parseTab } from "@/features/navigation/navigation";
import type { Tab } from "@/features/navigation/navigation";

/**
 * Lecture et écriture de l'onglet actif dans l'adresse (specs/007-navigation-menu, R2).
 *
 * L'écriture passe par `history.pushState`, qui s'intègre au routeur Next.js sans rechargement ni
 * requête serveur : le changement d'onglet est instantané, y compris hors connexion.
 *
 * La lecture n'utilise pas `useSearchParams` : sur une page prérendue, il impose une frontière
 * `<Suspense>`, et hors du routeur — dans les tests qui rendent la vue — il renvoie `null` sans
 * jamais réagir à `pushState`. `useSyncExternalStore` lit l'adresse directement, comme le
 * fournisseur lit déjà le stockage, sans écart d'hydratation.
 */

/** Émis après chaque `pushState` : le navigateur, lui, ne signale que le retour et l'avance. */
export const NAVIGATION_EVENT = "budget:navigation";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(NAVIGATION_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(NAVIGATION_EVENT, onChange);
  };
}

/** Une chaîne plutôt qu'un objet : l'instantané doit rester égal à lui-même tant que rien ne change. */
function getSnapshot(): string {
  return window.location.search + window.location.hash;
}

/** Côté serveur, « Aujourd'hui » ; les onglets ne s'affichent de toute façon qu'après l'hydratation. */
function getServerSnapshot(): string {
  return "";
}

export function useActiveTab(): { tab: Tab; section: string | null } {
  const adresse = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const indexFragment = adresse.indexOf("#");
  const search = indexFragment === -1 ? adresse : adresse.slice(0, indexFragment);
  const fragment = indexFragment === -1 ? "" : adresse.slice(indexFragment + 1);
  return { tab: parseTab(search), section: decoderFragment(fragment) };
}

/** Un fragment mal encodé (`#%E0`) ferait lever `decodeURIComponent` : il ne vise alors rien. */
function decoderFragment(fragment: string): string | null {
  if (fragment === "") return null;
  try {
    return decodeURIComponent(fragment);
  } catch {
    return null;
  }
}

/** Ajoute une entrée d'historique : le bouton retour ramène à l'onglet précédent (FR-015). */
export function navigateTo(href: string): void {
  window.history.pushState(null, "", href);
  window.dispatchEvent(new Event(NAVIGATION_EVENT));
}
