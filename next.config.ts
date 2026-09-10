import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Adresses IPv4 de cette machine, hors boucle locale.
 *
 * Sert uniquement à `allowedDevOrigins` : ce sont les adresses auxquelles un second appareil
 * peut joindre le serveur de développement. Les découvrir évite d'inscrire un réseau
 * personnel dans le dépôt, et de le voir périmer au premier changement d'adresse.
 */
function adressesLocales(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((interfaces) => interfaces ?? [])
    .filter((i) => i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
}

const nextConfig: NextConfig = {
  /**
   * Sortie autonome, pour l'image Docker.
   *
   * Produit `.next/standalone` avec un `server.js` minimal et les seules dépendances
   * réellement tracées, ce qui évite d'embarquer `node_modules` en entier. `public` et
   * `.next/static` n'y sont **pas** copiés automatiquement : le Dockerfile s'en charge, faute
   * de quoi l'application se lancerait sans ses styles ni ses images.
   */
  output: "standalone",

  /**
   * **N'embarque jamais le budget dans la sortie de construction.**
   *
   * Constaté, pas supposé : sans cette exclusion, `next build` recopie `data/budget.json` —
   * les données financières réelles de l'utilisateur — dans `.next/standalone/data/`. Le
   * répertoire par défaut du stockage central se trouve à la racine du projet, et le traçage
   * de fichiers l'y ramasse.
   *
   * `.dockerignore` écarte déjà `data/` du contexte de construction, mais une construction
   * lancée hors Docker n'en bénéficierait pas. Une donnée qui n'a rien à faire dans un
   * artefact de build doit être exclue **à la source**, pas seulement sur un chemin.
   *
   * La clé est un motif de route : `/api/budget` est la seule à toucher ce répertoire, mais
   * l'exclusion porte sur toutes les routes, aucune n'ayant de raison de l'embarquer.
   */
  outputFileTracingExcludes: {
    "*": ["./data/**/*"],
  },

  /**
   * Origines autorisées à demander les ressources de développement (`/_next/*`).
   *
   * Next.js les bloque par défaut pour toute origine autre que celle de démarrage —
   * `localhost`. Sans cette liste, un second appareil reçoit bien le HTML rendu par le
   * serveur mais **jamais le JavaScript** : la page reste figée sur « Chargement… », faute
   * d'hydratation.
   *
   * Ne concerne **que `next dev`**. En production (`npm run build && npm start`), cette
   * restriction n'existe pas et ce réglage est ignoré.
   *
   * Les adresses sont **découvertes à l'exécution**, et non écrites en dur. Deux raisons :
   *  - une adresse de réseau personnel n'a rien à faire dans un dépôt, même si elle n'est pas
   *    routable depuis Internet ;
   *  - une adresse figée devient fausse au premier bail DHCP, et le symptôme — la page qui
   *    reste sur « Chargement… » depuis le téléphone — n'oriente pas vers sa cause.
   */
  allowedDevOrigins: adressesLocales(),
};

export default nextConfig;
