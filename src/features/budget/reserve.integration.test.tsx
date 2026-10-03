import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "@/lib/storage";
import { addMonthsToKey, dayOfMonth, daysInMonth } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { ouvrirOnglet, panneau, reinitialiserAdresse } from "@/test/navigation";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument, Expense, ReserveDeclaration } from "@/features/budget/types";

/**
 * Réserve d'épargne dans l'application montée : formulaire → fournisseur → stockage → calculs
 * → anneau, reste du jour et onglet « Mois » (specs/008-savings-reserve, récits 1 à 4).
 *
 * Les montants suivent l'exemple de la spécification : 900,00 € de revenus nets, 6 000,00 €
 * de réserve sur 12 mois. Le calcul lui-même est couvert au centime par
 * `reserve-cascade.test.ts` ; ici on vérifie qu'il arrive bien à l'écran.
 */

function aujourdHui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

const MOIS = aujourdHui().slice(0, 7);
const MOIS_PRECEDENT = addMonthsToKey(MOIS, -1);

function depense(id: string, amountCents: number, mois = MOIS, label?: string): Expense {
  const base: Expense = { id, amountCents, date: `${mois}-01`, category: null };
  return label ? { ...base, label } : base;
}

function ouverture(fromMonth = MOIS, balanceCents = 600000, months = 12): ReserveDeclaration {
  return { fromMonth, kind: "open", balanceCents, months };
}

/** 900,00 € de revenus nets chaque mois, sans abonnement. */
function budget(surcharge: Partial<BudgetDocument> = {}): BudgetDocument {
  return {
    ...emptyDocument(),
    incomes: [
      {
        id: "salaire",
        label: "Salaire",
        amountCents: 90000,
        kind: "recurring",
        periodicity: "monthly",
        startDate: "2020-01-01",
        endDate: null,
      },
    ],
    ...surcharge,
  };
}

function installer(doc: BudgetDocument): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

function documentStocke(): BudgetDocument {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) as string);
}

async function monterVue(onglet?: string) {
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
  if (onglet) await ouvrirOnglet(onglet);
}

/** `Intl` produit des espaces insécables : on normalise avant de comparer. */
function normaliser(texte: string | null | undefined): string {
  return (texte ?? "").replace(/\s/g, " ");
}

function euros(cents: number): string {
  return normaliser(formatCents(cents));
}

/** Valeur d'une ligne de liste de définitions, repérée par son intitulé. */
function valeur(zone: HTMLElement, intitule: string): string {
  const dt = within(zone).getByText(intitule);
  return normaliser(dt.nextElementSibling?.textContent);
}

function anneau(): HTMLElement {
  return screen.getByRole("region", { name: /^Reste à dépenser en / });
}

function sectionReserve(): HTMLElement {
  return screen.getByRole("region", { name: "Réserve d’épargne" });
}

async function declarer(solde: string, mois: string, bouton = "Enregistrer la réserve") {
  const utilisateur = userEvent.setup();
  const zone = within(sectionReserve());
  const champSolde = zone.getByLabelText("Solde de l’épargne aujourd’hui");
  const champMois = zone.getByLabelText("À répartir sur (mois)");
  await utilisateur.clear(champSolde);
  if (solde !== "") await utilisateur.type(champSolde, solde);
  await utilisateur.clear(champMois);
  if (mois !== "") await utilisateur.type(champMois, mois);
  await utilisateur.click(zone.getByRole("button", { name: bouton }));
}

beforeEach(() => {
  localStorage.clear();
  installer(budget());
  // `scrollIntoView` n'existe pas dans jsdom ; les liens vers une section l'appellent.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  reinitialiserAdresse();
  vi.restoreAllMocks();
});

// --- Récit 1 : déclarer la réserve et la voir répartie --------------------------------------

