<!--
RAPPORT D'IMPACT DE SYNCHRONISATION
Changement de version : 1.0.0 -> 1.1.0
Justification : ajout d'un principe (VIII. Le francais comme langue du projet). Aucun principe
existant n'a ete supprime ni redefini de maniere incompatible, donc MINEUR et non MAJEUR.
La traduction integrale du document en francais est une consequence directe du nouveau
principe : une constitution redigee en anglais violerait sa propre regle des sa ratification.
Aucune exigence n'a change de fond lors de la traduction.

Principes modifies (renommage par traduction, contenu inchange) :
- I. Local-First Data Ownership -> I. Propriete locale des donnees
- II. Money Is Exact -> II. L'argent est exact (NON NEGOCIABLE)
- III. Tested Where It Counts -> III. Tester la ou cela compte
- IV. Type-Safe and Lint-Clean -> IV. Typage strict et lint sans erreur
- V. Framework Truth Over Recall -> V. La documentation du framework prime sur la memoire
- VI. Simplicity and YAGNI -> VI. Simplicite et YAGNI
- VII. Accessible and Responsive by Default -> VII. Accessibilite et adaptabilite par defaut

Sections ajoutees :
- VIII. Le francais comme langue du projet (nouveau principe)
- Point de controle n.6 dans « Flux de developpement et points de controle qualite »
  (verification de la langue des artefacts)

Sections renommees par traduction :
- Core Principles -> Principes fondamentaux
- Technology and Data Constraints -> Contraintes techniques et de donnees
- Development Workflow and Quality Gates -> Flux de developpement et points de controle qualite
- Governance -> Gouvernance

Sections supprimees : aucune
-->

# Constitution de Budget App

## Principes fondamentaux

### I. Propriété locale des données

Budget App est un outil de finances personnelles mono-utilisateur. Les données financières de
l'utilisateur DOIVENT rester sous son contrôle : stockées localement ou dans un unique espace privé
qui lui appartient, jamais transmises à un service tiers qu'il n'a pas explicitement choisi. Aucun
SDK d'analyse d'audience, de télémétrie, de remontée de plantages ou de publicité transmettant des
écritures financières, des identifiants de compte ou des libellés de transaction hors de l'appareil
ne peut être ajouté. Toute fonctionnalité introduisant une dépendance réseau pour le cœur du
budget DOIT justifier pourquoi un fonctionnement local est impossible ; l'application DOIT rester
utilisable pour consulter et saisir des transactions sans connexion réseau.

Justification : l'historique des transactions fait partie des jeux de données les plus révélateurs
que possède une personne. La propriété locale est la promesse centrale du produit, pas une option
de configuration, et elle supprime au passage des pans entiers de complexité liés à
l'authentification et au multi-locataire.

### II. L'argent est exact (NON NÉGOCIABLE)

Les montants monétaires DOIVENT être représentés en unités mineures entières (centimes) pour le
stockage, le calcul et le transport. La virgule flottante binaire — un `number` utilisé comme
valeur décimale monétaire, un `parseFloat` sur une saisie utilisateur — NE DOIT PAS être employée
pour un montant stocké, additionné ou comparé. Le formatage en chaîne lisible n'intervient qu'à la
frontière d'affichage, via `Intl.NumberFormat`. Chaque montant DOIT porter une devise explicite ;
les règles d'arrondi DOIVENT être énoncées au point de division ou de répartition, et toute logique
de partage ou de proratisation DOIT redistribuer le reste plutôt que le perdre.

Justification : une dérive silencieuse d'un centime détruit la confiance dans un outil de budget
plus vite que n'importe quelle fonctionnalité manquante, et l'erreur de virgule flottante
n'apparaît qu'une fois le registre déjà faussé.

### III. Tester là où cela compte

Des tests automatisés sont EXIGÉS pour la logique monétaire : tout code qui calcule, agrège,
convertit, répartit ou persiste un montant, ainsi que tout code qui analyse des données
financières importées. Ce code NE DOIT PAS être fusionné sans tests couvrant au minimum le cas
nominal, un cas limite (zéro, négatif et le plus grand montant réaliste) et un cas d'entrée
malformée. Les modifications purement visuelles — mise en page, styles, textes, composants
statiques sans calcul — PEUVENT être livrées sans nouveaux tests. La correction d'une anomalie
dans la logique monétaire DOIT ajouter un test de non-régression reproduisant l'anomalie avant que
le correctif ne soit intégré.

Justification : imposer le TDD partout freinerait l'itération initiale sur l'interface d'un projet
mené seul, alors qu'un registre non testé ne vaut rien. Cibler le contrôle sur le code critique
achète la garantie qui compte à un coût qui sera réellement payé.

### IV. Typage strict et lint sans erreur

