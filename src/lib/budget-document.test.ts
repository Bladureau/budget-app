/**
 * Tests de la version 4 du document (fonctionnalité 006).
 *
 * Voir specs/006-bank-sync/data-model.md (§1.4 et §1.5).
 *
 * Les migrations 1 → 2 → 3 et la validation des entités historiques restent couvertes par
 * `storage.test.ts` et `storage.security.test.ts`. Ce fichier ne couvre que ce que la
 * version 4 ajoute : remboursements, état bancaire, provenance des dépenses.
 */

import { describe, expect, it } from "vitest";

import { parseDocument } from "@/lib/budget-document";
import { DOCUMENT_VERSION, emptyBankingState, emptyDocument } from "@/features/budget/types";
import type { BudgetDocument, InboxItem, LedgerEntry, Refund } from "@/features/budget/types";
import { initialCategoryRules, initialTreatmentRules } from "@/features/banking/initial-rules";

/** Document v3 tel qu'un utilisateur en détient aujourd'hui. */
function documentV3(): Record<string, unknown> {
  return {
    version: 3,
    incomes: [
      { id: "salaire", label: "Salaire", amountCents: 180000, kind: "oneOff", date: "2026-09-01" },
    ],
    subscriptions: [
      {
        id: "spotify",
        label: "Spotify",
        periodicity: "monthly",
        startDate: "2026-01-14",
        endDate: null,
        amounts: [{ amountCents: 707, effectiveFrom: "2026-01-14" }],
        pauses: [],
      },
    ],
    expenses: [
      { id: "d1", amountCents: 1240, date: "2026-09-06", label: "Boulangerie", category: "Courses" },
      { id: "d2", amountCents: 9_000_000_000, date: "2026-09-07", category: null },
    ],
    envelopes: [{ id: "e1", category: "Courses", month: "2026-09", limitCents: 40000 }],
  };
}

const remboursement: Refund = {
  id: "bank:lcl:r1",
  amountCents: 499,
  date: "2026-10-07",
  label: "Twitch",
  category: null,
  source: "lcl",
  bankRef: "lcl:r1",
};

const elementAClasser: InboxItem = {
  ref: "lcl:v1",
  bank: "lcl",
  date: "2026-10-02",
  amountCents: 35000,
  direction: "debit",
  kind: "transferOut",
  label: "VIR SEPA Jean Dupont",
  rawLabel: "VIREMENT · VIR SEPA Jean Dupont · MMS",
  why: "noRule",
};

function documentV4(modifier: (doc: BudgetDocument) => void = () => {}): BudgetDocument {
  const doc: BudgetDocument = {
    ...emptyDocument(),
    expenses: [
      {
        id: "bank:lcl:c1",
        amountCents: 3382,
        date: "2026-10-03",
        label: "PETROLEC SUD",
        category: null,
        source: "lcl",
        bankRef: "lcl:c1",
      },
    ],
    refunds: [remboursement],
    banking: {
      ...emptyBankingState(),
      importFrom: "2026-10-01",
      ledger: [
        { ref: "lcl:c1", outcome: "expense", reason: "structural:card" },
        { ref: "lcl:r1", outcome: "refund", reason: "structural:cardRefund" },
        { ref: "lcl:v1", outcome: "inbox", reason: "structural:unknown" },
        {
          ref: "revolut:p1",
          outcome: "expense",
          reason: "structural:card",
          mergedRefs: ["revolut:a1"],
        },
      ],
      inbox: [elementAClasser],
    },
  };
  modifier(doc);
  return doc;
}

function refuse(brut: unknown): void {
  const resultat = parseDocument(brut);
  expect(resultat.ok).toBe(false);
  if (!resultat.ok) expect(resultat.reason).toBe("invalidData");
}

// --- Migration 3 → 4 ----------------------------------------------------------------------

describe("migration 3 → 4", () => {
  it("reprend tout le contenu v3 au centime près", () => {
    const v3 = documentV3();
    const resultat = parseDocument(structuredClone(v3));

    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.value.version).toBe(DOCUMENT_VERSION);
    expect(resultat.value.incomes).toEqual(v3.incomes);
    expect(resultat.value.subscriptions).toEqual(v3.subscriptions);
    expect(resultat.value.expenses).toEqual(v3.expenses);
    expect(resultat.value.envelopes).toEqual(v3.envelopes);
  });

  it("ajoute des remboursements vides et un état bancaire sans date de début", () => {
    const resultat = parseDocument(documentV3());
    if (!resultat.ok) throw new Error("document refusé");

    expect(resultat.value.refunds).toEqual([]);
    expect(resultat.value.banking.importFrom).toBeNull();
    expect(resultat.value.banking.ledger).toEqual([]);
    expect(resultat.value.banking.inbox).toEqual([]);
  });

  it("écrit les règles initiales", () => {
    const resultat = parseDocument(documentV3());
    if (!resultat.ok) throw new Error("document refusé");

    expect(resultat.value.banking.rules).toEqual(initialTreatmentRules());
    expect(resultat.value.banking.categoryRules).toEqual(initialCategoryRules());
  });

  it("traverse toutes les migrations depuis un document v1", () => {
    const resultat = parseDocument({ version: 1, incomes: [], subscriptions: [] });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value).toEqual(emptyDocument());
  });

  it("produit le même document sur deux appareils qui migrent chacun de leur côté", () => {
    // Identifiants de règles stables : sinon deux migrations du même document divergeraient
    // et leur synchronisation croirait à une différence.
    expect(parseDocument(documentV3())).toEqual(parseDocument(documentV3()));
  });

  it("ne complète jamais un document déjà v4 dont une règle initiale a été supprimée", () => {
    const sansLoyer = documentV4((doc) => {
      doc.banking.rules = doc.banking.rules.filter((regle) => regle.id !== "initial:loyer");
    });

    const resultat = parseDocument(structuredClone(sansLoyer));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.value.banking.rules.map((regle) => regle.id)).not.toContain("initial:loyer");
    }
  });
});

