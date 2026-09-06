/**
 * Déclenchement d'un téléchargement de fichier.
 *
 * Ce module isole l'unique API navigateur non testable directement de la fonctionnalité
 * d'export. En la cantonnant ici, `@/features/budget/transfer` reste une fonction pure de
 * données vers chaîne, testable sans aucune simulation.
 *
 * Aucune requête réseau n'est émise : le fichier est construit en mémoire et remis au
 * navigateur. C'est ce qui rend la promesse du principe I vérifiable dans l'onglet réseau.
 */

/**
 * Propose un contenu au téléchargement sous le nom donné.
 *
 * Renvoie `false` plutôt que de lever si l'environnement ne le permet pas — navigation
 * restreinte, téléchargement bloqué, API absente. Un échec d'export doit être signalé à
 * l'utilisateur (EF-007), jamais passé sous silence.
 */
export function triggerDownload(
  contents: string,
  filename: string,
  mimeType = "application/json",
): boolean {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }

  let url: string | null = null;
  let ancre: HTMLAnchorElement | null = null;

  try {
    const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
    url = URL.createObjectURL(blob);

    ancre = document.createElement("a");
    ancre.href = url;
    ancre.download = filename;
    ancre.style.display = "none";
    document.body.appendChild(ancre);
    ancre.click();

    return true;
  } catch {
    return false;
  } finally {
    // Nettoyage systématique : sans révocation, chaque export retiendrait son contenu en
    // mémoire jusqu'au rechargement de la page.
    if (ancre?.parentNode) ancre.parentNode.removeChild(ancre);
    if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
  }
}
