/**
 * Navigation par onglets dans l'application montée (specs/007-navigation-menu, récits 3 et 4).
 *
 * Le serveur est simulé en mémoire, réduit à ce dont la navigation a besoin : budget central et
 * points d'entrée bancaires. Les liens internes visent des sections qui n'existent qu'avec des
 * données (élément « À classer », alerte bancaire, budget vide) : il faut un serveur pour les
 * faire apparaître.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ouvrirOnglet, panneau, reinitialiserAdresse } from "@/test/navigation";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";
import type { BankOperation } from "@/features/banking/types";
import { CALLBACK_MESSAGES } from "@/features/banking/messages";

const VIREMENT: BankOperation = {
  ref: "lcl:virement",
  bank: "lcl",
  bookingDate: "2026-09-10",
  paymentDate: null,
  amountCents: 35000,
  currency: "EUR",
  direction: "debit",
  kind: "transferOut",
  label: "VIR SEPA Mme JEANNE DUPONT OU",
  rawLabel: "VIREMENT · VIR SEPA Mme JEANNE DUPONT OU · MMS",
};

function banque(surcharge: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    bank: "lcl",
    connected: true,
    ibanSuffix: "XXXX",
    validUntil: "2099-01-01T00:00:00.000Z",
    lastFetchAt: "2026-09-10T12:00:00.000Z",
    lastError: null,
    discardedCount: 0,
    historyGap: false,
    ...surcharge,
  };
}

class ServeurSimule {
  revision = 1;
  document: BudgetDocument = emptyDocument();
  operations: BankOperation[] = [];
  banques: Record<string, unknown>[] = [banque()];

  reponse(statut: number, corps: unknown): Response {
    return new Response(JSON.stringify(corps), {
      status: statut,
      headers: { "Content-Type": "application/json" },
    });
  }

  handler = async (url: string, options?: RequestInit): Promise<Response> => {
    if (url.startsWith("/api/banking/status")) {
      return this.reponse(200, { configured: true, banks: this.banques });
    }
    if (url.startsWith("/api/banking/operations")) {
      return this.reponse(200, { operations: this.operations, banks: this.banques });
    }
    if (!options || options.method === "GET" || options.method === undefined) {
      return this.reponse(200, { revision: this.revision, updatedAt: null, document: this.document });
    }
    const corps = JSON.parse(String(options.body)) as { document: BudgetDocument };
    this.revision += 1;
    this.document = corps.document;
    return this.reponse(200, { revision: this.revision, updatedAt: new Date().toISOString() });
  };
}

let serveur: ServeurSimule;
const defilement = vi.fn();
const retourEnHaut = vi.fn();

beforeEach(() => {
  localStorage.clear();
  serveur = new ServeurSimule();
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => serveur.handler(url, options)));
  // Ni l'un ni l'autre n'existe dans jsdom.
  Element.prototype.scrollIntoView = defilement;
  vi.stubGlobal("scrollTo", retourEnHaut);
});

afterEach(() => {
  cleanup();
  reinitialiserAdresse();
  defilement.mockReset();
  retourEnHaut.mockReset();
  vi.unstubAllGlobals();
});

async function ouvrirApplication() {
  vi.resetModules();
  const { BudgetProvider } = await import("@/features/budget/budget-provider");
  const { BudgetView } = await import("@/features/budget/components/budget-view");
  render(
    <BudgetProvider>
      <BudgetView />
    </BudgetProvider>,
  );
  await screen.findByRole("navigation", { name: "Sections du budget" });
}

/** Élément sur lequel `scrollIntoView` a été appelé en dernier. */
function dernierDefilement(): Element | undefined {
  return defilement.mock.contexts.at(-1) as Element | undefined;
}

// --- Récit 3 : les liens internes mènent au bon onglet ------------------------------------

