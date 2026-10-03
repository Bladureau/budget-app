# Spécification de fonctionnalité : Menu de navigation par onglets

**Répertoire de fonctionnalité** : `specs/007-navigation-menu`

**Branche** : `feat-007-navigation-menu`

**Créée le** : 2026-10-03

**Statut** : Brouillon

**Demande initiale** : « Pour la prochaine feature, je voudrais bien avoir un menu plutôt que de
scroller indéfiniment. »

---

## Constat de départ

L'application tient aujourd'hui sur **une seule page** qui empile, dans l'ordre : l'état de
synchronisation, les alertes bancaires, le compteur « À classer », l'anneau du budget, le reste du
jour, la saisie d'une dépense, la boîte « À classer », le journal des dépenses, les enveloppes, les
comptes bancaires, un repli « Budget prévisionnel du mois » (bilan, revenus, abonnements,
répartition des charges, échéances, prévisions), puis l'export/import des données.

Avec la fonctionnalité 006, la page s'est encore allongée : atteindre les comptes bancaires ou la
sauvegarde demande de faire défiler tout le quotidien. Deux liens internes existent déjà et
supposent que tout est sur la même page :

- le compteur « À classer » renvoie vers la boîte « À classer » ;
- l'alerte d'expiration bancaire renvoie vers la section des comptes bancaires.

Trois textes désignent aussi un emplacement qui changera d'onglet :

- le message de bienvenue d'un budget vide renvoie à la section « Vos données » « en bas de
  page » (qui sera dans « Réglages ») ;
- l'anneau d'un budget sans revenus invite à renseigner revenus et abonnements « ci-dessous »
  (ils seront dans « Mois ») ;
- le journal vide invite à saisir une dépense « ci-dessus » (le formulaire sera dans
  « Aujourd'hui », le journal dans « Dépenses »).

Les autres « ci-dessous » de l'application renvoient à un élément de la même section et restent
justes.

## Découpage retenu

| Onglet | Contenu | Fréquence d'usage |
| --- | --- | --- |
| **Aujourd'hui** | Message de bienvenue (budget vide), alertes bancaires, compteur « À classer », anneau du budget, reste du jour, saisie d'une dépense | Plusieurs fois par jour |
| **Dépenses** | Boîte « À classer », journal des dépenses, enveloppes | Quotidienne à hebdomadaire |
| **Mois** | Bilan du mois, revenus, abonnements, répartition des charges, échéances, prévisions | Mensuelle |
| **Réglages** | Comptes bancaires, export/import des données | Occasionnelle |

Restent visibles **au-dessus des onglets, quel que soit l'onglet** : le titre, le sélecteur de
mois, l'état de synchronisation, l'avertissement de stockage et la résolution de conflit.

## Scénarios utilisateur et tests *(obligatoire)*

### Récit 1 — Naviguer entre les quatre onglets (Priorité : P1)

L'utilisateur ouvre l'application et arrive sur « Aujourd'hui », qui ne montre que ce qu'il
consulte plusieurs fois par jour. Pour voir son journal, ses abonnements ou ses comptes bancaires,
il touche l'onglet correspondant au lieu de faire défiler la page.

**Pourquoi cette priorité** : c'est la demande elle-même. À lui seul, ce récit supprime le
défilement interminable et constitue un produit utilisable.

**Test indépendant** : ouvrir l'application, vérifier que seul le contenu « Aujourd'hui » est
affiché, puis toucher chaque onglet et vérifier que le contenu affiché correspond au tableau du
découpage, sans aucune section manquante ni en double.

**Scénarios d'acceptation** :

1. **Étant donné** que l'utilisateur ouvre l'application, **quand** le budget a fini de charger,
   **alors** l'onglet « Aujourd'hui » est actif et seules ses sections sont affichées.
2. **Étant donné** que l'onglet « Aujourd'hui » est actif, **quand** l'utilisateur choisit
   « Mois », **alors** le bilan, les revenus, les abonnements, la répartition des charges, les
   échéances et les prévisions s'affichent directement, sans repli à déplier.
3. **Étant donné** n'importe quel onglet actif, **quand** l'utilisateur regarde le menu, **alors**
   l'onglet actif se distingue des autres autrement que par la seule couleur.
4. **Étant donné** que l'utilisateur est sur « Mois » et change de mois avec le sélecteur,
   **quand** le mois change, **alors** il reste sur « Mois » et voit les chiffres du nouveau mois.
5. **Étant donné** que l'utilisateur a saisi une dépense depuis « Aujourd'hui », **quand** il ouvre
   « Dépenses », **alors** la dépense figure dans le journal.

---

### Récit 2 — Un menu adapté au téléphone comme à l'ordinateur (Priorité : P1)

Sur téléphone, le menu est une barre fixée en bas de l'écran, à portée de pouce, qui reste visible
pendant le défilement d'un onglet. Sur un écran large, le menu prend la forme d'onglets en haut du
contenu.

**Pourquoi cette priorité** : l'application se consulte surtout sur téléphone ; un menu en haut
d'écran y serait difficile à atteindre d'une main, et une barre en bas paraîtrait déplacée sur
ordinateur.

**Test indépendant** : afficher l'application à 360 px de large puis à 1280 px, et vérifier
l'emplacement du menu, sa visibilité pendant le défilement et l'absence de contenu masqué.

**Scénarios d'acceptation** :

1. **Étant donné** un écran de téléphone, **quand** l'utilisateur fait défiler un onglet long,
   **alors** la barre de menu reste visible en bas de l'écran.
2. **Étant donné** un écran de téléphone, **quand** l'utilisateur fait défiler jusqu'en bas d'un
   onglet, **alors** le dernier élément de l'onglet est entièrement visible et utilisable, non
   recouvert par la barre.
3. **Étant donné** un téléphone dont le bas d'écran comporte une zone réservée au système (barre
   de geste), **quand** la barre de menu s'affiche, **alors** ses boutons restent au-dessus de
   cette zone.
