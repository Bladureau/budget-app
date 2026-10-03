// Ajoute les assertions DOM (`toBeInTheDocument`, `toHaveAttribute`…) à `expect`.
import "@testing-library/jest-dom/vitest";

// jsdom connaît `<dialog>` et son attribut `open`, mais n'implémente ni `showModal()` ni
// `close()`. Substitut minimal, fidèle à ce dont les composants se servent : ouvrir, fermer,
// et émettre `close` à la fermeture. Le piège à focus et la touche Échap restent ceux du
// navigateur et se vérifient à la main. Sans effet dans les tests en environnement `node`.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
