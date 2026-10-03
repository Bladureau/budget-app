# Contrat : adresses et menu de navigation

**Fonctionnalité** : `specs/007-navigation-menu` | **Date** : 2026-10-03

Ce contrat fixe ce qui est visible de l'extérieur du code : les adresses que l'application
comprend et produit, la structure accessible du menu et la redirection de retour de banque.

## 1. Adresses

```text
/                                  → onglet « Aujourd'hui »
/?onglet=depenses                  → onglet « Dépenses »
/?onglet=mois                      → onglet « Mois »
/?onglet=reglages                  → onglet « Réglages »
/?onglet=<inconnu>                 → onglet « Aujourd'hui », sans message (FR-016)
/?onglet=<valeur>#<ancre>          → l'onglet, puis l'élément <ancre> amené à l'écran
/?onglet=reglages&banking=<issue>  → onglet « Réglages » + message de retour de banque
```

- Le paramètre s'appelle `onglet`, ses valeurs sont en minuscules, sans accent.
- Un changement d'onglet **ajoute** une entrée d'historique (FR-015) : retour revient à l'onglet
  précédent.
- Le chemin reste `/` : aucune nouvelle route n'est créée, aucune requête serveur n'est émise par
  un changement d'onglet.
- Le sélecteur de mois ne touche pas à l'adresse (comportement actuel inchangé) : changer de mois
  garde l'onglet.

## 2. Structure accessible du menu

```html
<nav aria-label="Sections du budget">
  <ul>
    <li><a href="/" aria-current="page">[svg aria-hidden] Aujourd'hui</a></li>
    <li><a href="/?onglet=depenses">[svg aria-hidden] Dépenses</a></li>
    <li><a href="/?onglet=mois">[svg aria-hidden] Mois</a></li>
    <li><a href="/?onglet=reglages">[svg aria-hidden] Réglages</a></li>
  </ul>
</nav>
```

- Un seul `<nav>` portant ce nom dans la page, à côté de la « Navigation entre les mois »
  existante.
- `aria-current="page"` sur l'entrée active, et sur elle seule.
- Chaque panneau est une `<section>` nommée « Onglet <libellé> » (`aria-label`), et porte
  l'attribut `hidden` lorsqu'il est inactif. Le préfixe évite une homonymie : la section du reste
  du jour s'appelle déjà « Aujourd'hui ».
- Clic simple : changement d'onglet sans rechargement. Clic avec Ctrl, Cmd, Maj ou clic du
  milieu : comportement natif du navigateur.

## 3. Disposition

| Largeur | Position du menu | Marge basse du contenu |
| --- | --- | --- |
| < 640 px | Fixé en bas, pleine largeur, au-dessus de `env(safe-area-inset-bottom)` | Hauteur du menu + `env(safe-area-inset-bottom)` |
| ≥ 640 px | Dans le flux, sous l'en-tête | Marge actuelle |

Le menu doit tenir **cinq** entrées sans défilement horizontal à 360 px (FR-010).

## 4. Retour de banque (modifie 006)

Modification du [contrat de l'API bancaire](../../006-bank-sync/contracts/api-banking.md) §4 :

| | Avant | Après |
| --- | --- | --- |
| `Location` de la réponse `303` | `/?banking=<issue>` | `/?onglet=reglages&banking=<issue>` |

Les valeurs de `<issue>` (`connected`, `error`, `noAccount`, `invalidState`) et la nature
relative de l'en-tête sont inchangées.
