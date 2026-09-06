# Budget

Application web de budget personnel, mono-utilisateur et **locale d'abord** : vos données
financières ne quittent jamais votre appareil.

Elle répond à une question simple, mois par mois : **combien me reste-t-il une fois mes charges
récurrentes payées ?**

## Fonctionnalités

- **Revenus** ponctuels et récurrents, avec périodicité, date de début et date de fin facultative.
- **Abonnements** mensuels, trimestriels, semestriels ou annuels. Chaque échéance est imputée au
  mois où elle tombe réellement — une assurance annuelle pèse sur son mois, elle n'est pas lissée.
  Un coût mensuel moyen est affiché à titre indicatif, sans jamais entrer dans les totaux.
- **Budget mensuel** : revenus, charges engagées, reste disponible et taux d'engagement, avec
  ventilation des charges du montant le plus élevé au plus faible.
- **Navigation et anticipation** : passage d'un mois à l'autre, projection sur douze mois avec
  signalement des mois déficitaires, liste des prochaines échéances.
- **Cycle de vie des abonnements** : changement de tarif à une date donnée, mise en pause,
  résiliation. L'historique est conservé : les mois antérieurs ne sont jamais réécrits.
- **Saisie des dépenses** en quelques secondes : le montant suffit, la date du jour est appliquée
  par défaut.
- **Anneau du reste mensuel** : ce qu'il vous reste à dépenser d'ici la fin du mois, avec la part
  déjà consommée. Un dépassement s'affiche comme un montant de dépassement, jamais comme un reste
  négatif.
- **Allocation quotidienne fluctuante** : ce que vous pouvez dépenser aujourd'hui, obtenu en
  répartissant le reste du mois sur les jours restants. Dépenser moins qu'un jour augmente les
  suivants ; le report de la veille est affiché comme un gain ou une perte.
- **Journal des dépenses** présenté comme un relevé bancaire : antéchronologique, groupé par jour
  avec sous-totaux, recherche insensible aux accents, filtre par mois.
- **Enveloppes budgétaires** : un plafond de dépense par catégorie et par mois, confronté à la
  dépense réelle. Chaque enveloppe affiche son plafond, son dépensé et son restant, et porte un
  **libellé d'état** — non entamée, maîtrisée, proche du plafond, en dépassement — de sorte que
  retirer la couleur ne fasse rien perdre. L'alerte se déclenche à **85 %** du plafond, comparés
  par multiplication entière et non par division. Un plafond de zéro est valide : il signifie
  « ne rien dépenser ici ».
- **Regroupement « non budgété »** : les dépenses qui ne relèvent d'aucun plafond du mois, qu'il
  s'agisse d'une catégorie non plafonnée ou d'une dépense sans catégorie, avec leur ventilation.
- **Report des plafonds** d'un mois sur le suivant, en une action, avec confirmation avant tout
  remplacement. Les copies sont indépendantes : ajuster un plafond ne touche pas le mois d'origine,
  et les montants dépensés repartent de zéro.
- **Sauvegarde et restauration** : export intégral dans un fichier que vous possédez, et import
  qui le restitue à l'identique, avec confirmation et retour arrière.

## Démarrage

```bash
npm install
npm run dev
```

L'application est disponible sur <http://localhost:3000>.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Construction de production, avec vérification TypeScript |
| `npm run lint` | Analyse statique ESLint |
| `npm run test` | Suite de tests Vitest, une seule passe |
| `npm run test:watch` | Tests en surveillance |

`build`, `lint` et `test` doivent tous passer sans erreur avant qu'une modification soit
considérée comme terminée.

## Où sont mes données ?

Dans le `localStorage` de votre navigateur, sous la clé `budget-app:v1`, au format JSON en
version 3. Elles ne sont transmises à aucun serveur : l'application n'a ni base de données, ni API,
ni télémétrie, et fonctionne entièrement hors ligne.

