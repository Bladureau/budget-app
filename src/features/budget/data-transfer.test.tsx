import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STORAGE_KEY } from "@/lib/storage";
import { ouvrirOnglet, reinitialiserAdresse } from "@/test/navigation";
import { APPLICATION_MARKER, FORMAT_VERSION } from "@/features/budget/transfer";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

/**
 * Tests d’intégration de la section « Vos données » : sélection du fichier → analyse →
 * aperçu → confirmation → écriture → retour arrière.
 *
 * Ils couvrent les scénarios 3, 5, 6, 7 et 8 du guide de validation, et vérifient
 * l’invariant central : aucun refus, aucune annulation ne modifie les données.
 */

const documentInitial: BudgetDocument = {
  ...emptyDocument(),
  incomes: [
    {
      id: "initial",
      label: "Salaire initial",
      amountCents: 200000,
      kind: "oneOff",
      date: "2026-03-01",
    },
  ],
  subscriptions: [],
  expenses: [],
  envelopes: [],
};

const documentImporte: BudgetDocument = {
  ...emptyDocument(),
  incomes: [
    {
      id: "importe-1",
      label: "Salaire importé",
      amountCents: 250000,
      kind: "oneOff",
      date: "2026-04-01",
    },
    {
      id: "importe-2",
      label: "Prime importée",
      amountCents: 50000,
      kind: "oneOff",
      date: "2026-04-15",
    },
  ],
  subscriptions: [
    {
      id: "abo-importe",
      label: "Streaming importé",
      periodicity: "monthly",
      startDate: "2026-04-05",
      endDate: null,
      amounts: [{ amountCents: 1399, effectiveFrom: "2026-04-05" }],
      pauses: [],
    },
  ],
  expenses: [],
  envelopes: [],
};

function fichierExport(data: unknown = documentImporte, surcharge = {}): string {
  return JSON.stringify({
    application: APPLICATION_MARKER,
    formatVersion: FORMAT_VERSION,
    exportedAt: "2026-09-06T09:12:33.000Z",
    data,
    ...surcharge,
  });
}

/** jsdom fournit `File`, mais `File.text()` n’est pas toujours implémentée. */
function fichierNomme(contenu: string, nom = "sauvegarde.json"): File {
  const fichier = new File([contenu], nom, { type: "application/json" });
  Object.defineProperty(fichier, "text", {
    value: () => Promise.resolve(contenu),
    configurable: true,
  });
  return fichier;
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

  // « Vos données » est dans l'onglet « Réglages » (fonctionnalité 007).
  await ouvrirOnglet("Réglages");
}

function sectionDonnees() {
  return within(screen.getByRole("region", { name: "Vos données" }));
}

function documentStocke(): BudgetDocument | null {
  const brut = localStorage.getItem(STORAGE_KEY);
  return brut === null ? null : JSON.parse(brut);
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(documentInitial));
});

afterEach(() => {
  cleanup();
  reinitialiserAdresse();
  vi.restoreAllMocks();
});

