/**
 * Tests du client navigateur des points d'entrée bancaires, `fetch` simulé.
 *
 * `fetchOperations` relève de l'obligation de test du principe III : il lit des montants et des
 * dates venus du réseau. Cas nominal, cas limites et entrées malformées.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchBankStatus, fetchOperations, startConnect } from "@/features/banking/client";
import type { BankOperation } from "@/features/banking/types";

const fetchSimule = vi.fn();

function repondre(statut: number, corps: unknown): Response {
  return new Response(typeof corps === "string" ? corps : JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchSimule.mockReset();
  vi.stubGlobal("fetch", fetchSimule);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const banqueReliee = {
  bank: "lcl",
  connected: true,
  ibanSuffix: "XXXX",
  validUntil: "2027-03-30T00:00:00.000Z",
  lastFetchAt: "2026-10-01T18:00:00.000Z",
  lastError: null,
  discardedCount: 0,
  historyGap: false,
};

const banqueNonReliee = {
  bank: "revolut",
  connected: false,
  ibanSuffix: null,
  validUntil: null,
  lastFetchAt: null,
  lastError: null,
  discardedCount: 0,
  historyGap: false,
};

function operation(surcharge: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ref: "revolut:p1",
    bank: "revolut",
    bookingDate: "2026-10-02",
    paymentDate: "2026-10-02",
    amountCents: 545,
    currency: "EUR",
    direction: "debit",
    kind: "card",
    label: "Casino Shop",
    rawLabel: "Casino Shop",
    roundUpCents: 55,
    roundUpRef: "revolut:a1",
    ...surcharge,
  };
}

// --- fetchBankStatus ------------------------------------------------------------------------

describe("fetchBankStatus", () => {
  it("rend l'état validé", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { configured: true, banks: [banqueReliee, banqueNonReliee] }));
    const resultat = await fetchBankStatus();
    expect(resultat).toEqual({
      ok: true,
      value: { configured: true, banks: [banqueReliee, banqueNonReliee] },
    });
    expect(fetchSimule.mock.calls[0][1]).toMatchObject({ credentials: "same-origin", cache: "no-store" });
  });

  it.each([
    [401, "unauthorized"],
    [503, "notConfigured"],
    [500, "serverError"],
  ] as const)("traduit le statut %i en %s", async (statut, raison) => {
    fetchSimule.mockResolvedValue(repondre(statut, {}));
    expect(await fetchBankStatus()).toEqual({ ok: false, reason: raison });
  });

  it("traduit un réseau coupé en hors connexion", async () => {
    fetchSimule.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchBankStatus()).toEqual({ ok: false, reason: "offline" });
  });

  it("refuse un corps qui n'est pas du JSON", async () => {
    fetchSimule.mockResolvedValue(repondre(200, "<html>portail captif</html>"));
    expect(await fetchBankStatus()).toEqual({ ok: false, reason: "invalidResponse" });
  });

  it.each([
    ["configured absent", { banks: [] }],
    ["banque inconnue", { configured: true, banks: [{ ...banqueReliee, bank: "boursorama" }] }],
    ["erreur inconnue", { configured: true, banks: [{ ...banqueReliee, lastError: "kaput" }] }],
    ["suffixe trop long", { configured: true, banks: [{ ...banqueReliee, ibanSuffix: "FR7630002" }] }],
    ["date invalide", { configured: true, banks: [{ ...banqueReliee, validUntil: "demain" }] }],
    ["compteur négatif", { configured: true, banks: [{ ...banqueReliee, discardedCount: -1 }] }],
    ["champ manquant", { configured: true, banks: [{ bank: "lcl", connected: true }] }],
  ])("refuse une réponse mal formée : %s", async (_, corps) => {
    fetchSimule.mockResolvedValue(repondre(200, corps));
    expect(await fetchBankStatus()).toEqual({ ok: false, reason: "invalidResponse" });
  });
});

// --- startConnect -----------------------------------------------------------------------------

describe("startConnect", () => {
  it("rend l'URL de la banque", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { url: "https://tilisy.enablebanking.com/ais/start?x=1" }));
    expect(await startConnect("lcl")).toEqual({
      ok: true,
      value: "https://tilisy.enablebanking.com/ais/start?x=1",
    });
    const options = fetchSimule.mock.calls[0][1] as RequestInit;
    expect(options.method).toBe("POST");
    expect(JSON.parse(String(options.body))).toEqual({ bank: "lcl" });
  });

  it("refuse une réponse sans URL", async () => {
    fetchSimule.mockResolvedValue(repondre(200, {}));
    expect(await startConnect("lcl")).toEqual({ ok: false, reason: "invalidResponse" });
  });

  it("refuse une URL qui n'est pas en HTTPS", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { url: "http://ailleurs.exemple" }));
    expect(await startConnect("lcl")).toEqual({ ok: false, reason: "invalidResponse" });
  });

  it("signale une synchronisation bancaire non configurée", async () => {
    fetchSimule.mockResolvedValue(repondre(503, { error: "notConfigured" }));
    expect(await startConnect("revolut")).toEqual({ ok: false, reason: "notConfigured" });
  });
});

// --- fetchOperations ----------------------------------------------------------------------------

describe("fetchOperations", () => {
  function lot(operations: unknown[]): Response {
    return repondre(200, { operations, banks: [banqueReliee, banqueNonReliee] });
  }

  it("rend un lot valide et l'état des banques", async () => {
    fetchSimule.mockResolvedValue(lot([operation()]));
    const resultat = await fetchOperations("2026-10-01", false);

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.value.operations).toEqual([operation() as unknown as BankOperation]);
    expect(resultat.value.rejectedCount).toBe(0);
    expect(resultat.value.status.banks).toHaveLength(2);
    expect(String(fetchSimule.mock.calls[0][0])).toBe("/api/banking/operations?since=2026-10-01");
  });

  it("transmet la demande manuelle", async () => {
    fetchSimule.mockResolvedValue(lot([]));
    await fetchOperations("2026-10-01", true);
    expect(String(fetchSimule.mock.calls[0][0])).toContain("refresh=manual");
  });

  it("accepte un montant nul (pré-autorisation) et le plus grand montant réaliste", async () => {
    fetchSimule.mockResolvedValue(
      lot([
        operation({ ref: "revolut:z", amountCents: 0, roundUpCents: undefined, roundUpRef: undefined }),
        operation({ ref: "revolut:max", amountCents: 9_000_000_000 }),
      ]),
    );
    const resultat = await fetchOperations("2026-10-01", false);
    expect(resultat.ok && resultat.value.operations.map((o) => o.amountCents)).toEqual([0, 9_000_000_000]);
  });

  it.each([
    ["montant non entier", { amountCents: 5.45 }],
    ["montant négatif", { amountCents: -545 }],
    ["montant au-delà du maximum", { amountCents: 9_000_000_001 }],
    ["montant en texte", { amountCents: "5.45" }],
    ["date invalide", { bookingDate: "2026-02-30" }],
    ["date de paiement invalide", { paymentDate: "02/10/2026" }],
    ["nature inconnue", { kind: "crypto" }],
    ["devise mal formée", { currency: "euro" }],
    ["sens inconnu", { direction: "sideways" }],
    ["arrondi sans sa référence", { roundUpRef: undefined }],
    ["arrondi nul", { roundUpCents: 0 }],
    ["référence d'une autre banque", { ref: "lcl:p1" }],
  ])("écarte une opération invalide (%s) sans faire échouer le lot", async (_, surcharge) => {
    fetchSimule.mockResolvedValue(
      lot([operation({ ref: "revolut:ok1" }), operation(surcharge), operation({ ref: "revolut:ok2" })]),
    );
    const resultat = await fetchOperations("2026-10-01", false);

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.value.operations.map((o) => o.ref)).toEqual(["revolut:ok1", "revolut:ok2"]);
    expect(resultat.value.rejectedCount).toBe(1);
  });

  it("refuse un corps sans liste d'opérations", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { banks: [] }));
    expect(await fetchOperations("2026-10-01", false)).toEqual({ ok: false, reason: "invalidResponse" });
  });

  it("refuse un corps qui n'est pas du JSON", async () => {
    fetchSimule.mockResolvedValue(repondre(200, "pas du json"));
    expect(await fetchOperations("2026-10-01", false)).toEqual({ ok: false, reason: "invalidResponse" });
  });

  it("signale l'absence d'autorisation", async () => {
    fetchSimule.mockResolvedValue(repondre(401, {}));
    expect(await fetchOperations("2026-10-01", false)).toEqual({ ok: false, reason: "unauthorized" });
  });
});
