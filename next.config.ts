import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
   * Adresses de la machine de développement : réseau local et Tailscale. À adapter si le
   * réseau change — une adresse absente d'ici produira exactement le même symptôme.
   */
  allowedDevOrigins: ["10.173.170.242", "100.67.134.77", "192.168.56.1"],
};

export default nextConfig;