describe("récit 1 — déclarer la réserve", () => {
  it("n'évoque aucune épargne tant qu'aucune réserve n'est déclarée (FR-019)", async () => {
    await monterVue();

    expect(valeur(anneau(), "Disponible ce mois")).toBe(euros(90000));
    expect(within(anneau()).queryByText("Part d’épargne")).not.toBeInTheDocument();
    expect(within(anneau()).queryByText(/Épargne/)).not.toBeInTheDocument();

    await ouvrirOnglet("Mois");
    expect(screen.queryByRole("region", { name: "Réserve d’épargne" })).not.toBeInTheDocument();
  });

  it("ajoute la part d'épargne au disponible, à l'anneau et au montant par jour", async () => {
    await monterVue("Réglages");
    await declarer("6000", "12");
    await ouvrirOnglet("Aujourd’hui");

    expect(valeur(anneau(), "Disponible ce mois")).toBe(euros(140000));
    expect(valeur(anneau(), "Revenus du mois")).toBe(euros(90000));
    expect(valeur(anneau(), "Part d’épargne")).toBe(euros(50000));

    // Reste du jour : le disponible avec part, réparti sur les jours restants, tronqué.
    const joursRestants = daysInMonth(MOIS) - dayOfMonth(aujourdHui()) + 1;
    const allocation = screen.getByRole("region", { name: "Aujourd’hui" });
    expect(normaliser(allocation.textContent)).toContain(
      euros(Math.floor(140000 / joursRestants)),
    );
  });

  it("enregistre une déclaration pour le mois en cours, en version 5", async () => {
    await monterVue("Réglages");
    await declarer("6000", "12");

    await waitFor(() => {
      expect(documentStocke().reserve).toEqual([ouverture(MOIS, 600000, 12)]);
    });
    expect(documentStocke().version).toBe(5);
  });

  it("vide les champs après l'enregistrement et affiche l'état de la réserve", async () => {
    await monterVue("Réglages");
    await declarer("6000", "12");

    const zone = sectionReserve();
    expect(within(zone).getByLabelText("Solde de l’épargne aujourd’hui")).toHaveValue("");
    expect(valeur(zone, "Réserve en début de mois")).toBe(euros(600000));
    expect(valeur(zone, "Mois restants")).toBe("12");
    expect(valeur(zone, "Part de ce mois")).toBe(euros(50000));
  });

  it("tronque la part au centime : 1 000,00 € sur 3 mois donnent 333,33 €", async () => {
    await monterVue("Réglages");
    await declarer("1000", "3");
    expect(valeur(sectionReserve(), "Part de ce mois")).toBe(euros(33333));
  });

  it("refuse un solde invalide, avec son message, sans rien enregistrer (FR-003)", async () => {
    await monterVue("Réglages");
    const cas: [string, string][] = [
      ["-5", "Le solde ne peut pas être négatif. Zéro est accepté."],
      ["abc", "Le solde doit être un nombre, par exemple 6000 ou 5250,50."],
      ["1,234", "Le solde ne peut pas comporter plus de deux décimales."],
      ["", "Saisissez le solde de votre épargne."],
    ];

    for (const [saisie, message] of cas) {
      await declarer(saisie, "12");
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(
        within(sectionReserve()).getByLabelText("Solde de l’épargne aujourd’hui"),
      ).toHaveAttribute("aria-invalid", "true");
      expect(documentStocke().reserve).toEqual([]);
    }
  });

  it("refuse un nombre de mois invalide, avec son message, sans rien enregistrer", async () => {
    await monterVue("Réglages");
    const cas: [string, string][] = [
      ["0", "Le nombre de mois doit être compris entre 1 et 120."],
      ["121", "Le nombre de mois doit être compris entre 1 et 120."],
      ["1,5", "Le nombre de mois doit être un nombre entier, par exemple 12."],
      ["", "Saisissez un nombre de mois."],
    ];

    for (const [saisie, message] of cas) {
      await declarer("6000", saisie);
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(within(sectionReserve()).getByLabelText("À répartir sur (mois)")).toHaveAttribute(
        "aria-invalid",
        "true",
      );
      expect(documentStocke().reserve).toEqual([]);
    }
  });

  it("rappelle de ne pas compter l'épargne deux fois quand le mois a un revenu ponctuel (FR-004)", async () => {
    installer(
      budget({
        incomes: [
          ...budget().incomes,
          { id: "ponctuel", label: "Épargne", amountCents: 600000, kind: "oneOff", date: `${MOIS}-01` },
        ],
      }),
    );
    await monterVue("Réglages");
    expect(within(sectionReserve()).getByText(/revenu ponctuel/)).toBeInTheDocument();
  });

  it("ne fait pas ce rappel sans revenu ponctuel ce mois-ci", async () => {
    await monterVue("Réglages");
    expect(within(sectionReserve()).queryByText(/revenu ponctuel/)).not.toBeInTheDocument();
  });

  it("accepte un solde de zéro, sans inviter à renseigner ses revenus (FR-026)", async () => {
    installer(emptyDocument());
    await monterVue("Réglages");
    await declarer("0", "1");
    await waitFor(() => expect(documentStocke().reserve).toEqual([ouverture(MOIS, 0, 1)]));

    await ouvrirOnglet("Aujourd’hui");
    expect(within(anneau()).queryByText(/Renseignez vos revenus/)).not.toBeInTheDocument();
    expect(valeur(anneau(), "Part d’épargne")).toBe(euros(0));
  });

  it("rajoute l'épargne déjà entamée ce mois-ci au solde saisi (FR-002)", async () => {
    installer(budget({ expenses: [depense("d1", 110000)] }));
    await monterVue("Réglages");
    await declarer("5800", "12");

    // 900,00 € de revenus, 1 100,00 € dépensés : 200,00 € déjà puisés dans l'épargne.
    await waitFor(() => expect(documentStocke().reserve).toEqual([ouverture(MOIS, 600000, 12)]));
    expect(valeur(sectionReserve(), "Réserve prévue en fin de mois")).toBe(euros(580000));
  });
});

