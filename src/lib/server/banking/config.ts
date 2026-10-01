/**
 * Configuration de l'accès à Enable Banking.
 *
 * Voir specs/006-bank-sync/research.md (R6).
 *
 * **Ce module ne doit jamais rejoindre le graphe client.** Il lit la clé privée.
 *
 * **Fermeture par défaut**, comme l'accès au budget (D7 de 005) : identifiant, clé ou URL de
 * retour absents ou inutilisables, la configuration vaut `null` et la synchronisation bancaire
 * est désactivée. Le reste du budget fonctionne normalement. Aucune valeur de repli n'est
 * inventée : une configuration incomplète doit se voir, pas fonctionner à moitié.
 *
 * La configuration est relue **à chaque appel**, comme le jeton d'accès : une variable ou un
 * fichier peuvent changer sans redémarrage, et une lecture unique au chargement donnerait une
 * garantie périmée. La clé fait 3 Ko : la relire ne coûte rien.
 *
 * Aucune journalisation, ni de la clé ni de son chemin.
 */

import { readFileSync } from "node:fs";

export interface BankingConfig {
  appId: string;
  privateKey: string;
  redirectUrl: string;
}

const DEBUT_CLE = "-----BEGIN";

function variable(nom: string): string | null {
  const brut = process.env[nom];
  if (typeof brut !== "string") return null;
  const valeur = brut.trim();
  return valeur === "" ? null : valeur;
}

function urlDeRetourValide(valeur: string): boolean {
  try {
    // HTTPS obligatoire : la banque y renvoie un code d'autorisation, qui ne doit jamais
    // circuler en clair.
    return new URL(valeur).protocol === "https:";
  } catch {
    return false;
  }
}

function lireCle(chemin: string): string | null {
  try {
    const contenu = readFileSync(chemin, "utf8").trim();
    return contenu.startsWith(DEBUT_CLE) ? contenu : null;
  } catch {
    // Fichier absent, illisible faute de droits, ou chemin désignant un répertoire — ce que
    // Docker crée quand on monte un fichier qui n'existe pas sur l'hôte.
    return null;
  }
}

export function bankingConfig(): BankingConfig | null {
  const appId = variable("ENABLE_BANKING_APP_ID");
  const cheminCle = variable("ENABLE_BANKING_KEY_PATH");
  const redirectUrl = variable("BANKING_REDIRECT_URL");
  if (!appId || !cheminCle || !redirectUrl) return null;
  if (!urlDeRetourValide(redirectUrl)) return null;

  const privateKey = lireCle(cheminCle);
  if (!privateKey) return null;

  return { appId, privateKey, redirectUrl };
}
