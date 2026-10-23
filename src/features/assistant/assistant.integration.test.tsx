/**
 * L'assistant dans l'application montée (specs/009-local-ai-assistant, récits 1 à 3).
 *
 * Le serveur est simulé en mémoire : budget central, points d'entrée bancaires et route de
 * l'assistant, dont chaque réponse est pilotée à la main pour pouvoir observer l'interface
 * **pendant** que le texte arrive. Le vrai modèle n'est jamais appelé.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ouvrirOnglet, panneau, reinitialiserAdresse } from "@/test/navigation";
import { buildReferenceDocument } from "@/features/assistant/fixtures";
import {
  BUSY_EXPLANATION,
  CANCELLED,
  CONFIRM_RESET,
  EXAMPLE_QUESTIONS,
  FAILED,
  INTERRUPTED,
  LOADING,
  PENDING_CHANGES_NOTICE,
  QUESTION_EMPTY,
  QUESTION_TOO_LONG,
  UNAUTHORIZED,
  UNAVAILABLE,
  unverifiedWarning,
} from "@/features/assistant/messages";
import type { StreamEvent } from "@/features/assistant/types";
import type { BudgetDocument } from "@/features/budget/types";

const encodeur = new TextEncoder();

/** Une réponse en flux que le test fait avancer à la main. */
class FluxPilote {
  readonly reponse: Response;
  annule = false;
  private controleur!: ReadableStreamDefaultController<Uint8Array>;

  constructor(signal?: AbortSignal | null) {
    const flux = new ReadableStream<Uint8Array>({
      start: (controleur) => {
        this.controleur = controleur;
      },
      cancel: () => {
        this.annule = true;
      },
    });
    this.reponse = new Response(flux, { status: 200 });
    // Comme `fetch` : abandonner la requête interrompt la lecture du corps.
    signal?.addEventListener("abort", () => {
      this.annule = true;
      try {
        this.controleur.error(signal.reason);
      } catch {
        // Déjà fermé : rien à interrompre.
      }
    });
  }

  pousser(evenement: StreamEvent): void {
    this.controleur.enqueue(encodeur.encode(`${JSON.stringify(evenement)}\n`));
  }

  /** Ferme le flux sans événement terminal (coupure). */
  couper(): void {
    this.controleur.close();
  }

  terminer(...evenements: StreamEvent[]): void {
    for (const evenement of evenements) this.pousser(evenement);
    this.controleur.close();
  }
}

interface RequeteAssistant {
  month: string;
  today: string;
  messages: { role: string; content: string }[];
  signal: AbortSignal | null | undefined;
}

class ServeurSimule {
  revision = 1;
  document: BudgetDocument = buildReferenceDocument();
  requetes: RequeteAssistant[] = [];
  pilotes: FluxPilote[] = [];
  /** Réponse de la prochaine requête à l'assistant ; par défaut, un flux piloté. */
  prochaine: ((signal?: AbortSignal | null) => Response | Promise<Response>) | null = null;
  /** Bloque les écritures du budget : les saisies restent « en attente de synchronisation ». */
  bloquerEcritures = false;

  reponse(statut: number, corps: unknown): Response {
    return new Response(JSON.stringify(corps), {
      status: statut,
      headers: { "Content-Type": "application/json" },
    });
  }

  handler = async (url: string, options?: RequestInit): Promise<Response> => {
    if (url.startsWith("/api/assistant")) {
      this.requetes.push({
        ...(JSON.parse(String(options?.body)) as Omit<RequeteAssistant, "signal">),
        signal: options?.signal,
      });
      if (this.prochaine !== null) {
        const faire = this.prochaine;
        this.prochaine = null;
        return faire(options?.signal);
      }
      const pilote = new FluxPilote(options?.signal);
      this.pilotes.push(pilote);
      return pilote.reponse;
    }
    if (url.startsWith("/api/banking/status")) {
      return this.reponse(200, { configured: false, banks: [] });
    }
    if (url.startsWith("/api/banking/operations")) {
      return this.reponse(200, { operations: [], banks: [] });
    }
    if (!options || options.method === "GET" || options.method === undefined) {
      return this.reponse(200, { revision: this.revision, updatedAt: null, document: this.document });
    }
    if (this.bloquerEcritures) return new Promise<Response>(() => undefined);
    const corps = JSON.parse(String(options.body)) as { document: BudgetDocument };
    this.revision += 1;
    this.document = corps.document;
    return this.reponse(200, { revision: this.revision, updatedAt: new Date().toISOString() });
  };

