import { describe, expect, it } from "vitest";
import { buildAssistantContext } from "@/features/assistant/context";
import {
  EXPECTED,
  REFERENCE_MONTH,
  REFERENCE_TODAY,
  SECRET_RAW_LABEL,
  TRAP_LABEL,
  buildReferenceDocument,
} from "@/features/assistant/fixtures";
import { findUnverifiedValues } from "@/features/assistant/verify-amounts";
import { CONTEXT_MAX_CHARS } from "@/features/assistant/types";
import { reserveShortfallMessage } from "@/features/budget/messages";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument, Expense } from "@/features/budget/types";
import { formatCents } from "@/lib/money";

const e = EXPECTED;

function contexte(doc: BudgetDocument = buildReferenceDocument(), month = REFERENCE_MONTH) {
  return buildAssistantContext(doc, month, REFERENCE_TODAY);
}

describe("buildAssistantContext — mêmes montants que l'écran", () => {
  it("reproduit la synthèse du mois, au centime", () => {
    const { synthese } = contexte().data;

    expect(synthese).toMatchObject({
      revenusDuMois: formatCents(e.totalIncome),
      totalAbonnements: formatCents(e.totalCharges),
      revenusNets: formatCents(e.incomeNet),
      disponible: formatCents(e.available),
      depense: formatCents(e.spent),
      rembourse: formatCents(e.refunded),
      resteDuMois: formatCents(e.remaining),
      tauxEngagement: e.commitmentRateText,
    });
    expect(synthese.depassement).toBeUndefined();
  });

  it("reproduit le reste du jour", () => {
    expect(contexte().data.jour).toEqual({
      parJour: formatCents(e.daily.allowance),
      depenseAujourdhui: formatCents(e.daily.spentToday),
      resteAujourdhui: formatCents(e.daily.remainingToday),
      report: formatCents(e.daily.carryOver),
      joursRestants: e.daily.daysRemaining,
    });
  });

  it("reproduit la réserve", () => {
    expect(contexte().data.reserve).toEqual({
      reserveEnDebutDeMois: formatCents(e.reserveOpening),
      partDEpargneDuMois: formatCents(e.reserveShare),
      moisRestants: e.reserveMonthsRemaining,
      epargneEntameeCeMois: formatCents(0),
      reserveEnFinDeMoisPrevue: formatCents(e.reserveClosing),
    });
  });

  it("reproduit chaque enveloppe, sans pourcentage", () => {
    const { enveloppes } = contexte().data;
    const courses = enveloppes.find((l) => l.categorie === "Courses");
    const loisirs = enveloppes.find((l) => l.categorie === "Loisirs");

    expect(courses).toMatchObject({
      plafond: formatCents(e.envelopes.Courses.limit),
      depense: formatCents(e.envelopes.Courses.spent),
      reste: formatCents(e.envelopes.Courses.remaining),
      etat: "Maîtrisée",
    });
    expect(courses?.depassement).toBeUndefined();

    // Jamais un reste négatif : le dépassement a son propre champ, comme sur l'écran.
    expect(loisirs).toMatchObject({
      plafond: formatCents(e.envelopes.Loisirs.limit),
      depense: formatCents(e.envelopes.Loisirs.spent),
      reste: formatCents(0),
      depassement: formatCents(e.envelopes.Loisirs.overspent),
      etat: "En dépassement",
    });

    for (const ligne of enveloppes) expect(JSON.stringify(ligne)).not.toContain("%");
  });

  it("reproduit les dépenses hors enveloppe", () => {
    expect(contexte().data.nonBudgete).toEqual({
      total: formatCents(e.unbudgeted),
      categories: [{ categorie: "Sans catégorie", total: formatCents(e.unbudgeted) }],
    });
  });

  it("reproduit les abonnements du mois", () => {
    const { abonnements } = contexte().data;
    expect(abonnements.map((a) => [a.libelle, a.montant])).toEqual([
      ["Loyer", formatCents(e.subscriptions.Loyer)],
      ["Électricité", formatCents(e.subscriptions.Électricité)],
      ["Streaming", formatCents(e.subscriptions.Streaming)],
    ]);
    expect(abonnements[0].echeance).toBe("05/10/2026");
  });

  it("reproduit les revenus et les prochaines échéances", () => {
    const data = contexte().data;
    expect(data.revenus).toEqual([
      { libelle: "Salaire", montant: formatCents(e.totalIncome), date: "01/10/2026" },
    ]);
    expect(data.prochainesEcheances[0]).toEqual({
      libelle: "Loyer",
      montant: formatCents(e.subscriptions.Loyer),
      date: "05/11/2026",
    });
  });

  it("liste les dépenses du mois, du plus récent au plus ancien, sans les remboursements", () => {
    const { depensesRecentes } = contexte().data;

    expect(depensesRecentes).toHaveLength(6);
    expect(depensesRecentes.map((o) => o.libelle)).not.toContain("REMBOURSEMENT CINEMA");
    const dates = depensesRecentes.map((o) => o.date.split("/").reverse().join("-"));
    expect([...dates].sort().reverse()).toEqual(dates);

    const monoprix = depensesRecentes.find((o) => o.libelle === "MONOPRIX");
    expect(monoprix?.origine).toBe("manuelle");
    const carrefour = depensesRecentes.filter((o) => o.libelle === "CARREFOUR MARKET");
    expect(carrefour.map((o) => o.origine)).toEqual(["banque", "banque"]);
  });

  it("liste les remboursements à part : c'est la liste, et non un champ, qui en dit le sens", () => {
    expect(contexte().data.remboursementsRecents).toEqual([
      {
        date: "20/10/2026",
        libelle: "REMBOURSEMENT CINEMA",
        categorie: "Loisirs",
        montant: formatCents(2500),
        origine: "banque",
      },
    ]);
  });

  it("compte les opérations à classer sans en transmettre le détail", () => {
    expect(contexte().data.aClasser).toBe(2);
  });
});

