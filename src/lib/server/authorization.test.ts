// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookieStore = { get: vi.fn() };
const headerStore = { get: vi.fn((): string | null => null) };
vi.mock("next/headers", () => ({
  cookies: async () => cookieStore,
  headers: async () => headerStore,
}));

import {
  ACCESS_COOKIE_NAME,
  MIN_TOKEN_LENGTH,
  configuredToken,
  isAuthorized,
  requestIsSecure,
  matchesToken,
  unauthorizedResponse,
} from "@/lib/server/authorization";

/** Jeton de test : 64 caractères, au-delà du seuil. */
const JETON = "a".repeat(64);

beforeEach(() => {
  cookieStore.get.mockReset();
  headerStore.get.mockReset();
  headerStore.get.mockReturnValue(null);
  process.env.BUDGET_ACCESS_TOKEN = JETON;
});

afterEach(() => {
  delete process.env.BUDGET_ACCESS_TOKEN;
});

describe("configuredToken", () => {
  it("rend le jeton configuré", () => {
    expect(configuredToken()).toBe(JETON);
  });

  it("ignore les espaces de bordure", () => {
    process.env.BUDGET_ACCESS_TOKEN = `  ${JETON}  `;
    expect(configuredToken()).toBe(JETON);
  });

  it.each([
    ["absent", undefined],
    ["vide", ""],
    ["fait d'espaces", "     "],
    ["trop court", "a".repeat(MIN_TOKEN_LENGTH - 1)],
  ])("rend null quand le jeton est %s", (_libelle, valeur) => {
    if (valeur === undefined) delete process.env.BUDGET_ACCESS_TOKEN;
    else process.env.BUDGET_ACCESS_TOKEN = valeur;

    expect(configuredToken()).toBeNull();
  });

  it("accepte exactement la longueur minimale", () => {
    process.env.BUDGET_ACCESS_TOKEN = "b".repeat(MIN_TOKEN_LENGTH);
    expect(configuredToken()).not.toBeNull();
  });
});

describe("matchesToken", () => {
  it("accepte le jeton exact", () => {
    expect(matchesToken(JETON)).toBe(true);
  });

  it.each([
    ["un jeton erroné de même longueur", "b".repeat(64)],
    ["un jeton tronqué", JETON.slice(0, 63)],
    ["un jeton rallongé", `${JETON}a`],
    ["une chaîne vide", ""],
    ["null", null],
    ["undefined", undefined],
  ])("refuse %s", (_libelle, candidat) => {
    expect(matchesToken(candidat)).toBe(false);
  });

  it("refuse tout, y compris le bon jeton, quand rien n'est configuré", () => {
    // Fermeture par défaut : une erreur de configuration ne doit jamais ouvrir l'accès.
    delete process.env.BUDGET_ACCESS_TOKEN;
    expect(matchesToken(JETON)).toBe(false);
    expect(matchesToken("")).toBe(false);
  });

  it("refuse quand le jeton configuré est trop court, même si le candidat lui est égal", () => {
    const court = "a".repeat(MIN_TOKEN_LENGTH - 1);
    process.env.BUDGET_ACCESS_TOKEN = court;
    expect(matchesToken(court)).toBe(false);
  });

  it("ne lève jamais sur des longueurs différentes", () => {
    // `timingSafeEqual` lève si les tampons diffèrent en taille ; la longueur doit donc
    // être comparée avant, et cette levée ne doit jamais remonter.
    expect(() => matchesToken("court")).not.toThrow();
  });
});

describe("isAuthorized", () => {
  it("accepte un cookie portant le jeton", async () => {
    cookieStore.get.mockReturnValue({ value: JETON });
    expect(await isAuthorized()).toBe(true);
    expect(cookieStore.get).toHaveBeenCalledWith(ACCESS_COOKIE_NAME);
  });

  it("refuse un cookie erroné", async () => {
    cookieStore.get.mockReturnValue({ value: "b".repeat(64) });
    expect(await isAuthorized()).toBe(false);
  });

  it("refuse un cookie absent", async () => {
    cookieStore.get.mockReturnValue(undefined);
    expect(await isAuthorized()).toBe(false);
  });

  it("rend le même refus pour un cookie absent et pour un cookie erroné", async () => {
    // Les distinguer dirait à un tiers qu'il a trouvé le bon nom de cookie.
    cookieStore.get.mockReturnValue(undefined);
    const absent = await isAuthorized();
    cookieStore.get.mockReturnValue({ value: "mauvais" });
    const errone = await isAuthorized();

    expect(absent).toBe(errone);
    expect(absent).toBe(false);
  });

  it("refuse quand la lecture des cookies lève", async () => {
    cookieStore.get.mockImplementation(() => {
      throw new Error("hors contexte de requête");
    });
    expect(await isAuthorized()).toBe(false);
  });
});

describe("unauthorizedResponse", () => {
  it("rend un 401 ne divulguant rien d'autre que le motif", async () => {
    const reponse = unauthorizedResponse();
    expect(reponse.status).toBe(401);

    const corps: unknown = await reponse.json();
    // Exactement une clé : ni montant, ni révision, ni horodatage, ni indice de
    // l'existence d'un budget (EF-021).
    expect(corps).toEqual({ error: "unauthorized" });
    expect(Object.keys(corps as object)).toHaveLength(1);
  });
});

describe("requestIsSecure", () => {
  it("rend vrai derrière un terminateur TLS", async () => {
    headerStore.get.mockReturnValue("https");
    expect(await requestIsSecure()).toBe(true);
  });

  it("rend faux en HTTP simple", async () => {
    headerStore.get.mockReturnValue("http");
    expect(await requestIsSecure()).toBe(false);
  });

  it("rend faux quand aucun proxy ne renseigne l'en-tête", async () => {
    // `next start` ne sert pas de TLS lui-même : l'absence d'en-tête signifie HTTP. C'est
    // le cas d'un NAS joint directement, celui que le réglage précédent cassait.
    headerStore.get.mockReturnValue(null);
    expect(await requestIsSecure()).toBe(false);
  });

  it("retient la première valeur d'une chaîne de proxys", async () => {
    headerStore.get.mockReturnValue("https, http");
    expect(await requestIsSecure()).toBe(true);
  });

  it("tolère la casse et les espaces", async () => {
    headerStore.get.mockReturnValue("  HTTPS  ");
    expect(await requestIsSecure()).toBe(true);
  });

  it("ne dépend pas de NODE_ENV", async () => {
    // C'est tout l'objet du correctif : `NODE_ENV=production` en HTTP posait un cookie
    // `Secure` que le navigateur jetait, rendant l'autorisation impossible sans message.
    vi.stubEnv("NODE_ENV", "production");
    try {
      headerStore.get.mockReturnValue(null);
      expect(await requestIsSecure()).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rend faux plutôt que de lever hors contexte de requête", async () => {
    headerStore.get.mockImplementation(() => {
      throw new Error("hors contexte de requête");
    });
    expect(await requestIsSecure()).toBe(false);
  });

  it("interroge bien x-forwarded-proto", async () => {
    headerStore.get.mockReturnValue("https");
    await requestIsSecure();
    expect(headerStore.get).toHaveBeenCalledWith("x-forwarded-proto");
  });
});
