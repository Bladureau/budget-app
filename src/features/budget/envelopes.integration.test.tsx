import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "@/lib/storage";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument, Envelope, Expense } from "@/features/budget/types";

/**
 * Tests d'intégration des enveloppes : saisie → fournisseur → stockage → calculs → liste et
 * synthèse.
 *
 * Ils vérifient EF-010, l'exigence qui donne son sens à la décision « tout est dérivé » :
 * toute mutation — plafond **comme dépense** — met à jour la section sans action de
 * rafraîchissement, parce qu'aucun total n'est mémorisé.
 */

function moisCourant(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Date du jour, comme le fournisseur la calcule. */
function aujourdHui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function document(
  envelopes: Envelope[] = [],
  expenses: Expense[] = [],
): BudgetDocument {
  return {
    ...emptyDocument(),
    incomes: [
      {
        id: "revenu",
        label: "Salaire",
        amountCents: 200000,
        kind: "oneOff",
        date: aujourdHui(),
      },
    ],
    subscriptions: [],
    expenses,
    envelopes,
  };
}

function depense(
  id: string,
  amountCents: number,
  category: string | null,
  date = aujourdHui(),
): Expense {
  return { id, amountCents, date, category };
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

  await screen.findByRole("region", { name: "Enveloppes" });
}

function section() {
  return within(screen.getByRole("region", { name: "Enveloppes" }));
}

/** Le formulaire de création est le dernier « Plafond du mois » de la section. */
function champsCreation() {
  const categories = section().getAllByLabelText("Catégorie");
  const plafonds = section().getAllByLabelText("Plafond du mois");
  return {
    categorie: categories[categories.length - 1],
    plafond: plafonds[plafonds.length - 1],
  };
}

/**
 * La ligne d'une enveloppe, isolée de la synthèse.
 *
 * Les deux affichent les mêmes montants — c'est voulu — donc une recherche à l'échelle de la
 * section trouverait toujours deux occurrences. Les assertions portant sur une enveloppe
 * précise passent donc par sa ligne de liste.
 */
function ligne(categorie: string) {
  const titre = section().getByText(categorie);
  const element = titre.closest("li");
  if (element === null) throw new Error(`Ligne introuvable pour ${categorie}`);
  return within(element);
}

function documentStocke(): BudgetDocument | null {
  const brut = localStorage.getItem(STORAGE_KEY);
  return brut === null ? null : JSON.parse(brut);
}

/** Normalise les espaces insécables du formatage monétaire français. */
function normaliser(texte: string): string {
  return texte.replace(/[\s  ]/g, " ");
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(document()));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Enveloppes — définir un plafond (récit 1)", () => {
  it("affiche l'enveloppe et la synthèse sans rafraîchissement (EF-001, EF-010)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    expect(section().getByText(/Aucun plafond défini/)).toBeInTheDocument();

    const champs = champsCreation();
    await utilisateur.type(champs.categorie, "Courses");
    await utilisateur.type(champs.plafond, "400");
    await utilisateur.click(section().getByRole("button", { name: /Définir/ }));

    await waitFor(() => {
      expect(section().getByText("Courses")).toBeInTheDocument();
    });

    // Rien n'a été dépensé : l'enveloppe est « non entamée », et la synthèse prévoit 400,00 €.
    expect(section().getByText("Non entamée")).toBeInTheDocument();
    const courses = ligne("Courses");
    expect(
      normaliser(courses.getByText("Plafond").nextElementSibling?.textContent ?? ""),
    ).toContain("400,00");
    expect(
      normaliser(courses.getByText("Dépensé").nextElementSibling?.textContent ?? ""),
    ).toContain("0,00");
    expect(
      normaliser(section().getByText("Total prévu").nextElementSibling?.textContent ?? ""),
    ).toContain("400,00");
  });

  it("persiste le plafond en centimes entiers", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const champs = champsCreation();
    await utilisateur.type(champs.categorie, "Transport");
    await utilisateur.type(champs.plafond, "12,40");
    await utilisateur.click(section().getByRole("button", { name: /Définir/ }));

    await waitFor(() => {
      const doc = documentStocke();
      expect(doc?.envelopes).toHaveLength(1);
      expect(doc?.envelopes[0]).toMatchObject({
        category: "Transport",
        month: moisCourant(),
        limitCents: 1240,
      });
    });
  });

  it("réinitialise les champs pour enchaîner un second plafond (CS-001)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const champs = champsCreation();
    await utilisateur.type(champs.categorie, "Loisirs");
    await utilisateur.type(champs.plafond, "80");
    await utilisateur.click(section().getByRole("button", { name: /Définir/ }));

    await waitFor(() => {
      expect(champs.categorie).toHaveValue("");
      expect(champs.plafond).toHaveValue("");
    });
  });

  it("refuse un plafond négatif sans rien écrire (EF-004)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const champs = champsCreation();
    await utilisateur.type(champs.categorie, "Courses");
    await utilisateur.type(champs.plafond, "-50");
    await utilisateur.click(section().getByRole("button", { name: /Définir/ }));

    expect(await section().findByText(/ne peut pas être négatif/)).toBeInTheDocument();
    expect(documentStocke()?.envelopes).toEqual([]);
  });

  it("refuse une catégorie vide sans rien écrire", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.type(champsCreation().plafond, "100");
    await utilisateur.click(section().getByRole("button", { name: /Définir/ }));

    expect(await section().findByText("Saisissez une catégorie.")).toBeInTheDocument();
    expect(documentStocke()?.envelopes).toEqual([]);
  });

  it("accepte un plafond de zéro, seule exception du projet (décision D7)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const champs = champsCreation();
    await utilisateur.type(champs.categorie, "Tabac");
    await utilisateur.type(champs.plafond, "0");
    await utilisateur.click(section().getByRole("button", { name: /Définir/ }));

    await waitFor(() => {
      expect(documentStocke()?.envelopes[0]).toMatchObject({ limitCents: 0 });
    });
    expect(section().getByText("Tabac")).toBeInTheDocument();
  });

  it("ne crée jamais de doublon : redéfinir la même catégorie met à jour (EF-005)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    for (const montant of ["400", "250"]) {
      const champs = champsCreation();
      await utilisateur.type(champs.categorie, "Courses");
      await utilisateur.type(champs.plafond, montant);
      await utilisateur.click(section().getByRole("button", { name: /Définir/ }));
      await waitFor(() => expect(champs.plafond).toHaveValue(""));
    }

    const doc = documentStocke();
    expect(doc?.envelopes).toHaveLength(1);
    expect(doc?.envelopes[0].limitCents).toBe(25000);
  });
});

