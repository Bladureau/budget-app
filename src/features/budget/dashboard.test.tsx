import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "@/lib/storage";
import type { BudgetDocument } from "@/features/budget/types";

/**
 * Tests d'intégration du tableau de bord : saisie → fournisseur → stockage → calculs →
 * anneau, allocation et journal.
 *
 * Ils couvrent les scénarios 2, 3 et 7 du guide de validation, et vérifient EF-030 : toute
 * mutation met à jour l'affichage sans action de rafraîchissement.
 */

/** Date du jour, en heure locale, comme le fournisseur la calcule. */
function aujourdHui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Document de départ : 900,00 € disponibles ce mois, aucune dépense. */
function documentAvecBudget(expenses: BudgetDocument["expenses"] = []): BudgetDocument {
  return {
    version: 3,
    incomes: [
      {
        id: "revenu",
        label: "Salaire",
        amountCents: 90000,
        kind: "oneOff",
        date: aujourdHui(),
      },
    ],
    subscriptions: [],
    expenses,
    envelopes: [],
  };
}

async function monterVue() {
  vi.resetModules();
  const { BudgetProvider } = await import("@/features/budget/budget-provider");
  const { BudgetView } = await import("@/features/budget/components/budget-view");

  render(
    <BudgetProvider>
      <BudgetView />
    </BudgetProvider>,
  );

  await waitFor(() => {
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument();
  });
}

function normaliser(valeur: string): string {
  return valeur.replace(/\s/g, " ");
}

function sectionSaisie() {
  return within(screen.getByRole("region", { name: "Nouvelle dépense" }));
}

function sectionJournal() {
  return within(screen.getByRole("region", { name: "Mes dépenses" }));
}

function documentStocke(): BudgetDocument | null {
  const brut = localStorage.getItem(STORAGE_KEY);
  return brut === null ? null : JSON.parse(brut);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(documentAvecBudget()));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Tableau de bord — saisie d'une dépense (scénario 2)", () => {
  it("enregistre la dépense et met à jour l'affichage sans rafraîchissement (EF-030)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.type(sectionSaisie().getByLabelText("Montant"), "22,50");
    await utilisateur.click(sectionSaisie().getByRole("button", { name: "Enregistrer" }));

    // L'anneau reflète la dépense : 900,00 € − 22,50 € = 877,50 €.
    await waitFor(() => {
      const anneau = within(screen.getByRole("region", { name: /Reste à dépenser/ }));
      expect(
        normaliser(anneau.getByText(/877,50/).textContent ?? ""),
      ).toContain("877,50");
    });

    // Et le journal l'affiche.
    expect(sectionJournal().getByText("Dépense")).toBeInTheDocument();
  });

  it("accepte indifféremment la virgule et le point (EF-003)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.type(sectionSaisie().getByLabelText("Montant"), "12.40");
    await utilisateur.click(sectionSaisie().getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      expect(documentStocke()?.expenses[0].amountCents).toBe(1240);
    });
  });

  it("réinitialise le champ pour enchaîner une seconde dépense (CS-001)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const champ = sectionSaisie().getByLabelText("Montant");
    await utilisateur.type(champ, "10");
    await utilisateur.click(sectionSaisie().getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => expect(champ).toHaveValue(""));
  });

  it("persiste la dépense dans le stockage", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.type(sectionSaisie().getByLabelText("Montant"), "33,33");
    await utilisateur.click(sectionSaisie().getByRole("button", { name: "Enregistrer" }));

    await waitFor(() => {
      const doc = documentStocke();
      expect(doc?.version).toBe(3);
      expect(doc?.expenses).toHaveLength(1);
      expect(doc?.expenses[0]).toMatchObject({ amountCents: 3333, date: aujourdHui() });
    });
  });
});