// --- Document v4 valide --------------------------------------------------------------------

describe("document v4", () => {
  it("restitue à l'identique un document complet", () => {
    const doc = documentV4();
    const resultat = parseDocument(structuredClone(doc));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value).toEqual(doc);
  });

  it("accepte une dépense manuelle, sans provenance", () => {
    const doc = documentV4((d) => {
      d.expenses.push({ id: "manuelle", amountCents: 250, date: "2026-10-04", category: null });
    });
    const resultat = parseDocument(structuredClone(doc));
    expect(resultat.ok).toBe(true);
    if (resultat.ok) expect(resultat.value.expenses[1]).not.toHaveProperty("source");
  });

  it("refuse une version postérieure", () => {
    const resultat = parseDocument({ ...documentV4(), version: DOCUMENT_VERSION + 1 });
    expect(resultat).toEqual({ ok: false, reason: "futureVersion" });
  });
});

// --- Invariants (data-model §1.5), un par un -------------------------------------------------

describe("invariants du document v4", () => {
  it("refuse l'absence de l'état bancaire ou des remboursements", () => {
    const sansBanque: Record<string, unknown> = { ...documentV4() };
    delete sansBanque.banking;
    refuse(sansBanque);

    const sansRemboursements: Record<string, unknown> = { ...documentV4() };
    delete sansRemboursements.refunds;
    refuse(sansRemboursements);
  });

  it("refuse une dépense portant une provenance sans référence, ou l'inverse", () => {
    refuse(
      documentV4((d) => {
        delete d.expenses[0].bankRef;
      }),
    );
    refuse(
      documentV4((d) => {
        delete d.expenses[0].source;
      }),
    );
  });

  it("refuse une provenance inconnue", () => {
    const doc = structuredClone(documentV4()) as unknown as {
      expenses: Record<string, unknown>[];
    };
    doc.expenses[0].source = "boursorama";
    refuse(doc);
  });

  it("refuse un remboursement de montant nul, négatif ou non entier", () => {
    for (const montant of [0, -499, 4.99]) {
      refuse(
        documentV4((d) => {
          d.refunds[0].amountCents = montant;
        }),
      );
    }
  });

  it("refuse un remboursement sans référence bancaire", () => {
    const doc = structuredClone(documentV4()) as unknown as { refunds: Record<string, unknown>[] };
    delete doc.refunds[0].bankRef;
    refuse(doc);
  });

  it("refuse une référence inscrite deux fois au registre", () => {
    refuse(
      documentV4((d) => {
        d.banking.ledger.push({ ref: "lcl:c1", outcome: "ignored", reason: "structural:income" });
      }),
    );
  });

  it("refuse un sort inconnu au registre", () => {
    const doc = structuredClone(documentV4()) as unknown as {
      banking: { ledger: Record<string, unknown>[] };
    };
    doc.banking.ledger[0].outcome = "maybe";
    refuse(doc);
  });

  it("refuse un élément « À classer » absent du registre", () => {
    refuse(
      documentV4((d) => {
        d.banking.inbox.push({ ...elementAClasser, ref: "lcl:inconnu" });
      }),
    );
  });

  it("refuse une entrée « À classer » au registre sans élément correspondant", () => {
    refuse(
      documentV4((d) => {
        d.banking.inbox = [];
      }),
    );
  });

  it("refuse un élément « À classer » inscrit sous un autre sort", () => {
    refuse(
      documentV4((d) => {
        const entree: LedgerEntry | undefined = d.banking.ledger.find((e) => e.ref === "lcl:v1");
        if (entree) entree.outcome = "ignored";
      }),
    );
  });

  it("refuse deux entités issues de la même opération bancaire", () => {
    refuse(
      documentV4((d) => {
        d.refunds[0].bankRef = "lcl:c1";
      }),
    );
  });

  it("refuse un identifiant de règle partagé avec une autre entité", () => {
    refuse(
      documentV4((d) => {
        d.banking.categoryRules[0].id = "bank:lcl:c1";
      }),
    );
  });

  it("refuse un motif de règle trop court", () => {
    refuse(
      documentV4((d) => {
        d.banking.rules[0].contains = "a";
      }),
    );
  });

  it("refuse une action de règle inconnue", () => {
    const doc = structuredClone(documentV4()) as unknown as {
      banking: { rules: Record<string, unknown>[] };
    };
    doc.banking.rules[0].action = { type: "delete" };
    refuse(doc);
  });

  it("refuse une date de début d'import invalide", () => {
    refuse(
      documentV4((d) => {
        d.banking.importFrom = "2026-02-30";
      }),
    );
  });
});