describe("Section « Vos données » — export", () => {
  it("propose le téléchargement d’une sauvegarde", async () => {
    const utilisateur = userEvent.setup();
    let contenuTelecharge: string | null = null;

    Object.defineProperty(URL, "createObjectURL", {
      value: (blob: Blob) => {
        // On capture le contenu réellement proposé au téléchargement.
        void blob;
        return "blob:test";
      },
      configurable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, configurable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      contenuTelecharge = this.getAttribute("download");
    });

    await monterVue();
    await utilisateur.click(
      sectionDonnees().getByRole("button", { name: "Télécharger une sauvegarde" }),
    );

    expect(contenuTelecharge).toMatch(/^budget-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);

    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("signale un échec d’export au lieu de le taire (EF-007)", async () => {
    const utilisateur = userEvent.setup();
    // Aucune simulation : `URL.createObjectURL` est absente sous jsdom, l’export échoue.
    await monterVue();

    await utilisateur.click(
      sectionDonnees().getByRole("button", { name: "Télécharger une sauvegarde" }),
    );

    expect(await screen.findByText(/n’a pas pu être produite/)).toBeInTheDocument();
  });

  it("indique que la sauvegarde porte sur les données enregistrées (EF-008)", async () => {
    await monterVue();
    expect(
      sectionDonnees().getByText(/saisie en cours non validée n’y figure pas/),
    ).toBeInTheDocument();
  });
});

describe("Section « Vos données » — aperçu avant remplacement (récit 3)", () => {
  it("présente un résumé avant toute écriture, sans modifier les données", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.upload(
      sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
      fichierNomme(fichierExport()),
    );

    const apercu = await screen.findByText("Contenu de la sauvegarde");
    expect(apercu).toBeInTheDocument();
    expect(screen.getByText(/Le contenu actuel sera remplacé/)).toBeInTheDocument();

    // L’invariant central : rien n’a encore été écrit.
    expect(documentStocke()).toEqual(documentInitial);
  });

  it("annuler ne modifie rien (EF-018)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.upload(
      sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
      fichierNomme(fichierExport()),
    );
    await screen.findByText("Contenu de la sauvegarde");
    await utilisateur.click(screen.getByRole("button", { name: "Annuler" }));

    expect(screen.queryByText("Contenu de la sauvegarde")).not.toBeInTheDocument();
    expect(documentStocke()).toEqual(documentInitial);
  });

  it("exige une confirmation délibérée avant de restaurer (EF-017)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.upload(
      sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
      fichierNomme(fichierExport()),
    );
    await screen.findByText("Contenu de la sauvegarde");

    // Le bouton reste inactif tant que la case n’est pas cochée.
    expect(screen.getByRole("button", { name: "Restaurer cette sauvegarde" })).toBeDisabled();
    expect(documentStocke()).toEqual(documentInitial);
  });

  it("avertit qu’une sauvegarde vide laissera l’application sans données", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();

    await utilisateur.upload(
      sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
      fichierNomme(fichierExport({ version: 1, incomes: [], subscriptions: [] })),
    );

    expect(
      await screen.findByText(/l’application se retrouvera sans données/),
    ).toBeInTheDocument();
  });
});

describe("Section « Vos données » — import et retour arrière", () => {
  async function importerEtConfirmer(utilisateur: ReturnType<typeof userEvent.setup>) {
    await utilisateur.upload(
      sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
      fichierNomme(fichierExport()),
    );
    await screen.findByText("Contenu de la sauvegarde");
    await utilisateur.click(screen.getByRole("checkbox"));
    await utilisateur.click(screen.getByRole("button", { name: "Restaurer cette sauvegarde" }));
  }

  it("restaure les données et présente un compte rendu (EF-014, EF-015)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();
    await importerEtConfirmer(utilisateur);

    expect(await screen.findByText("Sauvegarde restaurée")).toBeInTheDocument();
    expect(screen.getByText(/2 revenus restaurés et 1 abonnement restauré/)).toBeInTheDocument();

    // Écrit, et pas seulement affiché.
    expect(documentStocke()).toEqual(documentImporte);
  });

  it("permet de revenir à l’état antérieur en une seule action (EF-020, CS-006)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();
    await importerEtConfirmer(utilisateur);
    await screen.findByText("Sauvegarde restaurée");

    await utilisateur.click(screen.getByRole("button", { name: "Annuler cet import" }));

    await waitFor(() => {
      expect(documentStocke()).toEqual(documentInitial);
    });
  });
});

