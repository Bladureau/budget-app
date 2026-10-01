// @vitest-environment node

/**
 * Tests de contrat des points d'entrée bancaires.
 *
 * Voir specs/006-bank-sync/contracts/api-banking.md.
 *
 * Comme pour `/api/budget`, les gestionnaires sont appelés directement avec de vraies
 * `Request`. Le fournisseur est simulé par `fetch` ; la clé est engendrée pour le test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const cookieStore = { get: vi.fn() };
const headerStore = { get: vi.fn((): string | null => null) };
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => headerStore,
}));

import { GET as getStatus } from "@/app/api/banking/status/route";
import { POST as postConnect } from "@/app/api/banking/connect/route";
import { GET as getCallback } from "@/app/api/banking/callback/route";
import { GET as getOperations } from "@/app/api/banking/operations/route";
import { empreinteIban } from "@/lib/server/banking/enable-banking";
import { readBanking, updateBanking, withConnection } from "@/lib/server/banking/banking-store";
import type { BankConnection } from "@/lib/server/banking/banking-store";
import { lclCarte, revolutBrute } from "@/lib/server/banking/fixtures";

const JETON = "a".repeat(64);
const IBAN_LCL = "FR7630002000000000000000Y53";
const IBAN_AUTRE = "FR7630002000000000000001234";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const fetchSimule = vi.fn();
let repertoire: string;

function repondre(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  repertoire = await mkdtemp(path.join(tmpdir(), "banking-routes-"));
  const cheminCle = path.join(repertoire, "cle.pem");
  await writeFile(cheminCle, privateKey, "utf8");

  process.env.BUDGET_DATA_DIR = repertoire;
  process.env.BUDGET_ACCESS_TOKEN = JETON;
  process.env.ENABLE_BANKING_APP_ID = "app-id";
  process.env.ENABLE_BANKING_KEY_PATH = cheminCle;
  process.env.BANKING_REDIRECT_URL = "https://nas.exemple.ts.net/api/banking/callback";

  cookieStore.get.mockReset();
  cookieStore.get.mockReturnValue({ value: JETON });
  fetchSimule.mockReset();
  vi.stubGlobal("fetch", fetchSimule);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const nom of [
    "BUDGET_DATA_DIR",
    "BUDGET_ACCESS_TOKEN",
    "ENABLE_BANKING_APP_ID",
    "ENABLE_BANKING_KEY_PATH",
    "BANKING_REDIRECT_URL",
  ]) {
    delete process.env[nom];
  }
  await rm(repertoire, { recursive: true, force: true });
});

function requeteConnect(corps: unknown): Request {
  return new Request("http://localhost/api/banking/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corps),
  });
}

/** Lance une liaison et rend le `state` transmis au fournisseur. */
async function demarrerLiaison(bank: "lcl" | "revolut" = "lcl"): Promise<string> {
  fetchSimule
    .mockResolvedValueOnce(
      repondre(200, {
        aspsps: [
          { name: "LCL", maximum_consent_validity: 15552000 },
          { name: "Revolut", maximum_consent_validity: 15552000 },
        ],
      }),
    )
    .mockResolvedValueOnce(repondre(200, { url: "https://tilisy.enablebanking.com/ais/start?x=1" }));

  const reponse = await postConnect(requeteConnect({ bank }));
  expect(reponse.status).toBe(200);

  // Le dernier appel : une liaison précédente du même test en a laissé d'autres.
  const appel = [...fetchSimule.mock.calls].reverse().find(([url]) => String(url).endsWith("/auth"));
  const corps = JSON.parse(String((appel?.[1] as RequestInit).body)) as { state: string };
  return corps.state;
}

function retour(parametres: Record<string, string>): Request {
  return new Request(`http://0.0.0.0:3000/api/banking/callback?${new URLSearchParams(parametres)}`);
}

function sessionAvec(comptes: { iban: string; currency: string }[]): Response {
  return repondre(200, {
    session_id: "session-secrete",
    accounts: comptes.map((compte, i) => ({
      uid: `uid-${i}`,
      account_id: { iban: compte.iban },
      currency: compte.currency,
    })),
  });
}

