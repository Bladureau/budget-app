import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { STORAGE_KEY } from "@/lib/storage";
import { SYNC_METADATA_KEY } from "@/lib/sync-metadata";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

/**
 * Serveur simulé, tenu en mémoire.
 *
 * Il reproduit exactement le contrat : révision incrémentée, `409` avec l'état courant, et
 * validation minimale. Deux « appareils » sont deux montages successifs de l'application
 * partageant ce serveur — c'est ce qui rend le récit 1 vérifiable sans deux navigateurs.
 */
class ServeurSimule {
  revision = 0;
  document: BudgetDocument = emptyDocument();
  updatedAt: string | null = null;
  horsService: "offline" | null = null;
  appels = { get: 0, put: 0 };

  reponse(statut: number, corps: unknown): Response {
    return new Response(JSON.stringify(corps), {
      status: statut,
      headers: { "Content-Type": "application/json" },
    });
  }

  handler = async (_url: string, options?: RequestInit): Promise<Response> => {
    if (this.horsService === "offline") throw new TypeError("Failed to fetch");

    if (!options || options.method === "GET" || options.method === undefined) {
      this.appels.get += 1;
      return this.reponse(200, {
        revision: this.revision,
        updatedAt: this.updatedAt,
        document: this.document,
      });
    }

    this.appels.put += 1;
    const corps = JSON.parse(String(options.body)) as {
      baseRevision: number;
      document: BudgetDocument;
    };

    if (corps.baseRevision !== this.revision) {
      return this.reponse(409, {
        error: "revisionMismatch",
        revision: this.revision,
        updatedAt: this.updatedAt,
        document: this.document,
      });
    }

    this.revision += 1;
    this.document = corps.document;
    this.updatedAt = new Date().toISOString();
    return this.reponse(200, { revision: this.revision, updatedAt: this.updatedAt });
  };
}

let serveur: ServeurSimule;

