/**
 * Autorisation d'un appareil.
 *
 * Voir specs/005-server-side-storage/contracts/authorization.md.
 *
 * **Ce n'est ni un compte, ni un profil, ni un mot de passe utilisateur** — les trois sont
 * hors périmètre. Il n'existe aucune identité : le jeton autorise un appareil, il n'identifie
 * personne. Le serveur ne sait pas qui écrit, et n'a pas à le savoir : il détient *un* budget.
 *
 * **Ce module ne doit jamais rejoindre le graphe client.** Il lit le secret d'accès.
 */

import { timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";

export const ACCESS_COOKIE_NAME = "budget_access";

/**
 * Un secret plus court n'est pas un secret. Le seuil est vérifié à chaque appel plutôt
 * qu'au démarrage : une variable d'environnement peut être changée sans redéployer, et un
 * contrôle unique au chargement du module donnerait une garantie périmée.
 */
export const MIN_TOKEN_LENGTH = 32;

/**
 * Rend le jeton configuré, ou `null` s'il est inutilisable.
 *
 * **Fermeture par défaut (décision D7).** Absent, vide ou trop court, le jeton est traité
 * comme inexistant et tout accès est refusé. Aucun secret de repli n'est engendré : ce serait
 * exactement l'inverse de ce qu'il faut, une installation qui fonctionne et que rien ne
 * protège. Une erreur de configuration doit rendre l'application inutilisable, jamais
 * publique.
 */
export function configuredToken(): string | null {
  const brut = process.env.BUDGET_ACCESS_TOKEN;
  if (typeof brut !== "string") return null;

  const jeton = brut.trim();
  if (jeton.length < MIN_TOKEN_LENGTH) return null;

  return jeton;
}

/**
 * Compare un candidat au jeton configuré, **à temps constant**.
 *
 * `timingSafeEqual` lève si les deux tampons diffèrent en taille, et cette levée serait
 * elle-même un canal : la longueur est donc comparée d'abord, explicitement.
 *
 * Aucune journalisation, ni du candidat ni du jeton : un secret dans un fichier de journal
 * est un secret versionné en puissance.
 */
export function matchesToken(candidat: string | null | undefined): boolean {
  const attendu = configuredToken();
  if (attendu === null) return false;
  if (typeof candidat !== "string" || candidat.length === 0) return false;

  const a = Buffer.from(candidat, "utf8");
  const b = Buffer.from(attendu, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * Vrai si la requête courante porte un cookie d'accès valide.
 *
 * **Appelée dans chaque gestionnaire de route, jamais déléguée à `proxy.ts`.** La
 * documentation de la version installée est explicite : Proxy « should not be used as a full
 * session management or authorization solution ». Un contrôle placé là serait contournable
 * par tout appel qui ne traverse pas le proxy.
 *
 * « Cookie absent » et « cookie erroné » empruntent le même chemin et rendent la même valeur :
 * les distinguer dirait à un tiers qu'il a trouvé le bon nom de cookie.
 */
export async function isAuthorized(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    return matchesToken(cookieStore.get(ACCESS_COOKIE_NAME)?.value);
  } catch {
    // Hors contexte de requête, ou magasin de cookies indisponible : on refuse.
    return false;
  }
}

/**
 * Vrai si la requête courante a réellement été servie en HTTPS.
 *
 * Sert à décider l'attribut `Secure` du cookie d'accès, et **rien d'autre**.
 *
 * Pourquoi ne pas se fonder sur `NODE_ENV` : un navigateur refuse purement et simplement un
 * cookie `Secure` reçu en HTTP. Un serveur auto-hébergé lancé en production sur
 * `http://nas.local:3000` ne pourrait donc jamais autoriser un appareil — la page
 * redirigerait comme si tout allait bien, et l'application resterait non autorisée sans dire
 * pourquoi. Le protocole réellement servi est la seule information qui réponde à la question.
 *
 * `x-forwarded-proto` est posé par tout terminateur TLS placé devant l'application —
 * `tailscale serve`, nginx, Traefik, le proxy inverse d'un NAS. Son absence signifie que
 * l'application est jointe directement, et `next start` ne sert pas de TLS lui-même : c'est
 * donc du HTTP.
 *
 * **Cet en-tête est falsifiable** par un client qui n'est pas derrière un tel proxy. La
 * conséquence en est bénigne ici : le forcer à `https` rend le cookie inutilisable pour
 * l'appareil qui a menti — une nuisance qu'on ne s'inflige qu'à soi-même — et le forcer à
 * `http` n'expose le cookie que sur un réseau déjà privé, derrière un VPN. Aucune des deux ne
 * donne accès au budget, que seul le jeton ouvre.
 */
export async function requestIsSecure(): Promise<boolean> {
  try {
    const enTetes = await headers();
    const protocole = enTetes.get("x-forwarded-proto");
    if (protocole === null) return false;

    // Une chaîne de proxys concatène les valeurs ; la première est celle vue du client.
    return protocole.split(",")[0].trim().toLowerCase() === "https";
  } catch {
    // Hors contexte de requête : le choix prudent est celui qui reste utilisable.
    return false;
  }
}

/** Réponse de refus. Ni montant, ni révision, ni indice de l'existence d'un budget (EF-021). */
export function unauthorizedResponse(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}
