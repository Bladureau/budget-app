/**
 * Outils de calcul offerts à l'IA de l'assistant du budget.
 *
 * Le modèle ne calcule jamais (règle 1 du prompt, EF-003) : quand une question demande un calcul
 * que le contexte ne contient pas, il appelle un outil, et c'est **l'application** qui calcule, au
 * centime, avec les fonctions des écrans. Chaque montant rendu passe par le registre de
 * `verify-amounts.ts` : il est donc « connu » et la réponse qui le recopie n'est pas signalée.
 *
 * **Lecture seule** (EF-006) : un outil ne fait que lire le budget, il n'écrit rien. Le pire
 * résultat d'arguments détournés est un message d'erreur rendu au modèle.
 *
 * Fonctions pures : ni disque, ni réseau, ni horloge.
 */

import { compareIso, monthKeyOf } from "@/lib/date";
import type { IsoDate } from "@/lib/date";
import { computeDailyAllowance, remainingToSpreadCents } from "@/features/budget/expenses";
import type { BudgetDocument } from "@/features/budget/types";
import type { KnownValues } from "@/features/assistant/types";
import { createValueRegistry } from "@/features/assistant/verify-amounts";

/** Nom de l'outil « jours sans dépense ». */
export const OUTIL_JOURS_SANS_DEPENSE = "budget_avec_jours_sans_depense";

/** Définition d'un outil au format de l'API d'Ollama (`tools` de `/api/chat`). */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: string; description: string; items?: { type: string } }>;
      required: string[];
    };
  };
}

/** Un appel d'outil demandé par le modèle, déjà validé dans sa forme (nom chaîne, arguments objet). */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  /** Ce qui est rendu au modèle : du JSON, comme les DONNÉES. */
  content: string;
  /** Montants écrits dans `content`. */
  known: KnownValues;
}

/** Outils offerts pour le mois courant (le seul où « aujourd'hui » a un sens). */
export const ASSISTANT_TOOLS: readonly ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: OUTIL_JOURS_SANS_DEPENSE,
      description:
        "Calcule combien l'utilisateur peut encore dépenser aujourd'hui s'il ne dépense rien " +
        "certains jours à venir, les autres jours gardant leur budget par jour habituel. " +
        "Exemples : « combien ce soir si je ne dépense rien ce week-end », « je ne dépenserai " +
        "rien vendredi et samedi », « rien jusqu'à jeudi ». Donne les jours tels que " +
        "l'utilisateur les cite : l'application trouve les dates.",
      parameters: {
        type: "object",
        properties: {
          jours: {
            type: "array",
            items: { type: "string" },
            description:
              "Jours à venir sans dépense, tels que l'utilisateur les cite : noms de jours " +
              "(« vendredi », « samedi »), « demain », ou dates « JJ/MM ». Exemple : " +
              "[\"vendredi\", \"samedi\", \"dimanche\"].",
          },
          jusquA: {
            type: "string",
            description:
              "Pour « rien jusqu'à jeudi » : le dernier jour sans dépense (nom de jour ou " +
              "« JJ/MM »). Tous les jours de demain à celui-ci compris sont sans dépense.",
          },
        },
        required: [],
      },
    },
  },
];