beforeEach(() => {
  localStorage.clear();
  serveur = new ServeurSimule();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => serveur.handler(url, options)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Monte l'application, comme le ferait l'ouverture d'un onglet sur un appareil.
 *
 * `vi.resetModules()` est indispensable et non décoratif : le fournisseur retient
 * l'instantané du document dans une variable **de module**. Sans réinitialisation, un
 * second montage relirait le budget du premier et « l'autre appareil » n'en serait pas un.
 */
async function ouvrirAppareil() {
  vi.resetModules();
  const { BudgetProvider } = await import("@/features/budget/budget-provider");
  const { BudgetView } = await import("@/features/budget/components/budget-view");

  const rendu = render(
    <BudgetProvider>
      <BudgetView />
    </BudgetProvider>,
  );

  // Laisse la lecture initiale se terminer avant que le test n'agisse.
  await waitFor(() => expect(serveur.appels.get).toBeGreaterThan(0));
  return rendu;
}

/**
 * Simule le passage sur un autre appareil : le stockage du navigateur est vidé, le serveur
 * conserve son état. C'est exactement la situation du récit 1.
 */
function changerDAppareil(): void {
  cleanup();
  localStorage.clear();
}

function sectionSaisie() {
  return within(screen.getByRole("region", { name: "Nouvelle dépense" }));
}

/**
 * Le montant apparaît à plusieurs endroits de la vue ; le journal est celui qui fait foi.
 *
 * Il vit dans l'onglet « Dépenses », masqué à l'ouverture (fonctionnalité 007) : ces tests
 * portent sur les données synchronisées, pas sur la navigation, d'où `hidden: true`.
 */
function sectionJournal() {
  return within(screen.getByRole("region", { name: "Mes dépenses", hidden: true }));
}

async function saisirDepense(montant: string) {
  const utilisateur = userEvent.setup();
  await utilisateur.type(sectionSaisie().getByLabelText("Montant"), montant);
  await utilisateur.click(sectionSaisie().getByRole("button", { name: "Enregistrer" }));
}

// --- Récit 1 : retrouver son budget sur un autre appareil -------------------------------------

describe("récit 1 — synchronisation entre appareils", () => {
  it("pousse une dépense saisie vers le stockage central", async () => {
    await ouvrirAppareil();

    await saisirDepense("12,50");

    await waitFor(() => expect(serveur.revision).toBe(1));
    expect(serveur.document.expenses).toHaveLength(1);
    // Au centime, et en entier : 12,50 € vaut 1250 centimes, jamais 12.5.
    expect(serveur.document.expenses[0].amountCents).toBe(1250);
    expect(Number.isInteger(serveur.document.expenses[0].amountCents)).toBe(true);


  });

  it("restitue le budget à un appareil qui ne l'a jamais affiché", async () => {
    await ouvrirAppareil();
    await saisirDepense("12,50");
    await waitFor(() => expect(serveur.revision).toBe(1));


    changerDAppareil();
    await ouvrirAppareil();

    // Le second appareil affiche la dépense du premier, sans qu'on ait rien importé.
    await waitFor(() => {
      // Deux occurrences dans le journal : le sous-total du jour et la ligne elle-même.
      expect(sectionJournal().getAllByText("12,50 €").length).toBeGreaterThan(0);
    });

    expect(localStorage.getItem(STORAGE_KEY)).toContain("1250");
  });

  it("propage une suppression aux autres appareils", async () => {
    await ouvrirAppareil();
    await saisirDepense("30,00");
    await waitFor(() => expect(serveur.revision).toBe(1));


    // L'autre appareil supprime : le serveur ne détient plus la dépense.
    serveur.document = emptyDocument();
    serveur.revision = 2;

    changerDAppareil();
    await ouvrirAppareil();

    await waitFor(() => {
      expect(sectionJournal().queryByText("30,00 €")).not.toBeInTheDocument();
    });
  });

  it("adopte l'état distant sur un appareil neuf, sans réclamer un choix", async () => {
    serveur.document = {
      ...emptyDocument(),
      expenses: [{ id: "d-1", amountCents: 4200, date: "2026-09-07", category: "Courses" }],
    };
    serveur.revision = 5;
    serveur.updatedAt = "2026-09-07T10:00:00.000Z";

    await ouvrirAppareil();

    // Un appareil qui n'a rien saisi n'a rien à défendre : le traiter en conflit
    // imposerait un choix à quelqu'un qui n'a aucune modification locale.
    await waitFor(() =>
      expect(sectionJournal().getAllByText("42,00 €").length).toBeGreaterThan(0),
    );
    expect(screen.queryByText(/choisissez laquelle garder/i)).not.toBeInTheDocument();
  });

  it("enregistre la révision servie par le serveur", async () => {
    serveur.revision = 9;
    serveur.updatedAt = "2026-09-07T10:00:00.000Z";

    await ouvrirAppareil();

    await waitFor(() => {
      const brut = localStorage.getItem(SYNC_METADATA_KEY);
      expect(brut).not.toBeNull();
      expect(JSON.parse(String(brut))).toEqual({ baseRevision: 9, pendingChanges: false });
    });
  });

  it("annonce l'état « synchronisé » une fois à jour", async () => {
    await ouvrirAppareil();
    await waitFor(() => expect(screen.getByText("Synchronisé")).toBeInTheDocument());
  });
});

// --- Migration du budget existant (récit 2) ---------------------------------------------------

describe("récit 2 — reprise d'un budget déjà présent dans le navigateur", () => {
  it("pousse vers le serveur vide le budget trouvé localement, sans ressaisie", async () => {
    // Situation exacte de la bascule : le navigateur détient le budget, le serveur est neuf.
    const existant: BudgetDocument = {
      ...emptyDocument(),
      expenses: [
        { id: "d-1", amountCents: 1250, date: "2026-09-05", category: "Courses" },
        { id: "d-2", amountCents: 3300, date: "2026-09-06", category: "Transport" },
      ],
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existant));

    await ouvrirAppareil();

    await waitFor(() => expect(serveur.revision).toBe(1));
    expect(serveur.document.expenses).toHaveLength(2);

    // Somme identique au centime : 1250 + 3300.
    const somme = serveur.document.expenses.reduce((t, d) => t + d.amountCents, 0);
    expect(somme).toBe(4550);
  });
});

// --- Coalescence ------------------------------------------------------------------------------

describe("coalescence des poussées", () => {
  it("ne laisse qu'une poussée en vol à la fois", async () => {
    await ouvrirAppareil();

    // Trois saisies rapprochées : le document poussé étant toujours le dernier état
    // complet, une poussée par saisie n'apporterait rien.
    await saisirDepense("10,00");
    await saisirDepense("20,00");
    await saisirDepense("30,00");

    await waitFor(() => expect(serveur.document.expenses).toHaveLength(3));

    // Le serveur finit par détenir les trois, quel qu'ait été le nombre de requêtes.
    const somme = serveur.document.expenses.reduce((t, d) => t + d.amountCents, 0);
    expect(somme).toBe(6000);
  });
});

// --- Récit 3 : hors connexion -----------------------------------------------------------------

describe("récit 3 — continuer à saisir quand le stockage central est injoignable", () => {
  it("affiche le budget de la dernière synchronisation et le signale comme peut-être périmé", async () => {
    serveur.document = {
      ...emptyDocument(),
      expenses: [{ id: "d-1", amountCents: 4200, date: "2026-09-07", category: "Courses" }],
    };
    serveur.revision = 3;
    await ouvrirAppareil();
    await waitFor(() => expect(sectionJournal().getAllByText("42,00 €").length).toBeGreaterThan(0));

    cleanup();
    serveur.horsService = "offline";
    await ouvrirAppareil();

    // La dépense reste consultable, et l'utilisateur apprend qu'elle peut ne pas être à jour.
    await waitFor(() =>
      expect(sectionJournal().getAllByText("42,00 €").length).toBeGreaterThan(0),
    );
    expect(screen.getByText(/peut ne pas être à jour/i)).toBeInTheDocument();
  });

  it("enregistre et affiche une saisie faite hors connexion, en la signalant non synchronisée", async () => {
    await ouvrirAppareil();
    serveur.horsService = "offline";

    await saisirDepense("15,00");

    // La saisie n'a jamais attendu le réseau : elle est là, tout de suite.
    await waitFor(() =>
      expect(sectionJournal().getAllByText("15,00 €").length).toBeGreaterThan(0),
    );
    expect(JSON.parse(String(localStorage.getItem(STORAGE_KEY))).expenses).toHaveLength(1);

    await waitFor(() =>
      expect(screen.getByText(/rejoindront le budget central au retour du réseau/i)).toBeInTheDocument(),
    );
  });

  it("laisse le drapeau « en attente » levé après un échec de poussée (EF-025)", async () => {
    await ouvrirAppareil();
    serveur.horsService = "offline";

    await saisirDepense("15,00");

    // AUCUN échec ne baisse le drapeau : c'est ce qui empêche une saisie d'être oubliée
    // à la faveur d'une erreur réseau.
    await waitFor(() => {
      const meta = JSON.parse(String(localStorage.getItem(SYNC_METADATA_KEY)));
      expect(meta.pendingChanges).toBe(true);
    });
  });

  it("rejoint le stockage central au retour du réseau, sans action et sans doublon", async () => {
    await ouvrirAppareil();
    serveur.horsService = "offline";
    await saisirDepense("15,00");
    await waitFor(() => expect(screen.getByText(/rejoindront le budget central/i)).toBeInTheDocument());

    serveur.horsService = null;
    window.dispatchEvent(new Event("online"));

    await waitFor(() => expect(serveur.document.expenses).toHaveLength(1));
    expect(serveur.document.expenses[0].amountCents).toBe(1500);

    // Un second retour de réseau ne doit rien dupliquer : la poussée est idempotente
    // parce que l'unité de synchronisation est le document entier (EF-019).
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(serveur.document.expenses).toHaveLength(1));
  });

  it("signale explicitement un échec d'enregistrement plutôt que de laisser croire au succès (EF-012)", async () => {
    await ouvrirAppareil();
    serveur.horsService = "offline";

    await saisirDepense("15,00");

    await waitFor(() =>
      expect(screen.getByText(/conservées sur cet appareil/i)).toBeInTheDocument(),
    );
    // « Synchronisé » ne doit surtout pas rester affiché.
    expect(screen.queryByText("Synchronisé")).not.toBeInTheDocument();
  });
});

