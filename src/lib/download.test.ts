import { afterEach, describe, expect, it, vi } from "vitest";
import { triggerDownload } from "@/lib/download";

/**
 * jsdom n'implémente ni `URL.createObjectURL` ni `URL.revokeObjectURL` : on les simule pour
 * vérifier le contrat, notamment la révocation. C'est précisément parce que ces API ne sont
 * pas testables directement qu'elles sont isolées dans ce module, laissant `transfer.ts` pur.
 */
function simulerUrlObjet() {
  const creees: string[] = [];
  const revoquees: string[] = [];

  const creer = vi.fn(() => {
    const url = `blob:test/${creees.length}`;
    creees.push(url);
    return url;
  });
  const revoquer = vi.fn((url: string) => {
    revoquees.push(url);
  });

  Object.defineProperty(URL, "createObjectURL", { value: creer, configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revoquer, configurable: true });

  return { creees, revoquees, creer, revoquer };
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(URL, "createObjectURL");
  Reflect.deleteProperty(URL, "revokeObjectURL");
});

describe("triggerDownload", () => {
  it("déclenche le téléchargement et renvoie true", () => {
    simulerUrlObjet();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    expect(triggerDownload("contenu", "budget-2026-09-06-1112.json")).toBe(true);
    expect(clic).toHaveBeenCalledTimes(1);
  });

  it("révoque l’URL d’objet après usage", () => {
    const { creees, revoquees } = simulerUrlObjet();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerDownload("contenu", "fichier.json");

    // Sans révocation, chaque export retiendrait son contenu en mémoire jusqu’au
    // rechargement de la page.
    expect(revoquees).toEqual(creees);
    expect(revoquees).toHaveLength(1);
  });

  it("ne laisse aucune ancre dans le document", () => {
    simulerUrlObjet();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    triggerDownload("contenu", "fichier.json");

    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });

  it("porte le nom de fichier demandé", () => {
    simulerUrlObjet();
    let nom: string | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      nom = this.getAttribute("download");
    });

    triggerDownload("contenu", "budget-2026-01-05-0703.json");

    expect(nom).toBe("budget-2026-01-05-0703.json");
  });

  it("renvoie false au lieu de lever quand l’environnement ne le permet pas (EF-007)", () => {
    // Aucune simulation : `URL.createObjectURL` est absente sous jsdom.
    expect(() => triggerDownload("contenu", "fichier.json")).not.toThrow();
    expect(triggerDownload("contenu", "fichier.json")).toBe(false);
  });

  it("renvoie false si le clic lui-même échoue", () => {
    simulerUrlObjet();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("téléchargement bloqué");
    });

    expect(triggerDownload("contenu", "fichier.json")).toBe(false);
  });
});
