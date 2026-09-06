# Spécification de fonctionnalité : Export et import des données budgétaires

**Branche de fonctionnalité** : `004-data-export-import`

**Créée le** : 2026-09-05

**Statut** : Brouillon

**Entrée** : Obligation constitutionnelle, `.specify/memory/constitution.md` lignes 185 à 187 :
« L'application DOIT proposer un export, déclenché par l'utilisateur, de l'intégralité de ses données
budgétaires dans un format documenté et portable, ainsi qu'un import qui restitue fidèlement cet
export. C'est la porte de sortie qui rend la propriété des données réelle plutôt que nominale. »

## Scénarios utilisateur et tests *(obligatoire)*

### Récit utilisateur 1 – Exporter toutes mes données dans un fichier (Priorité : P1)

En tant que personne dont toutes les données financières vivent dans un seul navigateur, je veux
obtenir en une action un fichier contenant l'intégralité de ce que l'application détient sur moi,
afin de pouvoir le sauvegarder où je le souhaite et de ne pas être prisonnier de cet appareil.

**Pourquoi cette priorité** : c'est la moitié de l'obligation constitutionnelle qui a une valeur
immédiate et autonome. Un export sans import reste une sauvegarde utile ; un import sans export ne
sert à rien.

**Test indépendant** : entièrement testable en saisissant des données, en déclenchant l'export, puis
en ouvrant le fichier obtenu pour vérifier qu'il contient bien tous les éléments enregistrés et
qu'il est lisible.

**Scénarios d'acceptation** :

1. **Étant donné** une application contenant des revenus et des abonnements, **quand** l'utilisateur
   déclenche l'export, **alors** un fichier est proposé au téléchargement et contient l'intégralité
   de ces éléments.
2. **Étant donné** une application sans aucune donnée, **quand** l'utilisateur déclenche l'export,
   **alors** un fichier valide est tout de même produit, décrivant un contenu vide, sans erreur.
3. **Étant donné** un export déclenché, **quand** l'utilisateur regarde le nom du fichier proposé,
   **alors** celui-ci comporte la date et l'heure de l'export, afin que plusieurs sauvegardes ne se
   masquent pas entre elles.
4. **Étant donné** un fichier exporté, **quand** l'utilisateur l'ouvre dans un éditeur de texte,
   **alors** il peut y reconnaître ses libellés, ses montants et ses dates sans outil particulier.
5. **Étant donné** un fichier exporté, **quand** l'utilisateur en consulte l'en-tête, **alors** il y
   trouve la version du format et la date de l'export.
6. **Étant donné** l'application hors connexion réseau, **quand** l'utilisateur déclenche l'export,
   **alors** l'export aboutit normalement.

---

### Récit utilisateur 2 – Restaurer mes données depuis un fichier exporté (Priorité : P1)

Je veux recharger un fichier précédemment exporté et retrouver exactement l'état dans lequel se
trouvait l'application au moment de l'export, afin de pouvoir changer de navigateur, d'appareil, ou
me remettre d'un effacement du stockage local.

**Pourquoi cette priorité** : c'est l'autre moitié de l'obligation. C'est aussi le seul mécanisme de
récupération dont dispose une application entièrement locale.

**Test indépendant** : entièrement testable en exportant un jeu de données, en vidant l'application,
en important le fichier, puis en vérifiant que chaque élément est revenu à l'identique — montants au
centime près, dates, libellés et périodicités compris.

**Scénarios d'acceptation** :

1. **Étant donné** un fichier issu de l'export, **quand** l'utilisateur l'importe dans une
   application vide, **alors** tous les éléments du fichier sont présents et identiques à l'original.
2. **Étant donné** un cycle export puis import puis export, **quand** l'utilisateur compare les deux
   fichiers exportés, **alors** leur contenu de données est identique, à l'horodatage d'export près.
3. **Étant donné** un fichier importé, **quand** l'utilisateur consulte un mois budgétaire,
   **alors** les totaux affichés sont exactement ceux d'avant l'export, au centime près.
4. **Étant donné** un import réussi, **quand** l'utilisateur ferme puis rouvre l'application,
   **alors** les données importées sont toujours là.
5. **Étant donné** un import réussi, **quand** l'utilisateur consulte le résultat, **alors** un
   compte rendu indique combien d'éléments de chaque type ont été restaurés.
6. **Étant donné** l'application hors connexion réseau, **quand** l'utilisateur importe un fichier,
   **alors** l'import aboutit normalement.

---

### Récit utilisateur 3 – Ne jamais perdre mes données à cause d'un import (Priorité : P2)

