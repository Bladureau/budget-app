/**
 * Format d'échange : sérialisation de l'export et analyse d'un fichier importé.
 *
 * Voir specs/004-data-export-import/contracts/fichier-export.md pour le format, et
 * contracts/transfert.md pour le contrat de ce module.
 *
 * Module PUR : ne touche ni au DOM, ni à `localStorage`, ni à l'horloge — la date d'export
 * est fournie en paramètre. C'est ce qui le rend testable sans simulation.
 *
 * RÈGLE STRUCTURANTE (décision D2) : la validation du contenu est **entièrement déléguée** à
 * `parseDocument()` de `@/lib/storage`. Aucune règle du document n'est réimplémentée ici. Un
 * second analyseur divergerait du premier au premier changement de modèle, et cette
 * divergence produirait un import acceptant des données que le stockage refuserait ensuite.
 */

import { parseDocument } from "@/lib/storage";
import type { BudgetDocument } from "@/features/budget/types";

/** Marqueur d'identification. Distingue un fichier étranger d'un export abîmé. */
export const APPLICATION_MARKER = "budget-app";

/** Version du format d’échange. Suit celle du document : les deux avancent ensemble. */
export const FORMAT_VERSION = 3;

export type ImportRefusal = "notAnExport" | "futureVersion" | "corrupted";

export type ImportResult =
  | { ok: true; document: BudgetDocument; exportedAt: string | null }
  | { ok: false; reason: ImportRefusal };

function estObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

function deuxChiffres(valeur: number): string {
  return String(valeur).padStart(2, "0");
}

/**
 * Sérialise le document dans le format d'échange.
 *
 * Le document est **revalidé et normalisé** par `parseDocument()` avant sérialisation : on
 * n'exporte jamais un document que l'on refuserait de relire. C'est aussi cette normalisation
 * qui rend l'aller-retour stable octet pour octet, `parseDocument` reconstruisant les objets
 * dans un ordre de clés fixe.
 */
export function serializeExport(doc: BudgetDocument, exportedAt: Date): string {
  const controle = parseDocument(doc);
  const data = controle.ok ? controle.value : doc;

  return JSON.stringify(
    {
      application: APPLICATION_MARKER,
      formatVersion: FORMAT_VERSION,
      exportedAt: exportedAt.toISOString(),
      data,
    },
    null,
    2,
  );
}

/** `budget-AAAA-MM-JJ-HHmm.json`, en heure locale, triable chronologiquement. */
export function buildExportFilename(exportedAt: Date): string {
  const annee = exportedAt.getFullYear();
  const mois = deuxChiffres(exportedAt.getMonth() + 1);
  const jour = deuxChiffres(exportedAt.getDate());
  const heures = deuxChiffres(exportedAt.getHours());
  const minutes = deuxChiffres(exportedAt.getMinutes());
  return `budget-${annee}-${mois}-${jour}-${heures}${minutes}.json`;
}

/**
 * Analyse le contenu d'un fichier importé.
 *
 * Applique les cinq règles de validation dans l'ordre, chacune arrêtant le traitement. Ne
 * renvoie jamais un document partiel : soit le fichier entier est accepté, soit rien ne l'est.
 */
export function parseImport(raw: string): ImportResult {
  // 1. Analysable en JSON.
  let enveloppe: unknown;
  try {
    enveloppe = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "notAnExport" };
  }

  // 2. Racine objet portant le marqueur d'application.
  if (!estObjet(enveloppe)) return { ok: false, reason: "notAnExport" };
  if (enveloppe.application !== APPLICATION_MARKER) {
    return { ok: false, reason: "notAnExport" };
  }

  // 3. Version de format connue. Au-delà, le fichier vient d'une version plus récente de
  //    l'application : l'ouvrir plus avant reviendrait à interpréter ce qu'on ne comprend pas.
  const version = enveloppe.formatVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: "futureVersion" };
  }
  if (version > FORMAT_VERSION) return { ok: false, reason: "futureVersion" };

  // 4. Contenu validé par l'analyseur du document — jamais réimplémenté ici.
  const contenu = parseDocument(enveloppe.data);
  if (!contenu.ok) {
    return {
      ok: false,
      reason: contenu.reason === "futureVersion" ? "futureVersion" : "corrupted",
    };
  }

  // 5. L'horodatage est un confort d'affichage, pas une donnée budgétaire : absent ou
  //    illisible, il ne fait pas refuser des données financières intactes.
  const horodatage =
    typeof enveloppe.exportedAt === "string" && enveloppe.exportedAt !== ""
      ? enveloppe.exportedAt
      : null;

  return { ok: true, document: contenu.value, exportedAt: horodatage };
}