> La clé nomme l'emplacement, pas la version : celle-ci vit dans le champ `version` du document, et
> la migration est automatique et sans perte. Chaque étape n'ajoute qu'un champ sans jamais en
> retirer, et les étapes se composent : un document en version 1 traverse 1 → 2 → 3 d'affilée.

Conséquences à connaître :

- **Les données sont propres à ce navigateur et à cet appareil.** Vider les données du site les
  efface — d'où l'importance de la sauvegarde décrite ci-dessous.

Si le contenu enregistré devient illisible, l'application ne l'écrase jamais : elle le conserve
sous une clé `budget-app:corrupted:<horodatage>`, redémarre sur un budget vide et vous en informe.

## Sauvegarder et restaurer

La section **Vos données**, en bas de l'application, est votre porte de sortie.

- **Télécharger une sauvegarde** produit un fichier `budget-AAAA-MM-JJ-HHmm.json` contenant
  l'intégralité de vos revenus et abonnements. Le nom comporte la date et l'heure, si bien que
  plusieurs sauvegardes ne se masquent pas entre elles. Rangez-le où vous voulez : il n'est envoyé
  nulle part.
- **Restaurer une sauvegarde** recharge un fichier précédemment téléchargé. Avant tout
  remplacement, un résumé vous indique ce que contient le fichier **et** ce que contient
  l'application, et vous devez confirmer explicitement. Après l'import, un retour en arrière reste
  possible jusqu'à la fermeture de l'application.

L'import **remplace** le contenu actuel, il ne le fusionne pas. Un fichier refusé — mauvais
fichier, version plus récente, contenu abîmé — ne modifie jamais vos données, et le message vous
dit lequel des trois cas s'applique.

Le format du fichier est documenté dans
`specs/004-data-export-import/contracts/fichier-export.md`. Il est lisible dans un éditeur de
texte ; les montants y sont en centimes entiers (2 400,00 € s'écrit `240000`).

## Architecture

Application entièrement cliente à l'intérieur de l'App Router de Next.js 16 : aucun serveur
applicatif, aucune route d'API.

```text
src/
├── app/                      Coquille serveur et styles globaux
├── features/budget/
│   ├── budget-provider.tsx   Frontière cliente : état, chargement, écriture
│   ├── calculs.ts            Logique budgétaire pure — sous obligation de test
│   ├── expenses.ts           Anneau, allocation quotidienne, journal — sous obligation de test
│   ├── envelopes.ts          Plafonds par catégorie, états, alerte — sous obligation de test
│   ├── transfer.ts           Format d'échange : export et import
│   ├── types.ts              Types du domaine
│   └── components/           Interface
└── lib/
    ├── money.ts              Montants en centimes entiers, analyse et formatage
    ├── date.ts               Dates calendaires, échéances, bornes de mois
    ├── format.ts             Formatage des dates et des taux
    ├── download.ts           Téléchargement d'un fichier (API navigateur isolée)
    └── storage.ts            Document versionné, validation, quarantaine
```

Deux règles structurantes :

- **Les montants sont des entiers de centimes**, partout. Aucune valeur monétaire décimale
  n'existe hors de la frontière d'affichage : c'est ce qui garantit l'exactitude au centime.
  L'allocation quotidienne est tronquée au centime inférieur, de sorte que la somme des allocations
  restantes n'excède jamais ce dont vous disposez réellement.
- **Toute donnée lue depuis le stockage est validée à l'exécution** avant d'être typée, jamais
  transtypée.

## Documentation du projet

- `.specify/memory/constitution.md` — les principes qui gouvernent le projet
- `specs/002-income-subscriptions-budget/` — spécification, plan, contrats et tâches de la
  fonctionnalité implémentée ici
- `specs/004-data-export-import/` — spécification, plan et contrats de la sauvegarde
- `specs/003-daily-allowance-dashboard/` — spécification, plan et contrats du tableau de bord
- `specs/001` — fonctionnalité spécifiée, non encore développée

La documentation, les spécifications, les plans et les commentaires de code sont rédigés en
français ; les identifiants de code restent en anglais.
