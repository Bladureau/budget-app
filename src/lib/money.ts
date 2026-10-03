/**
 * Manipulation des montants monétaires.
 *
 * Principe II de la constitution : un montant est TOUJOURS un entier de centimes. Aucune
 * valeur monétaire décimale n’existe hors de la frontière d’affichage, et `parseFloat` est
 * proscrit sur un montant. Ce module est le seul point d’entrée et de sortie autorisé.
 */

/** Montant en centimes. Entier signé ; le signe négatif n’apparaît que sur des dérivés. */
export type Cents = number;

export type AmountError =
  | "empty"
  | "notANumber"
  | "tooManyDecimals"
  | "notPositive"
  | "tooLarge";

export type ParseAmountResult =
  | { ok: true; cents: Cents }
  | { ok: false; reason: AmountError };

/**
 * Motifs de refus d’un **plafond** d’enveloppe (fonctionnalité 001).
 *
 * Distincts de ceux d’un montant : zéro est un plafond valide — il signifie « ne rien
 * dépenser ici » — alors qu’il n’est jamais un montant valide. Le refus porte donc sur la
 * négativité, pas sur la non-positivité, et le message affiché peut le dire exactement.
 */
export type LimitError =
  | "empty"
  | "notANumber"
  | "tooManyDecimals"
  | "negative"
  | "tooLarge";

export type ParseLimitResult =
  | { ok: true; cents: Cents }
  | { ok: false; reason: LimitError };

/**
 * Plafond de saisie : 90 000 000,00 €. Très au-delà de tout usage réaliste, et deux ordres
 * de grandeur sous `Number.MAX_SAFE_INTEGER` exprimé en centimes, ce qui garantit que les
 * totalisations restent exactes même sur des milliers d’éléments.
 */
export const MAX_CENTS = 9_000_000_000;

/** Espaces acceptés comme séparateurs de milliers, insécables compris. */
const ESPACES = /[\s  ]/g;

const FORMAT_MONTANT = /^(\d+)(?:[.,](\d{1,}))?$/;

const formateurEuro = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

/**
 * Analyse une saisie utilisateur et la convertit en centimes.
 *
 * Accepte indifféremment la virgule et le point comme séparateur décimal (EF-028) et tolère
 * les espaces de milliers. Ne renvoie jamais `NaN` : l’échec porte un motif exploitable pour
 * composer le message affiché à côté du champ (EF-004).
 *
 * Le noyau `analyserMontant` fait tout le travail sauf une chose : la règle du montant
 * strictement positif, qui appartient au montant et non au plafond.
 */
function analyserMontant(raw: string): ParseLimitResult {
  const nettoye = raw.replace(ESPACES, "");
  if (nettoye === "") return { ok: false, reason: "empty" };

  const correspondance = FORMAT_MONTANT.exec(nettoye);
  if (!correspondance) {
    // Un signe moins est syntaxiquement rejeté ici, mais l’utilisateur a besoin de savoir
    // que c’est la négativité qui pose problème, pas la forme.
    if (/^-/.test(nettoye)) return { ok: false, reason: "negative" };
    return { ok: false, reason: "notANumber" };
  }

  const [, partieEntiere, partieDecimale = ""] = correspondance;
  if (partieDecimale.length > 2) return { ok: false, reason: "tooManyDecimals" };

  const centimes =
    Number(partieEntiere) * 100 + Number(partieDecimale.padEnd(2, "0"));

  if (centimes > MAX_CENTS) return { ok: false, reason: "tooLarge" };

  return { ok: true, cents: centimes };
}

export function parseAmountInput(raw: string): ParseAmountResult {
  const noyau = analyserMontant(raw);
  if (!noyau.ok) {
    // Pour un montant, négatif et nul relèvent du même refus : « supérieur à zéro ».
    return { ok: false, reason: noyau.reason === "negative" ? "notPositive" : noyau.reason };
  }
  if (noyau.cents <= 0) return { ok: false, reason: "notPositive" };
  return noyau;
}

/**
 * Analyse un **plafond** d’enveloppe : même grammaire qu’un montant, mais zéro accepté.
 *
 * Partage le noyau d’analyse avec `parseAmountInput` plutôt que de redéfinir la grammaire :
 * deux expressions régulières concurrentes finiraient par diverger, et une saisie serait
 * alors acceptée ici et refusée ailleurs.
 */
export function parseLimitInput(raw: string): ParseLimitResult {
  return analyserMontant(raw);
}

/**
 * Formate un montant pour l’affichage. Seul point d’appel autorisé à `Intl.NumberFormat`
 * dans l’application.
 */
export function formatCents(cents: Cents): string {
  return formateurEuro.format(cents / 100);
}

/**
 * Rend un montant sous la forme éditable attendue dans un champ de saisie (`"12,40"`).
 *
 * Distinct de `formatCents` : on ne veut ni symbole monétaire ni séparateur de milliers dans
 * un champ que l’utilisateur va modifier. Reste dans ce module pour que toute conversion
 * d’un montant vers une chaîne y soit centralisée (principe II).
 */
export function centsToInputValue(cents: Cents): string {
  const signe = cents < 0 ? "-" : "";
  const absolu = Math.abs(cents);
  const entiers = Math.trunc(absolu / 100);
  const decimales = String(absolu % 100).padStart(2, "0");
  return `${signe}${entiers},${decimales}`;
}

/** Additionne des montants. Addition entière : aucune dérive d’arrondi possible. */
export function sumCents(values: readonly Cents[]): Cents {
  let total = 0;
  for (const valeur of values) total += valeur;
  return total;
}