4. **Étant donné** un écran large, **quand** l'application s'affiche, **alors** les onglets sont
   placés en haut du contenu, sous l'en-tête, et aucune barre n'apparaît en bas.
5. **Étant donné** un écran de 360 px de large, **quand** le menu s'affiche, **alors** chaque onglet
   montre un pictogramme et un libellé lisible, sans défilement horizontal.

---

### Récit 3 — Les liens internes mènent au bon onglet (Priorité : P2)

Depuis « Aujourd'hui », le compteur « À classer » et l'alerte bancaire renvoient vers du contenu
désormais rangé dans un autre onglet. Les suivre ouvre le bon onglet et amène l'utilisateur sur la
section visée.

**Pourquoi cette priorité** : sans cela, ces liens deviennent morts — l'utilisateur toucherait
« 3 opérations à classer » sans que rien ne se passe. Le récit 1 reste utilisable sans lui, mais
avec une régression visible.

**Test indépendant** : avec au moins une opération à classer et une autorisation bancaire proche
de l'expiration, toucher chaque lien depuis « Aujourd'hui » et vérifier l'onglet ouvert et la
section affichée.

**Scénarios d'acceptation** :

1. **Étant donné** des opérations à classer, **quand** l'utilisateur touche le compteur
   « À classer » sur « Aujourd'hui », **alors** l'onglet « Dépenses » s'ouvre et la boîte
   « À classer » est à l'écran.
2. **Étant donné** une alerte d'expiration ou de perte d'accès bancaire, **quand** l'utilisateur
   touche son lien, **alors** l'onglet « Réglages » s'ouvre et la section des comptes bancaires est
   à l'écran.
3. **Étant donné** un budget vide, **quand** le message de bienvenue s'affiche, **alors** il désigne
   l'onglet « Réglages » (et non plus le « bas de page ») pour restaurer une sauvegarde.
4. **Étant donné** un mois sans revenus, **quand** l'anneau invite à renseigner revenus et
   abonnements, **alors** il propose un lien vers l'onglet « Mois » au lieu de « ci-dessous ».
5. **Étant donné** un journal vide sur « Dépenses », **quand** il invite à saisir une dépense,
   **alors** il propose un lien vers le formulaire de saisie de « Aujourd'hui » au lieu de
   « ci-dessus ».

---

