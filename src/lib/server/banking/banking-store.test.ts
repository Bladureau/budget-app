// @vitest-environment node

/**
 * Tests du magasin bancaire, sur un répertoire temporaire réel.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  emptyBanking,
  findConnection,
  mergeOperations,
  readBanking,
  updateBanking,
  withAttempt,
  withConnection,
  withError,
  withFetchResult,
} from "@/lib/server/banking/banking-store";
import type { BankOperation } from "@/features/banking/types";

let repertoire: string;

beforeEach(async () => {
  repertoire = await mkdtemp(path.join(tmpdir(), "banking-store-"));
  process.env.BUDGET_DATA_DIR = repertoire;
});

afterEach(async () => {
  delete process.env.BUDGET_DATA_DIR;
  await rm(repertoire, { recursive: true, force: true });
});

const HASH = "a".repeat(64);

function operation(ref: string, surcharge: Partial<BankOperation> = {}): BankOperation {
  return {
    ref: `revolut:${ref}`,
    bank: "revolut",
    bookingDate: "2026-10-02",
    paymentDate: "2026-10-02",
    amountCents: 545,
    currency: "EUR",
    direction: "debit",
    kind: "card",
    label: "Casino Shop",
    rawLabel: "Casino Shop",
    ...surcharge,
  };
}

const liaison = {
  bank: "revolut" as const,
  sessionId: "session-1",
  accountUid: "uid-1",
  ibanHash: HASH,
  ibanSuffix: "4206",
  validUntil: "2027-03-30T00:00:00.000Z",
};

describe("lecture", () => {
  it("rend un état vide quand le fichier n'existe pas", async () => {
    expect(await readBanking()).toEqual({ state: emptyBanking(), quarantined: false });
  });

  it("met en quarantaine un contenu illisible et repart à vide", async () => {
    await writeFile(path.join(repertoire, "banking.json"), "{abîmé", "utf8");

    expect(await readBanking()).toEqual({ state: emptyBanking(), quarantined: true });
    const fichiers = await readdir(repertoire);
    expect(fichiers.some((nom) => nom.startsWith("banking.corrupted-"))).toBe(true);
  });

  it("met en quarantaine un contenu de forme invalide", async () => {
    await writeFile(
      path.join(repertoire, "banking.json"),
      JSON.stringify({ version: 1, connections: [{ bank: "lcl" }] }),
      "utf8",
    );
    expect((await readBanking()).quarantined).toBe(true);
  });

  it("refuse deux connexions pour une même banque", async () => {
    const etat = withConnection(emptyBanking(), liaison);
    await writeFile(
      path.join(repertoire, "banking.json"),
      JSON.stringify({ ...etat, connections: [...etat.connections, ...etat.connections] }),
      "utf8",
    );
    expect((await readBanking()).quarantined).toBe(true);
  });
});

describe("écriture", () => {
  it("relit ce qui a été écrit", async () => {
    const resultat = await updateBanking((etat) => withConnection(etat, liaison));
    expect(resultat.ok).toBe(true);

    const { state } = await readBanking();
    expect(findConnection(state, "revolut")).toMatchObject({ sessionId: "session-1", lastError: null });
    expect(JSON.parse(await readFile(path.join(repertoire, "banking.json"), "utf8")).version).toBe(1);
  });

  it("n'écrit rien quand la transformation rend null", async () => {
    await updateBanking(() => null);
    expect(await readdir(repertoire)).toEqual([]);
  });

  it("sérialise deux mises à jour concurrentes sans en perdre une", async () => {
    await updateBanking((etat) => withConnection(etat, liaison));
    await Promise.all([
      updateBanking((etat) => withConnection(etat, { ...liaison, bank: "lcl", ibanSuffix: "0000" })),
      updateBanking((etat) => withAttempt(etat, "revolut", new Date("2026-10-01T18:00:00Z"))),
    ]);

    const { state } = await readBanking();
    expect(state.connections).toHaveLength(2);
    expect(findConnection(state, "revolut")?.lastAttemptAt).toBe("2026-10-01T18:00:00.000Z");
  });
});

describe("mergeOperations", () => {
  it("déduplique par référence, de façon idempotente", () => {
    const lot = [operation("a"), operation("b")];
    const une = mergeOperations([], lot);
    expect(mergeOperations(une, lot)).toEqual(une);
    expect(une).toHaveLength(2);
  });

  it("ne remplace pas une opération déjà connue", () => {
    const fusion = mergeOperations([operation("a")], [operation("a", { amountCents: 999 })]);
    expect(fusion).toEqual([operation("a")]);
  });

  it("ne réajoute pas un arrondi déjà fusionné dans un paiement", () => {
    const paiement = operation("p", { roundUpCents: 55, roundUpRef: "revolut:arrondi" });
    const arrondi = operation("arrondi", { kind: "roundUp", amountCents: 55 });
    expect(mergeOperations([paiement], [arrondi])).toEqual([paiement]);
  });
});

describe("transformations de connexion", () => {
  it("conserve le cache d'opérations lors d'un renouvellement", () => {
    let etat = withConnection(emptyBanking(), liaison);
    etat = withFetchResult(etat, "revolut", {
      operations: [operation("a")],
      discardedCount: 0,
      at: new Date("2026-10-01T18:00:00Z"),
    });
    etat = withError(etat, "revolut", "expired", new Date("2027-04-01T00:00:00Z"));

    const renouvele = withConnection(etat, { ...liaison, sessionId: "session-2", accountUid: "uid-2" });
    const connexion = findConnection(renouvele, "revolut");

    expect(connexion?.operations).toEqual([operation("a")]);
    expect(connexion?.sessionId).toBe("session-2");
    expect(connexion?.lastError).toBeNull();
    expect(connexion?.lastAttemptAt).toBeNull();
    expect(connexion?.lastFetchAt).toBe("2026-10-01T18:00:00.000Z");
  });

  it("conserve le cache en cas d'erreur", () => {
    let etat = withConnection(emptyBanking(), liaison);
    etat = withFetchResult(etat, "revolut", {
      operations: [operation("a")],
      discardedCount: 1,
      at: new Date("2026-10-01T18:00:00Z"),
    });
    etat = withError(etat, "revolut", "unavailable", new Date("2026-10-02T00:00:00Z"));

    expect(findConnection(etat, "revolut")).toMatchObject({
      operations: [operation("a")],
      lastError: "unavailable",
      lastFetchAt: "2026-10-01T18:00:00.000Z",
      lastAttemptAt: "2026-10-02T00:00:00.000Z",
    });
  });

  it("ignore une banque non reliée", () => {
    expect(withError(emptyBanking(), "lcl", "expired", new Date())).toEqual(emptyBanking());
  });
});