  /** Le pilote de la dernière réponse en flux. */
  get dernierPilote(): FluxPilote {
    const pilote = this.pilotes.at(-1);
    if (pilote === undefined) throw new Error("aucune réponse en flux n'a été demandée");
    return pilote;
  }
}

let serveur: ServeurSimule;

beforeEach(() => {
  localStorage.clear();
  serveur = new ServeurSimule();
  // Seule l'horloge est simulée : « aujourd'hui » vaut le 24 octobre 2026, jour de la fixture.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 24, 10, 0, 0));
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => serveur.handler(url, options)));
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  reinitialiserAdresse();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function ouvrirApplication(): Promise<void> {
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

/** Ouvre l'application sur l'onglet Assistant et rend ses éléments usuels. */
async function ouvrirAssistant() {
  await ouvrirApplication();
  await ouvrirOnglet("Assistant");
  const panel = within(panneau("Assistant"));
  return {
    panel,
    champ: () => panel.getByRole("textbox", { name: "Votre question" }),
    envoyer: () => panel.getByRole("button", { name: "Envoyer" }),
    annuler: () => panel.queryByRole("button", { name: "Annuler" }),
    statut: () => panel.getByRole("status"),
    /** La liste des échanges : la région de statut masquée répète certains textes, pas elle. */
    liste: () => within(panel.getByRole("list", { name: "Conversation" })),
  };
}

async function poser(
  utilisateur: ReturnType<typeof userEvent.setup>,
  assistant: Awaited<ReturnType<typeof ouvrirAssistant>>,
  question: string,
): Promise<void> {
  await utilisateur.type(assistant.champ(), question);
  await utilisateur.click(assistant.envoyer());
}

/** Une conversation terminée, le serveur répondant `reponse` à `question`. */
async function echange(
  utilisateur: ReturnType<typeof userEvent.setup>,
  assistant: Awaited<ReturnType<typeof ouvrirAssistant>>,
  question: string,
  reponse: string,
): Promise<void> {
  await poser(utilisateur, assistant, question);
  await waitFor(() => expect(serveur.pilotes.length).toBeGreaterThan(0));
  const pilote = serveur.dernierPilote;
  pilote.terminer({ type: "text", text: reponse }, { type: "done", unverified: [] });
  await waitFor(() => expect(assistant.champ()).toBeEnabled());
}

// --- Récit 1 : poser une question --------------------------------------------------------------------

describe("récit 1 — poser une question et lire la réponse", () => {
  it("ajoute un cinquième onglet « Assistant » au menu", async () => {
    await ouvrirApplication();
    const menu = within(screen.getByRole("navigation", { name: "Sections du budget" }));

    expect(menu.getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Aujourd’hui",
      "Dépenses",
      "Mois",
      "Assistant",
      "Réglages",
    ]);
  });

  it("nomme le mois interrogé et accueille avec des exemples", async () => {
    const { panel } = await ouvrirAssistant();

    expect(panel.getByText("Mois affiché : octobre 2026")).toBeInTheDocument();
    for (const exemple of EXAMPLE_QUESTIONS) {
      expect(panel.getByRole("button", { name: exemple })).toBeInTheDocument();
    }
  });

  it("affiche la réponse au fur et à mesure, puis annonce qu'elle est terminée", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Combien ai-je dépensé en courses ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    const pilote = serveur.dernierPilote;

    // Rien n'est encore arrivé : l'attente est dite en texte.
    expect(await assistant.panel.findByText("L'assistant réfléchit…")).toBeInTheDocument();

    pilote.pousser({ type: "text", text: "Vous avez dépensé " });
    expect(await assistant.panel.findByText(/Vous avez dépensé/)).toBeInTheDocument();
    expect(assistant.panel.queryByText(/312,47/)).not.toBeInTheDocument();

    pilote.terminer({ type: "text", text: "312,47 €." }, { type: "done", unverified: [] });
    expect(await assistant.panel.findByText(/Vous avez dépensé 312,47 €\./)).toBeInTheDocument();
    await waitFor(() => expect(assistant.statut()).toHaveTextContent("Réponse terminée"));
    expect(assistant.panel.queryByText(/Attention/)).not.toBeInTheDocument();
  });

  it("envoie le mois, la date du jour et la question au serveur", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "  Où en suis-je ?  ");

    await waitFor(() => expect(serveur.requetes).toHaveLength(1));
    expect(serveur.requetes[0]).toMatchObject({
      month: "2026-10",
      today: "2026-10-24",
      messages: [{ role: "user", content: "Où en suis-je ?" }],
    });
  });

  it("vide le champ après l'envoi et affiche la question de l'utilisateur", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Combien en courses ?");

    expect(assistant.panel.getByText("Combien en courses ?")).toBeInTheDocument();
    expect(assistant.champ()).toHaveValue("");
  });

  it("envoie avec Entrée, et saute une ligne avec Maj+Entrée", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await utilisateur.type(assistant.champ(), "ligne un{Shift>}{Enter}{/Shift}ligne deux");
    expect(assistant.champ()).toHaveValue("ligne un\nligne deux");
    expect(serveur.requetes).toHaveLength(0);

    await utilisateur.type(assistant.champ(), "{Enter}");
    await waitFor(() => expect(serveur.requetes).toHaveLength(1));
  });

  it("avertit des montants que l'application n'a pas fournis, en texte", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Combien me reste-t-il ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    serveur.dernierPilote.terminer(
      { type: "text", text: "Il vous reste 999,99 €." },
      { type: "done", unverified: ["999,99 €"] },
    );

    expect(await assistant.panel.findByText(unverifiedWarning("999,99 €"))).toBeInTheDocument();
    // La réponse reste affichée : l'avertissement s'y ajoute, il ne la remplace pas.
    expect(assistant.panel.getByText("Il vous reste 999,99 €.")).toBeInTheDocument();
  });

  it("empêche d'envoyer ou de modifier pendant une réponse, et dit pourquoi (EF-020)", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Première question ?", "Première réponse.");

    await poser(utilisateur, assistant, "Seconde question ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(2));

    expect(assistant.champ()).toBeDisabled();
    expect(assistant.envoyer()).toBeDisabled();
    for (const modifier of assistant.panel.getAllByRole("button", { name: "Modifier" })) {
      expect(modifier).toBeDisabled();
    }
    expect(assistant.panel.getByRole("button", { name: "Nouvelle conversation" })).toBeDisabled();
    expect(assistant.panel.getByText(BUSY_EXPLANATION)).toBeInTheDocument();
    expect(assistant.champ()).toHaveAccessibleDescription(new RegExp(BUSY_EXPLANATION));
    expect(assistant.annuler()).toBeInTheDocument();

    serveur.dernierPilote.terminer({ type: "text", text: "Ok." }, { type: "done", unverified: [] });
    await waitFor(() => expect(assistant.champ()).toBeEnabled());
    expect(assistant.envoyer()).toBeEnabled();
    expect(assistant.annuler()).not.toBeInTheDocument();
    expect(assistant.panel.queryByText(BUSY_EXPLANATION)).not.toBeInTheDocument();
  });

  it("refuse une question vide, en texte", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await utilisateur.click(assistant.envoyer());

    expect(assistant.panel.getByText(QUESTION_EMPTY)).toBeInTheDocument();
    expect(serveur.requetes).toHaveLength(0);
  });

  it("refuse une question de plus de 500 caractères avant tout envoi", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    fireEvent.change(assistant.champ(), { target: { value: "a".repeat(501) } });

    expect(assistant.panel.getByText(QUESTION_TOO_LONG)).toBeInTheDocument();
    expect(assistant.panel.getByText("501/500")).toBeInTheDocument();
    expect(assistant.envoyer()).toBeDisabled();
    await utilisateur.type(assistant.champ(), "{Enter}");
    expect(serveur.requetes).toHaveLength(0);
  });

  it("accepte exactement 500 caractères", async () => {
    const assistant = await ouvrirAssistant();
    fireEvent.change(assistant.champ(), { target: { value: "a".repeat(500) } });

    expect(assistant.panel.queryByText(QUESTION_TOO_LONG)).not.toBeInTheDocument();
    expect(assistant.envoyer()).toBeEnabled();
  });

  it("remplit le champ avec un exemple, sans envoyer", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await utilisateur.click(assistant.panel.getByRole("button", { name: EXAMPLE_QUESTIONS[0] }));

    expect(assistant.champ()).toHaveValue(EXAMPLE_QUESTIONS[0]);
    expect(serveur.requetes).toHaveLength(0);
  });

  it("dit que le mois affiché est passé", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirApplication();
    await utilisateur.click(screen.getByRole("button", { name: "Mois précédent" }));
    await ouvrirOnglet("Assistant");

    expect(within(panneau("Assistant")).getByText("Mois affiché : septembre 2026 (passé)")).toBeInTheDocument();
  });

  it("prévient quand des modifications ne sont pas encore synchronisées", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirApplication();
    serveur.bloquerEcritures = true;

    await utilisateur.type(screen.getByRole("textbox", { name: "Montant" }), "12,40");
    await utilisateur.click(screen.getByRole("button", { name: "Enregistrer" }));
    await ouvrirOnglet("Assistant");

    expect(await within(panneau("Assistant")).findByText(PENDING_CHANGES_NOTICE)).toBeInTheDocument();
  });

  it("n'annonce pas la liste en direct : seule la région de statut l'est", async () => {
    const assistant = await ouvrirAssistant();
    expect(assistant.statut()).toHaveClass("sr-only");
    expect(assistant.panel.queryByRole("log")).not.toBeInTheDocument();
  });
});