### Récit 4 — Garder sa place : actualisation, retour arrière, saisie en cours (Priorité : P3)

L'utilisateur qui actualise la page reste sur l'onglet où il était. Le bouton « retour » du
téléphone ou du navigateur le ramène à l'onglet précédent plutôt que de quitter l'application. Une
dépense à moitié saisie n'est pas perdue s'il jette un œil à un autre onglet avant de revenir.

**Pourquoi cette priorité** : confort attendu d'une navigation, mais le menu est déjà pleinement
utile sans lui.

**Test indépendant** : ouvrir « Mois », actualiser ; passer de « Aujourd'hui » à « Dépenses » puis
faire retour ; commencer une saisie, changer d'onglet, revenir.

**Scénarios d'acceptation** :

1. **Étant donné** que l'utilisateur est sur « Mois », **quand** il actualise la page, **alors** il
   se retrouve sur « Mois ».
2. **Étant donné** que l'utilisateur est passé de « Aujourd'hui » à « Dépenses », **quand** il
   utilise le bouton retour, **alors** il revient sur « Aujourd'hui ».
3. **Étant donné** que l'utilisateur a commencé à saisir une dépense sans l'enregistrer, **quand**
   il ouvre un autre onglet puis revient sur « Aujourd'hui », **alors** sa saisie est intacte.

---

### Cas limites

- **Chargement** : tant que le budget n'est pas chargé, seule l'indication « Chargement… »
  s'affiche sous l'en-tête ; le menu apparaît avec le contenu, une fois le budget prêt, pour
  qu'aucun onglet ne montre de contenu partiel ou faux.
- **Conflit de synchronisation** : la résolution d'un conflit reste accessible quel que soit
  l'onglet actif ; elle ne doit pas être cachée parce que l'utilisateur est sur « Réglages ».
- **Hors connexion** : le menu fonctionne sans réseau, tous les onglets restent consultables.
- **Adresse d'onglet inconnue** (lien ancien ou mal formé) : l'application ouvre « Aujourd'hui »
  sans message d'erreur.
- **Retour d'autorisation bancaire** : au retour de la banque après avoir lié un compte,
  l'utilisateur voit l'issue de l'opération (dans « Réglages », là où se trouvent les comptes),
  pas un onglet sans rapport.
- **Zoom à 200 %** : le menu reste utilisable et ne recouvre pas la majorité de l'écran.
- **Clavier seul** : chaque onglet est atteignable et activable au clavier, avec un focus visible.
- **Lecteur d'écran** : l'onglet actif est annoncé comme tel.

## Exigences *(obligatoire)*

### Exigences fonctionnelles

- **FR-001** : L'application DOIT présenter un menu de quatre entrées — « Aujourd'hui »,
  « Dépenses », « Mois », « Réglages » — et n'afficher à un instant donné que le contenu de l'onglet
  actif.
- **FR-002** : Chaque section existante DOIT apparaître dans exactement un onglet, conformément au
  tableau « Découpage retenu » ; aucune section ne DOIT disparaître ni être dupliquée.
- **FR-003** : Le titre, le sélecteur de mois, l'état de synchronisation, l'avertissement de
  stockage et la résolution de conflit DOIVENT rester visibles au-dessus du contenu, quel que soit
  l'onglet actif.
- **FR-004** : À l'ouverture de l'application sans onglet précisé, l'onglet « Aujourd'hui » DOIT
  être actif.
- **FR-005** : Les sections de l'onglet « Mois » DOIVENT s'afficher directement, sans repli à
  déplier.
- **FR-006** : Sur un écran étroit (téléphone), le menu DOIT être une barre fixée en bas de
  l'écran, toujours visible pendant le défilement, qui ne recouvre ni le contenu en fin d'onglet ni
  la zone système en bas de l'écran.
- **FR-007** : Sur un écran large, le menu DOIT prendre la forme d'onglets placés en haut du
  contenu, sous l'en-tête.
- **FR-008** : Chaque entrée du menu DOIT comporter un pictogramme et un libellé textuel, et
  l'entrée active DOIT se distinguer autrement que par la couleur seule.
- **FR-009** : Le menu DOIT être utilisable au clavier seul, avec un focus visible, et annoncer
  l'onglet actif aux technologies d'assistance.
