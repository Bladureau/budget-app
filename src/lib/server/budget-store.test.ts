// @vitest-environment node

/**
 * Tests du stockage central, sur un **répertoire temporaire réel**.
 *
 * L'atomicité, la quarantaine et la sérialisation ne se vérifient pas sur un double en
 * mémoire : ce sont des propriétés du système de fichiers. Un faux `fs` prouverait seulement
 * que le faux se comporte comme on l'a écrit.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { readBudget, writeBudget } from "@/lib/server/budget-store";
import { DOCUMENT_VERSION, emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

let repertoire: string;

beforeEach(async () => {
  repertoire = await mkdtemp(path.join(tmpdir(), "budget-store-"));
  process.env.BUDGET_DATA_DIR = repertoire;
});

afterEach(async () => {
  delete process.env.BUDGET_DATA_DIR;
  await rm(repertoire, { recursive: true, force: true });
});

function cheminBudget(): string {
  return path.join(repertoire, "budget.json");
}

function documentAvecDepense(amountCents: number): BudgetDocument {
  return {
    ...emptyDocument(),
    expenses: [{ id: "depense-1", amountCents, date: "2026-09-07", category: "Courses" }],
  };
}

async function ecrireFichier(contenu: string): Promise<void> {
  await mkdir(repertoire, { recursive: true });
  await writeFile(cheminBudget(), contenu, "utf8");
}

// --- Cas nominal --------------------------------------------------------------------------

describe("readBudget", () => {
  it("rend la révision 0 et un document vide quand aucun fichier n'existe", async () => {
    const resultat = await readBudget();

    // Un budget neuf n'est pas une erreur : c'est ce qui permet au premier appareil
    // d'écrire en se fondant sur la révision 0.
    expect(resultat).toEqual({
      ok: true,
      revision: 0,
      updatedAt: null,
      document: emptyDocument(),
    });
  });

  it("rend la révision 0 sur un fichier vide", async () => {
    await ecrireFichier("   ");
    const resultat = await readBudget();
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.revision).toBe(0);
  });

  it("relit ce qui a été écrit, au centime", async () => {
    await writeBudget(documentAvecDepense(1250), 0);
    const resultat = await readBudget();

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.revision).toBe(1);
    expect(resultat.document.expenses[0].amountCents).toBe(1250);
  });
});

describe("writeBudget", () => {
  it("incrémente la révision à chaque écriture acceptée", async () => {
    const premier = await writeBudget(documentAvecDepense(1000), 0);
    expect(premier).toMatchObject({ ok: true, revision: 1 });

    const second = await writeBudget(documentAvecDepense(2000), 1);
    expect(second).toMatchObject({ ok: true, revision: 2 });
  });

  it("horodate l'écriture", async () => {
    const resultat = await writeBudget(emptyDocument(), 0);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(Number.isNaN(Date.parse(resultat.updatedAt))).toBe(false);
  });
});

// --- Verrou optimiste ---------------------------------------------------------------------

describe("verrou optimiste", () => {
  it("refuse une écriture fondée sur une révision périmée, sans rien écrire", async () => {
    await writeBudget(documentAvecDepense(1000), 0); // révision 1

    const refuse = await writeBudget(documentAvecDepense(9999), 0);

    expect(refuse.ok).toBe(false);
    if (refuse.ok || refuse.reason !== "conflict") throw new Error("conflit attendu");
    expect(refuse.revision).toBe(1);
    // L'état courant accompagne le refus : l'appelant peut présenter le choix sans
    // second aller-retour.
    expect(refuse.document.expenses[0].amountCents).toBe(1000);

    const relu = await readBudget();
    if (!relu.ok) throw new Error("lecture attendue");
    expect(relu.revision).toBe(1);
    expect(relu.document.expenses[0].amountCents).toBe(1000);
  });

  it("accepte une écriture qui rejoue la révision courante après un conflit", async () => {
    await writeBudget(documentAvecDepense(1000), 0);
    await writeBudget(documentAvecDepense(9999), 0); // refusée

    const rejoue = await writeBudget(documentAvecDepense(9999), 1);
    expect(rejoue).toMatchObject({ ok: true, revision: 2 });
  });

  it("refuse une révision de base supérieure à la révision courante", async () => {
    const resultat = await writeBudget(emptyDocument(), 7);
    expect(resultat).toMatchObject({ ok: false, reason: "conflict", revision: 0 });
  });
});

// --- Bornes monétaires (principe III) -----------------------------------------------------

describe("bornes monétaires", () => {
  it("accepte le plus grand montant réaliste", async () => {
    const resultat = await writeBudget(documentAvecDepense(9_000_000_000), 0);
    expect(resultat.ok).toBe(true);

    const relu = await readBudget();
    if (!relu.ok) throw new Error("lecture attendue");
    expect(relu.document.expenses[0].amountCents).toBe(9_000_000_000);
  });

  it("refuse un montant au-delà de la borne", async () => {
    const resultat = await writeBudget(documentAvecDepense(9_000_000_001), 0);
    expect(resultat).toEqual({ ok: false, reason: "invalidDocument" });
  });

  it("refuse un montant négatif", async () => {
    const resultat = await writeBudget(documentAvecDepense(-100), 0);
    expect(resultat).toEqual({ ok: false, reason: "invalidDocument" });
  });

  it("refuse un montant nul pour une dépense", async () => {
    const resultat = await writeBudget(documentAvecDepense(0), 0);
    expect(resultat).toEqual({ ok: false, reason: "invalidDocument" });
  });

  it("refuse un montant décimal — les centimes sont entiers, transport compris (EF-004)", async () => {
    const resultat = await writeBudget(documentAvecDepense(12.5), 0);
    expect(resultat).toEqual({ ok: false, reason: "invalidDocument" });
  });

  it("accepte un plafond d'enveloppe nul, seule exception assumée du modèle", async () => {
    const document: BudgetDocument = {
      ...emptyDocument(),
      envelopes: [{ id: "env-1", category: "Courses", month: "2026-09", limitCents: 0 }],
    };
    expect(await writeBudget(document, 0)).toMatchObject({ ok: true });
  });

  it("ne persiste rien quand le document est refusé", async () => {
    await writeBudget(documentAvecDepense(-1), 0);
    const relu = await readBudget();
    if (!relu.ok) throw new Error("lecture attendue");
    expect(relu.revision).toBe(0);
  });
});

// --- Entrées malformées -------------------------------------------------------------------

describe("entrées malformées", () => {
  it.each([
    ["une valeur qui n'est pas un objet", 42],
    ["null", null],
    ["un tableau", []],
    ["un document sans version", { incomes: [], subscriptions: [], expenses: [], envelopes: [] }],
    ["une collection manquante", { version: DOCUMENT_VERSION, incomes: [] }],
  ])("refuse %s à l'écriture", async (_libelle, brut) => {
    expect(await writeBudget(brut, 0)).toEqual({ ok: false, reason: "invalidDocument" });
  });

  it("met en quarantaine un fichier illisible sans jamais l'écraser", async () => {
    await ecrireFichier("{ceci n'est pas du JSON");

    expect(await readBudget()).toEqual({ ok: false, reason: "unreadable" });

    const fichiers = await readdir(repertoire);
    const quarantaine = fichiers.filter((f) => f.startsWith("budget.corrupted-"));
    expect(quarantaine).toHaveLength(1);

    // Le contenu abîmé est intégralement préservé.
    const conserve = await readFile(path.join(repertoire, quarantaine[0]), "utf8");
    expect(conserve).toBe("{ceci n'est pas du JSON");
  });

  it("met en quarantaine un conteneur dont la révision est absente", async () => {
    await ecrireFichier(JSON.stringify({ updatedAt: "2026-09-07T10:00:00.000Z", document: emptyDocument() }));
    expect(await readBudget()).toEqual({ ok: false, reason: "unreadable" });
  });

  it("met en quarantaine un conteneur dont l'horodatage est invalide", async () => {
    await ecrireFichier(
      JSON.stringify({ revision: 1, updatedAt: "pas une date", document: emptyDocument() }),
    );
    expect(await readBudget()).toEqual({ ok: false, reason: "unreadable" });
  });

  it("repart à vide après une quarantaine, sans perdre le contenu mis de côté", async () => {
    await ecrireFichier("{abîmé");
    await readBudget();

    const suivante = await readBudget();
    expect(suivante).toMatchObject({ ok: true, revision: 0 });
  });
});

// --- Versions -----------------------------------------------------------------------------

describe("versions du document", () => {
  it("migre à la lecture un document en version antérieure", async () => {
    await ecrireFichier(
      JSON.stringify({
        revision: 3,
        updatedAt: "2026-09-07T10:00:00.000Z",
        document: { version: 1, incomes: [], subscriptions: [] },
      }),
    );

    const resultat = await readBudget();
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.document.version).toBe(DOCUMENT_VERSION);
    expect(resultat.document.expenses).toEqual([]);
    expect(resultat.document.envelopes).toEqual([]);
    expect(resultat.revision).toBe(3);
  });

  it("refuse un document en version postérieure et le laisse STRICTEMENT en place", async () => {
    const contenu = JSON.stringify({
      revision: 2,
      updatedAt: "2026-09-07T10:00:00.000Z",
      document: { version: DOCUMENT_VERSION + 1, incomes: [], subscriptions: [], expenses: [], envelopes: [] },
    });
    await ecrireFichier(contenu);

    expect(await readBudget()).toEqual({ ok: false, reason: "futureVersion" });

    // Pas même déplacé : le mettre de côté le soustrairait à la version qui sait le lire.
    expect(await readFile(cheminBudget(), "utf8")).toBe(contenu);
    const fichiers = await readdir(repertoire);
    expect(fichiers.filter((f) => f.startsWith("budget.corrupted-"))).toHaveLength(0);
  });

  it("refuse d'écrire par-dessus un fichier en version postérieure", async () => {
    await ecrireFichier(
      JSON.stringify({
        revision: 2,
        updatedAt: "2026-09-07T10:00:00.000Z",
        document: { version: DOCUMENT_VERSION + 1, incomes: [], subscriptions: [], expenses: [], envelopes: [] },
      }),
    );

    expect(await writeBudget(emptyDocument(), 2)).toEqual({ ok: false, reason: "futureVersion" });
  });
});

// --- Concurrence et atomicité ---------------------------------------------------------------

describe("sérialisation des écritures", () => {
  it("sérialise des écritures simultanées : une seule aboutit sur la même révision", async () => {
    const [a, b] = await Promise.all([
      writeBudget(documentAvecDepense(1000), 0),
      writeBudget(documentAvecDepense(2000), 0),
    ]);

    // Les deux se fondent sur la révision 0. Sans verrou, elles s'entrelaceraient et la
    // seconde écraserait la première en la croyant à jour.
    const aboutissent = [a, b].filter((r) => r.ok);
    expect(aboutissent).toHaveLength(1);

    const refusees = [a, b].filter((r) => !r.ok && r.reason === "conflict");
    expect(refusees).toHaveLength(1);
  });

  it("applique dans l'ordre une suite d'écritures chaînées", async () => {
    await writeBudget(documentAvecDepense(100), 0);
    await writeBudget(documentAvecDepense(200), 1);
    await writeBudget(documentAvecDepense(300), 2);

    const relu = await readBudget();
    if (!relu.ok) throw new Error("lecture attendue");
    expect(relu.revision).toBe(3);
    expect(relu.document.expenses[0].amountCents).toBe(300);
  });

  it("ne laisse aucun fichier temporaire derrière lui", async () => {
    await writeBudget(documentAvecDepense(1000), 0);
    const fichiers = await readdir(repertoire);
    expect(fichiers).toEqual(["budget.json"]);
  });

  it("crée le répertoire de données s'il n'existe pas", async () => {
    const absent = path.join(repertoire, "profond", "imbrique");
    process.env.BUDGET_DATA_DIR = absent;

    expect(await writeBudget(emptyDocument(), 0)).toMatchObject({ ok: true });
    expect(await readFile(path.join(absent, "budget.json"), "utf8")).toContain('"revision": 1');
  });
});

// --- Récit 5 : durabilité -----------------------------------------------------------------

describe("récit 5 — ne pas perdre ses données si le serveur s'arrête", () => {
  it("retrouve le budget intact au centime après un redémarrage du serveur", async () => {
    const budget: BudgetDocument = {
      ...emptyDocument(),
      incomes: [
        {
          id: "r-1",
          label: "Salaire",
          amountCents: 240000,
          kind: "recurring",
          periodicity: "monthly",
          startDate: "2026-01-05",
          endDate: null,
        },
      ],
      subscriptions: [
        {
          id: "a-1",
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
      expenses: [{ id: "d-1", amountCents: 1250, date: "2026-09-07", category: "Courses" }],
      envelopes: [{ id: "e-1", category: "Courses", month: "2026-09", limitCents: 30000 }],
    };

    await writeBudget(budget, 0);

    // Redémarrage : le module est rechargé de zéro, donc rien ne peut venir d'un cache en
    // mémoire. Seul le fichier peut répondre.
    vi.resetModules();
    const { readBudget: relire } = await import("@/lib/server/budget-store");
    const apres = await relire();

    if (!apres.ok) throw new Error("lecture attendue");
    expect(apres.revision).toBe(1);
    expect(apres.document).toEqual(budget);

    // Au centime : la somme de tous les montants est identique.
    const somme =
      apres.document.incomes.reduce((t, r) => t + r.amountCents, 0) +
      apres.document.subscriptions.reduce(
        (t, a) => t + a.amounts.reduce((u, m) => u + m.amountCents, 0),
        0,
      ) +
      apres.document.expenses.reduce((t, d) => t + d.amountCents, 0) +
      apres.document.envelopes.reduce((t, e) => t + e.limitCents, 0);
    expect(somme).toBe(240000 + 12000 + 13500 + 1250 + 30000);
  });

  it("conserve les périodes de pause et l'historique de tarifs après redémarrage (EF-003)", async () => {
    await writeBudget(
      {
        ...emptyDocument(),
        subscriptions: [
          {
            id: "a-1",
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
      },
      0,
    );

    const apres = await readBudget();
    if (!apres.ok) throw new Error("lecture attendue");
    // Ce sont les champs dont la perte réécrirait des mois passés.
    expect(apres.document.subscriptions[0].amounts).toHaveLength(2);
    expect(apres.document.subscriptions[0].pauses).toEqual([
      { from: "2024-06-01", to: "2024-08-31" },
    ]);
  });

  it("laisse l'état antérieur intact quand l'écriture échoue", async () => {
    await writeBudget(documentAvecDepense(1000), 0);

    // Un répertoire occupe la place du fichier temporaire : l'écriture y échoue, donc
    // avant tout `rename`. C'est précisément l'instant où l'atomicité doit protéger.
    await mkdir(path.join(repertoire, "budget.json.tmp"), { recursive: true });

    const echec = await writeBudget(documentAvecDepense(2000), 1);
    expect(echec).toEqual({ ok: false, reason: "writeFailed" });

    const apres = await readBudget();
    if (!apres.ok) throw new Error("lecture attendue");
    expect(apres.revision).toBe(1);
    expect(apres.document.expenses[0].amountCents).toBe(1000);
  });

  it("ne laisse jamais de fichier de référence tronqué", async () => {
    await writeBudget(documentAvecDepense(1000), 0);

    // Le fichier de référence est toujours du JSON complet : c'est la propriété que
    // l'écriture temporaire suivie d'un `rename` achète.
    const brut = await readFile(cheminBudget(), "utf8");
    expect(() => JSON.parse(brut)).not.toThrow();
    expect(JSON.parse(brut)).toMatchObject({ revision: 1 });
  });
});
