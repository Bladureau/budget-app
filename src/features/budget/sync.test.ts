import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchRemote, pushLocal } from "@/features/budget/sync";
import { emptyDocument } from "@/features/budget/types";
import type { BudgetDocument } from "@/features/budget/types";

function documentAvecDepense(amountCents: number): BudgetDocument {
  return {
    ...emptyDocument(),
    expenses: [{ id: "depense-1", amountCents, date: "2026-09-07", category: "Courses" }],
  };
}

/** Fabrique une réponse `fetch` sans passer par un vrai serveur. */
function reponse(statut: number, corps: unknown): Response {
  return new Response(typeof corps === "string" ? corps : JSON.stringify(corps), {
    status: statut,
    headers: { "Content-Type": "application/json" },
  });
}

const fetchSimule = vi.fn();

beforeEach(() => {
  fetchSimule.mockReset();
  vi.stubGlobal("fetch", fetchSimule);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- fetchRemote ----------------------------------------------------------------------------

describe("fetchRemote", () => {
  it("rend le document et la révision sur 200", async () => {
    fetchSimule.mockResolvedValue(
      reponse(200, { revision: 7, updatedAt: "2026-09-07T10:00:00.000Z", document: documentAvecDepense(1250) }),
    );

    const resultat = await fetchRemote();
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.revision).toBe(7);
    expect(resultat.document.expenses[0].amountCents).toBe(1250);
  });

  it("accepte la révision 0 avec un document vide — un budget neuf n'est pas une erreur", async () => {
    fetchSimule.mockResolvedValue(
      reponse(200, { revision: 0, updatedAt: null, document: emptyDocument() }),
    );

    const resultat = await fetchRemote();
    expect(resultat).toMatchObject({ ok: true, revision: 0 });
  });

  it("rend `offline` quand fetch lève", async () => {
    fetchSimule.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await fetchRemote()).toEqual({ ok: false, reason: "offline" });
  });

  it("rend `unauthorized` sur 401", async () => {
    fetchSimule.mockResolvedValue(reponse(401, { error: "unauthorized" }));
    expect(await fetchRemote()).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("rend `serverError` sur 500, en conservant le motif du serveur", async () => {
    fetchSimule.mockResolvedValue(reponse(500, { error: "storageUnreadable" }));
    // Le motif est transporté : « contenu mis de côté » et « disque plein » appellent des
    // gestes différents, les confondre cacherait lequel s'applique.
    expect(await fetchRemote()).toEqual({
      ok: false,
      reason: "serverError",
      serverCode: "storageUnreadable",
    });
  });

  it("rend `serverError` sans motif quand le serveur n'en donne pas", async () => {
    fetchSimule.mockResolvedValue(reponse(500, { error: "quelque chose d'inconnu" }));
    expect(await fetchRemote()).toEqual({
      ok: false,
      reason: "serverError",
      serverCode: undefined,
    });
  });

  it("rend `serverError` sur un code inattendu", async () => {
    fetchSimule.mockResolvedValue(reponse(418, {}));
    expect(await fetchRemote()).toEqual({ ok: false, reason: "serverError" });
  });

  describe("un 200 n'est pas une preuve : la réponse est une frontière de confiance", () => {
    // Un intermédiaire réseau, un portail captif ou une version dépareillée du serveur
    // peuvent rendre 200 avec n'importe quoi. Le principe IV impose de partir d'`unknown`.

    it.each([
      ["un corps qui n'est pas du JSON", "<html>portail captif</html>"],
      ["un corps qui n'est pas un objet", 42],
      ["une révision manquante", { updatedAt: null, document: emptyDocument() }],
      ["une révision non entière", { revision: 1.5, updatedAt: null, document: emptyDocument() }],
      ["une révision négative", { revision: -1, updatedAt: null, document: emptyDocument() }],
      ["un document manquant", { revision: 1, updatedAt: null }],
      ["un document invalide", { revision: 1, updatedAt: null, document: { version: 3 } }],
      [
        "un montant décimal dans le document",
        {
          revision: 1,
          updatedAt: null,
          document: { ...emptyDocument(), expenses: [{ id: "d", amountCents: 12.5, date: "2026-09-07", category: null }] },
        },
      ],
    ])("rend `invalidResponse` sur %s", async (_libelle, corps) => {
      fetchSimule.mockResolvedValue(reponse(200, corps));
      expect(await fetchRemote()).toEqual({ ok: false, reason: "invalidResponse" });
    });
  });

  it("ne touche jamais localStorage", async () => {
    const ecrire = vi.spyOn(Storage.prototype, "setItem");
    const supprimer = vi.spyOn(Storage.prototype, "removeItem");
    fetchSimule.mockResolvedValue(
      reponse(200, { revision: 1, updatedAt: null, document: emptyDocument() }),
    );

    await fetchRemote();

    // Décider quoi écrire revient au fournisseur : c'est ce qui rend ce module testable
    // sans simuler le stockage.
    expect(ecrire).not.toHaveBeenCalled();
    expect(supprimer).not.toHaveBeenCalled();
  });
});

// --- pushLocal ------------------------------------------------------------------------------

describe("pushLocal", () => {
  it("rend la nouvelle révision sur 200", async () => {
    fetchSimule.mockResolvedValue(reponse(200, { revision: 8, updatedAt: "2026-09-07T10:00:00.000Z" }));

    const resultat = await pushLocal(emptyDocument(), 7);
    expect(resultat).toMatchObject({ ok: true, revision: 8 });
  });

  it("envoie la révision de base et le document entier", async () => {
    fetchSimule.mockResolvedValue(reponse(200, { revision: 1, updatedAt: "2026-09-07T10:00:00.000Z" }));

    await pushLocal(documentAvecDepense(1250), 0);

    const [, options] = fetchSimule.mock.calls[0];
    expect(options.method).toBe("PUT");
    const envoye = JSON.parse(options.body);
    expect(envoye.baseRevision).toBe(0);
    // Le document est poussé en entier : il n'existe pas d'écriture par entité (D1).
    expect(envoye.document.expenses[0].amountCents).toBe(1250);
  });

  it("transporte les montants en entiers, sans notation décimale", async () => {
    fetchSimule.mockResolvedValue(reponse(200, { revision: 1, updatedAt: "2026-09-07T10:00:00.000Z" }));

    await pushLocal(documentAvecDepense(9_000_000_000), 0);

    const [, options] = fetchSimule.mock.calls[0];
    expect(options.body).toContain("9000000000");
    expect(options.body).not.toContain("9000000000.0");
  });

  it("rend `offline` quand fetch lève", async () => {
    fetchSimule.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await pushLocal(emptyDocument(), 0)).toEqual({ ok: false, reason: "offline" });
  });

  it("rend `unauthorized` sur 401", async () => {
    fetchSimule.mockResolvedValue(reponse(401, { error: "unauthorized" }));
    expect(await pushLocal(emptyDocument(), 0)).toEqual({ ok: false, reason: "unauthorized" });
  });

  it("rend `rejected` sur 400", async () => {
    fetchSimule.mockResolvedValue(reponse(400, { error: "invalidDocument" }));
    expect(await pushLocal(emptyDocument(), 0)).toEqual({ ok: false, reason: "rejected" });
  });

  it("rend `conflict` avec l'état courant sur 409", async () => {
    fetchSimule.mockResolvedValue(
      reponse(409, {
        error: "revisionMismatch",
        revision: 5,
        updatedAt: "2026-09-07T10:00:00.000Z",
        document: documentAvecDepense(4200),
      }),
    );

    const resultat = await pushLocal(emptyDocument(), 3);
    expect(resultat.ok).toBe(false);
    if (resultat.ok || resultat.reason !== "conflict") throw new Error("conflit attendu");
    expect(resultat.revision).toBe(5);
    // L'état courant vient du corps du 409 : pas de seconde requête pour afficher le choix.
    expect(resultat.document.expenses[0].amountCents).toBe(4200);
  });

  it("rend `serverError` si le corps d'un 409 est inexploitable", async () => {
    fetchSimule.mockResolvedValue(reponse(409, { error: "revisionMismatch" }));
    expect(await pushLocal(emptyDocument(), 0)).toEqual({ ok: false, reason: "serverError" });
  });

  it("rend `serverError` si le corps d'un 200 est inexploitable", async () => {
    // L'écriture a peut-être abouti, mais la révision est inconnue. `serverError` laisse le
    // drapeau « en attente » levé, et la poussée suivante — idempotente — rattrapera.
    fetchSimule.mockResolvedValue(reponse(200, { revision: "huit" }));
    expect(await pushLocal(emptyDocument(), 0)).toEqual({ ok: false, reason: "serverError" });
  });

  it("rend `serverError` sur 500, en conservant le motif du serveur", async () => {
    fetchSimule.mockResolvedValue(reponse(500, { error: "writeFailed" }));
    expect(await pushLocal(emptyDocument(), 0)).toEqual({
      ok: false,
      reason: "serverError",
      serverCode: "writeFailed",
    });
  });

  it("ne touche jamais localStorage", async () => {
    const ecrire = vi.spyOn(Storage.prototype, "setItem");
    fetchSimule.mockResolvedValue(reponse(200, { revision: 1, updatedAt: "2026-09-07T10:00:00.000Z" }));

    await pushLocal(emptyDocument(), 0);

    expect(ecrire).not.toHaveBeenCalled();
  });
});
