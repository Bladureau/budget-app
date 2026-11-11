// @vitest-environment node

/**
 * Tests des outils de calcul de l'assistant. Valeurs attendues calculées à la main à partir du jeu
 * de référence (`fixtures.ts`) : le samedi 24/10/2026, 143 394 c restent à répartir sur 8 jours
 * (24 → 31), soit 17 924 c par jour, et rien n'a été dépensé ce jour-là.
 */

import { describe, expect, it } from "vitest";
import {
  ASSISTANT_TOOLS,
  OUTIL_JOURS_SANS_DEPENSE,
  runAssistantTool,
} from "@/features/assistant/tools";
import { REFERENCE_TODAY, buildReferenceDocument } from "@/features/assistant/fixtures";
import { formatCents } from "@/lib/money";

const eur = formatCents;

function appeler(args: Record<string, unknown>, doc = buildReferenceDocument()) {
  const resultat = runAssistantTool({ name: OUTIL_JOURS_SANS_DEPENSE, arguments: args }, doc, REFERENCE_TODAY);
  return { ...resultat, json: JSON.parse(resultat.content) as Record<string, unknown> };
}

describe("outil « jours sans dépense »", () => {
  it("est déclaré au format d'Ollama", () => {
    const [outil] = ASSISTANT_TOOLS;
    expect(outil.function.name).toBe(OUTIL_JOURS_SANS_DEPENSE);
    expect(Object.keys(outil.function.parameters.properties)).toEqual(["jours", "jusquA"]);
  });

  it("3 jours cités : les 4 autres jours gardent leur budget, aujourd'hui reçoit le reste", () => {
    // 143 394 − 4 × 17 924 = 71 698
    const { json, known } = appeler({ jours: ["lundi", "Mardi", "mercredi"] });
    expect(json).toEqual({
      joursSansDepense: ["lundi 26/10", "mardi 27/10", "mercredi 28/10"],
      autresJoursAvecDepense: 4,
      parJourLesAutresJours: eur(17_924),
      depenseAujourdhui: eur(0),
      resteAujourdhui: eur(71_698),
    });
    expect(known.cents.has(71_698)).toBe(true);
    expect(known.cents.has(17_924)).toBe(true);
  });

  it("« jusquA » couvre tous les jours de demain à ce jour compris", () => {
    const { json } = appeler({ jusquA: "mardi" });
    expect(json.joursSansDepense).toEqual(["dimanche 25/10", "lundi 26/10", "mardi 27/10"]);
    expect(json.resteAujourdhui).toBe(eur(71_698));
  });

  it("comprend « demain », les dates JJ/MM et ignore les doublons", () => {
    const { json } = appeler({ jours: ["demain", "25/10", "dimanche", "26/10/2026"] });
    expect(json.joursSansDepense).toEqual(["dimanche 25/10", "lundi 26/10"]);
  });

  it("accepte une liste écrite en une seule chaîne", () => {
    const { json } = appeler({ jours: "lundi, mardi et mercredi" });
    expect(json.resteAujourdhui).toBe(eur(71_698));
  });

  it("tous les jours restants sans dépense : tout le reste du mois est pour aujourd'hui", () => {
    const { json } = appeler({ jusquA: "31/10" });
    expect(json.autresJoursAvecDepense).toBe(0);
    expect(json.resteAujourdhui).toBe(eur(143_394));
  });

  it("un jour du mois suivant est signalé, sans effet sur ce mois", () => {
    // Aucun jour sans dépense dans le mois : 143 394 − 7 × 17 924 = 17 926, le budget du jour
    // de l'écran plus les 2 centimes de l'arrondi.
    const { json } = appeler({ jours: ["01/11"] });
    expect(json.joursSansDepense).toEqual([]);
    expect(json.joursDuMoisSuivant).toEqual(["dimanche 01/11"]);
    expect(json.resteAujourdhui).toBe(eur(17_926));
  });

  it("déduit ce qui a déjà été dépensé aujourd'hui et signale un dépassement", () => {
    const doc = buildReferenceDocument();
    doc.expenses.push({ ...doc.expenses[0], id: "aujourdhui", date: REFERENCE_TODAY, amountCents: 80_000 });
    // 71 698 − 80 000 = −8 302
    const { json, known } = appeler({ jours: ["lundi", "mardi", "mercredi"] }, doc);
    expect(json.depenseAujourdhui).toBe(eur(80_000));
    expect(json.resteAujourdhui).toBe(eur(0));
    expect(json.depassementAujourdhui).toBe(eur(8_302));
    expect(known.cents.has(8_302)).toBe(true);
  });

  it.each([
    [{ jours: ["blabla"] }, /non compris/],
    [{ jours: ["20/10"] }, /déjà passé/],
    [{ jours: ["24/10"] }, /déjà passé/],
    [{ jours: ["31/02"] }, /non compris/],
    [{ jusquA: 3 }, /non compris/],
    [{ jours: 3 }, /liste de jours/],
    [{ jours: [3] }, /liste de jours/],
    [{}, /Aucun jour/],
  ])("refuse %j : le modèle reçoit une erreur et aucun montant", (args, message) => {
    const { json, known } = appeler(args);
    expect(json.erreur).toMatch(message);
    expect(known.cents.size).toBe(0);
  });

  it("rend une erreur pour un outil inconnu", () => {
    const resultat = runAssistantTool(
      { name: "supprimer_tout", arguments: {} },
      buildReferenceDocument(),
      REFERENCE_TODAY,
    );
    expect(JSON.parse(resultat.content)).toEqual({ erreur: "Outil inconnu : supprimer_tout." });
  });
});