// --- Conflit entre appareils (EF-024, EF-025) -------------------------------------------------

describe("conflit entre appareils", () => {
  /** Amène l'application dans l'état de conflit : saisie locale + serveur qui a bougé. */
  async function provoquerUnConflit() {
    await ouvrirAppareil();
    serveur.horsService = "offline";
    await saisirDepense("15,00");
    await waitFor(() => expect(screen.getByText(/rejoindront le budget central/i)).toBeInTheDocument());

    // Pendant ce temps, l'autre appareil a écrit.
    serveur.horsService = null;
    serveur.revision = 7;
    serveur.document = {
      ...emptyDocument(),
      expenses: [{ id: "autre", amountCents: 9900, date: "2026-09-07", category: "Autre" }],
    };

    window.dispatchEvent(new Event("online"));
    await screen.findByRole("region", { name: "Conflit de synchronisation" });
  }

  it("n'écrase rien et propose deux choix explicites", async () => {
    await provoquerUnConflit();

    const dialogue = within(screen.getByRole("region", { name: "Conflit de synchronisation" }));
    expect(dialogue.getByRole("button", { name: "Conserver mes modifications" })).toBeInTheDocument();
    expect(dialogue.getByRole("button", { name: "Reprendre la version du serveur" })).toBeInTheDocument();

    // Chaque action dit ce qu'elle fait perdre.
    expect(dialogue.getByText(/l’autre appareil seront perdues/i)).toBeInTheDocument();
    expect(dialogue.getByText(/cet appareil seront perdues/i)).toBeInTheDocument();

    // Rien n'a été écrasé, ni ici ni là-bas.
    expect(serveur.document.expenses[0].amountCents).toBe(9900);
    expect(JSON.parse(String(localStorage.getItem(STORAGE_KEY))).expenses[0].amountCents).toBe(1500);
  });

  it("propose d'exporter avant de trancher", async () => {
    await provoquerUnConflit();
    const dialogue = within(screen.getByRole("region", { name: "Conflit de synchronisation" }));
    expect(dialogue.getByText(/télécharger une sauvegarde avant de choisir/i)).toBeInTheDocument();
  });

  it("« conserver mes modifications » impose l'état local au serveur", async () => {
    await provoquerUnConflit();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole("button", { name: "Conserver mes modifications" }));

    await waitFor(() => expect(serveur.document.expenses[0].amountCents).toBe(1500));
    expect(serveur.revision).toBe(8);
  });

  it("« reprendre la version du serveur » adopte l'état distant", async () => {
    await provoquerUnConflit();
    const utilisateur = userEvent.setup();

    await utilisateur.click(screen.getByRole("button", { name: "Reprendre la version du serveur" }));

    await waitFor(() => {
      expect(JSON.parse(String(localStorage.getItem(STORAGE_KEY))).expenses[0].amountCents).toBe(9900);
    });
    // La saisie locale est perdue — mais l'utilisateur l'a décidé, ce qui est exactement
    // la différence que pose EF-025.
    await waitFor(() => expect(screen.getByText("Synchronisé")).toBeInTheDocument());
  });

  it("ne bloque pas la saisie tant que le choix n'est pas fait", async () => {
    await provoquerUnConflit();
    // Un conflit n'est pas une panne : le formulaire reste utilisable.
    expect(sectionSaisie().getByLabelText("Montant")).toBeEnabled();
  });
});