Avant qu'un import ne remplace ce que contient l'application, je veux savoir ce que je m'apprête à
charger et ce que je m'apprête à perdre, pouvoir renoncer, et disposer d'un filet si je me suis
trompé de fichier.

**Pourquoi cette priorité** : un import est destructeur par nature. Sans ce récit, la fonctionnalité
censée protéger les données devient le moyen le plus rapide de les détruire.

**Test indépendant** : entièrement testable en tentant d'importer un fichier dans une application
contenant déjà des données, en vérifiant qu'un résumé est présenté, que l'annulation ne change rien,
et qu'après confirmation les données remplacées restent récupérables.

**Scénarios d'acceptation** :

1. **Étant donné** une application contenant déjà des données, **quand** l'utilisateur sélectionne un
   fichier à importer, **alors** un résumé du contenu du fichier lui est présenté avant tout
   remplacement, avec le nombre d'éléments par type et la date de l'export.
2. **Étant donné** ce résumé affiché, **quand** l'utilisateur annule, **alors** aucune donnée n'est
   modifiée.
3. **Étant donné** ce résumé affiché, **quand** l'utilisateur confirme, **alors** il est averti
   explicitement que le contenu actuel sera remplacé, et l'import ne s'exécute qu'après cette
   confirmation.
4. **Étant donné** un import confirmé, **quand** le remplacement s'exécute, **alors** l'état
   antérieur est conservé automatiquement comme point de restauration avant l'écriture des nouvelles
   données.
5. **Étant donné** un import qui vient de s'exécuter, **quand** l'utilisateur constate son erreur,
   **alors** il peut revenir à l'état antérieur tant qu'il n'a pas quitté l'application.
6. **Étant donné** un import qui échoue en cours d'exécution, **quand** l'utilisateur consulte
   l'application, **alors** les données antérieures sont intactes et un message explique l'échec.

---

### Récit utilisateur 4 – Comprendre pourquoi un fichier est refusé (Priorité : P3)

Quand je choisis un fichier qui n'est pas un export valide, ou qui vient d'une version différente de
l'application, je veux un message qui me dit précisément ce qui ne va pas, afin de ne pas rester
devant un refus muet.

**Pourquoi cette priorité** : indispensable à l'usage réel, mais l'import fonctionne sans lui tant
que l'on ne se trompe pas de fichier.

**Test indépendant** : entièrement testable en soumettant tour à tour un fichier d'un autre type, un
fichier tronqué, un fichier d'une version de format antérieure et un fichier d'une version
postérieure, et en vérifiant que chaque refus porte un message distinct et exploitable.

**Scénarios d'acceptation** :

1. **Étant donné** un fichier qui n'est pas un export de l'application, **quand** l'utilisateur tente
   de l'importer, **alors** il est refusé avec un message indiquant qu'il ne s'agit pas d'un export
   reconnu, et aucune donnée n'est modifiée.
2. **Étant donné** un fichier d'export tronqué ou modifié à la main, **quand** l'utilisateur tente de
   l'importer, **alors** il est refusé avec un message indiquant que le fichier est incomplet ou
   abîmé.
3. **Étant donné** un fichier d'export produit par une version antérieure du format, **quand**
   l'utilisateur l'importe, **alors** il est accepté et son contenu est converti vers le format
   courant sans perte.
4. **Étant donné** un fichier d'export produit par une version postérieure du format, **quand**
   l'utilisateur tente de l'importer, **alors** il est refusé avec un message expliquant que le
   fichier provient d'une version plus récente de l'application, et aucune donnée n'est modifiée.
5. **Étant donné** un refus quel qu'il soit, **quand** l'utilisateur consulte l'application,
   **alors** son contenu est strictement inchangé.

---

### Cas limites

- **Fichier volumineux** : un export contenant plusieurs années de données s'importe sans que
  l'interface paraisse figée, et l'utilisateur voit que le traitement est en cours.
- **Fichier vide, de taille nulle** : refusé comme fichier abîmé, avec le message correspondant.
- **Fichier dont le contenu est valide mais dont toutes les collections sont vides** : accepté ; il
  restaure un état vide, ce qui est une opération légitime, mais l'avertissement de remplacement
  indique clairement que l'application se retrouvera sans données.
- **Import du même fichier deux fois de suite** : la seconde exécution produit le même résultat que
  la première, sans doublon.
- **Fichier contenant des identifiants en double** : refusé comme abîmé, plutôt qu'importé
  partiellement.
- **Fichier contenant un montant non entier, négatif là où c'est interdit, ou une date impossible** :
  refusé comme abîmé ; aucun élément n'est importé, même valide.
- **Export déclenché pendant une saisie non validée** : l'export reflète l'état enregistré, pas la
  saisie en cours ; ce comportement est indiqué à l'utilisateur.