// --- Récit 2 : le reste et le dépassement passent au mois suivant ---------------------------

describe("récit 2 — report au mois suivant", () => {
  async function moisSuivant() {
    await userEvent.click(screen.getByRole("button", { name: "Mois suivant" }));
  }

  it("fait repartir le mois suivant de la réserve de fin de mois", async () => {
    installer(budget({ expenses: [depense("d1", 110000)], reserve: [ouverture()] }));
    await monterVue("Mois");
    await moisSuivant();

    await waitFor(() => {
      expect(valeur(sectionReserve(), "Réserve en début de mois")).toBe(euros(580000));
    });
    expect(valeur(sectionReserve(), "Mois restants")).toBe("11");
    expect(valeur(sectionReserve(), "Part du mois")).toBe(euros(52727));
  });

  it("augmente la réserve quand le mois est moins dépensé que ses revenus", async () => {
    installer(budget({ expenses: [depense("d1", 70000)], reserve: [ouverture()] }));
    await monterVue("Mois");
    await moisSuivant();

    await waitFor(() => {
      expect(valeur(sectionReserve(), "Réserve en début de mois")).toBe(euros(620000));
    });
  });

  it("répercute sans action la suppression d'une dépense passée (FR-011)", async () => {
    const utilisateur = userEvent.setup();
    installer(
      budget({
        expenses: [depense("d1", 100000, MOIS, "Loyer"), depense("d2", 10000, MOIS, "Courses")],
        reserve: [ouverture()],
      }),
    );
    await monterVue("Dépenses");

    const journal = within(screen.getByRole("region", { name: "Mes dépenses" }));
    await utilisateur.click(journal.getByRole("button", { name: /Détail de Courses/ }));
    await utilisateur.click(journal.getByRole("button", { name: "Supprimer" }));
    await utilisateur.click(journal.getByRole("button", { name: "Confirmer la suppression" }));

    await ouvrirOnglet("Mois");
    await moisSuivant();
    await waitFor(() => {
      expect(valeur(sectionReserve(), "Réserve en début de mois")).toBe(euros(590000));
    });
  });

  it("laisse intact un mois antérieur à la déclaration (FR-013)", async () => {
    installer(budget({ reserve: [ouverture()] }));
    await monterVue("Mois");
    await userEvent.click(screen.getByRole("button", { name: "Mois précédent" }));

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Réserve d’épargne" })).not.toBeInTheDocument();
    });
    await ouvrirOnglet("Aujourd’hui");
    expect(valeur(anneau(), "Disponible ce mois")).toBe(euros(90000));
    expect(within(anneau()).queryByText("Part d’épargne")).not.toBeInTheDocument();
  });

  it("tient compte de chaque mois écoulé depuis une déclaration ancienne", async () => {
    installer(budget({ reserve: [ouverture(addMonthsToKey(MOIS, -4))] }));
    await monterVue("Mois");

    // Quatre mois de revenus nets non dépensés se sont ajoutés à la réserve.
    expect(valeur(sectionReserve(), "Réserve en début de mois")).toBe(euros(960000));
    expect(valeur(sectionReserve(), "Mois restants")).toBe("8");
    expect(valeur(sectionReserve(), "Part du mois")).toBe(euros(120000));
  });
});