// --- Accessibilité des surfaces ajoutées (principe VII) ---------------------------------------

describe("accessibilité des états de synchronisation", () => {
  it("annonce l'état sans interrompre : région polie, pas alerte", async () => {
    await ouvrirAppareil();
    const region = await waitFor(() => {
      const element = screen.getByText("Synchronisé").closest("[aria-live]");
      expect(element).not.toBeNull();
      return element as HTMLElement;
    });

    // Passer hors connexion mérite d'être annoncé, pas d'interrompre une saisie en cours.
    expect(region.getAttribute("aria-live")).toBe("polite");
  });

  it("porte chaque état par du texte, pas par la seule couleur", async () => {
    await ouvrirAppareil();
    serveur.horsService = "offline";
    await saisirDepense("15,00");

    // Le message se lit intégralement sans percevoir aucune couleur.
    const message = await screen.findByText(/rejoindront le budget central au retour du réseau/i);
    expect(message.textContent?.trim().length).toBeGreaterThan(20);
  });

  it("le dialogue de conflit est une région nommée, avec un titre", async () => {
    await ouvrirAppareil();
    serveur.horsService = "offline";
    await saisirDepense("15,00");
    await waitFor(() => expect(screen.getByText(/rejoindront le budget central/i)).toBeInTheDocument());

    serveur.horsService = null;
    serveur.revision = 7;
    serveur.document = {
      ...emptyDocument(),
      expenses: [{ id: "autre", amountCents: 9900, date: "2026-09-07", category: "Autre" }],
    };
    window.dispatchEvent(new Event("online"));

    const dialogue = await screen.findByRole("region", { name: "Conflit de synchronisation" });
    expect(within(dialogue).getByRole("heading")).toBeInTheDocument();
  });

  it("les deux actions de conflit sont atteignables au clavier", async () => {
    await ouvrirAppareil();
    serveur.horsService = "offline";
    await saisirDepense("15,00");
    await waitFor(() => expect(screen.getByText(/rejoindront le budget central/i)).toBeInTheDocument());

    serveur.horsService = null;
    serveur.revision = 7;
    serveur.document = emptyDocument();
    window.dispatchEvent(new Event("online"));
    await screen.findByRole("region", { name: "Conflit de synchronisation" });

    const utilisateur = userEvent.setup();
    await utilisateur.tab();
    // Une tabulation finit par atteindre les deux boutons : ce sont de vrais `<button>`,
    // pas des `div` cliquables.
    const boutons = screen.getAllByRole("button", {
      name: /Conserver mes modifications|Reprendre la version du serveur/,
    });
    expect(boutons).toHaveLength(2);
    for (const bouton of boutons) expect(bouton.tagName).toBe("BUTTON");
  });
});
