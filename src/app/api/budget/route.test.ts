// @vitest-environment node

/**
 * Tests de contrat du point d'entrée HTTP.
 *
 * Voir specs/005-server-side-storage/contracts/api-budget.md.
 *
 * Les gestionnaires sont appelés directement, avec de vraies `Request` : c'est ce que Next.js
 * leur passe, et cela évite de tester un serveur simulé plutôt que le contrat.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const cookieStore = { get: vi.fn() };
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

import { GET, PUT } from "@/app/api/budget/route";
import { DOCUMENT_VERSION, emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

const JETON = "a".repeat(64);

let repertoire: string;

beforeEach(async () => {
  repertoire = await mkdtemp(path.join(tmpdir(), "budget-route-"));
  process.env.BUDGET_DATA_DIR = repertoire;
  process.env.BUDGET_ACCESS_TOKEN = JETON;
  cookieStore.get.mockReset();
  cookieStore.get.mockReturnValue({ value: JETON });
});

afterEach(async () => {
  delete process.env.BUDGET_DATA_DIR;
  delete process.env.BUDGET_ACCESS_TOKEN;
  await rm(repertoire, { recursive: true, force: true });
});

function requetePut(corps: unknown): Request {
  return new Request("http://localhost/api/budget", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof corps === "string" ? corps : JSON.stringify(corps),
  });
}

function documentAvecDepense(amountCents: number): BudgetDocument {
  return {
    ...emptyDocument(),
    expenses: [{ id: "depense-1", amountCents, date: "2026-09-07", category: "Courses" }],
  };
}

// --- GET -----------------------------------------------------------------------------------

describe("GET /api/budget", () => {
  it("rend 200 et la révision 0 quand aucun budget n'existe", async () => {
    const reponse = await GET();
    expect(reponse.status).toBe(200);

    const corps = await reponse.json();
    // L'absence de budget est un état normal, pas l'absence d'une ressource : d'où 200 et
    // non 404. C'est ce qui laisse le premier appareil écrire sur la révision 0.
    expect(corps).toEqual({ revision: 0, updatedAt: null, document: emptyDocument() });
  });

  it("rend le budget enregistré", async () => {
    await PUT(requetePut({ baseRevision: 0, document: documentAvecDepense(1250) }));

    const corps = await (await GET()).json();
    expect(corps.revision).toBe(1);
    expect(corps.document.expenses[0].amountCents).toBe(1250);
    expect(typeof corps.updatedAt).toBe("string");
  });

  it("rend 500 storageUnreadable sur un contenu illisible", async () => {
    await writeFile(path.join(repertoire, "budget.json"), "{abîmé", "utf8");

    const reponse = await GET();
    expect(reponse.status).toBe(500);
    expect(await reponse.json()).toEqual({ error: "storageUnreadable" });
  });

  it("rend 500 storageFutureVersion sur un fichier plus récent que l'application", async () => {
    await writeFile(
      path.join(repertoire, "budget.json"),
      JSON.stringify({
        revision: 1,
        updatedAt: "2026-09-07T10:00:00.000Z",
        document: { version: DOCUMENT_VERSION + 1, incomes: [], subscriptions: [], expenses: [], envelopes: [] },
      }),
      "utf8",
    );

    const reponse = await GET();
    expect(reponse.status).toBe(500);
    // Distinct de `storageUnreadable` : les deux appellent des gestes opposés.
    expect(await reponse.json()).toEqual({ error: "storageFutureVersion" });
  });
});

// --- PUT -----------------------------------------------------------------------------------

describe("PUT /api/budget", () => {
  it("accepte une écriture et rend la nouvelle révision", async () => {
    const reponse = await PUT(requetePut({ baseRevision: 0, document: emptyDocument() }));

    expect(reponse.status).toBe(200);
    const corps = await reponse.json();
    expect(corps.revision).toBe(1);
    expect(typeof corps.updatedAt).toBe("string");
    // La réponse d'un succès ne renvoie pas le document : l'appelant l'a déjà.
    expect(corps.document).toBeUndefined();
  });

  it("transporte les montants en centimes entiers, sans les altérer (EF-004)", async () => {
    await PUT(requetePut({ baseRevision: 0, document: documentAvecDepense(9_000_000_000) }));

    const brut = await readFile(path.join(repertoire, "budget.json"), "utf8");
    // Aucune notation décimale ni exponentielle n'apparaît dans le fichier.
    expect(brut).toContain("9000000000");

    const corps = await (await GET()).json();
    expect(corps.document.expenses[0].amountCents).toBe(9_000_000_000);
    expect(Number.isInteger(corps.document.expenses[0].amountCents)).toBe(true);
  });

  it("rend 409 avec l'état courant quand la révision est périmée", async () => {
    await PUT(requetePut({ baseRevision: 0, document: documentAvecDepense(1000) }));

    const reponse = await PUT(requetePut({ baseRevision: 0, document: documentAvecDepense(2000) }));

    expect(reponse.status).toBe(409);
    const corps = await reponse.json();
    expect(corps.error).toBe("revisionMismatch");
    expect(corps.revision).toBe(1);
    // L'état courant accompagne le refus : pas de second aller-retour pour afficher le choix.
    expect(corps.document.expenses[0].amountCents).toBe(1000);
  });

  it("n'écrit rien quand il refuse pour révision périmée", async () => {
    await PUT(requetePut({ baseRevision: 0, document: documentAvecDepense(1000) }));
    await PUT(requetePut({ baseRevision: 0, document: documentAvecDepense(2000) }));

    const corps = await (await GET()).json();
    expect(corps.revision).toBe(1);
    expect(corps.document.expenses[0].amountCents).toBe(1000);
  });

  it.each([
    ["un corps qui n'est pas du JSON", "{pas du JSON"],
    ["un corps qui n'est pas un objet", 42],
    ["une révision de base manquante", { document: emptyDocument() }],
    ["une révision de base non entière", { baseRevision: 1.5, document: emptyDocument() }],
    ["une révision de base négative", { baseRevision: -1, document: emptyDocument() }],
    ["un document manquant", { baseRevision: 0 }],
    ["un document invalide", { baseRevision: 0, document: { version: 3 } }],
  ])("rend 400 sur %s", async (_libelle, corps) => {
    const reponse = await PUT(requetePut(corps));
    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({ error: "invalidDocument" });
  });

  it.each([
    ["un montant négatif", -100],
    ["un montant nul", 0],
    ["un montant décimal", 12.5],
    ["un montant au-delà de la borne", 9_000_000_001],
  ])("rend 400 sur %s, et n'écrit rien", async (_libelle, montant) => {
    const reponse = await PUT(
      requetePut({ baseRevision: 0, document: documentAvecDepense(montant) }),
    );
    expect(reponse.status).toBe(400);

    const corps = await (await GET()).json();
    expect(corps.revision).toBe(0);
  });

  it("n'expose aucun moyen de forcer une écriture", async () => {
    await PUT(requetePut({ baseRevision: 0, document: documentAvecDepense(1000) }));

    // Un éventuel drapeau `force` ne doit avoir aucun effet : le seul chemin est de rejouer
    // sur la révision courante.
    const reponse = await PUT(
      requetePut({ baseRevision: 0, force: true, document: documentAvecDepense(2000) }),
    );
    expect(reponse.status).toBe(409);
  });
});

// --- Autorisation ----------------------------------------------------------------------------

describe("autorisation", () => {
  it("rend 401 sur GET sans cookie", async () => {
    cookieStore.get.mockReturnValue(undefined);

    const reponse = await GET();
    expect(reponse.status).toBe(401);
    expect(await reponse.json()).toEqual({ error: "unauthorized" });
  });

  it("rend 401 sur PUT sans cookie, et n'écrit rien", async () => {
    cookieStore.get.mockReturnValue(undefined);

    const reponse = await PUT(requetePut({ baseRevision: 0, document: documentAvecDepense(1) }));
    expect(reponse.status).toBe(401);

    cookieStore.get.mockReturnValue({ value: JETON });
    const corps = await (await GET()).json();
    expect(corps.revision).toBe(0);
  });

  it("vérifie l'autorisation AVANT d'analyser le corps", async () => {
    cookieStore.get.mockReturnValue(undefined);

    // Un corps illisible donnerait 400 si l'ordre était inversé ; il doit donner 401.
    const reponse = await PUT(requetePut("{pas du JSON"));
    expect(reponse.status).toBe(401);
  });
});