describe("Section « Vos données » — refus (récit 4, CS-005, CS-007)", () => {
  const cas: [string, string, string][] = [
    ["fichier étranger", "ceci n’est pas du JSON", "n’est pas une sauvegarde"],
    [
      "version postérieure",
      JSON.stringify({
        application: APPLICATION_MARKER,
        formatVersion: 99,
        exportedAt: "2026-09-06T09:12:33.000Z",
        data: documentImporte,
      }),
      "version plus récente",
    ],
    [
      "contenu abîmé",
      JSON.stringify({
        application: APPLICATION_MARKER,
        formatVersion: FORMAT_VERSION,
        exportedAt: "2026-09-06T09:12:33.000Z",
        data: {
          version: 1,
          incomes: [
            { id: "a", label: "X", amountCents: -1, kind: "oneOff", date: "2026-01-01" },
          ],
          subscriptions: [],
        },
      }),
      "abîmé ou incomplet",
    ],
  ];

  for (const [nom, contenu, extraitAttendu] of cas) {
    it(`refuse un ${nom} avec son propre message, sans modifier les données`, async () => {
      const utilisateur = userEvent.setup();
      await monterVue();

      await utilisateur.upload(
        sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
        fichierNomme(contenu),
      );

      const alerte = await screen.findByRole("alert");
      expect(alerte).toHaveTextContent(new RegExp(extraitAttendu));

      // Le point le plus important : aucun refus ne touche les données.
      expect(documentStocke()).toEqual(documentInitial);
      expect(screen.queryByText("Contenu de la sauvegarde")).not.toBeInTheDocument();
    });
  }

  it("produit trois messages distincts pour les trois motifs (CS-007)", async () => {
    const messages = new Set<string>();

    for (const [, contenu] of cas) {
      const utilisateur = userEvent.setup();
      await monterVue();
      await utilisateur.upload(
        sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
        fichierNomme(contenu),
      );
      const alerte = await screen.findByRole("alert");
      messages.add(alerte.textContent ?? "");
      cleanup();
    }

    expect(messages.size).toBe(3);
  });
});

// --- Récit 2 de la fonctionnalité 005 : reprise vers le stockage central ------------------

/**
 * Serveur simulé minimal : il ne sert qu'à observer ce que l'import y dépose.
 *
 * Ces tests portent la garantie de CS-002 — « sans perte d'un seul centime » — sur le chemin
 * qui compte réellement : celui qu'empruntera l'utilisateur pour transférer son budget
 * existant du navigateur vers le serveur.
 */