// --- Autorisation -----------------------------------------------------------------------------

describe("autorisation", () => {
  it("refuse status et connect sans cookie valide", async () => {
    cookieStore.get.mockReturnValue(undefined);

    expect((await getStatus()).status).toBe(401);
    expect((await postConnect(requeteConnect({ bank: "lcl" }))).status).toBe(401);
    expect(fetchSimule).not.toHaveBeenCalled();
  });
});

// --- Configuration absente ----------------------------------------------------------------------

describe("configuration absente", () => {
  beforeEach(() => {
    delete process.env.ENABLE_BANKING_APP_ID;
  });

  it("status répond configured: false, sans erreur", async () => {
    const reponse = await getStatus();
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ configured: false });
  });

  it("connect répond 503 notConfigured", async () => {
    const reponse = await postConnect(requeteConnect({ bank: "lcl" }));
    expect(reponse.status).toBe(503);
    expect(await reponse.json()).toEqual({ error: "notConfigured" });
  });
});

// --- connect -------------------------------------------------------------------------------------

describe("POST /api/banking/connect", () => {
  it("refuse une banque inconnue", async () => {
    const reponse = await postConnect(requeteConnect({ bank: "boursorama" }));
    expect(reponse.status).toBe(400);
  });

  it("rend l'URL de la banque et demande au plus 180 jours", async () => {
    await demarrerLiaison("lcl");

    const appel = fetchSimule.mock.calls.find(([url]) => String(url).endsWith("/auth"));
    const corps = JSON.parse(String((appel?.[1] as RequestInit).body)) as {
      access: { valid_until: string };
    };
    const jours = (Date.parse(corps.access.valid_until) - Date.now()) / 86_400_000;
    expect(jours).toBeGreaterThan(179);
    expect(jours).toBeLessThanOrEqual(180);
  });

  it("répond 502 si le fournisseur est injoignable", async () => {
    fetchSimule.mockRejectedValue(new TypeError("fetch failed"));
    const reponse = await postConnect(requeteConnect({ bank: "lcl" }));
    expect(reponse.status).toBe(502);
  });
});

// --- callback ------------------------------------------------------------------------------------