// --- Récit 2 : l'application reste utilisable sans l'assistant --------------------------------------------

describe("récit 2 — IA indisponible", () => {
  it("dit « Assistant indisponible » et laisse le reste de l'application fonctionner", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    serveur.prochaine = () => serveur.reponse(503, { error: "assistantUnavailable" });

    await poser(utilisateur, assistant, "Bonjour ?");

    expect(await assistant.liste().findByText(UNAVAILABLE)).toBeInTheDocument();
    expect(assistant.panel.getByText(/Le reste du budget fonctionne normalement/)).toBeInTheDocument();
    // Aucune réponse n'a été inventée, aucun détail technique n'est affiché.
    expect(assistant.panel.queryByText(/503|assistantUnavailable|ECONN/)).not.toBeInTheDocument();
    await waitFor(() => expect(assistant.champ()).toBeEnabled());

    // Le reste de l'application répond comme d'habitude (EF-009).
    await ouvrirOnglet("Dépenses");
    expect(within(panneau("Dépenses")).getByRole("region", { name: "Mes dépenses" })).toBeVisible();
    await ouvrirOnglet("Aujourd’hui");
    expect(screen.getByRole("textbox", { name: "Montant" })).toBeVisible();
  });

  it("dit « Assistant indisponible » quand le réseau échoue", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    serveur.prochaine = () => Promise.reject(new TypeError("Failed to fetch"));

    await poser(utilisateur, assistant, "Bonjour ?");

    expect(await assistant.liste().findByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it("propose « Réessayer », et réussit sans recharger la page quand l'IA revient", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    serveur.prochaine = () => serveur.reponse(503, { error: "assistantUnavailable" });
    await poser(utilisateur, assistant, "Combien en courses ?");
    await assistant.liste().findByText(UNAVAILABLE);

    await utilisateur.click(assistant.panel.getByRole("button", { name: "Réessayer" }));

    await waitFor(() => expect(serveur.requetes).toHaveLength(2));
    // La même question est renvoyée, dans le même échange.
    expect(serveur.requetes[1].messages).toEqual([{ role: "user", content: "Combien en courses ?" }]);
    serveur.dernierPilote.terminer({ type: "text", text: "312,47 €." }, { type: "done", unverified: [] });
    expect(await assistant.panel.findByText("312,47 €.")).toBeInTheDocument();
    expect(assistant.liste().queryByText(UNAVAILABLE)).not.toBeInTheDocument();
    expect(assistant.liste().getAllByRole("listitem")).toHaveLength(1);
  });

  it("annonce le chargement du modèle", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Bonjour ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    serveur.dernierPilote.pousser({ type: "status", state: "loading" });

    expect(await assistant.panel.findByText(LOADING)).toBeInTheDocument();

    serveur.dernierPilote.pousser({ type: "text", text: "Bonjour." });
    await assistant.panel.findByText("Bonjour.");
    expect(assistant.panel.queryByText(LOADING)).not.toBeInTheDocument();
  });

  it("garde le texte reçu et marque la réponse interrompue quand le flux se coupe", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Bonjour ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    serveur.dernierPilote.pousser({ type: "text", text: "Début de répon" });
    await assistant.panel.findByText("Début de répon");
    serveur.dernierPilote.couper();

    expect(await assistant.liste().findByText(INTERRUPTED)).toBeInTheDocument();
    expect(assistant.panel.getByText("Début de répon")).toBeInTheDocument();
    expect(assistant.champ()).toBeEnabled();
  });

  it("signale l'erreur de flux envoyée par le serveur", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Bonjour ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    serveur.dernierPilote.terminer({ type: "error", code: "timeout" });

    expect(await assistant.liste().findByText(UNAVAILABLE)).toBeInTheDocument();
  });

  it("dit que l'accès est refusé sur un 401", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    serveur.prochaine = () => serveur.reponse(401, { error: "unauthorized" });

    await poser(utilisateur, assistant, "Bonjour ?");

    expect(await assistant.liste().findByText(UNAUTHORIZED)).toBeInTheDocument();
  });

  it("dit qu'une erreur est survenue sur un autre statut", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    serveur.prochaine = () => serveur.reponse(500, { error: "storageUnreadable" });

    await poser(utilisateur, assistant, "Bonjour ?");

    expect(await assistant.liste().findByText(FAILED)).toBeInTheDocument();
    expect(assistant.panel.queryByText(/storageUnreadable/)).not.toBeInTheDocument();
  });

  it("ne laisse aucune trace de l'assistant dans les autres onglets", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    serveur.prochaine = () => serveur.reponse(503, { error: "assistantUnavailable" });
    await poser(utilisateur, assistant, "Bonjour ?");
    await assistant.liste().findByText(UNAVAILABLE);

    for (const onglet of ["Aujourd’hui", "Dépenses", "Mois", "Réglages"]) {
      await ouvrirOnglet(onglet);
      expect(within(panneau(onglet)).queryByText(UNAVAILABLE)).not.toBeInTheDocument();
    }
  });
});