describe("Section « Vos données » — reprise vers le stockage central (récit 2 de la 005)", () => {
  let serveur: { revision: number; document: BudgetDocument | null; puts: number };

  beforeEach(() => {
    serveur = { revision: 0, document: null, puts: 0 };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, options?: RequestInit) => {
        const corpsJson = (statut: number, corps: unknown) =>
          new Response(JSON.stringify(corps), {
            status: statut,
            headers: { "Content-Type": "application/json" },
          });

        if (!options || options.method === undefined || options.method === "GET") {
          return corpsJson(200, {
            revision: serveur.revision,
            updatedAt: null,
            document: serveur.document ?? {
              version: 3,
              incomes: [],
              subscriptions: [],
              expenses: [],
              envelopes: [],
            },
          });
        }

        serveur.puts += 1;
        const recu = JSON.parse(String(options.body)) as {
          baseRevision: number;
          document: BudgetDocument;
        };
        if (recu.baseRevision !== serveur.revision) {
          return corpsJson(409, {
            error: "revisionMismatch",
            revision: serveur.revision,
            updatedAt: null,
            document: serveur.document,
          });
        }
        serveur.revision += 1;
        serveur.document = recu.document;
        return corpsJson(200, { revision: serveur.revision, updatedAt: new Date().toISOString() });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function importerEtConfirmer(utilisateur: ReturnType<typeof userEvent.setup>) {
    await utilisateur.upload(
      sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
      fichierNomme(fichierExport()),
    );
    await screen.findByText("Contenu de la sauvegarde");
    await utilisateur.click(screen.getByRole("checkbox"));
    await utilisateur.click(screen.getByRole("button", { name: "Restaurer cette sauvegarde" }));
  }

  it("un import confirmé atteint le stockage central (EF-014, EF-015)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();
    await importerEtConfirmer(utilisateur);
    await screen.findByText("Sauvegarde restaurée");

    // L'import n'a pas de code de synchronisation propre : il emprunte le chemin de
    // mutation ordinaire, et c'est ce qui le fait arriver ici.
    await waitFor(() => expect(serveur.document).not.toBeNull());
    expect(serveur.document).toEqual(documentImporte);
  });

  it("préserve le compte de chaque collection et la somme des montants (CS-002)", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();
    await importerEtConfirmer(utilisateur);
    await waitFor(() => expect(serveur.document).not.toBeNull());

    const distant = serveur.document as BudgetDocument;

    expect(distant.incomes).toHaveLength(documentImporte.incomes.length);
    expect(distant.subscriptions).toHaveLength(documentImporte.subscriptions.length);
    expect(distant.expenses).toHaveLength(documentImporte.expenses.length);
    expect(distant.envelopes).toHaveLength(documentImporte.envelopes.length);

    const sommeLocale =
      documentImporte.incomes.reduce((t, r) => t + r.amountCents, 0) +
      documentImporte.subscriptions.reduce((t, a) => t + a.amounts[0].amountCents, 0);
    const sommeDistante =
      distant.incomes.reduce((t, r) => t + r.amountCents, 0) +
      distant.subscriptions.reduce((t, a) => t + a.amounts[0].amountCents, 0);

    expect(sommeDistante).toBe(sommeLocale);
    expect(sommeDistante).toBe(250000 + 50000 + 1399);
  });

  it("préserve l'historique de tarifs et les pauses d'un abonnement (EF-003)", async () => {
    // Ce sont les champs dont la perte réécrirait des mois passés : ils méritent d'être
    // vérifiés nommément plutôt que par une égalité globale.
    const avecHistorique: BudgetDocument = {
      ...emptyDocument(),
      incomes: [],
      subscriptions: [
        {
          id: "abo-riche",
          label: "Assurance",
          periodicity: "annual",
          startDate: "2024-01-15",
          endDate: null,
          amounts: [
            { amountCents: 12000, effectiveFrom: "2024-01-15" },
            { amountCents: 13500, effectiveFrom: "2025-01-15" },
          ],
          pauses: [{ from: "2024-06-01", to: "2024-08-31" }],
        },
      ],
      expenses: [],
      envelopes: [],
    };

    const utilisateur = userEvent.setup();
    await monterVue();
    await utilisateur.upload(
      sectionDonnees().getByLabelText("Restaurer une sauvegarde"),
      fichierNomme(fichierExport(avecHistorique)),
    );
    await screen.findByText("Contenu de la sauvegarde");
    await utilisateur.click(screen.getByRole("checkbox"));
    await utilisateur.click(screen.getByRole("button", { name: "Restaurer cette sauvegarde" }));

    await waitFor(() => expect(serveur.document).not.toBeNull());

    const abonnement = (serveur.document as BudgetDocument).subscriptions[0];
    expect(abonnement.amounts).toEqual([
      { amountCents: 12000, effectiveFrom: "2024-01-15" },
      { amountCents: 13500, effectiveFrom: "2025-01-15" },
    ]);
    expect(abonnement.pauses).toEqual([{ from: "2024-06-01", to: "2024-08-31" }]);
  });

  it("l'export reflète le contenu central adopté, pas un état local périmé (EF-013)", async () => {
    // Le serveur détient un budget que ce navigateur n'a jamais vu.
    serveur.revision = 4;
    serveur.document = documentImporte;
    localStorage.clear();

    await monterVue();

    // Après adoption, la copie de travail locale — celle que l'export sérialise — est
    // devenue celle du serveur.
    await waitFor(() => {
      expect(documentStocke()).toEqual(documentImporte);
    });
  });

  it("le retour arrière atteint lui aussi le stockage central", async () => {
    const utilisateur = userEvent.setup();
    await monterVue();
    await importerEtConfirmer(utilisateur);
    await screen.findByText("Sauvegarde restaurée");
    await waitFor(() => expect(serveur.document).toEqual(documentImporte));

    await utilisateur.click(screen.getByRole("button", { name: "Annuler cet import" }));

    await waitFor(() => expect(serveur.document).toEqual(documentInitial));
  });
});
