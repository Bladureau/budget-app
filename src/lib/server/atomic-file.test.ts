// @vitest-environment node

/**
 * Tests des primitives d'écriture sûre, sur un répertoire temporaire réel.
 *
 * Voir specs/006-bank-sync/plan.md (D3). Comme pour `budget-store`, l'atomicité et la
 * quarantaine sont des propriétés du système de fichiers : un double en mémoire ne prouverait
 * rien.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  cheminQuarantaine,
  ecrireJsonAtomiquement,
  enSerie,
  existe,
  mettreEnQuarantaine,
} from "@/lib/server/atomic-file";

let repertoire: string;

beforeEach(async () => {
  repertoire = await mkdtemp(path.join(tmpdir(), "atomic-file-"));
});

afterEach(async () => {
  await rm(repertoire, { recursive: true, force: true });
});

describe("ecrireJsonAtomiquement", () => {
  it("écrit le JSON et ne laisse aucun fichier temporaire", async () => {
    const chemin = path.join(repertoire, "a.json");
    expect(await ecrireJsonAtomiquement(chemin, { montant: 1250 })).toBe(true);

    expect(JSON.parse(await readFile(chemin, "utf8"))).toEqual({ montant: 1250 });
    expect(await readdir(repertoire)).toEqual(["a.json"]);
  });

  it("crée le répertoire s'il n'existe pas", async () => {
    const chemin = path.join(repertoire, "sous", "dossier", "a.json");
    expect(await ecrireJsonAtomiquement(chemin, [])).toBe(true);
    expect(await existe(chemin)).toBe(true);
  });

  it("laisse l'ancien contenu intact si l'écriture échoue", async () => {
    const chemin = path.join(repertoire, "a.json");
    await writeFile(chemin, '{"ancien":true}', "utf8");

    // Un répertoire au nom du fichier temporaire fait échouer l'écriture avant le `rename` :
    // c'est la coupure entre les deux étapes, simulée sans toucher au système.
    await ecrireJsonAtomiquement(path.join(repertoire, "a.json.tmp", "x"), {});
    const echec = await ecrireJsonAtomiquement(chemin, { nouveau: true });

    expect(echec).toBe(false);
    expect(await readFile(chemin, "utf8")).toBe('{"ancien":true}');
  });
});

describe("enSerie", () => {
  it("exécute dans l'ordre les opérations d'une même clé, même concurrentes", async () => {
    const ordre: number[] = [];
    const attendre = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    await Promise.all([
      enSerie("k", async () => {
        await attendre(20);
        ordre.push(1);
      }),
      enSerie("k", async () => {
        ordre.push(2);
      }),
    ]);

    expect(ordre).toEqual([1, 2]);
  });

  it("poursuit la chaîne après un échec", async () => {
    const echec = enSerie("k", async () => {
      throw new Error("échec");
    });
    const suivante = enSerie("k", async () => "ok");

    await expect(echec).rejects.toThrow("échec");
    await expect(suivante).resolves.toBe("ok");
  });

  it("ne fait pas attendre une clé par une autre", async () => {
    let lenteTerminee = false;
    const lente = enSerie("lente", async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      lenteTerminee = true;
    });

    await enSerie("rapide", async () => {
      expect(lenteTerminee).toBe(false);
    });
    await lente;
  });
});

describe("quarantaine", () => {
  it("déplace le fichier sous un nom horodaté sans deux-points", async () => {
    const chemin = path.join(repertoire, "banking.json");
    await writeFile(chemin, "{abîmé", "utf8");

    await mettreEnQuarantaine(chemin);

    const fichiers = await readdir(repertoire);
    expect(fichiers).toHaveLength(1);
    expect(fichiers[0]).toMatch(/^banking\.corrupted-\d{4}-\d{2}-\d{2}T[\d-]+\.\d{3}Z\.json$/);
    expect(await readFile(path.join(repertoire, fichiers[0]), "utf8")).toBe("{abîmé");
  });

  it("construit le nom de quarantaine à partir du nom d'origine", () => {
    const chemin = path.join(repertoire, "budget.json");
    const nom = cheminQuarantaine(chemin, new Date("2026-10-01T18:00:00.000Z"));
    expect(nom).toBe(path.join(repertoire, "budget.corrupted-2026-10-01T18-00-00.000Z.json"));
  });

  it("ne lève pas si le fichier n'existe pas", async () => {
    await expect(mettreEnQuarantaine(path.join(repertoire, "absent.json"))).resolves.toBeUndefined();
  });
});