- **Stockage plein au moment de l'import** : l'import échoue proprement, les données antérieures sont
  restaurées, et le message distingue ce cas d'un fichier invalide.
- **Espace disque ou permission de téléchargement refusée à l'export** : l'échec est signalé plutôt
  que silencieux.
- **Caractères accentués et emoji dans les libellés** : conservés à l'identique par l'aller-retour.

## Exigences *(obligatoire)*

### Exigences fonctionnelles

**Export**

- **EF-001** : L'utilisateur DOIT pouvoir déclencher l'export depuis l'application, par une action
  explicite.
- **EF-002** : L'export DOIT contenir l'intégralité des données budgétaires détenues par
  l'application, sans sélection ni filtrage partiel.
- **EF-003** : L'export DOIT produire un fichier unique, dans un format textuel documenté et lisible
  sans outil spécifique.
- **EF-004** : Le fichier exporté DOIT porter un en-tête indiquant la version du format et la date et
  l'heure de l'export.
- **EF-005** : Le nom du fichier proposé DOIT comporter la date et l'heure de l'export.
- **EF-006** : L'export DOIT aboutir même lorsque l'application ne contient aucune donnée.
- **EF-007** : Un échec d'export DOIT être signalé par un message ; il ne DOIT jamais être silencieux.
- **EF-008** : L'export DOIT refléter l'état enregistré des données, et non une saisie en cours non
  validée.

**Import**

- **EF-009** : L'utilisateur DOIT pouvoir sélectionner un fichier d'export et déclencher son import.
- **EF-010** : L'import DOIT restituer à l'identique tous les éléments contenus dans le fichier :
  montants au centime près, dates, libellés, périodicités et toute autre caractéristique enregistrée.
- **EF-011** : Un cycle export puis import puis export DOIT produire deux fichiers dont le contenu de
  données est identique, à l'horodatage d'export près.
- **EF-012** : L'import DOIT remplacer l'intégralité du contenu existant, et non le fusionner avec
  lui.
- **EF-013** : L'import DOIT valider la totalité du fichier avant d'écrire quoi que ce soit ; un
  fichier partiellement valide NE DOIT PAS être partiellement importé.
- **EF-014** : Après un import réussi, le système DOIT présenter un compte rendu indiquant le nombre
  d'éléments restaurés par type.
- **EF-015** : Les données importées DOIVENT survivre à la fermeture et à la réouverture de
  l'application.

**Protection contre la perte de données**

- **EF-016** : Avant tout remplacement, le système DOIT présenter un résumé du fichier sélectionné :
  nombre d'éléments par type et date de l'export.
- **EF-017** : Le système DOIT avertir explicitement que le contenu actuel sera remplacé, et n'exécuter
  l'import qu'après confirmation de l'utilisateur.
- **EF-018** : L'utilisateur DOIT pouvoir renoncer à l'import à ce stade, sans qu'aucune donnée ne
  soit modifiée.
- **EF-019** : Le système DOIT conserver l'état antérieur comme point de restauration avant d'écrire
  les données importées.
- **EF-020** : L'utilisateur DOIT pouvoir revenir à l'état antérieur après un import, tant qu'il n'a
  pas quitté l'application.
- **EF-021** : Si l'import échoue en cours d'exécution, le système DOIT laisser les données
  antérieures intactes et expliquer l'échec.

**Refus et compatibilité**

- **EF-022** : Le système DOIT refuser un fichier qui n'est pas un export reconnu, avec un message le
  disant.
- **EF-023** : Le système DOIT refuser un fichier abîmé, tronqué, vide, contenant des identifiants en
  double ou des valeurs invalides, avec un message distinct du précédent.
- **EF-024** : Le système DOIT accepter un fichier d'une version antérieure du format et en convertir
  le contenu vers le format courant sans perte.
- **EF-025** : Le système DOIT refuser un fichier d'une version postérieure du format, avec un message
  expliquant qu'il provient d'une version plus récente de l'application.
- **EF-026** : Tout refus DOIT laisser le contenu de l'application strictement inchangé.

**Fonctionnement**

- **EF-027** : L'export et l'import DOIVENT fonctionner sans connexion réseau.
- **EF-028** : Le fichier exporté NE DOIT être transmis à aucun service tiers ; il reste sous le seul
  contrôle de l'utilisateur.
- **EF-029** : Lors du traitement d'un fichier volumineux, le système DOIT indiquer que l'opération
  est en cours.

### Entités clés

- **Fichier d'export** : le document produit par l'export. Comporte un en-tête — version du format,
  date et heure de l'export — et le contenu intégral des données budgétaires.