describe("buildAssistantContext — mois et période", () => {
  it("indique le mois courant et la date du jour", () => {
    const { data } = contexte();
    expect(data.mois).toBe("octobre 2026");
    expect(data.periode).toBe("courant");
    expect(data.aujourdhui).toBe("24/10/2026");
  });

  it("n'inclut pas le bloc « jour » ni la date du jour pour un mois passé", () => {
    const { data } = contexte(buildReferenceDocument(), "2026-09");
    expect(data.periode).toBe("passé");
    expect(data.mois).toBe("septembre 2026");
    expect(data.jour).toBeUndefined();
    expect(data.aujourdhui).toBeUndefined();
    // Pas de réserve avant sa première déclaration.
    expect(data.reserve).toBeUndefined();
    expect(data.depensesRecentes).toEqual([]);
    expect(data.remboursementsRecents).toEqual([]);
  });

  it("marque un mois à venir", () => {
    const { data } = contexte(buildReferenceDocument(), "2026-11");
    expect(data.periode).toBe("à venir");
    expect(data.jour).toBeUndefined();
  });
});

describe("buildAssistantContext — cas limites", () => {
  it("décrit un budget vide sans aucune liste ni inventer de chiffre", () => {
    const { data } = contexte(emptyDocument());

    expect(data.budgetVide).toBe(true);
    expect(data.enveloppes).toEqual([]);
    expect(data.abonnements).toEqual([]);
    expect(data.revenus).toEqual([]);
    expect(data.depensesRecentes).toEqual([]);
    expect(data.remboursementsRecents).toEqual([]);
    expect(data.nonBudgete).toBeUndefined();
    expect(data.reserve).toBeUndefined();
    expect(data.synthese.disponible).toBe(formatCents(0));
    expect(data.synthese.tauxEngagement).toBeUndefined();
  });

  it("ne dit pas « budget vide » dès qu'une donnée existe", () => {
    expect(contexte().data.budgetVide).toBe(false);
  });

  it("présente un dépassement comme un montant, jamais un reste négatif", () => {
    const doc: BudgetDocument = {
      ...emptyDocument(),
      incomes: [
        {
          id: "r",
          label: "Prime",
          amountCents: 10_000,
          kind: "oneOff",
          date: "2026-10-01",
        },
      ],
      expenses: [{ id: "d", amountCents: 15_000, date: "2026-10-02", category: null }],
    };
    const { synthese } = contexte(doc).data;

    expect(synthese.resteDuMois).toBe(formatCents(0));
    expect(synthese.depassement).toBe(formatCents(5_000));
    expect(synthese.etatDuMois).toBe("Dépassement");
  });

  it("présente une réserve épuisée par son découvert, jamais un solde négatif", () => {
    const doc: BudgetDocument = {
      ...emptyDocument(),
      reserve: [{ fromMonth: "2026-08", kind: "open", balanceCents: 1_000, months: 12 }],
      expenses: [{ id: "d", amountCents: 500_000, date: "2026-08-02", category: null }],
    };
    const { reserve } = contexte(doc).data;

    expect(reserve?.reserveEnDebutDeMois).toBe(reserveShortfallMessage(formatCents(499_000)));
    expect(reserve?.reserveEnFinDeMoisPrevue).toBe(reserveShortfallMessage(formatCents(499_000)));
    expect(reserve?.partDEpargneDuMois).toBe(formatCents(0));
    // Aucun montant négatif brut : le signe moins n'apparaît dans aucune valeur.
    expect(JSON.stringify(reserve)).not.toMatch(/[-−]\d/);
  });

  it("formate zéro et un très grand montant sans notation scientifique", () => {
    const doc: BudgetDocument = {
      ...emptyDocument(),
      expenses: [
        { id: "z", amountCents: 1, date: "2026-10-02", category: null },
        { id: "g", amountCents: 9_000_000_000, date: "2026-10-03", category: null },
      ],
    };
    const { data, known } = contexte(doc);

    expect(data.synthese.depense).toBe(formatCents(9_000_000_001));
    expect(data.depensesRecentes[0].montant).toBe(formatCents(9_000_000_000));
    expect(known.cents.has(9_000_000_000)).toBe(true);
    expect(JSON.stringify(data)).not.toMatch(/e\+\d/i);
  });

  it("signale la troncature au-delà de 30 enveloppes", () => {
    const doc = buildReferenceDocument();
    for (let i = 0; i < 40; i += 1) {
      doc.envelopes.push({ id: `e${i}`, category: `Cat ${i}`, month: REFERENCE_MONTH, limitCents: 1000 });
    }
    const { data } = contexte(doc);

    expect(data.enveloppes).toHaveLength(30);
    expect(data.enveloppesTronquees).toBe(true);
  });
});

