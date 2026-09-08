import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "@/lib/storage";

/**
 * Tests d’intégration de la vue budgétaire : formulaire → fournisseur → stockage → calculs →
 * affichage. Ils couvrent les scénarios 1, 2, 3, 6 et 11 du guide de validation.
 *
 * Le fournisseur conserve un instantané au niveau du module ; `vi.resetModules()` suivi d’un
 * import dynamique garantit que chaque test repart d’un état propre, sans exposer d’API de
 * réinitialisation dans le code de production.
 */
async function monterVue() {
  vi.resetModules();
  const { BudgetProvider } = await import("@/features/budget/budget-provider");
  const { BudgetView } = await import("@/features/budget/components/budget-view");

  render(
    <BudgetProvider>
      <BudgetView />
    </BudgetProvider>,
  );

  // Le premier rendu sert l’instantané serveur ; on attend l’hydratation cliente.
  await waitFor(() => {
    expect(screen.queryByText("Chargement…")).not.toBeInTheDocument();
  });
}

function sectionRevenus() {
  return within(screen.getByRole("region", { name: "Revenus" }));
}

/**
 * `Intl` produit une espace fine insécable comme séparateur de milliers, invisible mais
 * distincte d’une espace simple : on normalise avant de comparer.
 */
function normaliser(valeur: string): string {
  return valeur.replace(/\s/g, " ");
}

/** Total affiché en tête d’une section, repéré par son intitulé. */
function totalDeSection(section: ReturnType<typeof within>, intitule: string): string {
  const etiquette = section.getByText(new RegExp(`^${intitule}`));
  return normaliser(etiquette.parentElement?.textContent ?? "");
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Vue budgétaire — démarrage à vide (scénario 1)", () => {
  it("affiche des totaux à zéro et invite à saisir, sans erreur", async () => {
    await monterVue();

    expect(screen.getByRole("heading", { name: /^Budget de / })).toBeInTheDocument();
    expect(screen.getByText(/Commencez par enregistrer un revenu/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    expect(totalDeSection(sectionRevenus(), "Total du mois")).toBe(
      normaliser("Total du mois 0,00 €"),
    );
  });
});

describe("Vue budgétaire — saisie d’un revenu (scénario 2)", () => {
  it("enregistre un revenu et met à jour le total sans rafraîchissement (EF-019, CS-004)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const revenus = sectionRevenus();
    await utilisateur.type(revenus.getByLabelText("Libellé"), "Salaire");
    await utilisateur.type(revenus.getByLabelText("Montant"), "2400,00");
    await utilisateur.click(revenus.getByRole("button", { name: "Ajouter le revenu" }));

    // Le total du mois se met à jour sans action de rafraîchissement de l’utilisateur.
    await waitFor(() => {
      expect(totalDeSection(sectionRevenus(), "Total du mois")).toBe(
        normaliser("Total du mois 2 400,00 €"),
      );
    });
    expect(screen.getByText("Salaire")).toBeInTheDocument();
  });

  it("persiste le revenu dans le stockage (EF-026)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const revenus = sectionRevenus();
    await utilisateur.type(revenus.getByLabelText("Libellé"), "Salaire");
    await utilisateur.type(revenus.getByLabelText("Montant"), "2400");
    await utilisateur.click(revenus.getByRole("button", { name: "Ajouter le revenu" }));

    await waitFor(() => {
      const brut = localStorage.getItem(STORAGE_KEY);
      expect(brut).not.toBeNull();
      const document = JSON.parse(brut as string);
      expect(document.incomes).toHaveLength(1);
      expect(document.incomes[0]).toMatchObject({
        label: "Salaire",
        amountCents: 240000,
      });
    });
  });
});

describe("Vue budgétaire — refus de saisie (scénario 3)", () => {
  it("refuse un montant négatif, nul, non numérique ou à trois décimales sans rien enregistrer", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const cas: [string, string][] = [
      ["-10", "Le montant doit être supérieur à zéro."],
      ["0", "Le montant doit être supérieur à zéro."],
      ["abc", "Le montant doit être un nombre, par exemple 12,40."],
      ["1,234", "Le montant ne peut pas comporter plus de deux décimales."],
    ];

    for (const [saisie, message] of cas) {
      const revenus = sectionRevenus();
      const champLibelle = revenus.getByLabelText("Libellé");
      const champMontant = revenus.getByLabelText("Montant");

      await utilisateur.clear(champLibelle);
      await utilisateur.type(champLibelle, "Test");
      await utilisateur.clear(champMontant);
      await utilisateur.type(champMontant, saisie);
      await utilisateur.click(revenus.getByRole("button", { name: "Ajouter le revenu" }));

      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(champMontant).toHaveAttribute("aria-invalid", "true");
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    }
  });

  it("refuse un libellé vide", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const revenus = sectionRevenus();
    await utilisateur.type(revenus.getByLabelText("Montant"), "100");
    await utilisateur.click(revenus.getByRole("button", { name: "Ajouter le revenu" }));

    expect(await screen.findByText("Saisissez un libellé.")).toBeInTheDocument();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("Vue budgétaire — stockage illisible (scénario 11)", () => {
  it("informe l’utilisateur, démarre à vide et conserve la valeur brute", async () => {
    const brut = JSON.stringify({ version: 99, incomes: [], subscriptions: [] });
    localStorage.setItem(STORAGE_KEY, brut);

    await monterVue();

    const alerte = screen.getByRole("alert");
    expect(within(alerte).getByText("Données précédentes illisibles")).toBeInTheDocument();
    expect(within(alerte).getByText(/n’ont pas été détruites/)).toBeInTheDocument();

    const cleQuarantaine = Object.keys(localStorage).find((cle) =>
      cle.startsWith("budget-app:corrupted:"),
    );
    expect(cleQuarantaine).toBeDefined();
    expect(localStorage.getItem(cleQuarantaine as string)).toBe(brut);
  });
});

describe("Vue budgétaire — accessibilité (CS-007, CS-010)", () => {
  it("associe une étiquette à chaque champ de saisie du revenu", async () => {
    await monterVue();
    const revenus = sectionRevenus();
    expect(revenus.getByLabelText("Libellé")).toBeInTheDocument();
    expect(revenus.getByLabelText("Montant")).toBeInTheDocument();
    expect(revenus.getByLabelText("Périodicité")).toBeInTheDocument();
    expect(revenus.getByLabelText("Début")).toBeInTheDocument();
  });

  it("annonce l’état du budget par du texte, pas par la seule couleur", async () => {
    await monterVue();
    // Sans données, le budget est à l’équilibre : le libellé doit être lisible tel quel.
    expect(screen.getByText("Équilibre")).toBeInTheDocument();
    expect(screen.getByText("Reste disponible")).toBeInTheDocument();
  });

  it("expose la navigation entre les mois au clavier avec des libellés explicites", async () => {
    await monterVue();
    const navigation = within(
      screen.getByRole("navigation", { name: "Navigation entre les mois" }),
    );
    expect(navigation.getByRole("button", { name: "Mois précédent" })).toBeInTheDocument();
    expect(navigation.getByRole("button", { name: "Mois suivant" })).toBeInTheDocument();
  });
});