- **Résumé d'import** : la description du fichier sélectionné présentée avant remplacement. Nombre
  d'éléments par type et date de l'export d'origine.
- **Compte rendu d'import** : le bilan présenté après un import réussi. Nombre d'éléments restaurés
  par type.
- **Point de restauration** : la copie de l'état antérieur conservée avant l'écriture des données
  importées, permettant le retour en arrière.
- **Motif de refus** : la raison pour laquelle un fichier a été rejeté — fichier non reconnu, fichier
  abîmé, version postérieure — chacune donnant lieu à un message distinct.

## Critères de succès *(obligatoire)*

### Résultats mesurables

- **CS-001** : Un utilisateur obtient une sauvegarde complète de ses données en moins de trois
  actions à partir de l'écran principal.
- **CS-002** : Un cycle export puis import restitue 100 % des éléments, sans perte ni altération
  d'un seul montant, d'une seule date ou d'un seul libellé, vérifié sur un jeu comportant au moins
  200 éléments de tous types.
- **CS-003** : Un cycle export puis import puis export produit deux fichiers dont le contenu de
  données est identique octet pour octet, à l'horodatage d'export près.
- **CS-004** : Les montants sont exacts au centime après l'aller-retour, sans aucune dérive
  d'arrondi.
- **CS-005** : Aucun scénario d'import invalide, quel qu'il soit, ne modifie les données existantes,
  vérifié sur au moins six types de fichiers défectueux distincts.
- **CS-006** : Un utilisateur ayant importé le mauvais fichier retrouve son état antérieur en une
  seule action, sans avoir quitté l'application.
- **CS-007** : Chacun des trois motifs de refus produit un message distinct que l'utilisateur peut
  relier à une action corrective.
- **CS-008** : L'export et l'import aboutissent sans connexion réseau.
- **CS-009** : Un fichier représentant trois années de données s'importe sans que l'interface
  paraisse figée, une indication de traitement en cours restant visible.
- **CS-010** : Les caractères accentués et les emoji présents dans les libellés sont restitués à
  l'identique après l'aller-retour.

## Hypothèses

- **Le format d'échange est le même que celui du stockage interne, versionné et documenté.** Réutiliser
  la structure déjà versionnée de l'application évite d'entretenir deux schémas et deux chemins de
  migration, et rend la fidélité de l'aller-retour vérifiable par simple comparaison. La
  documentation du format fait partie de la livraison.
- **L'import remplace, il ne fusionne pas.** L'obligation constitutionnelle porte sur un import qui
  « restitue fidèlement » l'export : c'est une restauration, pas une synchronisation. La fusion de
  deux jeux de données — avec ses conflits d'identifiants et ses doublons — est un problème
  différent, explicitement hors périmètre.
- **L'export porte sur la totalité des données**, sans sélection par période ni par type. Un export
  partiel casserait la garantie de fidélité de l'aller-retour.
- **Le format d'échange n'est pas un format tableur.** Une exportation en CSV destinée à être ouverte
  dans un tableur est une fonctionnalité de commodité distincte, hors périmètre : elle ne peut pas
  restituer fidèlement des structures imbriquées comme l'historique des tarifs d'un abonnement.
- **Aucun chiffrement du fichier exporté** dans cette version. Le fichier contient des données
  financières personnelles ; c'est à l'utilisateur de choisir où il le range. Ajouter un chiffrement
  par mot de passe impliquerait de gérer la perte de ce mot de passe, ce qui est une fonctionnalité à
  part entière.
- **Aucune sauvegarde automatique ni planifiée.** L'obligation constitutionnelle porte sur un export
  « déclenché par l'utilisateur ». Une sauvegarde périodique serait une fonctionnalité distincte.
- **Aucun envoi vers un service tiers** — ni stockage en nuage, ni courriel, ni synchronisation —
  conformément au principe I de la constitution. Le fichier est remis à l'utilisateur, un point c'est
  tout.
- **Le point de restauration est temporaire** et vaut pour la session en cours. Le conserver
  durablement reviendrait à construire un historique de versions, ce qui dépasse le besoin.
- **La fonctionnalité est indépendante du contenu.** Elle exporte et importe le document de données
  quel qu'il soit, sans connaître le détail des revenus, abonnements, dépenses ou plafonds. Elle reste
  donc valide au fil des fonctionnalités 002, 003 et 001, et n'a pas à être respécifiée à chacune.
- **Utilisateur unique, sans compte ni partage**, conformément à la constitution.
- **Textes d'interface en français**, avec les dates au format `JJ/MM/AAAA`, en cohérence avec les
  fonctionnalités 001, 002 et 003.