describe("buildAssistantContext — minimisation et assainissement", () => {
  const json = contexte().json;

  it.each([
    ["rawLabel", "rawLabel"],
    ["libellé brut d'une opération à classer", SECRET_RAW_LABEL],
    ["référence bancaire", "bankRef"],
    ["référence bancaire (valeur)", "lcl:"],
    ["identifiant de dépense", "dep-carrefour-1"],
    ["identifiant d'abonnement", "abo-loyer"],
    ["source de dépense", "\"source\""],
  ])("ne transmet jamais : %s", (_nom, interdit) => {
    expect(json).not.toContain(interdit);
  });

  it("garde le libellé piégé comme une donnée, sur une seule ligne", () => {
    const piege = contexte().data.depensesRecentes.find((o) => o.libelle === TRAP_LABEL);
    expect(piege).toBeDefined();
    expect(piege?.categorie).toBe("Sans catégorie");
  });

  it("assainit les libellés : une ligne, 60 caractères au plus", () => {
    const doc = buildReferenceDocument();
    doc.expenses.push({
      id: "long",
      amountCents: 100,
      date: "2026-10-21",
      category: "Cat\negorie",
      label: `LIGNE UN\nLIGNE DEUX\t${"x".repeat(500)}`,
    });
    const { depensesRecentes } = contexte(doc).data;

    for (const operation of depensesRecentes) {
      expect(Array.from(operation.libelle).length).toBeLessThanOrEqual(60);
      expect(operation.libelle).not.toMatch(/[\n\r\t]/);
      expect(operation.categorie).not.toMatch(/[\n\r\t]/);
    }
  });
});