describe("Enveloppes — la dépense se répercute (récit 2, EF-010)", () => {
  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document([
          { id: "env-courses", category: "Courses", month: moisCourant(), limitCents: 40000 },
        ]),
      ),
    );
  });

  it("met à jour l'enveloppe quand une dépense est saisie, sans rafraîchissement", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    const saisie = within(screen.getByRole("region", { name: "Nouvelle dépense" }));
    await utilisateur.type(saisie.getByLabelText("Montant"), "100");
    // La catégorie est dans le repli du formulaire de dépense.
    await utilisateur.click(saisie.getByText("Libellé, catégorie, date"));
    await utilisateur.type(saisie.getByLabelText("Catégorie"), "Courses");
    await utilisateur.click(saisie.getByRole("button", { name: "Enregistrer" }));

    // 400,00 € − 100,00 € = 300,00 € restants, et l'enveloppe devient « maîtrisée ».
    await waitFor(() => {
      expect(section().getByText("Maîtrisée")).toBeInTheDocument();
    });
    const courses = ligne("Courses");
    expect(normaliser(courses.getByText("Dépensé").nextElementSibling?.textContent ?? ""))
      .toContain("100,00");
    expect(normaliser(courses.getByText("Restant").nextElementSibling?.textContent ?? ""))
      .toContain("300,00");
  });

  it("classe une dépense sans catégorie en non budgété (EF-012, décision D3)", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document(
          [{ id: "e1", category: "Courses", month: moisCourant(), limitCents: 40000 }],
          [depense("d1", 2500, null), depense("d2", 1000, "Cadeaux")],
        ),
      ),
    );
    await monterVue();

    expect(section().getByText("Non budgété")).toBeInTheDocument();
    expect(section().getByText("Sans catégorie")).toBeInTheDocument();
    expect(section().getByText("Cadeaux")).toBeInTheDocument();
    // 25,00 € + 10,00 € = 35,00 € hors enveloppe.
    expect(normaliser(section().getByText(/35,00/).textContent ?? "")).toContain("35,00");
  });

  it("met à jour l'enveloppe quand une dépense est supprimée (scénario 4)", async () => {
    const utilisateur = userEvent.setup();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document(
          [{ id: "e1", category: "Courses", month: moisCourant(), limitCents: 40000 }],
          [
            // Libellés distincts : sans eux, les deux boutons « Détail » du journal porteraient
            // le même nom accessible, la dépense visée devenant ambiguë.
            { ...depense("d1", 12050, "Courses"), label: "Marché" },
            { ...depense("d2", 7950, "Courses"), label: "Épicerie" },
          ],
        ),
      ),
    );
    await monterVue();

    // 120,50 € + 79,50 € = 200,00 € dépensés, 200,00 € restants.
    expect(
      normaliser(ligne("Courses").getByText("Dépensé").nextElementSibling?.textContent ?? ""),
    ).toContain("200,00");

    // Suppression par le journal : l'enveloppe suit, aucun total n'étant mémorisé (EF-010).
    const journal = within(screen.getByRole("region", { name: "Mes dépenses" }));
    await utilisateur.click(journal.getByRole("button", { name: /Détail de Marché/ }));
    await utilisateur.click(journal.getByRole("button", { name: "Supprimer" }));
    await utilisateur.click(
      journal.getByRole("button", { name: "Confirmer la suppression" }),
    );

    await waitFor(() => {
      expect(
        normaliser(
          ligne("Courses").getByText("Dépensé").nextElementSibling?.textContent ?? "",
        ),
      ).toContain("79,50");
    });
  });

  it("ignore une dépense datée d'un autre mois", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document(
          [{ id: "e1", category: "Courses", month: moisCourant(), limitCents: 40000 }],
          [depense("hors", 30000, "Courses", "2020-01-15")],
        ),
      ),
    );
    await monterVue();

    expect(section().getByText("Non entamée")).toBeInTheDocument();
  });
});

