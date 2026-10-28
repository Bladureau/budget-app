/**
 * Mots-clés d'une question, pour retrouver les opérations qu'elle évoque (récit 4).
 *
 * Voir specs/009-local-ai-assistant/research.md (R4). La recherche est faite par l'application, pas
 * par le modèle : elle est déterministe, testable sans IA, et le total des opérations trouvées est
 * calculé en centimes (EF-003). Même normalisation que le journal (`normalizeForSearch`) : « café »
 * est trouvé en tapant « cafe ».
 *
 * Ni bibliothèque de langue, ni racinisation : une liste de mots vides suffit à écarter le bruit
 * d'une question en français, et un mot trop courant au pire ajoute une opération de trop.
 */

import { normalizeForSearch } from "@/features/budget/expenses";

/** Nombre maximal de mots retenus : au-delà, la question est une phrase, pas une recherche. */
export const KEYWORDS_MAX = 5;

/** Longueur minimale d'un mot retenu. */
const MOT_MIN = 3;

/**
 * Mots vides, déjà normalisés (sans accents, en minuscules). Y figurent les mots de liaison, les
 * interrogatifs et les noms qui désignent la structure du budget plutôt qu'une opération : les
 * retenir ferait correspondre presque tout.
 *
 * Les catégories courantes (« courses », « loisirs »…) n'y sont volontairement pas : une question
 * sur les courses doit retrouver les opérations de cette catégorie.
 */
const MOTS_VIDES: ReadonlySet<string> = new Set([
  // articles, prépositions, pronoms
  "les", "des", "une", "aux", "que", "qui", "quoi", "dont", "dans", "pour", "par", "sur", "sous",
  "avec", "sans", "chez", "entre", "vers", "depuis", "avant", "apres", "pendant", "contre",
  "mes", "mon", "ton", "tes", "ses", "son", "nos", "notre", "vos", "votre", "leur", "leurs",
  "ces", "cet", "cette", "ceci", "cela", "moi", "toi", "lui", "elle", "nous", "vous", "ils",
  "elles", "est", "sont", "etre", "ete", "suis", "avez", "avons", "ont", "avoir", "eu", "ai",
  // interrogatifs et verbes de la demande
  "quel", "quels", "quelle", "quelles", "combien", "quand", "comment", "pourquoi", "ou", "puis",
  "peux", "peut", "peuvent", "dis", "dire", "donne", "donner", "montre", "montrer", "liste",
  "lister", "afficher", "affiche", "voir", "faire", "fait", "faut", "veux", "voudrais", "pris",
  "prise", "achete", "achetes", "achetee", "regle", "regles", "reglee",
  // quantité, temps, degré
  "tout", "tous", "toute", "toutes", "plus", "moins", "tres", "bien", "aussi", "encore", "deja",
  "ici", "cela", "mois", "semaine", "semaines", "jour", "jours", "aujourd", "hui", "hier",
  "demain", "dernier", "derniers", "derniere", "dernieres", "recent", "recents", "recente",
  "recentes", "courant", "total", "totale", "montant", "somme", "argent", "euro", "euros",
  // vocabulaire du budget
  "depense", "depenses", "depensee", "depensees", "paye", "payes", "payee", "payer", "achat",
  "achats", "operation", "operations", "transaction", "transactions", "ligne", "lignes",
  "budget", "reste", "restant", "revenu", "revenus", "abonnement", "abonnements", "enveloppe",
  "enveloppes", "reserve", "epargne", "plafond", "categorie", "categories",
]);

/**
 * Mots significatifs d'une question : normalisés, d'au moins trois caractères, hors mots vides,
 * sans doublon, dans l'ordre d'apparition, au plus `KEYWORDS_MAX`.
 */
export function extractKeywords(question: string): string[] {
  const mots = normalizeForSearch(question).split(/[^\p{L}\p{N}]+/u);

  const retenus: string[] = [];
  for (const mot of mots) {
    if (mot.length < MOT_MIN || MOTS_VIDES.has(mot) || retenus.includes(mot)) continue;
    retenus.push(mot);
    if (retenus.length === KEYWORDS_MAX) break;
  }
  return retenus;
}