describe("buildAssistantContext — valeurs connues", () => {
  it("connaît chaque montant et pourcentage écrit dans le contexte", () => {
    const { json, known } = contexte();
    expect(findUnverifiedValues(json, known)).toEqual([]);
  });

  it("fournit les valeurs de la fixture et rien de plus qu'une somme erronée", () => {
    const { known } = contexte();
    expect(known.cents.has(e.available)).toBe(true);
    expect(known.cents.has(e.daily.allowance)).toBe(true);
    expect(known.percents.has(40.6)).toBe(true);
    // Une somme que seul un calcul du modèle produirait n'est pas connue.
    expect(known.cents.has(e.envelopes.Courses.spent + e.envelopes.Loisirs.spent)).toBe(false);
  });

  it("signale la somme qu'un modèle calculerait lui-même", () => {
    const { known } = contexte();
    const somme = formatCents(e.envelopes.Courses.spent + e.envelopes.Loisirs.spent);
    expect(findUnverifiedValues(`Au total ${somme}.`, known)).toEqual([somme]);
  });
});

describe("buildAssistantContext — taille", () => {
  const LONG = "LIBELLE TRES LONG POUR OCCUPER BEAUCOUP DE PLACE DANS LE CONTEXTE ENVOYE";

  /** Un budget volumineux : de quoi dépasser le plafond avec les listes à leur taille de départ. */
  function lourd(operations: number): BudgetDocument {
    const doc = buildReferenceDocument();
    for (let i = 0; i < 40; i += 1) {
      doc.envelopes.push({
        id: `env${i}`,
        category: `${LONG} ${i}`,
        month: REFERENCE_MONTH,
        limitCents: 10_000 + i,
      });
      doc.subscriptions.push({
        id: `sub${i}`,
        label: `${LONG} ${i}`,
        periodicity: "monthly",
        startDate: "2026-01-12",
        endDate: null,
        amounts: [{ amountCents: 1_000 + i, effectiveFrom: "2026-01-12" }],
        pauses: [],
      });
      doc.incomes.push({
        id: `inc${i}`,
        label: `${LONG} ${i}`,
        amountCents: 5_000 + i,
        kind: "oneOff",
        date: "2026-10-04",
      });
    }
    for (let i = 0; i < operations; i += 1) {
      const depense: Expense = {
        id: `d${i}`,
        date: `2026-10-${String((i % 20) + 1).padStart(2, "0")}`,
        amountCents: 10_000 + i,
        category: LONG,
        label: `${LONG} ${i}`,
      };
      doc.expenses.push(depense);
    }
    return doc;
  }

  it("reste sous le plafond avec un budget volumineux, agrégats intacts", () => {
    const petit = contexte();
    const grand = contexte(lourd(3000));

    expect(grand.json.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS);
    // Les opérations sont réduites en premier.
    expect(grand.data.depensesRecentes.length).toBeLessThan(25);
    expect(grand.data.jour).toBeDefined();
    expect(grand.data.reserve).toBeDefined();
    expect(grand.data.synthese.etatDuMois).toBeDefined();
    expect(grand.data.synthese.disponible).toBeDefined();
    expect(grand.data.reserve?.partDEpargneDuMois).toBe(petit.data.reserve?.partDEpargneDuMois);
  });

  it("garde 25 opérations quand le contexte tient", () => {
    const doc = buildReferenceDocument();
    for (let i = 0; i < 100; i += 1) {
      doc.expenses.push({
        id: `d${i}`,
        date: "2026-10-05",
        amountCents: 100 + i,
        category: "Courses",
        label: `Achat ${i}`,
      });
    }
    expect(contexte(doc).data.depensesRecentes).toHaveLength(25);
  });

  it("réduit les listes dans l'ordre prévu : opérations d'abord", () => {
    const { data } = contexte(lourd(200));

    // Tant que les opérations n'ont pas été vidées, les autres listes gardent leur taille initiale.
    if (data.depensesRecentes.length > 0) {
      expect(data.revenus).toHaveLength(10);
      expect(data.abonnements).toHaveLength(25);
    }
  });

  it("ne retient comme connus que les montants encore présents après réduction", () => {
    const { json, known } = contexte(lourd(3000));
    for (const centimes of known.cents) {
      expect(json).toContain(formatCents(centimes));
    }
  });

  it("contrôle l'ensemble du contexte réduit sans montant inconnu", () => {
    const { json, known } = contexte(lourd(3000));
    expect(findUnverifiedValues(json, known)).toEqual([]);
  });
});

