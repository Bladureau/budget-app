// @vitest-environment node

/**
 * Garde-fou d'architecture : **rien de `src/lib/server/` ne doit rejoindre le graphe client.**
 *
 * Ces modules touchent `node:fs` et lisent le secret d'accès. Les importer depuis un composant
 * client ferait au mieux échouer la construction, au pire embarquer le jeton dans le paquet
 * envoyé au navigateur.
 *
 * Le répertoire rend la règle visible en revue ; ce test la rend vérifiable. Une revue peut
 * laisser passer un import ajouté six mois plus tard, pas celui-ci.
 */

import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const RACINE = path.resolve(__dirname, "..", "..");

async function fichiersSource(repertoire: string): Promise<string[]> {
  const entrees = await readdir(repertoire, { withFileTypes: true });
  const fichiers: string[] = [];

  for (const entree of entrees) {
    const complet = path.join(repertoire, entree.name);
    if (entree.isDirectory()) {
      fichiers.push(...(await fichiersSource(complet)));
    } else if (/\.tsx?$/.test(entree.name) && !/\.test\.tsx?$/.test(entree.name)) {
      fichiers.push(complet);
    }
  }

  return fichiers;
}

/** Chemins importés via l'alias `@/`, résolus en chemins de fichiers. */
function importsDe(contenu: string): string[] {
  const chemins: string[] = [];
  const motif = /from\s+["']@\/([^"']+)["']/g;
  let trouve: RegExpExecArray | null;

  while ((trouve = motif.exec(contenu)) !== null) chemins.push(trouve[1]);

  return chemins;
}

async function resoudre(specificateur: string, tous: string[]): Promise<string | null> {
  const base = path.join(RACINE, specificateur);
  for (const candidat of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (tous.includes(candidat)) return candidat;
  }
  return null;
}

describe("isolation du code serveur", () => {
  it("aucun fichier du graphe client n'importe src/lib/server/", async () => {
    const tous = await fichiersSource(RACINE);

    // Point de départ : tout fichier portant la directive de frontière cliente.
    const contenus = new Map<string, string>();
    for (const fichier of tous) contenus.set(fichier, await readFile(fichier, "utf8"));

    const aVisiter = tous.filter((f) => {
      const contenu = contenus.get(f) ?? "";
      return /^\s*["']use client["']/m.test(contenu);
    });

    expect(aVisiter.length).toBeGreaterThan(0); // sinon le test ne prouverait rien

    const visites = new Set<string>();
    const fautifs: string[] = [];

    while (aVisiter.length > 0) {
      const fichier = aVisiter.pop() as string;
      if (visites.has(fichier)) continue;
      visites.add(fichier);

      const contenu = contenus.get(fichier) ?? "";
      for (const specificateur of importsDe(contenu)) {
        if (specificateur.startsWith("lib/server/")) {
          fautifs.push(`${path.relative(RACINE, fichier)} → @/${specificateur}`);
          continue;
        }
        const resolu = await resoudre(specificateur, tous);
        if (resolu !== null) aVisiter.push(resolu);
      }
    }

    expect(fautifs).toEqual([]);
  });

  it("le graphe client atteint bien plusieurs modules, sinon le test ne prouve rien", async () => {
    // Garde-fou du garde-fou : si la traversée cessait de fonctionner, le test précédent
    // passerait pour de mauvaises raisons.
    const tous = await fichiersSource(RACINE);
    const provider = tous.find((f) => f.endsWith(path.join("budget", "budget-provider.tsx")));
    expect(provider).toBeDefined();

    const contenu = await readFile(provider as string, "utf8");
    expect(importsDe(contenu).length).toBeGreaterThan(5);
  });

  it("aucun module n'écrit le jeton d'accès dans un journal", async () => {
    const tous = await fichiersSource(RACINE);

    for (const fichier of tous) {
      const contenu = await readFile(fichier, "utf8");
      const lignes = contenu.split("\n");

      lignes.forEach((ligne, index) => {
        if (!/console\.(log|warn|error|info|debug)/.test(ligne)) return;
        // Un jeton dans un fichier de journal est un jeton versionné en puissance.
        expect(
          /BUDGET_ACCESS_TOKEN|configuredToken|ACCESS_COOKIE/.test(ligne),
          `${path.relative(RACINE, fichier)}:${index + 1} journalise le jeton`,
        ).toBe(false);
      });
    }
  });
});
