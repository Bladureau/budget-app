import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "@/lib/storage";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

/**
 * Liste des règles de classement (specs/006-bank-sync, récit 6) : affichage dans l'ordre
 * d'évaluation, modification, suppression, usage au clavier.
 *
 * Le composant est monté seul sous le fournisseur, sur le stockage local : il ne dépend pas des
 * onglets ni du reste de la vue.
 */

function budget(surcharge: Partial<BudgetDocument["banking"]> = {}): BudgetDocument {
  const doc = emptyDocument();
  return { ...doc, banking: { ...doc.banking, importFrom: "2026-09-01", ...surcharge } };
}

function documentStocke(): BudgetDocument {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
}

async function monter() {
  vi.resetModules();
  const { BudgetProvider, useBudget } = await import("@/features/budget/budget-provider");
  const { RuleList } = await import("@/features/banking/components/rule-list");

  // La liste lit le document : on attend que le fournisseur l'ait chargé, comme le fait la vue.
  function Hote() {
    return useBudget().ready ? <RuleList /> : <p>Chargement…</p>;
  }
  render(
    <BudgetProvider>
      <Hote />
    </BudgetProvider>,
  );
  await waitFor(() => expect(screen.queryByText("Chargement…")).not.toBeInTheDocument());
}

function traitement() {
  return within(screen.getByRole("list", { name: "Opérations à ignorer ou à compter" }));
}

function categories() {
  return within(screen.getByRole("list", { name: "Catégories automatiques" }));
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(budget()));
});

afterEach(() => {
  cleanup();
});

describe("affichage", () => {
  it("liste les règles de traitement dans leur ordre d'évaluation, avec banque et action", async () => {
    await monter();

    const lignes = traitement().getAllByRole("listitem");
    expect(lignes.map((li) => li.textContent)).toEqual([
      expect.stringContaining("« LOYER » — LCL · Ignorer"),
      expect.stringContaining("« Bunq » — Revolut · Ignorer"),
      expect.stringContaining("« UMS-ULYS » — LCL · Compter en dépense"),
    ]);
  });

  it("liste les règles de catégorie dans leur ordre, avec leur catégorie", async () => {
    await monter();

    const lignes = categories().getAllByRole("listitem");
    expect(lignes).toHaveLength(budget().banking.categoryRules.length);
    expect(lignes[0].textContent).toContain("« Carrefour » — Courses");
  });

  it("nomme l'abonnement visé par une règle de rattachement", async () => {
    const doc = budget();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...doc,
        subscriptions: [
          {
            id: "abo-spotify",
            label: "Spotify",
            periodicity: "monthly",
            startDate: "2026-01-14",
            endDate: null,
            amounts: [{ amountCents: 707, effectiveFrom: "2026-01-14" }],
            pauses: [],
          },
        ],
        banking: {
          ...doc.banking,
          rules: [
            {
              id: "r-spotify",
              bank: "lcl",
              contains: "Spotify",
              action: { type: "subscription", subscriptionId: "abo-spotify" },
            },
          ],
        },
      }),
    );
    await monter();

    expect(traitement().getByRole("listitem").textContent).toContain(
      "« Spotify » — LCL · Déjà compté dans un abonnement (Spotify)",
    );
  });

  it("le dit quand une liste est vide", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(budget({ rules: [], categoryRules: [] })));
    await monter();
    expect(screen.getAllByText("Aucune règle.")).toHaveLength(2);
  });

  it("ne s'affiche pas tant que la synchronisation bancaire n'a pas servi", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyDocument()));
    await monter();
    expect(screen.queryByRole("region", { name: "Règles de classement" })).not.toBeInTheDocument();
  });
});