describe("Tableau de bord — refus de saisie (scénario 3)", () => {
  it("refuse les montants invalides sans rien écrire", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const cas: [string, string][] = [
      ["-10", "Le montant doit être supérieur à zéro."],
      ["0", "Le montant doit être supérieur à zéro."],
      ["abc", "Le montant doit être un nombre, par exemple 12,40."],
      ["1,234", "Le montant ne peut pas comporter plus de deux décimales."],
    ];

    for (const [saisie, message] of cas) {
      const champ = sectionSaisie().getByLabelText("Montant");
      await utilisateur.clear(champ);
      await utilisateur.type(champ, saisie);
      await utilisateur.click(sectionSaisie().getByRole("button", { name: "Enregistrer" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(champ).toHaveAttribute("aria-invalid", "true");
      expect(documentStocke()?.expenses).toHaveLength(0);
    }
  });
});

describe("Tableau de bord — anneau et allocation", () => {
  it("annonce l'état par du texte, pas par la seule couleur (CS-009)", async () => {
    await monterVue();
    expect(screen.getByText("Rien de dépensé")).toBeInTheDocument();
  });

  it("présente un dépassement comme un montant, jamais comme un reste négatif (EF-012)", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        documentAvecBudget([
          { id: "trop", amountCents: 102000, date: aujourdHui(), category: null },
        ]),
      ),
    );
    await monterVue();

    expect(screen.getByText("Dépassement")).toBeInTheDocument();
    const anneau = within(screen.getByRole("region", { name: /Reste à dépenser/ }));
    expect(anneau.getByText(/120,00/)).toBeInTheDocument();
    // Aucun montant négatif brut n'est affiché.
    expect(anneau.queryByText(/-\s?1\s?020/)).not.toBeInTheDocument();
  });

  it("affiche l'allocation du jour et le nombre de jours restants (EF-015)", async () => {
    await monterVue();
    const allocation = within(screen.getByRole("region", { name: "Aujourd’hui" }));
    expect(allocation.getByText(/jours? restants?/)).toBeInTheDocument();
  });

  it("invite à renseigner un budget quand il n'y en a pas (EF-014)", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 3, incomes: [], subscriptions: [], expenses: [], envelopes: [] }),
    );
    await monterVue();

    expect(screen.getByText(/Renseignez vos revenus et vos abonnements/)).toBeInTheDocument();
  });
});

describe("Tableau de bord — journal (scénario 7)", () => {
  const hier = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate(),
    ).padStart(2, "0")}`;
  };

  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        documentAvecBudget([
          { id: "a", amountCents: 1000, date: aujourdHui(), label: "Café", category: "Sorties" },
          { id: "b", amountCents: 2500, date: aujourdHui(), label: "Boulangerie", category: "Courses" },
          { id: "c", amountCents: 4000, date: hier(), label: "Pharmacie", category: null },
        ]),
      ),
    );
  });

  it("regroupe par journée avec un sous-total exact (EF-025)", async () => {
    await monterVue();
    const journal = sectionJournal();

    // Les deux dépenses du jour font 35,00 € ; celle d'hier 40,00 €.
    expect(journal.getByText(/35,00/)).toBeInTheDocument();
    expect(journal.getAllByText(/40,00/).length).toBeGreaterThan(0);
  });

  it("trouve « Café » en tapant « cafe » (EF-026)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.type(sectionJournal().getByLabelText("Rechercher"), "cafe");

    await waitFor(() => {
      expect(sectionJournal().getByText("Café")).toBeInTheDocument();
      expect(sectionJournal().queryByText("Boulangerie")).not.toBeInTheDocument();
    });
  });

  it("propose d'effacer une recherche sans résultat (EF-029)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.type(sectionJournal().getByLabelText("Rechercher"), "introuvable");

    expect(await screen.findByText(/Aucune dépense ne correspond/)).toBeInTheDocument();
    await utilisateur.click(screen.getByRole("button", { name: "Effacer la recherche" }));

    await waitFor(() => {
      expect(sectionJournal().getByText("Café")).toBeInTheDocument();
    });
  });

  it("affiche un message quand aucune dépense n'existe", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(documentAvecBudget()));
    await monterVue();

    expect(sectionJournal().getByText(/Aucune dépense enregistrée/)).toBeInTheDocument();
  });
});