describe("GET /api/banking/callback", () => {
  it("relie la banque sans le cookie, grâce au state", async () => {
    const state = await demarrerLiaison("lcl");
    cookieStore.get.mockReturnValue(undefined); // SameSite=Strict : le cookie n'arrive pas.
    fetchSimule.mockResolvedValueOnce(sessionAvec([{ iban: IBAN_LCL, currency: "EUR" }]));

    const reponse = await getCallback(retour({ state, code: "code" }));

    expect(reponse.status).toBe(303);
    expect(reponse.headers.get("Location")).toBe("/?banking=connected");
    const { state: banque } = await readBanking();
    expect(banque.connections[0]).toMatchObject({
      bank: "lcl",
      sessionId: "session-secrete",
      ibanHash: empreinteIban(IBAN_LCL),
      ibanSuffix: "0Y53",
    });
  });

  it("refuse un state inconnu", async () => {
    const reponse = await getCallback(retour({ state: "inconnu", code: "code" }));
    expect(reponse.headers.get("Location")).toBe("/?banking=invalidState");
    expect(fetchSimule).not.toHaveBeenCalled();
  });

  it("refuse un state rejoué", async () => {
    const state = await demarrerLiaison("lcl");
    fetchSimule.mockResolvedValueOnce(sessionAvec([{ iban: IBAN_LCL, currency: "EUR" }]));
    await getCallback(retour({ state, code: "code" }));

    const rejeu = await getCallback(retour({ state, code: "code" }));
    expect(rejeu.headers.get("Location")).toBe("/?banking=invalidState");
  });

  it("refuse un state expiré", async () => {
    const state = await demarrerLiaison("lcl");
    vi.useFakeTimers({ now: Date.now() + 16 * 60_000 });
    try {
      const reponse = await getCallback(retour({ state, code: "code" }));
      expect(reponse.headers.get("Location")).toBe("/?banking=invalidState");
    } finally {
      vi.useRealTimers();
    }
  });

  it("signale l'erreur renvoyée par la banque", async () => {
    const state = await demarrerLiaison("lcl");
    const reponse = await getCallback(retour({ state, error: "server_error" }));
    expect(reponse.headers.get("Location")).toBe("/?banking=error");
  });

  it("signale une session sans compte, sans rien enregistrer", async () => {
    const state = await demarrerLiaison("lcl");
    fetchSimule.mockResolvedValueOnce(sessionAvec([]));

    const reponse = await getCallback(retour({ state, code: "code" }));
    expect(reponse.headers.get("Location")).toBe("/?banking=noAccount");
    expect((await readBanking()).state.connections).toEqual([]);
  });

  it("refuse de choisir entre deux comptes en euros à la première liaison", async () => {
    const state = await demarrerLiaison("revolut");
    fetchSimule.mockResolvedValueOnce(
      sessionAvec([
        { iban: IBAN_LCL, currency: "EUR" },
        { iban: IBAN_AUTRE, currency: "EUR" },
      ]),
    );

    const reponse = await getCallback(retour({ state, code: "code" }));
    expect(reponse.headers.get("Location")).toBe("/?banking=noAccount");
  });

  it("retient un compte seul même annoncé sans devise (LCL annonce « XXX »)", async () => {
    const state = await demarrerLiaison("lcl");
    fetchSimule.mockResolvedValueOnce(sessionAvec([{ iban: IBAN_LCL, currency: "XXX" }]));

    const reponse = await getCallback(retour({ state, code: "code" }));

    expect(reponse.headers.get("Location")).toBe("/?banking=connected");
    expect((await readBanking()).state.connections[0].ibanSuffix).toBe("0Y53");
  });

  it("retient l'unique compte en euros parmi plusieurs devises", async () => {
    const state = await demarrerLiaison("revolut");
    fetchSimule.mockResolvedValueOnce(
      sessionAvec([
        { iban: IBAN_AUTRE, currency: "USD" },
        { iban: IBAN_LCL, currency: "EUR" },
      ]),
    );

    await getCallback(retour({ state, code: "code" }));
    expect((await readBanking()).state.connections[0].ibanHash).toBe(empreinteIban(IBAN_LCL));
  });

  it("conserve l'ancienne session si le renouvellement renvoie un autre compte", async () => {
    let state = await demarrerLiaison("lcl");
    fetchSimule.mockResolvedValueOnce(sessionAvec([{ iban: IBAN_LCL, currency: "EUR" }]));
    await getCallback(retour({ state, code: "code" }));

    state = await demarrerLiaison("lcl");
    fetchSimule.mockResolvedValueOnce(
      repondre(200, {
        session_id: "autre-session",
        accounts: [{ uid: "u", account_id: { iban: IBAN_AUTRE }, currency: "EUR" }],
      }),
    );
    const reponse = await getCallback(retour({ state, code: "code" }));

    expect(reponse.headers.get("Location")).toBe("/?banking=noAccount");
    const connexion = (await readBanking()).state.connections[0];
    expect(connexion.sessionId).toBe("session-secrete");
    expect(connexion.lastError).toBe("noAccount");
  });
});

// --- Aucune donnée sensible ----------------------------------------------------------------------

describe("non-divulgation", () => {
  it("status ne contient ni session, ni IBAN complet, ni empreinte, ni JWT", async () => {
    const state = await demarrerLiaison("lcl");
    fetchSimule.mockResolvedValueOnce(sessionAvec([{ iban: IBAN_LCL, currency: "EUR" }]));
    await getCallback(retour({ state, code: "code" }));

    const corps = await (await getStatus()).text();
    expect(corps).not.toContain("session-secrete");
    expect(corps).not.toContain(IBAN_LCL);
    expect(corps).not.toContain(empreinteIban(IBAN_LCL));
    expect(corps).not.toMatch(/eyJ[\w-]+\.[\w-]+\./);
    expect(JSON.parse(corps)).toMatchObject({
      configured: true,
      banks: [
        { bank: "lcl", connected: true, ibanSuffix: "0Y53" },
        { bank: "revolut", connected: false },
      ],
    });
  });
});