- **FR-010** : Le menu DOIT tenir sans défilement horizontal à 360 px de large **avec cinq
  entrées**, afin d'accueillir la future vue hebdomadaire sans refonte.
- **FR-011** : Le lien du compteur « À classer » DOIT ouvrir l'onglet « Dépenses » et amener la
  boîte « À classer » à l'écran.
- **FR-012** : Le lien des alertes bancaires DOIT ouvrir l'onglet « Réglages » et amener la section
  des comptes bancaires à l'écran.
- **FR-013** : Aucun texte de l'application NE DOIT désigner par sa position (« ci-dessus »,
  « ci-dessous », « en bas de page ») un élément situé dans un autre onglet. Les trois textes
  relevés au « Constat de départ » DOIVENT renvoyer par un lien vers l'onglet concerné :
  « Réglages » pour la restauration d'une sauvegarde, « Mois » pour les revenus et abonnements,
  le formulaire de saisie de « Aujourd'hui » pour le journal vide.
- **FR-014** : L'onglet actif DOIT survivre à une actualisation de la page.
- **FR-015** : Le bouton retour du navigateur ou du téléphone DOIT ramener à l'onglet précédemment
  consulté.
- **FR-016** : Une adresse désignant un onglet inexistant DOIT ouvrir « Aujourd'hui ».
- **FR-017** : Changer d'onglet NE DOIT PAS effacer une saisie en cours non enregistrée (formulaire
  de dépense, de revenu, d'abonnement ou d'enveloppe).
- **FR-018** : Le retour d'une autorisation bancaire DOIT afficher l'onglet « Réglages ».
- **FR-019** : La fonctionnalité NE DOIT modifier ni les données enregistrées, ni leur format, ni
  aucun calcul : aucun montant affiché ne change du seul fait de la navigation.

### Comportement monétaire

Sans objet : la fonctionnalité ne crée, ne calcule ni ne transforme aucun montant (FR-019). Les
montants affichés dans chaque onglet sont exactement ceux qu'affiche la page unique actuelle pour
le même mois.

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **SC-001** : Depuis l'ouverture de l'application, n'importe quelle section est atteinte en
  **un seul toucher** sur le menu, suivi au plus d'un court défilement dans l'onglet.
- **SC-002** : Sur un téléphone de 360 px de large, l'onglet « Aujourd'hui » est au moins deux fois
  moins long que la page unique actuelle.
- **SC-003** : Le passage d'un onglet à l'autre est perçu comme immédiat (moins d'une demi-seconde),
  y compris hors connexion.
- **SC-004** : 100 % des sections présentes avant la fonctionnalité restent accessibles, et 100 %
  des liens internes existants mènent à leur cible.
- **SC-005** : Pour un même mois, chaque montant affiché est identique avant et après la
  fonctionnalité.

## Hypothèses

- L'utilisateur est seul et principalement sur téléphone ; l'ordinateur est un usage secondaire.
- La limite entre « écran étroit » et « écran large » reprend le point de rupture déjà utilisé par
  l'application pour ses marges.
- L'onglet actif est porté par l'adresse de la page, ce qui donne gratuitement l'actualisation, le
  retour arrière et les liens directs vers un onglet ; aucun réglage n'est mémorisé ailleurs.
- Le sélecteur de mois reste affiché sur « Réglages » même s'il n'y a pas d'effet : le garder
  partout évite qu'il apparaisse et disparaisse au gré des onglets.
- Aucune pastille (compteur sur une entrée du menu) n'est prévue : le compteur « À classer » et les
  alertes bancaires restent affichés sur « Aujourd'hui », l'onglet d'ouverture.
- L'ordre des sections à l'intérieur de chaque onglet reprend l'ordre actuel de la page unique.

## Hors périmètre

- La vue hebdomadaire du « reste à dépenser » : elle fera l'objet de la fonctionnalité suivante et
  viendra s'ajouter au menu comme cinquième entrée ou au sein d'un onglet existant.
- Toute réorganisation du contenu des sections elles-mêmes.
- Les tâches restantes de la fonctionnalité 006 (modification des règles de classement,
  finitions).