describe("suppression", () => {
  it("demande confirmation, et « Conserver » ne supprime rien", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    await utilisateur.click(screen.getByRole("button", { name: "Supprimer la règle LOYER" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Supprimer la règle « LOYER » ?");
    await utilisateur.click(screen.getByRole("button", { name: "Conserver" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(documentStocke().banking.rules).toHaveLength(3);
  });

  it("supprime une règle initiale comme une autre", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    await utilisateur.click(screen.getByRole("button", { name: "Supprimer la règle LOYER" }));
    await utilisateur.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() => {
      expect(documentStocke().banking.rules.map((r) => r.id)).toEqual([
        "initial:bunq",
        "initial:ulys",
      ]);
    });
    expect(screen.queryByText("« LOYER »")).not.toBeInTheDocument();
  });

  it("supprime une règle de catégorie sans toucher aux règles de traitement", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    await utilisateur.click(screen.getByRole("button", { name: "Supprimer la règle SNCF" }));
    await utilisateur.click(screen.getByRole("button", { name: "Confirmer la suppression" }));

    await waitFor(() => {
      expect(documentStocke().banking.categoryRules.map((r) => r.id)).not.toContain(
        "initial:cat-sncf",
      );
    });
    expect(documentStocke().banking.rules).toHaveLength(3);
  });
});

describe("modification", () => {
  it("corrige le motif d'une règle de traitement, sans changer son rang ni son action", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    await utilisateur.click(screen.getByRole("button", { name: "Modifier la règle LOYER" }));
    const champ = traitement().getByLabelText("Le libellé contient");
    expect(champ).toHaveValue("LOYER");
    // Une règle de traitement ne propose pas de catégorie.
    expect(traitement().queryByLabelText("Catégorie")).not.toBeInTheDocument();

    await utilisateur.clear(champ);
    await utilisateur.type(champ, "LOYER DUPONT");
    await utilisateur.click(traitement().getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(documentStocke().banking.rules[0]).toEqual({
        id: "initial:loyer",
        bank: "lcl",
        contains: "LOYER DUPONT",
        action: { type: "ignore" },
      });
    });
    expect(traitement().getAllByRole("listitem")[0].textContent).toContain("« LOYER DUPONT »");
  });

  it("corrige le motif et la catégorie d'une règle de catégorie", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    await utilisateur.click(screen.getByRole("button", { name: "Modifier la règle SNCF" }));
    const motif = categories().getByLabelText("Le libellé contient");
    const categorie = categories().getByLabelText("Catégorie");
    await utilisateur.clear(motif);
    await utilisateur.type(motif, "SNCF Connect");
    await utilisateur.clear(categorie);
    await utilisateur.type(categorie, "Voyages");
    await utilisateur.click(categories().getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(
        documentStocke().banking.categoryRules.find((r) => r.id === "initial:cat-sncf"),
      ).toEqual({ id: "initial:cat-sncf", contains: "SNCF Connect", category: "Voyages" });
    });
  });

  it("refuse un motif trop court par un message rattaché au champ, sans rien enregistrer", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    await utilisateur.click(screen.getByRole("button", { name: "Modifier la règle LOYER" }));
    const champ = traitement().getByLabelText("Le libellé contient");
    await utilisateur.clear(champ);
    await utilisateur.type(champ, "a");
    await utilisateur.click(traitement().getByRole("button", { name: "Enregistrer" }));

    expect(screen.getByText("Le motif doit faire entre 2 et 80 caractères.")).toBeInTheDocument();
    expect(champ).toHaveAttribute("aria-invalid", "true");
    expect(documentStocke().banking.rules[0].contains).toBe("LOYER");
  });

  it("refuse une catégorie vide", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    await utilisateur.click(screen.getByRole("button", { name: "Modifier la règle SNCF" }));
    await utilisateur.clear(categories().getByLabelText("Catégorie"));
    await utilisateur.click(categories().getByRole("button", { name: "Enregistrer" }));

    expect(
      screen.getByText("Saisissez une catégorie, de 80 caractères au plus."),
    ).toBeInTheDocument();
    expect(
      documentStocke().banking.categoryRules.find((r) => r.id === "initial:cat-sncf")?.category,
    ).toBe("Transport");
  });

  it("« Annuler » referme le formulaire sans rien changer", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    await utilisateur.click(screen.getByRole("button", { name: "Modifier la règle LOYER" }));
    await utilisateur.type(traitement().getByLabelText("Le libellé contient"), " MODIFIE");
    await utilisateur.click(traitement().getByRole("button", { name: "Annuler" }));

    expect(traitement().queryByLabelText("Le libellé contient")).not.toBeInTheDocument();
    expect(documentStocke().banking.rules[0].contains).toBe("LOYER");
  });
});

describe("au clavier", () => {
  it("modifie une règle sans la souris : Entrée ouvre, Entrée valide", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    screen.getByRole("button", { name: "Modifier la règle Bunq" }).focus();
    await utilisateur.keyboard("{Enter}");

    const champ = traitement().getByLabelText("Le libellé contient");
    champ.focus();
    await utilisateur.keyboard("{Control>}a{/Control}Bunq BV{Enter}");

    await waitFor(() => {
      expect(documentStocke().banking.rules[1].contains).toBe("Bunq BV");
    });
  });

  it("supprime une règle sans la souris", async () => {
    const utilisateur = userEvent.setup();
    await monter();

    screen.getByRole("button", { name: "Supprimer la règle Bunq" }).focus();
    await utilisateur.keyboard("{Enter}");
    screen.getByRole("button", { name: "Confirmer la suppression" }).focus();
    await utilisateur.keyboard("{Enter}");

    await waitFor(() => {
      expect(documentStocke().banking.rules.map((r) => r.id)).not.toContain("initial:bunq");
    });
  });
});
