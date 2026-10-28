/**
 * Contrôle des montants d'une réponse de l'assistant (EF-003, EF-024).
 *
 * Voir specs/009-local-ai-assistant/research.md (R6). Le modèle ne doit citer que des valeurs que
 * l'application lui a fournies. Le registre enregistre chaque valeur au moment où elle est écrite
 * dans le contexte ; à la fin de la réponse, tout montant ou pourcentage cité qui n'y figure pas
 * est signalé. Cela attrape aussi bien un chiffre inventé qu'une somme calculée par le modèle.
 *
 * Limite assumée : on ne vérifie pas que le **bon** montant est cité avec le **bon** libellé. Une
 * valeur réelle mais mal attribuée passe — c'est le rôle du jeu de questions vérifié à la main.
 */

import { formatRateFr } from "@/lib/format";
import { MAX_CENTS, formatCents } from "@/lib/money";
import type { Cents } from "@/lib/money";
import type { KnownValues } from "@/features/assistant/types";

export interface ValueRegistry {
  /** Montant formaté pour le contexte ; sa valeur absolue est retenue comme « connue ». */
  montant: (cents: Cents) => string;
  /** Taux (`0.604`) formaté comme à l'écran, `60,4 %` ; sa valeur est retenue comme « connue ». */
  pourcentage: (ratio: number) => string;
  known: KnownValues;
}

export function createValueRegistry(): ValueRegistry {
  const cents = new Set<number>();
  const percents = new Set<number>();

  return {
    montant(valeur) {
      cents.add(Math.abs(valeur));
      return formatCents(valeur);
    },
    pourcentage(ratio) {
      const texte = formatRateFr(ratio);
      percents.add(Number(texte.replace(",", ".").replace(/[^\d.-]/g, "")));
      return texte;
    },
    known: { cents, percents },
  };
}

// --- Extraction ---------------------------------------------------------------------------------

/** Séparateurs de milliers acceptés : espace, insécable, fine insécable, point. */
const SEPARATEURS_MILLIERS = /[\s\u00a0\u202f.]/g;

/** Un nombre à la française, suivi de son unité : `€`, `euro(s)`, `EUR` ou `%`. */
const MONTANT_OU_POURCENTAGE =
  /([-\u2212\u2013])?(\d{1,3}(?:[\s\u00a0\u202f.]\d{3})+(?:,\d+)?|\d+(?:,\d+)?|,\d+)[\s\u00a0\u202f]*(€|euros?\b|eur\b|%)/giu;

/** Forme affichable d'un pourcentage non vérifié : `61,5 %`. */
function formaterPourcentage(valeur: number): string {
  return `${String(valeur).replace(".", ",")} %`;
}

/** Centimes d'une écriture `12 345,6`, ou `null` si elle n'est pas un montant exact. */
function versCentimes(nombre: string): Cents | null {
  const [entier = "", decimales = ""] = nombre.split(",");
  const chiffres = entier.replace(SEPARATEURS_MILLIERS, "");
  if (decimales.length > 2 || chiffres.length > 12) return null;

  const centimes = Number(chiffres === "" ? "0" : chiffres) * 100 + Number(decimales.padEnd(2, "0"));
  return centimes > MAX_CENTS ? null : centimes;
}

/** Un pourcentage cité est vérifié s'il égale un connu, à une décimale, ou à son arrondi entier. */
function pourcentageConnu(valeur: number, connus: ReadonlySet<number>): boolean {
  for (const connu of connus) {
    if (Math.abs(connu - valeur) < 0.05) return true;
    if (Number.isInteger(valeur) && Math.round(connu) === valeur) return true;
  }
  return false;
}

/**
 * Montants et pourcentages de `text` absents des valeurs connues, déjà formatés, sans doublon et
 * dans l'ordre d'apparition. Une écriture qui n'est pas un montant exact (plus de deux décimales,
 * démesurée) est signalée telle qu'écrite : mieux vaut un avertissement de trop qu'un chiffre
 * douteux présenté comme fiable.
 */
export function findUnverifiedValues(text: string, known: KnownValues): string[] {
  const absents: string[] = [];
  const signaler = (forme: string) => {
    if (!absents.includes(forme)) absents.push(forme);
  };

  for (const correspondance of text.matchAll(MONTANT_OU_POURCENTAGE)) {
    const [ecrit, signe, nombre, unite] = correspondance;

    if (unite === "%") {
      const valeur = Number(nombre.replace(SEPARATEURS_MILLIERS, "").replace(",", "."));
      if (!Number.isFinite(valeur) || !pourcentageConnu(valeur, known.percents)) {
        signaler(Number.isFinite(valeur) ? formaterPourcentage(valeur) : ecrit.trim());
      }
      continue;
    }

    const centimes = versCentimes(nombre);
    if (centimes === null) {
      signaler(ecrit.trim());
    } else if (!known.cents.has(centimes)) {
      signaler(formatCents(signe === undefined ? centimes : -centimes));
    }
  }

  return absents;
}