// --- Récit 3 : voir quand l'épargne est entamée ----------------------------------------------

describe("récit 3 — état de l'épargne", () => {
  it("dit que l'épargne est intacte et ce qu'il reste de revenus avant d'y toucher", async () => {
    installer(budget({ expenses: [depense("d1", 80000)], reserve: [ouverture()] }));
    await monterVue();

    expect(normaliser(anneau().textContent)).toContain(
      `Épargne non entamée — encore ${euros(10000)} de revenus avant d’y toucher.`,
    );
  });

  it("dit combien d'épargne est entamé, et sur quelle part", async () => {
    installer(budget({ expenses: [depense("d1", 110000)], reserve: [ouverture()] }));
    await monterVue();

    expect(normaliser(anneau().textContent)).toContain(
      `Épargne entamée : ${euros(20000)} sur ${euros(50000)}.`,
    );
  });

  it("présente un dépassement comme un montant positif, retiré de la réserve (FR-018)", async () => {
    installer(budget({ expenses: [depense("d1", 150000)], reserve: [ouverture()] }));
    await monterVue();

    const texte = normaliser(anneau().textContent);
    expect(texte).toContain("Dépassé de");
    expect(texte).toContain(euros(10000));
    expect(texte).toContain("Ce dépassement sera retiré de la réserve.");
    // Aucun montant négatif brut, ni tiret ni signe moins typographique.
    expect(texte).not.toMatch(/[-−]\s?\d/);
  });

  it("détaille la réserve du mois dans l'onglet « Mois » (FR-017)", async () => {
    installer(budget({ expenses: [depense("d1", 110000)], reserve: [ouverture()] }));
    await monterVue("Mois");

    const zone = sectionReserve();
    expect(valeur(zone, "Réserve en début de mois")).toBe(euros(600000));
    expect(valeur(zone, "Mois restants")).toBe("12");
    expect(valeur(zone, "Part du mois")).toBe(euros(50000));
    expect(valeur(zone, "Disponible avec la part d’épargne")).toBe(euros(140000));
    expect(valeur(zone, "Épargne entamée ce mois")).toBe(euros(20000));
    expect(valeur(zone, "Réserve prévue en fin de mois")).toBe(euros(580000));
  });

  it("annonce une réserve épuisée par un découvert positif, jamais par un solde négatif", async () => {
    installer(
      budget({
        expenses: [depense("d0", 200000, MOIS_PRECEDENT)],
        reserve: [ouverture(MOIS_PRECEDENT, 10000, 12)],
      }),
    );
    await monterVue();

    // 100,00 + 900,00 − 2 000,00 = −1 000,00 € en début de mois.
    expect(valeur(anneau(), "Découvert de la réserve")).toBe(euros(100000));
    expect(within(anneau()).queryByText(/Renseignez vos revenus/)).not.toBeInTheDocument();
    expect(normaliser(anneau().textContent)).not.toMatch(/[-−]\s?\d/);

    await ouvrirOnglet("Mois");
    expect(valeur(sectionReserve(), "Réserve en début de mois")).toBe(
      `Réserve épuisée — découvert de ${euros(100000)}`,
    );
    expect(normaliser(sectionReserve().textContent)).not.toMatch(/[-−]\s?\d/);
  });
});

// --- Récit 4 : recaler, modifier, retirer ----------------------------------------------------