Le mode `strict` de TypeScript DOIT rester activé dans `tsconfig.json`. `any`, les assertions de
non-nullité (`!`) et `@ts-expect-error` / `@ts-ignore` NE DOIVENT PAS être introduits sans un
commentaire adjacent expliquant pourquoi aucune alternative typée n'existe. Les données franchissant
une frontière de confiance — fichiers importés, lectures `localStorage` / IndexedDB, réponses d'API,
paramètres d'URL — DOIVENT être validées à l'exécution puis typées à partir du résultat validé,
jamais par transtypage. `npm run build` et `npm run lint` DOIVENT tous deux passer sans aucune
erreur avant qu'une modification soit considérée comme terminée, et les règles de lint NE DOIVENT
PAS être désactivées à l'échelle d'un fichier pour faire passer une modification.

Justification : le système de types est la suite de tests la moins chère disponible, et il ne porte
réellement que si ses échappatoires restent rares et délibérées.

### V. La documentation du framework prime sur la mémoire

Ce projet utilise Next.js 16 avec l'App Router et React 19, dont les API et les conventions diffèrent
de versions antérieures bien plus largement documentées. Avant d'écrire ou de modifier du code
spécifique à Next.js — routage, récupération de données, mise en cache, frontières entre composants
serveur et client, métadonnées, middleware, configuration — le guide pertinent situé sous
`node_modules/next/dist/docs/` DOIT être lu et suivi, et les avis de dépréciation respectés. Les
articles de blog, la mémoire et les motifs hérités de versions antérieures de Next.js NE DOIVENT PAS
prévaloir sur ce qu'énonce la documentation de la version installée.

Justification : le dépôt épingle une version exacte du framework dont le comportement fait autorité
et se lit localement ; deviner à partir d'habitudes périmées produit du code qui semble correct et
échoue à l'exécution ou à la montée de version. Cela reprend la consigne permanente d'`AGENTS.md`.

### VI. Simplicité et YAGNI

Commencer par l'implémentation la plus simple qui satisfait la spécification. Toute dépendance
supplémentaire, couche d'abstraction, bibliothèque de gestion d'état, tâche de fond ou surface de
configuration DOIT être justifiée par un besoin présent et démontré — non anticipé. Une nouvelle
dépendance d'exécution DOIT être justifiée dans la demande de fusion face à l'alternative d'écrire
soi-même la portion nécessaire ou d'utiliser une API de la plateforme. La généralité spéculative —
interfaces à implémentation unique, options que rien ne définit, points d'extension multi-devises ou
multi-utilisateurs avant d'avoir été spécifiés — DOIT être supprimée plutôt que conservée « pour
plus tard ».

Justification : il s'agit d'une application mono-utilisateur, locale d'abord, maintenue par une
seule personne ; chaque abstraction ajoutée trop tôt est une dette de maintenance payée
indéfiniment contre un besoin qui pourrait ne jamais survenir.

### VII. Accessibilité et adaptabilité par défaut

Toute surface interactive DOIT être utilisable au clavier seul avec un indicateur de focus visible,
et DOIT recourir aux éléments HTML sémantiques avant les attributs ARIA. Les champs de formulaire
DOIVENT avoir une étiquette associée, et les états d'erreur DOIVENT être signalés par du texte, non
par la couleur seule. Les textes et les contrôles interactifs DOIVENT respecter le contraste WCAG
2.1 AA dans les deux thèmes, clair et sombre, pris en charge par l'application. Les mises en page
DOIVENT rester utilisables à partir d'une fenêtre de 360 px de large, sans défilement horizontal, et
les données financières chiffrées ou tabulaires DOIVENT rester lisibles à 200 % de zoom navigateur.
Les règles core-web-vitals d'`eslint-config-next` NE DOIVENT PAS être neutralisées pour contourner
ces exigences.

Justification : rattraper l'accessibilité après coup coûte plusieurs fois le prix de sa prise en
compte initiale, et une application de budget se consulte dans l'urgence, sur l'appareil qui se
trouve à portée de main.

### VIII. Le français comme langue du projet

Le français est la langue de travail du projet. DOIVENT être rédigés en français :

