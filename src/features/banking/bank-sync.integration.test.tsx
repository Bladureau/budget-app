/**
 * Synchronisation bancaire de bout en bout, dans l'application montée.
 *
 * Voir specs/006-bank-sync/spec.md (récits 1 à 3) et plan.md (D1, D11, R13).
 *
 * Le serveur est simulé en mémoire : budget central (contrat de 005) et points d'entrée
 * bancaires (contrat de 006). Les opérations y sont déjà **normalisées**, comme le serveur réel
 * les rend ; la normalisation elle-même est couverte par ses propres tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ouvrirOnglet, reinitialiserAdresse } from "@/test/navigation";

import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";
import type { BankOperation } from "@/features/banking/types";

function operation(ref: string, surcharge: Partial<BankOperation>): BankOperation {
  return {
    ref: `lcl:${ref}`,
    bank: "lcl",
    bookingDate: "2026-09-10",
    paymentDate: "2026-09-08",
    amountCents: 1000,
    currency: "EUR",
    direction: "debit",
    kind: "card",
    label: "COMMERCE",
    rawLabel: "CARTE · CB COMMERCE 08/09/26",
    ...surcharge,
  };
}

const OPERATIONS: BankOperation[] = [
  operation("carte", { amountCents: 3382, label: "PETROLEC SUD" }),
  operation("courses", { amountCents: 1224, label: "MP*CARREFOUR", paymentDate: "2026-09-09" }),
  operation("recharge", { amountCents: 5000, label: "Revolut**0000*" }),
  operation("caf", { amountCents: 18305, direction: "credit", kind: "transferIn", label: "VIREMENT CAF", paymentDate: null }),
  operation("virement", {
    amountCents: 35000,
    kind: "transferOut",
    label: "VIR SEPA Mme JEANNE DUPONT OU",
    rawLabel: "VIREMENT · VIR SEPA Mme JEANNE DUPONT OU · MMS",
    paymentDate: null,
  }),
  operation("avant", { amountCents: 800, label: "BOULANGERIE", paymentDate: "2026-08-30", bookingDate: "2026-09-02" }),
];

const BANQUES = [
  {
    bank: "lcl",
    connected: true,
    ibanSuffix: "XXXX",
    validUntil: "2027-03-30T00:00:00.000Z",
    lastFetchAt: "2026-09-10T12:00:00.000Z",
    lastError: null,
    discardedCount: 0,
    historyGap: false,
  },
  {
    bank: "revolut",
    connected: false,
    ibanSuffix: null,
    validUntil: null,
    lastFetchAt: null,
    lastError: null,
    discardedCount: 0,
    historyGap: false,
  },
];

class ServeurSimule {
  revision = 1;
  document: BudgetDocument;
  operations: BankOperation[] = OPERATIONS;
  banques: Record<string, unknown>[] = BANQUES;
  budgetEnPanne = false;
  appels = { budget: 0, put: 0, operations: 0 };

  constructor() {
    const doc = emptyDocument();
    this.document = {
      ...doc,
      incomes: [{ id: "salaire", label: "Salaire", amountCents: 150000, kind: "oneOff", date: "2026-09-01" }],
      banking: { ...doc.banking, importFrom: "2026-09-01" },
    };
  }

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
      this.appels.operations += 1;
      return this.reponse(200, { operations: this.operations, banks: this.banques });
    }

    if (this.budgetEnPanne) return this.reponse(500, { error: "storageUnreadable" });

    if (!options || options.method === "GET" || options.method === undefined) {
      this.appels.budget += 1;
      return this.reponse(200, {
        revision: this.revision,
        updatedAt: "2026-09-10T12:00:00.000Z",
        document: this.document,
      });
    }

    this.appels.put += 1;
    const corps = JSON.parse(String(options.body)) as { baseRevision: number; document: BudgetDocument };
    if (corps.baseRevision !== this.revision) {
      return this.reponse(409, { error: "revisionMismatch", revision: this.revision, updatedAt: null, document: this.document });
    }
    this.revision += 1;
    this.document = corps.document;
    return this.reponse(200, { revision: this.revision, updatedAt: new Date().toISOString() });
  };
}

let serveur: ServeurSimule;

beforeEach(() => {
  localStorage.clear();
  serveur = new ServeurSimule();
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => serveur.handler(url, options)));
});

afterEach(() => {
  cleanup();
  reinitialiserAdresse();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function ouvrirAppareil() {
  vi.resetModules();
  const { BudgetProvider } = await import("@/features/budget/budget-provider");
  const { BudgetView } = await import("@/features/budget/components/budget-view");
  return render(
    <BudgetProvider>
      <BudgetView />
    </BudgetProvider>,
  );
}

function changerDAppareil(): void {
  cleanup();
  localStorage.clear();
}

// Le journal vit dans l'onglet « Dépenses » (fonctionnalité 007) ; ces tests vérifient ce qui y
// est inscrit, pas la navigation, d'où `hidden: true`.
const journal = () => within(screen.getByRole("region", { name: "Mes dépenses", hidden: true }));

describe("récit 1 — les paiements apparaissent tout seuls", () => {
  it("importe les paiements carte au jour du paiement, avec leur provenance", async () => {
    await ouvrirAppareil();

    await waitFor(() => expect(journal().getByText("PETROLEC SUD")).toBeInTheDocument());
    expect(journal().getByText("MP*CARREFOUR")).toBeInTheDocument();
    expect(journal().getByText("Courses · LCL")).toBeInTheDocument();
    expect(journal().getByText("08/09/2026")).toBeInTheDocument();

    // L'import a rejoint le stockage central par le chemin ordinaire, en une seule poussée.
    await waitFor(() => expect(serveur.document.expenses).toHaveLength(2));
    expect(serveur.appels.put).toBe(1);
  });

  it("ne crée aucun doublon à l'ouverture suivante, ni sur un autre appareil", async () => {
    await ouvrirAppareil();
    await waitFor(() => expect(serveur.document.expenses).toHaveLength(2));

    changerDAppareil();
    await ouvrirAppareil();
    await waitFor(() => expect(serveur.appels.operations).toBe(2));
    await waitFor(() => expect(journal().getByText("PETROLEC SUD")).toBeInTheDocument());

    expect(serveur.document.expenses).toHaveLength(2);
    expect(serveur.appels.put).toBe(1);
  });

  it("ne traite rien si la lecture du budget a échoué (copie locale non à jour)", async () => {
    serveur.budgetEnPanne = true;
    await ouvrirAppareil();

    await waitFor(() => expect(screen.getByText(/Mes banques/)).toBeInTheDocument());
    expect(serveur.appels.operations).toBe(0);
    expect(serveur.appels.put).toBe(0);
  });
});

describe("récit 2 — ne jamais compter deux fois", () => {
  it("n'importe ni recharge, ni crédit, ni paiement antérieur à la date de début", async () => {
    await ouvrirAppareil();
    await waitFor(() => expect(serveur.document.expenses).toHaveLength(2));

    const total = serveur.document.expenses.reduce((s, d) => s + d.amountCents, 0);
    expect(total).toBe(3382 + 1224);
    // Les revenus ne bougent pas : la CAF reste saisie à part (EF-020).
    expect(serveur.document.incomes).toHaveLength(1);
    expect(serveur.document.banking.ledger.find((e) => e.ref === "lcl:avant")).toBeUndefined();
  });
});

describe("récit 4 — les remboursements réduisent les dépenses", () => {
  it("affiche le remboursement au journal et le déduit du dépensé du mois", async () => {
    // Le mois affiché est le mois courant : les opérations sont datées d'aujourd'hui.
    const aujourdHui = new Date();
    const jour = `${aujourdHui.getFullYear()}-${String(aujourdHui.getMonth() + 1).padStart(2, "0")}-${String(aujourdHui.getDate()).padStart(2, "0")}`;
    serveur.document = {
      ...serveur.document,
      incomes: [{ id: "salaire", label: "Salaire", amountCents: 150000, kind: "oneOff", date: `${jour.slice(0, 8)}01` }],
      banking: { ...serveur.document.banking, importFrom: `${jour.slice(0, 8)}01` },
    };
    serveur.operations = [
      operation("uber", { amountCents: 5846, label: "UBER *EATS", bookingDate: jour, paymentDate: jour }),
      operation("twitch", {
        amountCents: 499,
        direction: "credit",
        kind: "cardRefund",
        label: "Twitch Interacti",
        bookingDate: jour,
        paymentDate: null,
      }),
    ];
    await ouvrirAppareil();

    await waitFor(() => expect(journal().getByText("Remboursement · Twitch Interacti")).toBeInTheDocument());
    expect(journal().getByText("− 4,99 €")).toBeInTheDocument();
    // Sous-total du jour : 58,46 − 4,99.
    expect(journal().getAllByText("53,47 €").length).toBeGreaterThan(0);

    const anneau = within(screen.getByRole("region", { name: /Reste à dépenser/ }));
    expect(anneau.getByText("Remboursements déduits : 4,99 €.")).toBeInTheDocument();
    expect(anneau.getByText("53,47 €")).toBeInTheDocument();
  });
});

describe("récit 5 — garder l'accès dans la durée", () => {
  const dans = (jours: number) => new Date(Date.now() + jours * 86_400_000).toISOString();

  it("avertit dès l'ouverture d'un accès qui expire dans moins de 14 jours", async () => {
    serveur.banques = [{ ...BANQUES[0], validUntil: dans(10) }, BANQUES[1]];
    await ouvrirAppareil();

    // Deux fois : en alerte en haut de page, et sur la ligne de la banque dans le panneau.
    expect(await screen.findAllByText(/L’accès à LCL expire dans \d+ jours/)).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Aller à « Mes banques »" })).toHaveAttribute(
      "href",
      "/?onglet=reglages#titre-banques",
    );
    await ouvrirOnglet("Réglages");
    expect(screen.getByRole("button", { name: "Reconnecter LCL" })).toBeInTheDocument();
  });

  it("signale un accès expiré avec la date de dernière récupération réussie", async () => {
    serveur.banques = [{ ...BANQUES[0], validUntil: dans(-3), lastError: "expired" }, BANQUES[1]];
    await ouvrirAppareil();

    const messages = await screen.findAllByText(/L’accès à LCL a expiré le .*Dernière récupération réussie le/);
    expect(messages.length).toBeGreaterThan(0);
  });

  it("n'affiche aucune alerte quand l'accès est valable plus de 14 jours", async () => {
    await ouvrirAppareil();
    await waitFor(() => expect(screen.getByText(/Accès valable jusqu’au/)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Aller à « Mes banques »" })).not.toBeInTheDocument();
  });

  it("signale un trou d'historique possible", async () => {
    serveur.banques = [{ ...BANQUES[0], historyGap: true }, BANQUES[1]];
    await ouvrirAppareil();
    expect(await screen.findByText(/n’a peut-être pas rendu les opérations les plus anciennes/)).toBeInTheDocument();
  });
});

describe("récit 3 — « À classer »", () => {
  it("signale l'élément à l'accueil sans le compter, puis l'ignore en un geste", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirAppareil();

    const compteur = await screen.findByRole("link", { name: "1 opération bancaire à classer" });
    expect(compteur).toHaveAttribute("href", "/?onglet=depenses#a-classer");

    await ouvrirOnglet("Dépenses");
    const liste = within(screen.getByRole("region", { name: "À classer" }));
    expect(liste.getByText("VIR SEPA Mme JEANNE DUPONT OU")).toBeInTheDocument();
    expect(serveur.document.expenses.some((d) => d.amountCents === 35000)).toBe(false);

    await utilisateur.click(liste.getByRole("button", { name: "Ignorer" }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "À classer" })).not.toBeInTheDocument());
    await waitFor(() => expect(serveur.document.banking.inbox).toEqual([]));
    expect(serveur.document.expenses.some((d) => d.amountCents === 35000)).toBe(false);
  });

  it("classe un élément en dépense, au clavier, avec une catégorie", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirAppareil();
    await ouvrirOnglet("Dépenses");

    const liste = within(await screen.findByRole("region", { name: "À classer" }));
    liste.getByRole("button", { name: "Dépense" }).focus();
    await utilisateur.keyboard("{Enter}");
    await utilisateur.type(liste.getByLabelText("Catégorie (facultative)"), "Famille");
    await utilisateur.click(liste.getByRole("button", { name: "Valider" }));

    await waitFor(() => expect(journal().getByText("VIR SEPA Mme JEANNE DUPONT OU")).toBeInTheDocument());
    expect(journal().getByText("Famille · LCL")).toBeInTheDocument();
  });

  it("n'affiche ni liste ni compteur quand rien n'est à classer", async () => {
    serveur.operations = OPERATIONS.filter((o) => o.kind === "card");
    await ouvrirAppareil();

    await waitFor(() => expect(serveur.document.expenses).toHaveLength(2));
    expect(screen.queryByRole("region", { name: "À classer" })).not.toBeInTheDocument();
    expect(screen.queryByText(/à classer/)).not.toBeInTheDocument();
  });

  it("rattache un abonnement probable à l'abonnement choisi", async () => {
    const utilisateur = userEvent.setup();
    serveur.document = {
      ...serveur.document,
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
    };
    serveur.operations = [operation("spotify", { amountCents: 707, label: "Spotify France" })];
    await ouvrirAppareil();
    await ouvrirOnglet("Dépenses");

    const liste = within(await screen.findByRole("region", { name: "À classer" }));
    expect(liste.getByText(/Ressemble à un abonnement déjà saisi/)).toBeInTheDocument();
    await utilisateur.click(liste.getByRole("button", { name: "Rattacher à un abonnement…" }));
    expect(liste.getByLabelText("Abonnement")).toHaveValue("abo-spotify");
    await utilisateur.click(liste.getByRole("button", { name: "Valider" }));

    await waitFor(() =>
      expect(serveur.document.banking.rules[0]).toMatchObject({
        action: { type: "subscription", subscriptionId: "abo-spotify" },
      }),
    );
    expect(serveur.document.expenses).toEqual([]);
  });

  it("refuse un motif de règle trop court, puis ignore toujours ce bénéficiaire", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirAppareil();
    await ouvrirOnglet("Dépenses");

    const liste = within(await screen.findByRole("region", { name: "À classer" }));
    await utilisateur.click(liste.getByRole("button", { name: "Toujours ignorer…" }));

    const motif = liste.getByLabelText("Pour les opérations dont le libellé contient");
    await utilisateur.clear(motif);
    await utilisateur.type(motif, "a");
    await utilisateur.click(liste.getByRole("button", { name: "Valider" }));
    expect(liste.getByText("Le motif doit faire au moins 2 caractères.")).toBeInTheDocument();

    await utilisateur.clear(motif);
    await utilisateur.type(motif, "JEANNE DUPONT");
    await utilisateur.click(liste.getByRole("button", { name: "Valider" }));

    await waitFor(() => expect(serveur.document.banking.rules[0]).toMatchObject({ contains: "JEANNE DUPONT" }));
  });
});

describe("récit 6 — garder la main sur ce qui a été importé", () => {
  /** Rouvre l'application sur le même appareil : la banque rend à nouveau les mêmes opérations. */
  async function resynchroniser() {
    const appelsAvant = serveur.appels.operations;
    cleanup();
    await ouvrirAppareil();
    await waitFor(() => expect(serveur.appels.operations).toBe(appelsAvant + 1));
  }

  async function ouvrirDetail(utilisateur: ReturnType<typeof userEvent.setup>, libelle: RegExp) {
    await waitFor(() => expect(serveur.document.expenses).toHaveLength(2));
    await ouvrirOnglet("Dépenses");
    await utilisateur.click(journal().getByRole("button", { name: libelle }));
  }

  it("conserve une dépense importée que j'ai corrigée (EF-033)", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirAppareil();
    await ouvrirDetail(utilisateur, /Détail de PETROLEC SUD/);

    const montant = journal().getByLabelText("Montant");
    await utilisateur.clear(montant);
    await utilisateur.type(montant, "40,00");
    const libelle = journal().getByLabelText("Libellé");
    await utilisateur.clear(libelle);
    await utilisateur.type(libelle, "Essence");
    await utilisateur.type(journal().getByLabelText("Catégorie"), "Carburant");
    const date = journal().getByLabelText("Date");
    await utilisateur.clear(date);
    await utilisateur.type(date, "2026-09-07");
    await utilisateur.click(journal().getByRole("button", { name: "Enregistrer" }));

    const corrigee = {
      id: "bank:lcl:carte",
      amountCents: 4000,
      date: "2026-09-07",
      label: "Essence",
      category: "Carburant",
      source: "lcl",
      bankRef: "lcl:carte",
    };
    await waitFor(() => {
      expect(serveur.document.expenses.find((d) => d.id === "bank:lcl:carte")).toEqual(corrigee);
    });

    await resynchroniser();

    // Ni écrasée, ni dédoublée : la banque a rendu l'opération d'origine, elle a été ignorée.
    expect(serveur.document.expenses).toHaveLength(2);
    expect(serveur.document.expenses.find((d) => d.id === "bank:lcl:carte")).toEqual(corrigee);
    expect(journal().getByText("Essence")).toBeInTheDocument();
    expect(journal().queryByText("PETROLEC SUD")).not.toBeInTheDocument();
  });

  it("ne réimporte jamais une dépense importée que j'ai supprimée (EF-034)", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirAppareil();
    await ouvrirDetail(utilisateur, /Détail de PETROLEC SUD/);

    await utilisateur.click(journal().getByRole("button", { name: "Supprimer" }));
    await utilisateur.click(journal().getByRole("button", { name: "Confirmer la suppression" }));
    await waitFor(() => expect(serveur.document.expenses).toHaveLength(1));

    await resynchroniser();

    expect(serveur.document.expenses.map((d) => d.id)).toEqual(["bank:lcl:courses"]);
    // Le registre garde la trace de l'opération : c'est ce qui empêche son retour.
    expect(serveur.document.banking.ledger.some((e) => e.ref === "lcl:carte")).toBe(true);
    expect(journal().queryByText("PETROLEC SUD")).not.toBeInTheDocument();
  });

  it("applique une catégorie aux prochaines dépenses du même commerçant, pas aux passées", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirAppareil();
    await ouvrirDetail(utilisateur, /Détail de PETROLEC SUD/);

    await utilisateur.type(journal().getByLabelText("Catégorie"), "Carburant");
    await utilisateur.click(
      journal().getByRole("button", { name: "Appliquer cette catégorie à ce commerçant…" }),
    );
    // Le motif proposé est le libellé de la dépense, modifiable avant validation.
    expect(journal().getByLabelText("Pour les opérations dont le libellé contient")).toHaveValue(
      "PETROLEC SUD",
    );
    await utilisateur.click(journal().getByRole("button", { name: "Créer la règle" }));

    expect(journal().getByRole("status")).toHaveTextContent(
      "Règle créée : les prochaines dépenses contenant « PETROLEC SUD » iront dans « Carburant ».",
    );
    await waitFor(() => {
      expect(serveur.document.banking.categoryRules[0]).toMatchObject({
        contains: "PETROLEC SUD",
        category: "Carburant",
      });
    });
    // La règle ne touche pas la dépense déjà importée : sa correction reste un geste à part.
    expect(serveur.document.expenses.find((d) => d.id === "bank:lcl:carte")?.category).toBeNull();

    serveur.operations = [
      ...OPERATIONS,
      operation("carte2", { amountCents: 5210, label: "PETROLEC SUD", paymentDate: "2026-09-20" }),
    ];
    await resynchroniser();

    await waitFor(() => expect(serveur.document.expenses).toHaveLength(3));
    expect(serveur.document.expenses.find((d) => d.id === "bank:lcl:carte2")?.category).toBe(
      "Carburant",
    );
    expect(serveur.document.expenses.find((d) => d.id === "bank:lcl:carte")?.category).toBeNull();
  });

  it("demande une catégorie avant de créer la règle, et refuse un motif trop court", async () => {
    const utilisateur = userEvent.setup();
    await ouvrirAppareil();
    await ouvrirDetail(utilisateur, /Détail de PETROLEC SUD/);
    const reglesAvant = serveur.document.banking.categoryRules.length;

    await utilisateur.click(
      journal().getByRole("button", { name: "Appliquer cette catégorie à ce commerçant…" }),
    );
    await utilisateur.click(journal().getByRole("button", { name: "Créer la règle" }));
    expect(
      journal().getByText("Saisissez d’abord une catégorie dans le champ « Catégorie »."),
    ).toBeInTheDocument();

    await utilisateur.type(journal().getByLabelText("Catégorie"), "Carburant");
    const motif = journal().getByLabelText("Pour les opérations dont le libellé contient");
    await utilisateur.clear(motif);
    await utilisateur.type(motif, "P");
    await utilisateur.click(journal().getByRole("button", { name: "Créer la règle" }));
    expect(journal().getByText("Le motif doit faire entre 2 et 80 caractères.")).toBeInTheDocument();

    expect(serveur.document.banking.categoryRules).toHaveLength(reglesAvant);
  });

  it("ne propose pas la règle pour une dépense saisie à la main", async () => {
    const utilisateur = userEvent.setup();
    serveur.document = {
      ...serveur.document,
      expenses: [{ id: "manuelle", amountCents: 990, date: "2026-09-12", label: "Marché", category: null }],
    };
    serveur.operations = [];
    await ouvrirAppareil();
    await ouvrirOnglet("Dépenses");
    await utilisateur.click(await journal().findByRole("button", { name: /Détail de Marché/ }));

    expect(
      journal().queryByRole("button", { name: "Appliquer cette catégorie à ce commerçant…" }),
    ).not.toBeInTheDocument();
  });
});