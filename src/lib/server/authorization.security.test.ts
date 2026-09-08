// @vitest-environment node

/**
 * Tests adverses de l'accès au budget central (récit 4, CS-007).
 *
 * Sur le modèle de `src/lib/storage.security.test.ts` : on ne vérifie pas que le code
 * fonctionne, on vérifie qu'il **résiste**. Chaque test prend le point de vue de l'appareil
 * non autorisé et échoue si celui-ci obtient quoi que ce soit.
 *
 * Ces tests portent la garantie que le récit 4 doit délivrer : CS-007 devient une propriété
 * vérifiée par du code, et non une promesse de configuration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { GET, PUT } from "@/app/api/budget/route";
import { MIN_TOKEN_LENGTH } from "@/lib/server/authorization";
import { readBudget, writeBudget } from "@/lib/server/budget-store";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

const JETON = "a".repeat(64);

let repertoire: string;

/** Budget témoin : s'il fuit, on le verra dans le corps d'une réponse. */
const BUDGET_SECRET: BudgetDocument = {
  ...emptyDocument(),
  expenses: [{ id: "secret-1", amountCents: 133742, date: "2026-09-07", category: "Psychanalyste" }],
};

beforeEach(async () => {
  repertoire = await mkdtemp(path.join(tmpdir(), "budget-securite-"));
  process.env.BUDGET_DATA_DIR = repertoire;
  process.env.BUDGET_ACCESS_TOKEN = JETON;
  cookieStore.get.mockReset();

  // Le budget existe réellement : un refus qui « protège » un stockage vide ne prouve rien.
  cookieStore.get.mockReturnValue({ value: JETON });
  await writeBudget(BUDGET_SECRET, 0);
  cookieStore.get.mockReset();
});

afterEach(async () => {
  delete process.env.BUDGET_DATA_DIR;
  delete process.env.BUDGET_ACCESS_TOKEN;
  await rm(repertoire, { recursive: true, force: true });
});

function requetePut(document: unknown, baseRevision = 1): Request {
  return new Request("http://localhost/api/budget", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseRevision, document }),
  });
}

/** Les façons dont un appareil non autorisé peut se présenter. */
const IDENTIFIANTS_REFUSES: readonly [string, unknown][] = [
  ["aucun cookie", undefined],
  ["un cookie vide", { value: "" }],
  ["un cookie erroné de même longueur", { value: "b".repeat(64) }],
  ["un jeton tronqué d'un caractère", { value: JETON.slice(0, 63) }],
  ["un jeton rallongé d'un caractère", { value: `${JETON}a` }],
  ["un jeton en majuscules", { value: JETON.toUpperCase() }],
  ["un préfixe du jeton", { value: "a".repeat(8) }],
];

// --- Lecture ------------------------------------------------------------------------------

describe("un appareil non autorisé ne peut rien lire (CS-007)", () => {
  it.each(IDENTIFIANTS_REFUSES)("refuse la lecture avec %s", async (_libelle, cookie) => {
    cookieStore.get.mockReturnValue(cookie);

    const reponse = await GET();

    expect(reponse.status).toBe(401);
    const brut = await reponse.text();
    // Aucun montant, aucun libellé, aucune catégorie : le corps ne doit rien laisser filtrer.
    expect(brut).not.toContain("133742");
    expect(brut).not.toContain("Psychanalyste");
    expect(brut).toBe(JSON.stringify({ error: "unauthorized" }));
  });
});

// --- Écriture -----------------------------------------------------------------------------

describe("un appareil non autorisé ne peut rien modifier (CS-007)", () => {
  it.each(IDENTIFIANTS_REFUSES)("refuse l'écriture avec %s", async (_libelle, cookie) => {
    cookieStore.get.mockReturnValue(cookie);

    const reponse = await PUT(requetePut(emptyDocument()));
    expect(reponse.status).toBe(401);

    // Et surtout : les données sont intactes.
    const apres = await readBudget();
    if (!apres.ok) throw new Error("lecture attendue");
    expect(apres.revision).toBe(1);
    expect(apres.document.expenses[0].amountCents).toBe(133742);
  });

  it("ne peut pas non plus effacer le budget", async () => {
    cookieStore.get.mockReturnValue(undefined);

    await PUT(requetePut(emptyDocument()));

    const apres = await readBudget();
    if (!apres.ok) throw new Error("lecture attendue");
    expect(apres.document.expenses).toHaveLength(1);
  });

  it("vérifie l'autorisation avant même de lire le corps de la requête", async () => {
    cookieStore.get.mockReturnValue(undefined);

    // Un corps illisible donnerait 400 si l'ordre était inversé. Le 401 prouve que rien
    // du contenu envoyé n'a été examiné.
    const reponse = await PUT(
      new Request("http://localhost/api/budget", { method: "PUT", body: "{pas du JSON" }),
    );
    expect(reponse.status).toBe(401);
  });
});