describe("récit 4 — recaler et retirer", () => {
  const ancienne = ouverture(MOIS_PRECEDENT, 600000, 12);

  async function texteDuMoisPrecedent(): Promise<string> {
    await ouvrirOnglet("Mois");
    await userEvent.click(screen.getByRole("button", { name: "Mois précédent" }));
    const texte = await waitFor(() => normaliser(sectionReserve().textContent));
    await userEvent.click(screen.getByRole("button", { name: "Mois suivant" }));
    return texte;
  }

  it("fait repartir le mois en cours du solde ressaisi, sans toucher au mois passé (FR-021)", async () => {
    installer(budget({ reserve: [ancienne] }));
    await monterVue();
    const avant = await texteDuMoisPrecedent();

    await ouvrirOnglet("Réglages");
    await declarer("3000", "6", "Mettre à jour la réserve");

    await waitFor(() => {
      expect(documentStocke().reserve).toEqual([ancienne, ouverture(MOIS, 300000, 6)]);
    });
    expect(valeur(sectionReserve(), "Réserve en début de mois")).toBe(euros(300000));
    expect(valeur(sectionReserve(), "Mois restants")).toBe("6");
    expect(valeur(sectionReserve(), "Part de ce mois")).toBe(euros(50000));

    expect(await texteDuMoisPrecedent()).toBe(avant);
  });

  it("remplace la déclaration quand le recalage a lieu le même mois", async () => {
    installer(budget({ reserve: [ouverture()] }));
    await monterVue("Réglages");
    await declarer("3000", "6", "Mettre à jour la réserve");

    await waitFor(() => expect(documentStocke().reserve).toEqual([ouverture(MOIS, 300000, 6)]));
  });

  it("ne compte pas deux fois l'épargne déjà puisée lors d'un recalage en cours de mois", async () => {
    installer(budget({ expenses: [depense("d1", 110000)], reserve: [ouverture()] }));
    await monterVue("Réglages");
    await declarer("5800", "12", "Mettre à jour la réserve");

    await waitFor(() => {
      expect(valeur(sectionReserve(), "Réserve prévue en fin de mois")).toBe(euros(580000));
    });
  });

  it("exige une confirmation avant de retirer la réserve, et « Annuler » ne change rien", async () => {
    const utilisateur = userEvent.setup();
    installer(budget({ reserve: [ancienne] }));
    await monterVue("Réglages");

    await utilisateur.click(screen.getByRole("button", { name: "Retirer la réserve" }));
    expect(screen.getByText(/Retirer la réserve \?/)).toBeInTheDocument();
    await utilisateur.click(screen.getByRole("button", { name: "Annuler" }));

    expect(documentStocke().reserve).toEqual([ancienne]);
    expect(screen.getByRole("button", { name: "Retirer la réserve" })).toBeInTheDocument();
  });

  it("revient au calcul sans réserve après le retrait, le mois passé gardant ses montants", async () => {
    const utilisateur = userEvent.setup();
    installer(budget({ reserve: [ancienne] }));
    await monterVue();
    const avant = await texteDuMoisPrecedent();

    await ouvrirOnglet("Réglages");
    await utilisateur.click(screen.getByRole("button", { name: "Retirer la réserve" }));
    await utilisateur.click(screen.getByRole("button", { name: "Confirmer le retrait" }));

    await waitFor(() => {
      expect(documentStocke().reserve).toEqual([ancienne, { fromMonth: MOIS, kind: "closed" }]);
    });

    await ouvrirOnglet("Aujourd’hui");
    expect(valeur(anneau(), "Disponible ce mois")).toBe(euros(90000));
    expect(within(anneau()).queryByText("Part d’épargne")).not.toBeInTheDocument();

    expect(await texteDuMoisPrecedent()).toBe(avant);
  });

  it("signale la durée atteinte et mène aux réglages pour en choisir une nouvelle (FR-023)", async () => {
    installer(budget({ reserve: [ouverture(addMonthsToKey(MOIS, -2), 60000, 1)] }));
    await monterVue("Mois");

    expect(within(sectionReserve()).getByText(/durée prévue pour votre réserve est atteinte/))
      .toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Choisir une nouvelle durée" }));

    await waitFor(() => expect(panneau("Réglages")).toBeVisible());
    expect(within(sectionReserve()).getByLabelText("À répartir sur (mois)")).toBeInTheDocument();
  });
});