- la documentation (README, guides, notes d'architecture, décisions techniques) ;
- les artefacts Spec Kit : spécifications, plans, listes de tâches et listes de contrôle sous
  `specs/` ;
- les commentaires de code, y compris les blocs JSDoc et les commentaires de justification exigés
  par les principes III et IV ;
- les messages de commit et les descriptions de demandes de fusion.

RESTENT en anglais, sans dérogation à demander :

- les identifiants de code — noms de variables, fonctions, types, composants, fichiers et
  répertoires — afin de rester cohérents avec les API du framework et des bibliothèques ;
- les noms de scripts npm, de branches Git et les conventions imposées par les outils ;
- les termes techniques sans équivalent français établi, qui PEUVENT être conservés en anglais entre
  accents graves plutôt que traduits approximativement ;
- les citations et extraits de sources tierces, reproduits dans leur langue d'origine ;
- le bloc d'`AGENTS.md` régénéré automatiquement par `next dev`, qui n'est pas rédigé par le projet.

Un artefact rédigé dans la mauvaise langue DOIT être corrigé avant fusion, au même titre qu'une
erreur de lint.

Justification : le projet est écrit, lu et maintenu en français ; une documentation dans une autre
langue que celle de son unique lecteur ajoute une friction permanente sans contrepartie. Distinguer
explicitement la prose du code évite la dérive inverse — des identifiants traduits qui divergeraient
des API sur lesquelles ils reposent.

## Contraintes techniques et de données

La pile approuvée est Next.js 16 (App Router), React 19, TypeScript 5 en mode strict, Tailwind CSS 4
et ESLint 9 avec `eslint-config-next`. Remplacer l'un de ces fondements ou en ajouter un constitue un
amendement à la présente constitution, et non une demande de fusion ordinaire.

- Le code source réside sous `src/`, importé via l'alias de chemin `@/*` plutôt que par des chemins
  relatifs profonds.
- Les composants serveur sont le défaut ; `"use client"` DOIT être appliqué au composant le plus
  restreint qui nécessite réellement de l'interactivité ou des API navigateur.
- Les choix de persistance DOIVENT satisfaire le principe I. Tout schéma de stockage DOIT être
  versionné dès sa première publication, et un chemin de migration DOIT accompagner toute
  modification d'un schéma pour lequel un utilisateur peut déjà détenir des données. La perte de
  données lors d'une migration n'est jamais acceptable ; une migration en échec DOIT laisser les
  données antérieures intactes.
- L'application DOIT proposer un export, déclenché par l'utilisateur, de l'intégralité de ses données
  budgétaires dans un format documenté et portable, ainsi qu'un import qui restitue fidèlement cet
  export. C'est la porte de sortie qui rend la propriété des données réelle plutôt que nominale.
- Aucun secret NE DOIT être versionné. Tout ce qui est préfixé par `NEXT_PUBLIC_*` est public par
  définition et NE DOIT PAS contenir d'identifiants de connexion.

## Flux de développement et points de contrôle qualité

Le travail sur une fonctionnalité suit le flux Spec Kit — spécification, plan, tâches,
implémentation — avec les artefacts conservés sous `.specify/` et `specs/`. Les spécifications
DOIVENT énoncer explicitement le comportement monétaire attendu (arrondi, devise, conventions de
signe) plutôt que de le laisser à l'implémentation.

Avant qu'une modification soit considérée comme terminée, tout ce qui suit DOIT être vrai :

1. `npm run build` réussit sans aucune erreur TypeScript.
2. `npm run lint` réussit sans aucune erreur.
3. Les tests exigés par le principe III existent et passent.
4. Le comportement visible par l'utilisateur a été vérifié dans l'application en fonctionnement.
5. Aucun code mort, commenté ou laissé en attente ne subsiste.
6. Les artefacts et commentaires produits ou modifiés respectent le principe VIII.

Les commits DOIVENT porter sur une seule modification logique, avec un message indiquant ce qui a
changé et pourquoi. Le bloc d'`AGENTS.md` régénéré par `next dev` est versionné avec le travail
plutôt que supprimé. Les répertoires générés (`.next/`, `node_modules/`) NE DOIVENT PAS être
versionnés.

## Gouvernance

La présente constitution prévaut sur les pratiques ad hoc et les conventions antérieures. Lorsqu'un
réglage par défaut d'un outil, un tutoriel ou un squelette généré entre en conflit avec un principe
énoncé ici, c'est ce document qui l'emporte.

- **Autorité** : toute demande de fusion et toute revue DOIVENT vérifier la conformité aux principes
  ci-dessus. Une modification qui viole un principe DOIT être révisée ou accompagnée d'un amendement
  à la présente constitution — elle NE DOIT PAS être fusionnée sur la base d'une exception non
  documentée.
- **Procédure d'amendement** : un amendement est proposé sous la forme d'une modification de ce
  fichier énonçant le principe concerné, la justification et l'impact de migration sur le code
  existant. Il prend effet à la fusion ; le code violant déjà un principe nouvellement ajouté DOIT
  être consigné comme travail de mise en conformité plutôt que tacitement exempté.
- **Politique de versionnement** : ce document suit le versionnement sémantique. MAJEUR pour la
  suppression ou la redéfinition incompatible d'un principe ; MINEUR pour l'ajout d'un principe ou
  l'extension substantielle d'une règle ; CORRECTIF pour les clarifications, reformulations et
  corrections typographiques qui ne changent pas ce qui est exigé.
- **Revue de conformité** : les principes sont relus au début de l'étape de planification de chaque
  fonctionnalité, et le plan DOIT signaler tout principe qu'il met sous tension. Une complexité qui
  contrevient au principe VI DOIT être justifiée par écrit dans le plan, ou rejetée.
- **Consignes d'exécution** : `AGENTS.md` et `CLAUDE.md` portent les consignes opérationnelles
  quotidiennes destinées aux agents et aux contributeurs. Ils précisent la présente constitution ;
  ils ne la remplacent pas.

**Version** : 1.1.0 | **Ratifiée le** : 2026-09-05 | **Dernière modification** : 2026-09-05
