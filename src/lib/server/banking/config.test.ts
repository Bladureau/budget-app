// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { bankingConfig } from "@/lib/server/banking/config";

const CLE = "-----BEGIN PRIVATE KEY-----\nMIIfausse\n-----END PRIVATE KEY-----";

let repertoire: string;
let cheminCle: string;

beforeEach(async () => {
  repertoire = await mkdtemp(path.join(tmpdir(), "banking-config-"));
  cheminCle = path.join(repertoire, "enable-banking.pem");
  await writeFile(cheminCle, `${CLE}\n`, "utf8");

  process.env.ENABLE_BANKING_APP_ID = "app-id";
  process.env.ENABLE_BANKING_KEY_PATH = cheminCle;
  process.env.BANKING_REDIRECT_URL = "https://nas.exemple.ts.net:9443/api/banking/callback";
});

afterEach(async () => {
  delete process.env.ENABLE_BANKING_APP_ID;
  delete process.env.ENABLE_BANKING_KEY_PATH;
  delete process.env.BANKING_REDIRECT_URL;
  await rm(repertoire, { recursive: true, force: true });
});

describe("bankingConfig", () => {
  it("rend la configuration complète", () => {
    expect(bankingConfig()).toEqual({
      appId: "app-id",
      privateKey: CLE,
      redirectUrl: "https://nas.exemple.ts.net:9443/api/banking/callback",
    });
  });

  it.each(["ENABLE_BANKING_APP_ID", "ENABLE_BANKING_KEY_PATH", "BANKING_REDIRECT_URL"])(
    "rend null si %s est absente",
    (nom) => {
      delete process.env[nom];
      expect(bankingConfig()).toBeNull();
    },
  );

  it("rend null si une variable ne contient que des espaces", () => {
    process.env.ENABLE_BANKING_APP_ID = "   ";
    expect(bankingConfig()).toBeNull();
  });

  it("rend null si le fichier de clé n'existe pas", () => {
    process.env.ENABLE_BANKING_KEY_PATH = path.join(repertoire, "absente.pem");
    expect(bankingConfig()).toBeNull();
  });

  it("rend null si le chemin de clé désigne un répertoire", async () => {
    const dossier = path.join(repertoire, "dossier.pem");
    await mkdir(dossier);
    process.env.ENABLE_BANKING_KEY_PATH = dossier;
    expect(bankingConfig()).toBeNull();
  });

  it("rend null si la clé est vide ou n'est pas au format PEM", async () => {
    await writeFile(cheminCle, "", "utf8");
    expect(bankingConfig()).toBeNull();

    await writeFile(cheminCle, "pas une clé", "utf8");
    expect(bankingConfig()).toBeNull();
  });

  it("rend null si l'URL de retour n'est pas en HTTPS ou est invalide", () => {
    process.env.BANKING_REDIRECT_URL = "http://nas.exemple/api/banking/callback";
    expect(bankingConfig()).toBeNull();

    process.env.BANKING_REDIRECT_URL = "pas une url";
    expect(bankingConfig()).toBeNull();
  });
});
