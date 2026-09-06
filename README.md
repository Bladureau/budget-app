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

Dans le `localStorage` de votre navigateur, sous la clé `budget-app:v1`, au format JSON. Elles ne
sont transmises à aucun serveur : l'application n'a ni base de données, ni API, ni télémétrie, et
fonctionne entièrement hors ligne.

Conséquences à connaître :

- **Les données sont propres à ce navigateur et à cet appareil.** Vider les données du site les
  efface.
- **Il n'y a pas encore d'export ni de sauvegarde.** Cette fonctionnalité est spécifiée
  (`specs/004-data-export-import/`) mais pas encore développée.

Si le contenu enregistré devient illisible, l'application ne l'écrase jamais : elle le conserve
sous une clé `budget-app:corrupted:<horodatage>`, redémarre sur un budget vide et vous en informe.

## Architecture

Application entièrement cliente à l'intérieur de l'App Router de Next.js 16 : aucun serveur
applicatif, aucune route d'API.

```text
src/
├── app/                      Coquille serveur et styles globaux
├── features/budget/
│   ├── budget-provider.tsx   Frontière cliente : état, chargement, écriture
│   ├── calculs.ts            Logique budgétaire pure — sous obligation de test
│   ├── types.ts              Types du domaine
│   └── components/           Interface
└── lib/
    ├── money.ts              Montants en centimes entiers, analyse et formatage
    ├── date.ts               Dates calendaires, échéances, bornes de mois
    ├── format.ts             Formatage des dates et des taux
    └── storage.ts            Document versionné, validation, quarantaine
```

Deux règles structurantes :

- **Les montants sont des entiers de centimes**, partout. Aucune valeur monétaire décimale
  n'existe hors de la frontière d'affichage : c'est ce qui garantit l'exactitude au centime.
- **Toute donnée lue depuis le stockage est validée à l'exécution** avant d'être typée, jamais
  transtypée.

## Documentation du projet

- `.specify/memory/constitution.md` — les principes qui gouvernent le projet
- `specs/002-income-subscriptions-budget/` — spécification, plan, contrats et tâches de la
  fonctionnalité implémentée ici
- `specs/001`, `specs/003`, `specs/004` — fonctionnalités spécifiées, non encore développées

La documentation, les spécifications, les plans et les commentaires de code sont rédigés en
français ; les identifiants de code restent en anglais.