// --- Récit 3 : suivre une conversation ---------------------------------------------------------------------

describe("récit 3 — conversation, annulation, modification", () => {
  it("transmet les échanges précédents avec la question suivante", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Combien en courses ?", "312,47 €.");

    await poser(utilisateur, assistant, "Et en loisirs ?");
    await waitFor(() => expect(serveur.requetes).toHaveLength(2));

    expect(serveur.requetes[1].messages).toEqual([
      { role: "user", content: "Combien en courses ?" },
      { role: "assistant", content: "312,47 €." },
      { role: "user", content: "Et en loisirs ?" },
    ]);
  });

  it("propose « Annuler » seulement pendant une réponse, et y place le focus", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    expect(assistant.annuler()).not.toBeInTheDocument();

    await poser(utilisateur, assistant, "Bonjour ?");
    await waitFor(() => expect(assistant.annuler()).toBeInTheDocument());

    await waitFor(() => expect(assistant.annuler()).toHaveFocus());
  });

  it("annule la réponse : le texte reçu reste, la génération s'arrête, le champ est libre", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Résume tout.");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    serveur.dernierPilote.pousser({ type: "text", text: "Voici un début" });
    await assistant.panel.findByText("Voici un début");

    await utilisateur.click(assistant.annuler()!);

    expect(await assistant.liste().findByText(CANCELLED)).toBeInTheDocument();
    expect(assistant.panel.getByText("Voici un début")).toBeInTheDocument();
    expect(serveur.requetes[0].signal?.aborted).toBe(true);
    expect(serveur.dernierPilote.annule).toBe(true);
    expect(assistant.champ()).toBeEnabled();
    expect(assistant.annuler()).not.toBeInTheDocument();
    expect(assistant.statut()).toHaveTextContent(CANCELLED);
    // Le focus retourne dans le champ.
    await waitFor(() => expect(assistant.champ()).toHaveFocus());
    // Aucune erreur n'est affichée : l'utilisateur a décidé d'arrêter.
    expect(assistant.liste().queryByText(UNAVAILABLE)).not.toBeInTheDocument();
    expect(assistant.liste().queryByText(INTERRUPTED)).not.toBeInTheDocument();
  });

  it("annule avant tout texte : la question reste, sans réponse", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Bonjour ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    await utilisateur.click(assistant.annuler()!);

    expect(await assistant.liste().findByText(CANCELLED)).toBeInTheDocument();
    expect(assistant.panel.getByText("Bonjour ?")).toBeInTheDocument();
  });

  it("annule avec Échap", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();

    await poser(utilisateur, assistant, "Bonjour ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    await utilisateur.keyboard("{Escape}");

    expect(await assistant.liste().findByText(CANCELLED)).toBeInTheDocument();
    expect(serveur.requetes[0].signal?.aborted).toBe(true);
  });

  it("pose une nouvelle question aussitôt après une annulation, sans la réponse annulée", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await poser(utilisateur, assistant, "Première ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));
    await utilisateur.click(assistant.annuler()!);
    await assistant.liste().findByText(CANCELLED);

    await poser(utilisateur, assistant, "Seconde ?");

    await waitFor(() => expect(serveur.requetes).toHaveLength(2));
    // L'échange annulé n'est pas dans l'historique.
    expect(serveur.requetes[1].messages).toEqual([{ role: "user", content: "Seconde ?" }]);
  });

  it("remplace la suite quand on modifie la première question d'une conversation de trois échanges", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Question un ?", "Réponse un.");
    await echange(utilisateur, assistant, "Question deux ?", "Réponse deux.");
    await echange(utilisateur, assistant, "Question trois ?", "Réponse trois.");

    await utilisateur.click(assistant.panel.getAllByRole("button", { name: "Modifier" })[0]);
    const edition = assistant.panel.getByRole("textbox", { name: "Modifier votre question" });
    await utilisateur.clear(edition);
    await utilisateur.type(edition, "Question modifiée ?");
    await utilisateur.click(assistant.panel.getByRole("button", { name: "Envoyer la modification" }));

    await waitFor(() => expect(serveur.requetes).toHaveLength(4));
    expect(serveur.requetes[3].messages).toEqual([{ role: "user", content: "Question modifiée ?" }]);
    expect(await assistant.panel.findByText("Question modifiée ?")).toBeInTheDocument();
    expect(assistant.panel.queryByText("Question deux ?")).not.toBeInTheDocument();
    expect(assistant.panel.queryByText("Réponse trois.")).not.toBeInTheDocument();
    expect(assistant.panel.queryByText("Réponse un.")).not.toBeInTheDocument();
  });

  it("ne relance rien quand la modification est identique à la question", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Question un ?", "Réponse un.");

    await utilisateur.click(assistant.panel.getByRole("button", { name: "Modifier" }));
    await utilisateur.click(assistant.panel.getByRole("button", { name: "Envoyer la modification" }));

    expect(serveur.requetes).toHaveLength(1);
    expect(assistant.panel.getByText("Réponse un.")).toBeInTheDocument();
    expect(assistant.panel.queryByRole("button", { name: "Envoyer la modification" })).not.toBeInTheDocument();
  });

  it("ferme l'édition sans rien changer avec « Annuler la modification »", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Question un ?", "Réponse un.");

    await utilisateur.click(assistant.panel.getByRole("button", { name: "Modifier" }));
    await utilisateur.click(assistant.panel.getByRole("button", { name: "Annuler la modification" }));

    expect(assistant.panel.getByText("Question un ?")).toBeInTheDocument();
    expect(serveur.requetes).toHaveLength(1);
  });

  it("refuse une modification vide ou trop longue, comme une nouvelle question", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Question un ?", "Réponse un.");

    await utilisateur.click(assistant.panel.getByRole("button", { name: "Modifier" }));
    const edition = assistant.panel.getByRole("textbox", { name: "Modifier votre question" });
    await utilisateur.clear(edition);
    expect(assistant.panel.getAllByText(QUESTION_EMPTY).length).toBeGreaterThan(0);
    expect(assistant.panel.getByRole("button", { name: "Envoyer la modification" })).toBeDisabled();

    fireEvent.change(edition, { target: { value: "a".repeat(501) } });
    expect(assistant.panel.getAllByText(QUESTION_TOO_LONG).length).toBeGreaterThan(0);
    expect(assistant.panel.getByRole("button", { name: "Envoyer la modification" })).toBeDisabled();
  });

  it("demande confirmation avant d'effacer la conversation", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Question un ?", "Réponse un.");

    await utilisateur.click(assistant.panel.getByRole("button", { name: "Nouvelle conversation" }));
    expect(assistant.panel.getByText(CONFIRM_RESET)).toBeInTheDocument();
    await utilisateur.click(assistant.panel.getByRole("button", { name: "Garder" }));
    expect(assistant.panel.getByText("Réponse un.")).toBeInTheDocument();

    await utilisateur.click(assistant.panel.getByRole("button", { name: "Nouvelle conversation" }));
    await utilisateur.click(assistant.panel.getByRole("button", { name: "Effacer" }));

    expect(assistant.panel.queryByText("Réponse un.")).not.toBeInTheDocument();
    expect(assistant.panel.getByRole("button", { name: EXAMPLE_QUESTIONS[0] })).toBeInTheDocument();
  });

  it("repart de zéro quand on change de mois (EF-014)", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Question un ?", "Réponse un.");

    await utilisateur.click(screen.getByRole("button", { name: "Mois précédent" }));

    const panel = within(panneau("Assistant"));
    expect(panel.queryByText("Réponse un.")).not.toBeInTheDocument();
    expect(panel.getByText("Mois affiché : septembre 2026 (passé)")).toBeInTheDocument();
  });

  it("conserve la conversation quand on change d'onglet", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await echange(utilisateur, assistant, "Question un ?", "Réponse un.");

    await ouvrirOnglet("Mois");
    await ouvrirOnglet("Assistant");

    expect(within(panneau("Assistant")).getByText("Réponse un.")).toBeInTheDocument();
  });

  it("abandonne la réponse en cours quand on change de mois", async () => {
    const utilisateur = userEvent.setup();
    const assistant = await ouvrirAssistant();
    await poser(utilisateur, assistant, "Bonjour ?");
    await waitFor(() => expect(serveur.pilotes).toHaveLength(1));

    await utilisateur.click(screen.getByRole("button", { name: "Mois précédent" }));

    await waitFor(() => expect(serveur.requetes[0].signal?.aborted).toBe(true));
  });
});