describe("Enveloppes — alerte et dépassement (récit 3)", () => {
  /** Plafond de 400,00 € : le seuil d'alerte tombe exactement sur 340,00 €. */
  function avecDepense(centimes: number) {
    return JSON.stringify(
      document(
        [{ id: "e1", category: "Courses", month: moisCourant(), limitCents: 40000 }],
        [depense("d1", centimes, "Courses")],
      ),
    );
  }

  it("n'annonce pas l'alerte avant le seuil exact de 85 % (T035)", async () => {
    localStorage.setItem(STORAGE_KEY, avecDepense(33999));
    await monterVue();

    expect(section().getByText("Maîtrisée")).toBeInTheDocument();
    expect(section().queryByText("Proche du plafond")).not.toBeInTheDocument();
  });

  it("annonce l'alerte au centime exact du seuil (EF-015)", async () => {
    localStorage.setItem(STORAGE_KEY, avecDepense(34000));
    await monterVue();

    expect(section().getByText("Proche du plafond")).toBeInTheDocument();
  });

  it("affiche un montant de dépassement, jamais un reste négatif (EF-016)", async () => {
    localStorage.setItem(STORAGE_KEY, avecDepense(44500));
    await monterVue();

    expect(section().getByText("En dépassement")).toBeInTheDocument();

    // Dans la ligne, le troisième montant devient un dépassement : le mot « Restant » en
    // disparaît, et aucun reste négatif n'est affiché (EF-016).
    const courses = ligne("Courses");
    expect(courses.queryByText("Restant")).not.toBeInTheDocument();
    // 445,00 € − 400,00 € = 45,00 €, affiché positivement.
    expect(
      normaliser(courses.getByText("Dépassement").nextElementSibling?.textContent ?? ""),
    ).toContain("45,00");
    // La synthèse, elle, garde le signe de son total : au niveau du mois la question est
    // « de combien le plan est-il dépassé », et masquer le signe rendrait ce total faux.
    expect(courses.queryByText(/−45,00|-45,00/)).not.toBeInTheDocument();
  });

  it("récapitule le nombre et le montant des dépassements (EF-018)", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document(
          [
            { id: "e1", category: "Courses", month: moisCourant(), limitCents: 10000 },
            { id: "e2", category: "Loisirs", month: moisCourant(), limitCents: 5000 },
          ],
          [depense("d1", 12000, "Courses"), depense("d2", 6000, "Loisirs")],
        ),
      ),
    );
    await monterVue();

    // 20,00 € + 10,00 € = 30,00 € de dépassement sur deux enveloppes.
    const recap = section().getByText(/enveloppes en dépassement/);
    expect(normaliser(recap.textContent ?? "")).toContain("2 enveloppes en dépassement");
    expect(normaliser(recap.textContent ?? "")).toContain("30,00");
  });
});

