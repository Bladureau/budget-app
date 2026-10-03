import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, vi } from "vitest";

/**
 * Utilitaires de test pour la navigation par onglets (specs/007-navigation-menu, R9).
 *
 * Les panneaux inactifs portent `hidden` : `getByRole` les ignore. Un test qui cherche une
 * section hors de « Aujourd’hui » ouvre donc d’abord son onglet, comme le ferait l’utilisateur.
 */

/**
 * Panneau de l’onglet `nom`, qu’il soit visible ou non. Repéré par son attribut plutôt que par
 * son rôle : un élément `hidden` n’a pas de nom accessible, donc pas de rôle « region ».
 */
export function panneau(nom: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`section[aria-label="Onglet ${nom}"]`);
  if (element === null) throw new Error(`Panneau introuvable : Onglet ${nom}`);
  return element;
}

/**
 * Clique sur l’entrée `nom` du menu, puis attend que son panneau soit visible. Le menu
 * n’apparaît qu’une fois le budget chargé : on l’attend plutôt que de le supposer présent.
 */
export async function ouvrirOnglet(nom: string): Promise<void> {
  const menu = within(await screen.findByRole("navigation", { name: "Sections du budget" }));
  // Le menu remonte en haut de page, ce que jsdom n’implémente pas : neutralisé le temps du
  // seul clic, pour qu’un appel inattendu ailleurs reste visible.
  const retourEnHaut = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  try {
    await userEvent.click(menu.getByRole("link", { name: nom }));
  } finally {
    retourEnHaut.mockRestore();
  }
  await waitFor(() => {
    expect(panneau(nom)).toBeVisible();
  });
}

/**
 * Remet l’adresse à `/`. jsdom la conserve d’un test à l’autre : sans cela, un onglet ouvert
 * dans un test serait encore actif au début du suivant. À appeler dans `afterEach`.
 */
export function reinitialiserAdresse(): void {
  window.history.replaceState(null, "", "/");
}
