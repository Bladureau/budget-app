/**
 * Assainissement des textes issus des opérations avant leur envoi à l'assistant.
 *
 * Les libellés bancaires viennent de l'extérieur : le modèle les lirait comme n'importe quel
 * texte, consignes comprises (EF-015, R7). On ne cherche pas à détecter une attaque — une liste
 * noire serait impossible à tenir et trompeuse — on rend le texte inerte : une seule ligne,
 * courte, sans caractère de contrôle. La défense réelle est structurelle (bloc de données
 * délimité, aucun outil d'écriture, contrôle des montants).
 */

/** Longueur maximale d'un libellé transmis, en caractères. */
export const LABEL_MAX_LENGTH = 60;

/** Texte de remplacement d'un libellé absent ou vide. */
export const EMPTY_LABEL = "Sans libellé";

/** Caractères de contrôle (retours à la ligne et tabulations compris) et séparateurs de ligne. */
const CONTROLE = /[\p{Cc}\u2028\u2029]/gu;

/**
 * Libellé sur une seule ligne, de `max` caractères au plus. La coupure se fait par points de
 * code, pour ne jamais séparer une paire de substitution (un émoji) en son milieu.
 */
export function sanitizeLabel(text: string | undefined, max: number = LABEL_MAX_LENGTH): string {
  const net = (text ?? "").replace(CONTROLE, " ").replace(/\s+/g, " ").trim();
  if (net === "") return EMPTY_LABEL;

  const points = Array.from(net);
  if (points.length <= max) return net;

  return points.slice(0, max).join("").trimEnd();
}