describe("Enveloppes — report des plafonds (récit 4)", () => {
  const bouton = () =>
    section().getByRole("button", { name: /Reprendre les plafonds/ });

  it("désactive le report et l'explique quand le mois précédent est vide (EF-020)", async () => {
    await monterVue();

    expect(bouton()).toBeDisabled();
    expect(section().getByText(/rien à copier/)).toBeInTheDocument();
  });

  it("copie les plafonds du mois précédent, dépensés repartant de zéro", async () => {
    const utilisateur = userEvent.setup();
    const d = new Date();
    const precedent = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    // Un mois précédent réel : on décale la date de référence d'un mois en arrière.
    const anterieur = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const clePrecedente = `${anterieur.getFullYear()}-${String(
      anterieur.getMonth() + 1,
    ).padStart(2, "0")}`;
    expect(clePrecedente).not.toBe(precedent);

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document([
          { id: "p1", category: "Courses", month: clePrecedente, limitCents: 40000 },
          { id: "p2", category: "Loisirs", month: clePrecedente, limitCents: 8000 },
        ]),
      ),
    );
    await monterVue();

    await utilisateur.click(bouton());

    await waitFor(() => {
      const doc = documentStocke();
      const duMois = doc?.envelopes.filter((e) => e.month === precedent) ?? [];
      expect(duMois).toHaveLength(2);
      // Nouveaux identifiants : la copie est indépendante de son original (EF-022).
      expect(duMois.map((e) => e.id)).not.toContain("p1");
      expect(duMois.map((e) => e.id)).not.toContain("p2");
    });

    // Les plafonds sont repris, les dépensés repartent de zéro.
    expect(section().getAllByText("Non entamée")).toHaveLength(2);
  });

  it("demande confirmation avant de remplacer des plafonds existants (EF-021)", async () => {
    const utilisateur = userEvent.setup();
    const d = new Date();
    const anterieur = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const clePrecedente = `${anterieur.getFullYear()}-${String(
      anterieur.getMonth() + 1,
    ).padStart(2, "0")}`;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document([
          { id: "p1", category: "Courses", month: clePrecedente, limitCents: 40000 },
          { id: "actuel", category: "Loisirs", month: moisCourant(), limitCents: 9900 },
        ]),
      ),
    );
    await monterVue();

    await utilisateur.click(bouton());

    // Rien n'est écrit tant que le remplacement n'est pas confirmé.
    expect(section().getByRole("alert")).toHaveTextContent(/remplacera/);
    expect(documentStocke()?.envelopes.map((e) => e.id)).toContain("actuel");

    await utilisateur.click(section().getByRole("button", { name: "Annuler" }));
    expect(documentStocke()?.envelopes.map((e) => e.id)).toContain("actuel");

    await utilisateur.click(bouton());
    await utilisateur.click(section().getByRole("button", { name: "Remplacer" }));

    await waitFor(() => {
      const doc = documentStocke();
      expect(doc?.envelopes.map((e) => e.id)).not.toContain("actuel");
      expect(
        doc?.envelopes.filter((e) => e.month === moisCourant()).map((e) => e.category),
      ).toEqual(["Courses"]);
    });
  });
});

describe("Enveloppes — suppression (récit 1, scénario 3)", () => {
  it("bascule les dépenses en non budgété et le dit avant de supprimer", async () => {
    const utilisateur = userEvent.setup();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document(
          [{ id: "e1", category: "Courses", month: moisCourant(), limitCents: 40000 }],
          [depense("d1", 5000, "Courses")],
        ),
      ),
    );
    await monterVue();

    await utilisateur.click(
      section().getByRole("button", { name: /Supprimer l’enveloppe Courses/ }),
    );

    const alerte = within(section().getByRole("alert"));
    expect(section().getByRole("alert")).toHaveTextContent(/Non budgété/);
    expect(documentStocke()?.envelopes).toHaveLength(1);

    await utilisateur.click(alerte.getByRole("button", { name: "Supprimer" }));

    await waitFor(() => {
      expect(documentStocke()?.envelopes).toEqual([]);
    });
    // La dépense subsiste, reclassée en non budgété.
    expect(documentStocke()?.expenses).toHaveLength(1);
    expect(section().getByText("Non budgété")).toBeInTheDocument();
  });
});

describe("Enveloppes — la section suit le sélecteur de mois (EF-019, scénario 9)", () => {
  it("change d'enveloppes en changeant de mois, sans second sélecteur", async () => {
    const utilisateur = userEvent.setup();
    const d = new Date();
    const suivant = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const cleSuivante = `${suivant.getFullYear()}-${String(
      suivant.getMonth() + 1,
    ).padStart(2, "0")}`;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        document([
          { id: "e1", category: "Courses", month: moisCourant(), limitCents: 40000 },
          { id: "e2", category: "Vacances", month: cleSuivante, limitCents: 60000 },
        ]),
      ),
    );
    await monterVue();

    expect(section().getByText("Courses")).toBeInTheDocument();
    expect(section().queryByText("Vacances")).not.toBeInTheDocument();

    // La section n'a pas de sélecteur : c'est celui de l'en-tête qui la commande.
    await utilisateur.click(screen.getByRole("button", { name: "Mois suivant" }));

    await waitFor(() => {
      expect(section().getByText("Vacances")).toBeInTheDocument();
    });
    expect(section().queryByText("Courses")).not.toBeInTheDocument();

    // Isolation : revenir en arrière retrouve le mois précédent intact (CS-007).
    await utilisateur.click(screen.getByRole("button", { name: "Mois précédent" }));
    await waitFor(() => {
      expect(section().getByText("Courses")).toBeInTheDocument();
    });
    expect(
      normaliser(ligne("Courses").getByText("Plafond").nextElementSibling?.textContent ?? ""),
    ).toContain("400,00");
  });
});
