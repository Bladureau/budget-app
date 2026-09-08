import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SYNC_METADATA_KEY,
  clearSyncMetadata,
  defaultSyncMetadata,
  parseSyncMetadata,
  readSyncMetadata,
  writeSyncMetadata,
} from "@/lib/sync-metadata";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("parseSyncMetadata", () => {
  it("accepte une forme valide", () => {
    expect(parseSyncMetadata({ baseRevision: 42, pendingChanges: false })).toEqual({
      baseRevision: 42,
      pendingChanges: false,
    });
  });

  it("accepte la révision zéro, qui signifie « jamais synchronisé »", () => {
    expect(parseSyncMetadata({ baseRevision: 0, pendingChanges: true })).toEqual({
      baseRevision: 0,
      pendingChanges: true,
    });
  });

  it.each([
    ["une valeur qui n'est pas un objet", 42],
    ["null", null],
    ["un tableau", [{ baseRevision: 1, pendingChanges: false }]],
    ["une révision manquante", { pendingChanges: false }],
    ["un drapeau manquant", { baseRevision: 1 }],
    ["une révision non entière", { baseRevision: 1.5, pendingChanges: false }],
    ["une révision négative", { baseRevision: -1, pendingChanges: false }],
    ["une révision textuelle", { baseRevision: "1", pendingChanges: false }],
    ["un drapeau textuel", { baseRevision: 1, pendingChanges: "false" }],
  ])("refuse %s", (_libelle, brut) => {
    expect(parseSyncMetadata(brut)).toBeNull();
  });

  it("refuse en bloc une forme partiellement valide", () => {
    // Accepter `baseRevision` en ignorant un `pendingChanges` corrompu produirait une
    // combinaison que rien n'a jamais écrite — plus dangereuse que le repli prudent.
    expect(parseSyncMetadata({ baseRevision: 7, pendingChanges: null })).toBeNull();
  });
});

describe("readSyncMetadata", () => {
  it("relit ce qui a été écrit", () => {
    writeSyncMetadata({ baseRevision: 12, pendingChanges: false });
    expect(readSyncMetadata()).toEqual({ baseRevision: 12, pendingChanges: false });
  });

  it("rend le repli quand rien n'est enregistré", () => {
    expect(readSyncMetadata()).toEqual(defaultSyncMetadata());
  });

  it("rend le repli sur un contenu vide", () => {
    localStorage.setItem(SYNC_METADATA_KEY, "   ");
    expect(readSyncMetadata()).toEqual(defaultSyncMetadata());
  });

  it("rend le repli sur un JSON illisible, sans lever", () => {
    localStorage.setItem(SYNC_METADATA_KEY, "{ceci n'est pas du JSON");
    expect(() => readSyncMetadata()).not.toThrow();
    expect(readSyncMetadata()).toEqual(defaultSyncMetadata());
  });

  it("rend le repli sur une forme invalide", () => {
    localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify({ baseRevision: "douze" }));
    expect(readSyncMetadata()).toEqual(defaultSyncMetadata());
  });
});

describe("les replis vont dans le sens prudent", () => {
  // Ces deux tests ne vérifient pas des valeurs, mais l'intention derrière : un repli qui
  // partirait dans l'autre sens ferait perdre des saisies sans le dire.

  it("se croit jamais synchronisé, pour entrer en conflit plutôt qu'écraser", () => {
    expect(defaultSyncMetadata().baseRevision).toBe(0);
  });

  it("se croit porteur de modifications, pour pousser en trop plutôt qu'oublier", () => {
    expect(defaultSyncMetadata().pendingChanges).toBe(true);
  });

  it("applique ces deux replis à un contenu corrompu", () => {
    localStorage.setItem(SYNC_METADATA_KEY, JSON.stringify({ baseRevision: 99 }));
    const relu = readSyncMetadata();
    expect(relu.baseRevision).toBe(0);
    expect(relu.pendingChanges).toBe(true);
  });
});

describe("writeSyncMetadata", () => {
  it("signale l'échec au lieu de laisser croire au succès", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota dépassé");
    });
    expect(writeSyncMetadata({ baseRevision: 1, pendingChanges: false })).toBe(false);
  });

  it("n'écrit que sous sa propre clé, jamais sous celle du budget", () => {
    // Garantie de la décision D5 : les deux contenus échouent indépendamment.
    writeSyncMetadata({ baseRevision: 3, pendingChanges: true });
    expect(localStorage.getItem("budget-app:v1")).toBeNull();
    expect(localStorage.getItem(SYNC_METADATA_KEY)).not.toBeNull();
  });
});

describe("clearSyncMetadata", () => {
  it("efface, et la lecture suivante repart du repli", () => {
    writeSyncMetadata({ baseRevision: 5, pendingChanges: false });
    clearSyncMetadata();
    expect(readSyncMetadata()).toEqual(defaultSyncMetadata());
  });
});
