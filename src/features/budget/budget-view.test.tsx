import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "@/lib/storage";
import { ouvrirOnglet, panneau, reinitialiserAdresse } from "@/test/navigation";

/**
 * Tests d’intégration de la vue budgétaire : formulaire → fournisseur → stockage → calculs →
 * affichage. Ils couvrent les scénarios 1, 2, 3, 6 et 11 du guide de validation.
 *
 * Le fournisseur conserve un instantané au niveau du module ; `vi.resetModules()` suivi d’un
 * import dynamique garantit que chaque test repart d’un état propre, sans exposer d’API de
 * réinitialisation dans le code de production.
 */
async function monterVue(onglet?: string) {
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

  // Les revenus et la synthèse vivent dans l’onglet « Mois » (fonctionnalité 007).
  if (onglet) await ouvrirOnglet(onglet);
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
  reinitialiserAdresse();
});

describe("Vue budgétaire — démarrage à vide (scénario 1)", () => {
  it("affiche des totaux à zéro et invite à saisir, sans erreur", async () => {
    await monterVue("Mois");

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
    await monterVue("Mois");

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
    await monterVue("Mois");

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
    await monterVue("Mois");

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
    await monterVue("Mois");

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

    await monterVue("Mois");

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
    await monterVue("Mois");
    const revenus = sectionRevenus();
    expect(revenus.getByLabelText("Libellé")).toBeInTheDocument();
    expect(revenus.getByLabelText("Montant")).toBeInTheDocument();
    expect(revenus.getByLabelText("Périodicité")).toBeInTheDocument();
    expect(revenus.getByLabelText("Début")).toBeInTheDocument();
  });

  it("annonce l’état du budget par du texte, pas par la seule couleur", async () => {
    await monterVue("Mois");
    // Sans données, le budget est à l’équilibre : le libellé doit être lisible tel quel.
    expect(screen.getByText("Équilibre")).toBeInTheDocument();
    expect(screen.getByText("Reste disponible")).toBeInTheDocument();
  });

  it("expose la navigation entre les mois au clavier avec des libellés explicites", async () => {
    await monterVue("Mois");
    const navigation = within(
      screen.getByRole("navigation", { name: "Navigation entre les mois" }),
    );
    expect(navigation.getByRole("button", { name: "Mois précédent" })).toBeInTheDocument();
    expect(navigation.getByRole("button", { name: "Mois suivant" })).toBeInTheDocument();
  });
});

// --- Navigation par onglets (fonctionnalité 007) ------------------------------------------

/** Titres de section attendus dans chaque onglet, et dans lui seul (FR-002). */
const SECTIONS_PAR_ONGLET: [string, (string | RegExp)[]][] = [
  ["Aujourd’hui", [/^Reste à dépenser en /, "Aujourd’hui", "Nouvelle dépense"]],
  ["Dépenses", ["Mes dépenses", "Enveloppes"]],
  ["Mois", [/^Budget de /, "Revenus", "Abonnements"]],
  ["Réglages", ["Vos données"]],
];

describe("Vue budgétaire — navigation par onglets (récit 1)", () => {
  it("ouvre sur « Aujourd’hui », seul panneau visible et seule entrée active (FR-004)", async () => {
    await monterVue();

    expect(panneau("Aujourd’hui")).toBeVisible();
    for (const nom of ["Dépenses", "Mois", "Réglages"]) {
      expect(panneau(nom)).not.toBeVisible();
    }

    const menu = within(screen.getByRole("navigation", { name: "Sections du budget" }));
    expect(menu.getByRole("link", { name: "Aujourd’hui" })).toHaveAttribute("aria-current", "page");
    for (const nom of ["Dépenses", "Mois", "Réglages"]) {
      expect(menu.getByRole("link", { name: nom })).not.toHaveAttribute("aria-current");
    }
  });

  it("range chaque section dans un onglet et un seul (FR-002)", async () => {
    await monterVue();

    for (const [onglet, titres] of SECTIONS_PAR_ONGLET) {
      await ouvrirOnglet(onglet);

      for (const titre of titres) {
        const element = screen.getByRole("heading", { name: titre });
        expect(panneau(onglet)).toContainElement(element);
      }
      // Les sections des autres onglets sont masquées, donc absentes de l’arbre accessible.
      for (const [autre, titresAutres] of SECTIONS_PAR_ONGLET) {
        if (autre === onglet) continue;
        for (const titre of titresAutres) {
          expect(screen.queryByRole("heading", { name: titre })).not.toBeInTheDocument();
        }
      }
      expect(
        within(screen.getByRole("navigation", { name: "Sections du budget" })).getByRole("link", {
          name: onglet,
        }),
      ).toHaveAttribute("aria-current", "page");
    }
  });

  it("affiche le budget prévisionnel directement, sans repli (FR-005)", async () => {
    await monterVue("Mois");

    // Plus de repli « Budget prévisionnel du mois » : les sections sont visibles sans rien déplier.
    expect(screen.queryByText("Budget prévisionnel du mois")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Revenus" })).toBeVisible();
  });

  it("garde l’onglet « Mois » quand on change de mois", async () => {
    const utilisateur = userEvent.setup();
    await monterVue("Mois");
    const titreAvant = screen.getByRole("heading", { name: /^Budget de / }).textContent;

    await utilisateur.click(screen.getByRole("button", { name: "Mois suivant" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /^Budget de / }).textContent).not.toBe(titreAvant);
    });
    expect(panneau("Mois")).toBeVisible();
  });

  it("montre dans « Dépenses » la dépense saisie sur « Aujourd’hui »", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const saisie = within(screen.getByRole("region", { name: "Nouvelle dépense" }));
    await utilisateur.type(saisie.getByLabelText("Montant"), "12,50");
    await utilisateur.click(saisie.getByRole("button", { name: "Enregistrer" }));
    await ouvrirOnglet("Dépenses");

    const journal = within(screen.getByRole("region", { name: "Mes dépenses" }));
    await waitFor(() => {
      expect(journal.getAllByText(/12,50/).length).toBeGreaterThan(0);
    });
  });
});