// --- Fermeture par défaut (D7) -------------------------------------------------------------

describe("fermeture par défaut : une erreur de configuration ne doit jamais ouvrir l'accès", () => {
  it.each([
    ["absent", undefined],
    ["vide", ""],
    ["fait d'espaces", "      "],
    ["trop court d'un caractère", "a".repeat(MIN_TOKEN_LENGTH - 1)],
  ])("refuse tout quand le jeton du serveur est %s", async (_libelle, valeur) => {
    if (valeur === undefined) delete process.env.BUDGET_ACCESS_TOKEN;
    else process.env.BUDGET_ACCESS_TOKEN = valeur;

    // Même en présentant ce que le serveur a « configuré » : il n'y a pas de mode ouvert.
    cookieStore.get.mockReturnValue({ value: valeur ?? "" });
    expect((await GET()).status).toBe(401);

    cookieStore.get.mockReturnValue({ value: JETON });
    expect((await GET()).status).toBe(401);
    expect((await PUT(requetePut(emptyDocument()))).status).toBe(401);
  });

  it("laisse les données intactes lorsqu'il est mal configuré", async () => {
    delete process.env.BUDGET_ACCESS_TOKEN;
    await PUT(requetePut(emptyDocument()));

    process.env.BUDGET_ACCESS_TOKEN = JETON;
    cookieStore.get.mockReturnValue({ value: JETON });
    const apres = await readBudget();
    if (!apres.ok) throw new Error("lecture attendue");
    expect(apres.document.expenses[0].amountCents).toBe(133742);
  });
});

// --- Non-divulgation (EF-021) ---------------------------------------------------------------

describe("un refus ne divulgue rien", () => {
  it("rend un corps identique pour un cookie absent et pour un cookie erroné", async () => {
    // Les distinguer dirait à un tiers qu'il a trouvé le bon nom de cookie.
    cookieStore.get.mockReturnValue(undefined);
    const absent = await GET();
    const corpsAbsent = await absent.text();

    cookieStore.get.mockReturnValue({ value: "b".repeat(64) });
    const errone = await GET();
    const corpsErrone = await errone.text();

    expect(absent.status).toBe(errone.status);
    expect(corpsAbsent).toBe(corpsErrone);
  });

  it("ne dit pas si un budget existe", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const avecBudget = await (await GET()).text();

    // Même réponse sur un serveur qui ne détient rien du tout.
    await rm(path.join(repertoire, "budget.json"), { force: true });
    const sansBudget = await (await GET()).text();

    expect(avecBudget).toBe(sansBudget);
  });

  it("ne renvoie ni révision ni horodatage", async () => {
    cookieStore.get.mockReturnValue(undefined);
    const corps: unknown = await (await GET()).json();

    expect(corps).toEqual({ error: "unauthorized" });
    expect(Object.keys(corps as object)).toHaveLength(1);
  });

  it("n'écrit le jeton dans aucun journal", async () => {
    const journal = vi.spyOn(console, "log").mockImplementation(() => {});
    const avertissement = vi.spyOn(console, "warn").mockImplementation(() => {});
    const erreur = vi.spyOn(console, "error").mockImplementation(() => {});

    cookieStore.get.mockReturnValue({ value: JETON });
    await GET();
    cookieStore.get.mockReturnValue({ value: "b".repeat(64) });
    await GET();

    // Un jeton dans un fichier de journal est un jeton versionné en puissance.
    for (const espion of [journal, avertissement, erreur]) {
      for (const appel of espion.mock.calls) {
        expect(JSON.stringify(appel)).not.toContain(JETON);
      }
    }

    journal.mockRestore();
    avertissement.mockRestore();
    erreur.mockRestore();
  });
});
