// @vitest-environment node

/**
 * Tests des appels au fournisseur, `fetch` simulé.
 *
 * La clé est engendrée pour le test : aucune vraie clé n'entre dans le dépôt.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVerify, generateKeyPairSync } from "node:crypto";

import {
  createSession,
  empreinteIban,
  fetchTransactions,
  getAspspMaxValidity,
  signJwt,
  startAuthorization,
  suffixeIban,
  traduireErreur,
} from "@/lib/server/banking/enable-banking";
import type { BankingConfig } from "@/lib/server/banking/config";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

const config: BankingConfig = {
  appId: "app-id",
  privateKey,
  redirectUrl: "https://nas.exemple.ts.net/api/banking/callback",
};

const fetchSimule = vi.fn();

function repondre(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
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

function decoder(partie: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(partie, "base64url").toString("utf8")) as Record<string, unknown>;
}

describe("signJwt", () => {
  it("produit un JWT RS256 vérifiable avec la clé publique", () => {
    const jeton = signJwt(config, new Date("2026-10-01T18:00:00Z"));
    const [entete, charge, signature] = jeton.split(".");

    expect(decoder(entete)).toEqual({ typ: "JWT", alg: "RS256", kid: "app-id" });
    expect(decoder(charge)).toEqual({
      iss: "enablebanking.com",
      aud: "api.enablebanking.com",
      iat: 1790877600,
      exp: 1790877600 + 3600,
    });

    const verificateur = createVerify("RSA-SHA256");
    verificateur.update(`${entete}.${charge}`);
    expect(verificateur.verify(publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });
});

describe("startAuthorization", () => {
  it("demande une autorisation personnelle et rend l'URL de la banque", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { url: "https://tilisy.enablebanking.com/ais/start?sessionid=x" }));

    const resultat = await startAuthorization(config, "lcl", "etat", new Date("2027-03-30T00:00:00Z"));

    expect(resultat).toEqual({ ok: true, value: "https://tilisy.enablebanking.com/ais/start?sessionid=x" });
    const [url, options] = fetchSimule.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.enablebanking.com/auth");
    expect(JSON.parse(String(options.body))).toEqual({
      access: { valid_until: "2027-03-30T00:00:00.000Z" },
      aspsp: { name: "LCL", country: "FR" },
      state: "etat",
      redirect_url: config.redirectUrl,
      psu_type: "personal",
    });
  });

  it("refuse une URL de banque qui n'est pas en HTTPS", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { url: "http://ailleurs.exemple" }));
    expect(await startAuthorization(config, "lcl", "e", new Date())).toEqual({
      ok: false,
      error: "unavailable",
    });
  });
});

describe("createSession", () => {
  it("rend la session et les comptes, en ignorant un compte mal formé", async () => {
    fetchSimule.mockResolvedValue(
      repondre(200, {
        session_id: "s1",
        accounts: [
          { uid: "u1", account_id: { iban: "FR7600000000000000000000000" }, currency: "EUR" },
          { pas: "un compte" },
        ],
      }),
    );

    expect(await createSession(config, "code")).toEqual({
      ok: true,
      value: {
        sessionId: "s1",
        accounts: [{ uid: "u1", iban: "FR7600000000000000000000000", currency: "EUR" }],
      },
    });
  });

  it("refuse une réponse sans identifiant de session", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { accounts: [] }));
    expect(await createSession(config, "code")).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("fetchTransactions", () => {
  it("réunit toutes les pages et transmet les en-têtes de présence", async () => {
    fetchSimule
      .mockResolvedValueOnce(repondre(200, { transactions: [{ n: 1 }], continuation_key: "p2" }))
      .mockResolvedValueOnce(repondre(200, { transactions: [{ n: 2 }], continuation_key: null }));

    const resultat = await fetchTransactions(config, "u1", "2026-09-24", {
      ipAddress: "100.64.0.2",
      userAgent: "Navigateur",
    });

    expect(resultat).toEqual({ ok: true, value: [{ n: 1 }, { n: 2 }] });
    const [premiere, options] = fetchSimule.mock.calls[0] as [string, RequestInit];
    expect(premiere).toContain("/accounts/u1/transactions?date_from=2026-09-24&transaction_status=BOOK");
    expect(options.headers).toMatchObject({
      "Psu-Ip-Address": "100.64.0.2",
      "Psu-User-Agent": "Navigateur",
    });
    expect(String(fetchSimule.mock.calls[1][0])).toContain("continuation_key=p2");
  });

  it("n'envoie pas d'en-tête de présence inconnu", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { transactions: [] }));
    await fetchTransactions(config, "u1", "2026-09-24", { ipAddress: null, userAgent: null });

    const options = fetchSimule.mock.calls[0][1] as RequestInit;
    expect(options.headers).not.toHaveProperty("Psu-Ip-Address");
  });

  it("refuse une réponse mal formée", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { transactions: "non" }));
    expect(await fetchTransactions(config, "u1", "2026-09-24", { ipAddress: null, userAgent: null }))
      .toEqual({ ok: false, error: "unavailable" });
  });

  it("traduit un réseau coupé en indisponibilité", async () => {
    fetchSimule.mockRejectedValue(new TypeError("fetch failed"));
    expect(await fetchTransactions(config, "u1", "2026-09-24", { ipAddress: null, userAgent: null }))
      .toEqual({ ok: false, error: "unavailable" });
  });
});

describe("getAspspMaxValidity", () => {
  it("rend la durée maximale annoncée par la banque", async () => {
    fetchSimule.mockResolvedValue(
      repondre(200, { aspsps: [{ name: "LCL", maximum_consent_validity: 15552000 }] }),
    );
    expect(await getAspspMaxValidity(config, "lcl")).toEqual({ ok: true, value: 15552000 });
  });

  it("refuse une banque absente de la liste", async () => {
    fetchSimule.mockResolvedValue(repondre(200, { aspsps: [] }));
    expect(await getAspspMaxValidity(config, "revolut")).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("traduireErreur", () => {
  it.each([
    [429, {}, "rateLimited"],
    [400, { code: "ASPSP_RATE_LIMIT_EXCEEDED" }, "rateLimited"],
    [401, { error: "EXPIRED_SESSION" }, "expired"],
    [400, { code: "SESSION_EXPIRED" }, "expired"],
    [403, { code: "SESSION_REVOKED" }, "revoked"],
    [401, {}, "revoked"],
    [500, {}, "unavailable"],
    [502, "non JSON", "unavailable"],
  ] as const)("statut %i, corps %j → %s", (statut, corps, attendu) => {
    expect(traduireErreur(statut, corps)).toBe(attendu);
  });
});

describe("identité d'un compte", () => {
  it("donne la même empreinte à deux écritures d'un même IBAN", () => {
    expect(empreinteIban("fr76 1234 5678 9012")).toBe(empreinteIban("FR7612345678 9012"));
    expect(empreinteIban("FR761234")).not.toBe(empreinteIban("FR761235"));
  });

  it("ne garde que les quatre derniers caractères pour l'affichage", () => {
    expect(suffixeIban("FR76 1234 5678 9012")).toBe("9012");
  });
});