// --- operations ----------------------------------------------------------------------------------

describe("GET /api/banking/operations", () => {
  const T0 = new Date("2026-10-05T12:00:00Z");

  function requeteOperations(
    parametres: Record<string, string>,
    enTetes: Record<string, string> = {},
  ): Request {
    return new Request(
      `http://0.0.0.0:3000/api/banking/operations?${new URLSearchParams(parametres)}`,
      { headers: enTetes },
    );
  }

  async function relier(bank: "lcl" | "revolut", surcharge: Partial<BankConnection> = {}) {
    await updateBanking((etat) => {
      const relie = withConnection(etat, {
        bank,
        sessionId: `session-${bank}`,
        accountUid: `uid-${bank}`,
        ibanHash: "b".repeat(64),
        ibanSuffix: "XXXX",
        validUntil: "2027-03-30T00:00:00.000Z",
      });
      return {
        ...relie,
        connections: relie.connections.map((c) => (c.bank === bank ? { ...c, ...surcharge } : c)),
      };
    });
  }

  function transactions(brutes: unknown[]): Response {
    return repondre(200, { transactions: brutes, continuation_key: null });
  }

  const refs = (corps: { operations: { ref: string }[] }) => corps.operations.map((o) => o.ref);
  const banque = (corps: { banks: { bank: string }[] }, bank: string) =>
    corps.banks.find((b) => b.bank === bank) as Record<string, unknown>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: T0 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuse sans cookie, et refuse une date de départ invalide", async () => {
    expect((await getOperations(requeteOperations({ since: "2026-10-01" }))).status).toBe(200);
    expect((await getOperations(requeteOperations({ since: "hier" }))).status).toBe(400);
    expect((await getOperations(requeteOperations({}))).status).toBe(400);

    cookieStore.get.mockReturnValue(undefined);
    expect((await getOperations(requeteOperations({ since: "2026-10-01" }))).status).toBe(401);
  });

  it("récupère, normalise et trie, avec les en-têtes de présence", async () => {
    await relier("lcl");
    fetchSimule.mockResolvedValueOnce(
      transactions([
        lclCarte("b", "2026-10-03", "12.00", "BOULANGERIE", "02/10/26"),
        lclCarte("a", "2026-10-02", "33.82", "PETROLEC SUD", "01/10/26"),
      ]),
    );

    const reponse = await getOperations(
      requeteOperations(
        { since: "2026-10-01" },
        { "x-forwarded-for": "100.64.0.2, 10.0.0.1", "user-agent": "Firefox" },
      ),
    );
    const corps = await reponse.json();

    expect(refs(corps)).toEqual(["lcl:a", "lcl:b"]);
    expect(corps.operations[0]).toMatchObject({ amountCents: 3382, paymentDate: "2026-10-01" });
    const [url, options] = fetchSimule.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("date_from=2026-09-24");
    expect(options.headers).toMatchObject({
      "Psu-Ip-Address": "100.64.0.2",
      "Psu-User-Agent": "Firefox",
    });
  });

  it("sert le cache sans rappeler la banque avant 6 heures", async () => {
    await relier("lcl");
    fetchSimule.mockResolvedValueOnce(
      transactions([lclCarte("a", "2026-10-02", "1.00", "X", "01/10/26")]),
    );
    await getOperations(requeteOperations({ since: "2026-10-01" }));

    vi.setSystemTime(new Date(T0.getTime() + 5 * 3_600_000));
    const corps = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).json();

    expect(fetchSimule).toHaveBeenCalledTimes(1);
    expect(corps.operations).toHaveLength(1);
  });

  it("rappelle la banque après 6 heures", async () => {
    await relier("lcl");
    fetchSimule.mockImplementation(async () => transactions([]));
    await getOperations(requeteOperations({ since: "2026-10-01" }));

    vi.setSystemTime(new Date(T0.getTime() + 6 * 3_600_000));
    await getOperations(requeteOperations({ since: "2026-10-01" }));
    expect(fetchSimule).toHaveBeenCalledTimes(2);
  });

  it("borne la demande manuelle à 5 minutes", async () => {
    await relier("lcl");
    fetchSimule.mockImplementation(async () => transactions([]));
    const manuelle = () =>
      getOperations(requeteOperations({ since: "2026-10-01", refresh: "manual" }));

    await manuelle();
    vi.setSystemTime(new Date(T0.getTime() + 4 * 60_000));
    await manuelle();
    expect(fetchSimule).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date(T0.getTime() + 5 * 60_000));
    await manuelle();
    expect(fetchSimule).toHaveBeenCalledTimes(2);
  });

  it("ne déclenche qu'une récupération pour deux demandes simultanées", async () => {
    await relier("lcl");
    fetchSimule.mockImplementation(async () => transactions([]));
    await Promise.all([
      getOperations(requeteOperations({ since: "2026-10-01" })),
      getOperations(requeteOperations({ since: "2026-10-01" })),
    ]);
    expect(fetchSimule).toHaveBeenCalledTimes(1);
  });

  it("rend l'autre banque quand l'une échoue, et garde le cache de celle en échec", async () => {
    await relier("lcl", {
      operations: [
        {
          ref: "lcl:ancienne",
          bank: "lcl",
          bookingDate: "2026-10-02",
          paymentDate: "2026-10-01",
          amountCents: 100,
          currency: "EUR",
          direction: "debit",
          kind: "card",
          label: "X",
          rawLabel: "X",
        },
      ],
    });
    await relier("revolut");
    fetchSimule.mockImplementation(async (url: string) =>
      url.includes("uid-lcl")
        ? repondre(401, { error: "EXPIRED_SESSION" })
        : transactions([
            revolutBrute("p", "2026-10-03", "5.45", "DBIT", "CARD_PAYMENT", "Casino Shop"),
          ]),
    );

    const corps = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).json();

    expect(refs(corps).sort()).toEqual(["lcl:ancienne", "revolut:p"]);
    expect(banque(corps, "lcl").lastError).toBe("expired");
    expect(banque(corps, "revolut").lastError).toBeNull();
  });

  it("fusionne les arrondis et ne les réajoute pas à la récupération suivante", async () => {
    await relier("revolut");
    fetchSimule.mockImplementation(async () =>
      transactions([
        revolutBrute("a", "2026-10-03", "0.55", "DBIT", "TRANSFER", "Revpoints Spare Change"),
        revolutBrute("p", "2026-10-03", "5.45", "DBIT", "CARD_PAYMENT", "Casino Shop"),
      ]),
    );
    await getOperations(requeteOperations({ since: "2026-10-01" }));

    vi.setSystemTime(new Date(T0.getTime() + 7 * 3_600_000));
    const corps = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).json();

    expect(fetchSimule).toHaveBeenCalledTimes(2);
    expect(corps.operations).toHaveLength(1);
    expect(corps.operations[0]).toMatchObject({
      ref: "revolut:p",
      roundUpCents: 55,
      roundUpRef: "revolut:a",
    });
  });

  it("compte les transactions illisibles sans faire échouer la récupération", async () => {
    await relier("lcl");
    fetchSimule.mockResolvedValueOnce(
      transactions([
        lclCarte("ok", "2026-10-02", "1.00", "X", "01/10/26"),
        lclCarte("ko", "2026-10-02", "1,00", "X", "01/10/26"),
      ]),
    );
    const corps = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).json();

    expect(corps.operations).toHaveLength(1);
    expect(banque(corps, "lcl").discardedCount).toBe(1);
  });

  it("ne rend pas les opérations antérieures à since − 7 jours", async () => {
    await relier("lcl");
    fetchSimule.mockResolvedValueOnce(
      transactions([
        lclCarte("vieille", "2026-09-20", "1.00", "X", "19/09/26"),
        lclCarte("marge", "2026-09-25", "1.00", "X", "24/09/26"),
      ]),
    );
    const corps = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).json();
    expect(refs(corps)).toEqual(["lcl:marge"]);
  });

  const ancienne = {
    ref: "lcl:ancienne",
    bank: "lcl" as const,
    bookingDate: "2026-05-30",
    paymentDate: "2026-05-29",
    amountCents: 100,
    currency: "EUR",
    direction: "debit" as const,
    kind: "card" as const,
    label: "X",
    rawLabel: "X",
  };

  it("consigne un accès retiré sans perdre le cache", async () => {
    await relier("lcl", { operations: [{ ...ancienne, bookingDate: "2026-10-02" }] });
    fetchSimule.mockResolvedValueOnce(repondre(403, { code: "SESSION_REVOKED" }));

    const corps = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).json();

    expect(banque(corps, "lcl").lastError).toBe("revoked");
    expect(refs(corps)).toEqual(["lcl:ancienne"]);
  });

  it("conserve le cache après une reconnexion, et ne rend aucune opération en double", async () => {
    // Liaison initiale, puis récupération d'une opération.
    let state = await demarrerLiaison("lcl");
    fetchSimule.mockResolvedValueOnce(sessionAvec([{ iban: IBAN_LCL, currency: "XXX" }]));
    await getCallback(retour({ state, code: "code" }));
    fetchSimule.mockResolvedValueOnce(
      transactions([lclCarte("a", "2026-10-02", "12.00", "BOULANGERIE", "01/10/26")]),
    );
    await getOperations(requeteOperations({ since: "2026-10-01" }));

    // Renouvellement : même compte, nouvelle session.
    state = await demarrerLiaison("lcl");
    fetchSimule.mockResolvedValueOnce(sessionAvec([{ iban: IBAN_LCL, currency: "XXX" }]));
    await getCallback(retour({ state, code: "code-2" }));

    // La banque rend de nouveau la même opération, plus une nouvelle.
    fetchSimule.mockResolvedValueOnce(
      transactions([
        lclCarte("a", "2026-10-02", "12.00", "BOULANGERIE", "01/10/26"),
        lclCarte("b", "2026-10-04", "3.00", "CAFE", "03/10/26"),
      ]),
    );
    const corps = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).json();

    expect(refs(corps)).toEqual(["lcl:a", "lcl:b"]);
    expect(banque(corps, "lcl").lastError).toBeNull();
  });

  it("signale un trou d'historique après plus de 90 jours d'extinction", async () => {
    await relier("lcl", { lastFetchAt: "2026-06-01T00:00:00.000Z", operations: [ancienne] });
    // La banque ne rend plus rien d'antérieur à juillet.
    fetchSimule.mockResolvedValueOnce(
      transactions([lclCarte("recente", "2026-07-10", "1.00", "X", "09/07/26")]),
    );

    const corps = await (await getOperations(requeteOperations({ since: "2026-05-01" }))).json();
    expect(banque(corps, "lcl").historyGap).toBe(true);
  });

  it("ne signale pas de trou quand la banque rend tout depuis la date demandée", async () => {
    await relier("lcl", { lastFetchAt: "2026-06-01T00:00:00.000Z", operations: [ancienne] });
    fetchSimule.mockResolvedValueOnce(
      transactions([lclCarte("suite", "2026-05-25", "1.00", "X", "24/05/26")]),
    );

    const corps = await (await getOperations(requeteOperations({ since: "2026-05-01" }))).json();
    expect(banque(corps, "lcl").historyGap).toBe(false);
  });

  it("ne signale pas de trou après une courte extinction", async () => {
    await relier("lcl", { lastFetchAt: "2026-10-01T00:00:00.000Z" });
    fetchSimule.mockResolvedValueOnce(transactions([]));

    const corps = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).json();
    expect(banque(corps, "lcl").historyGap).toBe(false);
  });

  it("ne renvoie aucune donnée sensible", async () => {
    await relier("lcl");
    fetchSimule.mockResolvedValueOnce(transactions([]));
    const texte = await (await getOperations(requeteOperations({ since: "2026-10-01" }))).text();
    expect(texte).not.toContain("session-lcl");
    expect(texte).not.toContain("uid-lcl");
    expect(texte).not.toContain("b".repeat(64));
  });
});
