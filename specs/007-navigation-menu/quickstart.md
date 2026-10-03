# Guide de validation : Menu de navigation par onglets

**Fonctionnalité** : `specs/007-navigation-menu` | **Date** : 2026-10-03

## Prérequis

- Branche `feat-007-navigation-menu`, dépendances installées (`npm install`).
- Un budget contenant au moins une dépense, un revenu, un abonnement et une enveloppe. Pour le
  récit 3 : au moins une opération « À classer » et, si possible, une banque proche de
  l'expiration (sinon, les tests automatisés couvrent ce cas).

## Contrôles automatiques

```powershell
npm run lint
npm run build
npm test
```

Les trois doivent passer sans erreur. `npm run build` vérifie en particulier que la page reste
prérendue sans erreur de frontière `Suspense` (recherche R2).

### Référence

Relevée le 2026-10-03 sur la branche vierge (T001) : **844 tests au vert** (34 fichiers), lint
sans erreur, build réussi avec `/` prérendue (`○ Static`).

## Vérifications manuelles

Lancer `npm run dev`, puis ouvrir l'application dans le navigateur et ses outils de
développement (mode appareil mobile).

### Récit 1 — Les quatre onglets

1. Ouvrir `/` : seul « Aujourd'hui » s'affiche (anneau, reste du jour, saisie) ; l'entrée
   « Aujourd'hui » du menu est marquée active (gras, trait, couleur).
2. Toucher chaque entrée : le contenu correspond au [modèle de données](./data-model.md)
   § « Répartition des sections ». Aucune section manquante, aucune en double.
3. « Mois » : sections affichées directement, plus de repli « Budget prévisionnel du mois ».
4. Sur « Mois », changer de mois : on reste sur « Mois ».
5. Saisir une dépense sur « Aujourd'hui », ouvrir « Dépenses » : elle est dans le journal.
6. Comparer quelques montants avec la version de `master` pour le même mois : identiques
   (SC-005).

### Récit 2 — Téléphone et ordinateur

1. Largeur 360 px : barre en bas, quatre entrées avec pictogramme et libellé, aucun défilement
   horizontal.
2. Faire défiler « Mois » jusqu'en bas : la barre reste visible, le dernier élément (prévisions)
   est entièrement lisible au-dessus d'elle.
3. Profil iPhone (zone de geste) : les boutons de la barre restent au-dessus de la zone système.
4. Largeur 1280 px : onglets en haut sous l'en-tête, aucune barre en bas.
5. Zoom navigateur à 200 % : menu toujours utilisable, contenu lisible.
6. **Cinq entrées** (FR-010) : ajouter temporairement une cinquième entrée en local, vérifier à
   360 px qu'elle tient, puis annuler la modification.
7. **Longueur** (SC-002) : à 360 px et avec le même budget, relever dans la console
   `document.documentElement.scrollHeight` sur `master`, puis sur la branche avec l'onglet
   « Aujourd'hui ». La seconde valeur doit être au plus la moitié de la première. Consigner les
   deux valeurs dans la description de la demande de fusion.

### Récit 3 — Liens internes

1. Sur « Aujourd'hui », toucher « N opérations bancaires à classer » : « Dépenses » s'ouvre,
   la boîte « À classer » est à l'écran.
2. Toucher « Aller à « Mes banques » » dans une alerte : « Réglages » s'ouvre sur « Mes
   banques ».
3. Budget vide (navigation privée sur une instance de test) : le message de bienvenue renvoie vers
   « Réglages » ; l'anneau propose « Ouvrir l'onglet Mois » ; sur « Dépenses », le journal vide
   propose « Saisir une dépense », qui ramène au formulaire de « Aujourd'hui ».
4. Relier ou reconnecter une banque : au retour, « Réglages » est affiché avec le message
   d'issue. Après actualisation, le message a disparu et l'onglet est conservé.

### Récit 4 — Garder sa place

1. Sur « Mois », actualiser : on reste sur « Mois ».
2. « Aujourd'hui » → « Dépenses », puis retour du navigateur : « Aujourd'hui ».
3. Commencer une dépense (montant et libellé) sans l'enregistrer, ouvrir « Réglages », revenir :
   la saisie est intacte.
4. Ouvrir `/?onglet=nimportequoi` : « Aujourd'hui », sans erreur.

### Accessibilité

1. Au clavier seul : Tab atteint chaque entrée du menu avec un focus visible ; Entrée l'active.
2. Avec un lecteur d'écran (NVDA ou VoiceOver) : l'entrée active est annoncée comme « page
   actuelle ».
3. Thèmes clair et sombre : contraste suffisant de l'entrée active et des entrées inactives.

### Hors connexion

Couper le réseau dans les outils de développement, puis changer d'onglet : tout reste
consultable, aucune requête n'est émise par le changement d'onglet (onglet Réseau vide).