function erreur(message: string): ToolResult {
  return {
    content: JSON.stringify({ erreur: message }),
    known: { cents: new Set(), percents: new Set() },
  };
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function versUtc(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function plusJours(date: IsoDate, n: number): IsoDate {
  const d = versUtc(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `2026-10-23` → `vendredi 23/10`. */
function nommer(date: IsoDate): string {
  return `${JOURS[versUtc(date).getUTCDay()]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Minuscules, sans accents ni espaces superflus : « Après-demain » → « apres-demain ». */
function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

/**
 * Date désignée par `texte`, à partir de demain : nom de jour (sa prochaine occurrence), « demain »,
 * « après-demain », ou « JJ/MM[/AAAA] ». `null` si le texte n'est pas compris ou désigne un jour
 * passé (aujourd'hui compris : on ne prévoit pas de « ne rien dépenser » le jour même).
 */
function resoudre(texte: string, today: IsoDate): IsoDate | null {
  const t = normaliser(texte).replace(/^(ce |cette |le |la )/, "");
  if (t === "demain") return plusJours(today, 1);
  if (t === "apres-demain" || t === "apres demain") return plusJours(today, 2);

  const indice = JOURS.indexOf(t.replace(/ prochain$/, ""));
  if (indice >= 0) {
    for (let n = 1; n <= 7; n++) {
      const date = plusJours(today, n);
      if (versUtc(date).getUTCDay() === indice) return date;
    }
  }

  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(t);
  if (m) {
    const annee = m[3] ?? today.slice(0, 4);
    const date = `${annee}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    if (plusJours(date, 0) !== date) return null; // 31/02, etc.
    return compareIso(date, today) > 0 ? date : null;
  }
  return null;
}

/**
 * Montant dépensable aujourd'hui si l'utilisateur ne dépense rien certains jours à venir.
 *
 * Les jours où il dépensera encore (aujourd'hui exclu) gardent chacun le budget par jour de
 * l'écran ; tout le reste revient à aujourd'hui, moins ce qui y a déjà été dépensé. Sans jour sans
 * dépense, on retrouve le reste du jour de l'écran, à l'arrondi près. Un jour du mois suivant est
 * sans effet : il est signalé, pas compté.
 */
function joursSansDepense(doc: BudgetDocument, today: IsoDate, args: Record<string, unknown>): ToolResult {
  const { jours, jusquA } = args;
  const textes: string[] = [];
  if (typeof jours === "string") textes.push(...jours.split(/,| et /));
  else if (Array.isArray(jours)) {
    for (const j of jours) {
      if (typeof j !== "string") return erreur("« jours » doit être une liste de jours, par exemple [\"vendredi\", \"samedi\"].");
      textes.push(j);
    }
  } else if (jours !== undefined && jours !== null) {
    return erreur("« jours » doit être une liste de jours, par exemple [\"vendredi\", \"samedi\"].");
  }

  const dates = new Set<IsoDate>();
  const incompris: string[] = [];
  for (const texte of textes) {
    if (texte.trim() === "") continue;
    const date = resoudre(texte, today);
    if (date === null) incompris.push(texte.slice(0, 40));
    else dates.add(date);
  }
  if (jusquA !== undefined && jusquA !== null && jusquA !== "") {
    const fin = typeof jusquA === "string" ? resoudre(jusquA, today) : null;
    if (fin === null) incompris.push(String(jusquA).slice(0, 40));
    else for (let d = plusJours(today, 1); compareIso(d, fin) <= 0; d = plusJours(d, 1)) dates.add(d);
  }

  if (incompris.length > 0) {
    return erreur(
      `Jour(s) non compris ou déjà passé(s) : ${incompris.join(", ")}. ` +
        "Demande à l'utilisateur de préciser les jours à venir sans dépense.",
    );
  }
  if (dates.size === 0) {
    return erreur("Aucun jour donné. Demande à l'utilisateur quels jours à venir il ne dépensera rien.");
  }

  const mois = monthKeyOf(today);
  const triees = [...dates].sort(compareIso);
  const dansLeMois = triees.filter((d) => monthKeyOf(d) === mois);
  const horsMois = triees.filter((d) => monthKeyOf(d) !== mois);

  const jour = computeDailyAllowance(doc, today);
  const joursAvecDepense = jour.daysRemaining - 1 - dansLeMois.length;
  const restant = remainingToSpreadCents(doc, today);
  const pourAujourdhui = Math.max(0, restant - joursAvecDepense * jour.allowanceCents);
  const reste = pourAujourdhui - jour.spentTodayCents;

  const { montant, known } = createValueRegistry();
  const resultat = {
    joursSansDepense: dansLeMois.map(nommer),
    ...(horsMois.length > 0
      ? { joursDuMoisSuivant: horsMois.map(nommer), noteMoisSuivant: "sans effet sur le budget de ce mois" }
      : {}),
    autresJoursAvecDepense: joursAvecDepense,
    parJourLesAutresJours: montant(jour.allowanceCents),
    depenseAujourdhui: montant(jour.spentTodayCents),
    resteAujourdhui: montant(Math.max(0, reste)),
    ...(reste < 0 ? { depassementAujourdhui: montant(-reste) } : {}),
  };
  return { content: JSON.stringify(resultat), known };
}

/** Exécute un appel d'outil du modèle. Un outil inconnu ou des arguments invalides rendent une erreur. */
export function runAssistantTool(
  call: ToolCall,
  doc: BudgetDocument,
  today: IsoDate,
): ToolResult {
  if (call.name === OUTIL_JOURS_SANS_DEPENSE) {
    return joursSansDepense(doc, today, call.arguments);
  }
  return erreur(`Outil inconnu : ${call.name.slice(0, 80)}.`);
}