describe("récit 3 — liens internes", () => {
  it("le compteur « À classer » ouvre « Dépenses » sur la liste (FR-011)", async () => {
    const utilisateur = userEvent.setup();
    serveur.document = {
      ...serveur.document,
      banking: { ...serveur.document.banking, importFrom: "2026-09-01" },
    };
    serveur.operations = [VIREMENT];
    await ouvrirApplication();

    const compteur = await screen.findByRole("link", { name: "1 opération bancaire à classer" });
    await utilisateur.click(compteur);

    await waitFor(() => expect(panneau("Dépenses")).toBeVisible());
    expect(panneau("Aujourd’hui")).not.toBeVisible();
    await waitFor(() => expect(dernierDefilement()).toHaveAttribute("id", "a-classer"));
    expect(window.location.search).toBe("?onglet=depenses");
    expect(window.location.hash).toBe("#a-classer");
  });

  it("l'alerte bancaire ouvre « Réglages » sur « Mes banques » (FR-012)", async () => {
    const utilisateur = userEvent.setup();
    serveur.banques = [banque({ validUntil: new Date(Date.now() + 10 * 86_400_000).toISOString() })];
    await ouvrirApplication();

    await utilisateur.click(await screen.findByRole("link", { name: "Aller à « Mes banques »" }));

    await waitFor(() => expect(panneau("Réglages")).toBeVisible());
    await waitFor(() => expect(dernierDefilement()).toHaveAttribute("id", "titre-banques"));
  });

  it("le message de bienvenue renvoie à « Réglages », plus au bas de page (FR-013)", async () => {
    await ouvrirApplication();

    const bienvenue = await screen.findByRole("region", { name: "Bienvenue" });
    expect(bienvenue).not.toHaveTextContent(/bas de page/);
    expect(within(bienvenue).getByRole("link", { name: "l’onglet Réglages" })).toHaveAttribute(
      "href",
      "/?onglet=reglages#titre-donnees",
    );
  });

  it("l'anneau d'un mois sans revenus renvoie à l'onglet « Mois » (FR-013)", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirApplication();

    const anneau = screen.getByRole("region", { name: /^Reste à dépenser en / });
    expect(anneau).not.toHaveTextContent(/ci-dessous/);
    await utilisateur.click(within(anneau).getByRole("link", { name: "Ouvrir l’onglet Mois" }));

    await waitFor(() => expect(panneau("Mois")).toBeVisible());
    await waitFor(() => expect(dernierDefilement()).toHaveAttribute("id", "titre-revenus"));
  });

  it("le journal vide renvoie au formulaire de saisie de « Aujourd’hui » (FR-013)", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirApplication();
    await ouvrirOnglet("Dépenses");

    const journal = screen.getByRole("region", { name: "Mes dépenses" });
    expect(journal).not.toHaveTextContent(/ci-dessus/);
    await utilisateur.click(within(journal).getByRole("link", { name: "Saisir une dépense" }));

    await waitFor(() => expect(panneau("Aujourd’hui")).toBeVisible());
    await waitFor(() => expect(dernierDefilement()).toHaveAttribute("id", "titre-saisie"));
  });

  it("le retour de banque affiche « Réglages » avec son message (FR-018)", async () => {
    window.history.replaceState(null, "", "/?onglet=reglages&banking=connected");
    await ouvrirApplication();

    expect(panneau("Réglages")).toBeVisible();
    expect(await screen.findByText(CALLBACK_MESSAGES.connected)).toBeVisible();
    // Le message est retiré de l'adresse, l'onglet y reste.
    await waitFor(() => expect(window.location.search).toBe("?onglet=reglages"));
  });
});

// --- Récit 4 : garder sa place ------------------------------------------------------------

describe("récit 4 — garder sa place", () => {
  it("conserve une saisie en cours quand on change d'onglet (FR-017)", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirApplication();

    const saisie = within(screen.getByRole("region", { name: "Nouvelle dépense" }));
    await utilisateur.type(saisie.getByLabelText("Montant"), "18,90");
    await ouvrirOnglet("Réglages");
    await ouvrirOnglet("Aujourd’hui");

    expect(
      within(screen.getByRole("region", { name: "Nouvelle dépense" })).getByLabelText("Montant"),
    ).toHaveValue("18,90");
  });

  it("revient à l'onglet précédent avec le bouton retour (FR-015)", async () => {
    await ouvrirApplication();
    await ouvrirOnglet("Dépenses");

    window.history.back();

    await waitFor(() => expect(panneau("Aujourd’hui")).toBeVisible());
    expect(panneau("Dépenses")).not.toBeVisible();
  });

  it("rouvre l'onglet de l'adresse après une actualisation (FR-014)", async () => {
    window.history.replaceState(null, "", "/?onglet=mois");
    await ouvrirApplication();

    expect(panneau("Mois")).toBeVisible();
    expect(panneau("Aujourd’hui")).not.toBeVisible();
  });

  it("ouvre « Aujourd’hui », sans erreur, sur une adresse d'onglet inconnue (FR-016)", async () => {
    window.history.replaceState(null, "", "/?onglet=nimportequoi");
    await ouvrirApplication();

    expect(panneau("Aujourd’hui")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("remonte en haut de page quand on change d'onglet par le menu", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirApplication();

    // Clic direct plutôt que `ouvrirOnglet`, qui neutralise justement ce retour en haut.
    const menu = within(screen.getByRole("navigation", { name: "Sections du budget" }));
    await utilisateur.click(menu.getByRole("link", { name: "Mois" }));

    await waitFor(() => expect(panneau("Mois")).toBeVisible());
    expect(retourEnHaut).toHaveBeenCalledWith({ top: 0 });
  });
});