describe("buildAssistantContext — correspondances (récit 4)", () => {
  function avecQuestion(question: string, doc: BudgetDocument = buildReferenceDocument()) {
    return buildAssistantContext(doc, REFERENCE_MONTH, REFERENCE_TODAY, question);
  }

  it("liste les opérations d'un commerçant et leur total, égal à celui du journal", () => {
    const { correspondances } = avecQuestion("Qu'ai-je payé chez Carrefour ?").data;

    expect(correspondances).toMatchObject({
      motsCles: ["carrefour"],
      nombre: e.carrefour.count,
      total: formatCents(e.carrefour.total),
      sensDuTotal: "depense",
    });
    expect(correspondances?.depenses.map((o) => o.montant)).toEqual([
      formatCents(7_412),
      formatCents(9_840),
    ]);
    expect(correspondances?.partielle).toBeUndefined();
  });

  it("cherche dans la catégorie comme dans le libellé", () => {
    const { correspondances } = avecQuestion("Combien ai-je dépensé en courses ?").data;

    expect(correspondances?.nombre).toBe(3);
    expect(correspondances?.total).toBe(formatCents(e.envelopes.Courses.spent));
  });

  it("déduit les remboursements du total, comme le journal", () => {
    const { correspondances } = avecQuestion("Mes sorties de loisirs ?").data;

    // Loisirs : 2 850 + 15 570 − 2 500 de remboursement.
    expect(correspondances?.nombre).toBe(3);
    expect(correspondances?.total).toBe(formatCents(15_920));
    // Le remboursement est dans sa propre liste, jamais parmi les dépenses (validation du 24/10, question 3).
    expect(correspondances?.depenses.map((o) => o.libelle)).not.toContain("REMBOURSEMENT CINEMA");
    expect(correspondances?.remboursements.map((o) => o.libelle)).toEqual(["REMBOURSEMENT CINEMA"]);
  });

  it("indique un remboursement net quand les remboursements l'emportent", () => {
    const doc = buildReferenceDocument();
    doc.refunds[0] = { ...doc.refunds[0], amountCents: 50_000 };
    const { correspondances } = avecQuestion("loisirs", doc).data;

    expect(correspondances?.sensDuTotal).toBe("remboursement");
    expect(correspondances?.total).toBe(formatCents(50_000 - 18_420));
  });

  it("n'ajoute aucun bloc quand rien ne correspond ou que la question n'a pas de mot-clé", () => {
    expect(avecQuestion("Qu'ai-je payé chez Zzzzz ?").data.correspondances).toBeUndefined();
    expect(avecQuestion("Quels sont mes abonnements ?").data.correspondances).toBeUndefined();
    expect(avecQuestion("").data.correspondances).toBeUndefined();
    expect(contexte().data.correspondances).toBeUndefined();
  });

  it("ignore les accents et la casse de la question", () => {
    const doc = buildReferenceDocument();
    doc.expenses.push({ id: "cafe", amountCents: 250, date: "2026-10-22", category: null, label: "Café Müller" });

    expect(avecQuestion("CAFE ?", doc).data.correspondances?.nombre).toBe(1);
    expect(avecQuestion("Où est mon café ?", doc).data.correspondances?.nombre).toBe(1);
  });

  it("exclut les opérations des autres mois", () => {
    const doc = buildReferenceDocument();
    doc.expenses.push({
      id: "ancienne",
      amountCents: 100_000,
      date: "2026-09-12",
      category: "Courses",
      label: "CARREFOUR MARKET",
    });

    const { correspondances } = avecQuestion("Carrefour", doc).data;
    expect(correspondances?.nombre).toBe(2);
    expect(correspondances?.total).toBe(formatCents(e.carrefour.total));
  });

  it("liste au plus 20 opérations, signale qu'elle est partielle et donne le total complet", () => {
    const doc = buildReferenceDocument();
    for (let i = 0; i < 30; i += 1) {
      doc.expenses.push({
        id: `lidl${i}`,
        amountCents: 1_000 + i,
        date: "2026-10-05",
        category: "Courses",
        label: `LIDL ${i}`,
      });
    }
    const { correspondances } = avecQuestion("lidl", doc).data;

    expect(correspondances?.nombre).toBe(30);
    expect(correspondances?.depenses).toHaveLength(20);
    expect(correspondances?.partielle).toBe(true);
    const attendu = Array.from({ length: 30 }, (_, i) => 1_000 + i).reduce((a, b) => a + b, 0);
    expect(correspondances?.total).toBe(formatCents(attendu));
  });

  it("garde le libellé piégé d'une correspondance comme une donnée", () => {
    const { correspondances } = avecQuestion("Que contient la dépense IGNORE ?").data;

    const piege = correspondances?.depenses.find((o) => o.libelle === TRAP_LABEL);
    expect(piege).toBeDefined();
    expect(correspondances?.motsCles).toEqual(["contient", "ignore"]);
  });

  it("ne recopie jamais la question dans le contexte, seuls ses mots-clés normalisés y figurent", () => {
    const { json } = avecQuestion("Qu'ai-je payé chez Carrefour ? SECRET-PHRASE-INTERDITE");
    expect(json).not.toContain("Qu'ai-je");
    expect(json).not.toContain("SECRET-PHRASE-INTERDITE");
    expect(json).toContain("carrefour");
  });

  it("enregistre le total et chaque montant listé comme connus", () => {
    const { json, known } = avecQuestion("Carrefour");

    expect(known.cents.has(e.carrefour.total)).toBe(true);
    expect(findUnverifiedValues(json, known)).toEqual([]);
    expect(findUnverifiedValues(`Total : ${formatCents(e.carrefour.total + 1)}`, known)).toHaveLength(1);
  });

  it("réduit les correspondances en dernier quand le contexte dépasse sa taille", () => {
    const doc = buildReferenceDocument();
    const LONG = "LIBELLE TRES LONG POUR OCCUPER BEAUCOUP DE PLACE DANS LE CONTEXTE ENVOYE";
    for (let i = 0; i < 40; i += 1) {
      doc.envelopes.push({ id: `env${i}`, category: `${LONG} ${i}`, month: REFERENCE_MONTH, limitCents: 1_000 });
    }
    for (let i = 0; i < 60; i += 1) {
      doc.expenses.push({
        id: `x${i}`,
        amountCents: 100 + i,
        date: "2026-10-06",
        category: LONG,
        label: `LIDL ${LONG} ${i}`,
      });
    }
    const resultat = avecQuestion("lidl", doc);

    expect(resultat.json.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS);
    expect(resultat.data.correspondances?.nombre).toBe(60);
    expect(findUnverifiedValues(resultat.json, resultat.known)).toEqual([]);
  });
});

describe("buildAssistantContext — déterminisme", () => {
  it("rend le même contexte pour les mêmes données", () => {
    expect(contexte().json).toBe(contexte().json);
  });

  it("ne dépend pas de l'ordre de stockage des dépenses", () => {
    const doc = buildReferenceDocument();
    const inverse = { ...doc, expenses: [...doc.expenses].reverse() };
    expect(contexte(inverse).json).toBe(contexte(doc).json);
  });
});
