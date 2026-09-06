# Plan d'implémentation : Export et import des données budgétaires

**Branche** : `004-data-export-import` | **Date** : 2026-09-06 | **Spécification** : [spec.md](./spec.md)

**Entrée** : spécification de fonctionnalité `specs/004-data-export-import/spec.md`

> Branche Git réelle au moment de la planification : `feat-002-income_and_subscription`. Aucune
> extension Git n'est installée, aucune branche dédiée n'est créée par le flux Spec Kit.

## Résumé

Donner à l'utilisateur la porte de sortie qu'exige la constitution : un export intégral de ses
données dans un fichier qu'il possède, et un import qui le restitue à l'identique.

L'approche technique tient en une phrase : **réutiliser l'analyseur de document déjà écrit pour la
fonctionnalité 002 plutôt que d'en écrire un second.** `parseDocument()` de `src/lib/storage.ts`
valide déjà un document entier depuis `unknown`, refuse toute donnée invalide sans import partiel, et
reconstruit les objets dans un ordre de clés fixe. Cette dernière propriété n'était pas recherchée
pour elle-même, mais elle rend la sérialisation déterministe — et donc la garantie d'aller-retour
octet pour octet (CS-003) atteignable par simple comparaison de chaînes.

Le fichier exporté est le document interne enveloppé dans un en-tête portant un marqueur
d'application, une version de format et un horodatage. Le marqueur est ce qui permet de distinguer
« ce n'est pas un export de cette application » de « c'est un export abîmé » — les deux messages
distincts qu'exige CS-007.

Tout est client : aucun serveur, aucune route d'API, aucun envoi. L'export produit un `Blob`
téléchargé localement ; l'import lit un fichier choisi par l'utilisateur.

## Contexte technique

**Langage / version** : TypeScript 5 en mode `strict`, React 19.2.8

**Dépendances principales** : Next.js 16.3.4 (App Router), React 19, Tailwind CSS 4. **Aucune
dépendance ajoutée**, ni d'exécution ni de développement : l'outillage de test posé par 002 suffit.

**Réutilisé de la fonctionnalité 002** — c'est le cœur du plan :

| Élément existant | Rôle dans 004 |
| --- | --- |
| `parseDocument(unknown)` de `src/lib/storage.ts` | Valide le contenu importé. Aucun second analyseur. |
| `ParseFailure` (`notAnObject`, `unknownVersion`, `futureVersion`, `invalidData`) | Alimente les motifs de refus. |
| `DOCUMENT_VERSION`, `BudgetDocument`, `emptyDocument()` | Forme et version du contenu exporté. |
| `saveDocument()` et sa revalidation avant écriture | Écriture de l'état importé. |
| `BudgetProvider` | Accueille les actions d'export, d'import et de retour arrière. |

**Stockage** : inchangé. L'import écrit par le chemin existant, sous la même clé `budget-app:v1`.
Aucune nouvelle clé persistée : le point de restauration vit en mémoire, pour la session.

**Tests** : Vitest, React Testing Library, jsdom — déjà en place. `File`, `Blob` et `FileReader` sont
fournis par jsdom ; `URL.createObjectURL` ne l'est pas et devra être simulé dans les tests
d'export.

**Plateforme cible** : navigateurs de bureau et mobiles récents. Aucune exécution serveur.

**Type de projet** : ajout à l'application mono-page cliente existante.

**Objectifs de performance** : un fichier représentant trois années de données s'importe sans que
l'interface paraisse figée, avec une indication de traitement visible (CS-009, EF-029).

**Contraintes** : fonctionnement hors ligne (CS-008, EF-027) ; exactitude au centime après
l'aller-retour (CS-004) ; aucune donnée existante modifiée par un import refusé (CS-005) ; retour
arrière en une action (CS-006).

**Échelle / portée** : ordre de grandeur de quelques centaines d'éléments et quelques centaines de
kilo-octets. Le fichier est lu entièrement en mémoire, ce qui est sans risque à cette échelle.

## Contrôle de conformité à la constitution

*BARRIÈRE : doit passer avant la phase 0, puis être réévaluée après la phase 1.*

Évaluation au regard de `.specify/memory/constitution.md` v1.1.0.

| Principe | Statut | Comment il est tenu dans ce plan |
| --- | --- | --- |
| I. Propriété locale des données | ✅ Conforme | Cette fonctionnalité **est** l'expression de ce principe. Le fichier est remis à l'utilisateur et à personne d'autre : aucun envoi réseau, aucun service tiers, fonctionnement hors ligne complet. |
| II. L'argent est exact | ✅ Conforme | Les montants traversent l'aller-retour en entiers de centimes, sans jamais repasser par une valeur décimale. La sérialisation JSON d'un entier est exacte. CS-004 est vérifié par un test d'aller-retour. |
| III. Tester là où cela compte | ✅ Conforme | L'analyse d'un fichier importé persiste des montants : tests obligatoires, avec les six familles de fichiers défectueux d'EF-023 et la garantie d'aller-retour de CS-003. |
| IV. Typage strict et lint sans erreur | ✅ Conforme | Le contenu d'un fichier est une frontière de confiance de plus : il part d'`unknown` et passe par les analyseurs existants, sans transtypage. `build`, `lint` et `test` sans erreur. |
| V. La documentation du framework prime sur la mémoire | ✅ Conforme | Doc relue : `01-getting-started/05-server-and-client-components.md`, qui range les API navigateur du côté client. Aucune page de la version installée ne traite du téléchargement de fichier : c'est une API de plateforme, pas une API Next.js, et aucune Fonction Serveur n'est employée. Consigné en D6 de [research.md](./research.md). |
| VI. Simplicité et YAGNI | ✅ Conforme | Zéro dépendance ajoutée. Aucun second analyseur. Fusion, chiffrement, CSV et sauvegarde planifiée sont écartés par la spécification et ne sont pas préparés par anticipation. |
| VII. Accessibilité et adaptabilité par défaut | ✅ Conforme | Sélecteur de fichier étiqueté, confirmation par case à cocher explicite, états annoncés par du texte, traitement en cours signalé aux lecteurs d'écran. |
| VIII. Le français comme langue du projet | ✅ Conforme | Artefacts et commentaires en français ; identifiants et noms de fichiers en anglais. |

**Verdict avant phase 0** : aucune violation. Suivi de complexité vide.

**Verdict après phase 1** : réévalué, aucune violation introduite. La conception ne persiste aucune
donnée nouvelle, n'ajoute aucune dépendance et ne duplique aucune validation. Voir la note de
réévaluation en fin de [data-model.md](./data-model.md).

## Structure du projet

### Documentation (cette fonctionnalité)

```text
specs/004-data-export-import/
├── spec.md              # Spécification (déjà présente)
├── plan.md              # Ce fichier (sortie de /speckit-plan)
├── research.md          # Sortie de la phase 0
├── data-model.md        # Sortie de la phase 1
├── quickstart.md        # Sortie de la phase 1
├── contracts/           # Sortie de la phase 1
│   ├── fichier-export.md
│   ├── transfert.md
│   └── interface.md
├── checklists/
│   └── requirements.md  # Déjà présente
└── tasks.md             # Sortie de /speckit-tasks — NON créée ici
```

### Code source (racine du dépôt)

Fichiers **ajoutés** par cette fonctionnalité :

```text
src/
├── features/budget/
│   ├── transfer.ts                   # Enveloppe, sérialisation, analyse d'un fichier
│   ├── transfer.test.ts              # Aller-retour, refus, exactitude au centime
│   └── components/
│       ├── data-transfer.tsx         # Section « Vos données » : export et import
│       ├── import-preview.tsx        # Résumé, avertissement, confirmation
│       └── import-report.tsx         # Compte rendu et retour arrière
└── lib/
    ├── download.ts                   # Déclenchement du téléchargement (API navigateur isolée)
    └── download.test.ts
```

Fichiers **modifiés** :

```text
src/
├── features/budget/
│   ├── budget-provider.tsx           # Actions exportData, importDocument, undoImport
│   ├── messages.ts                   # Messages de refus et de compte rendu
│   └── components/budget-view.tsx    # Insertion de la section de transfert
└── app/globals.css                   # Rien de nouveau attendu ; à vérifier seulement
```

**Décision de structure** : le module de transfert vit sous `src/features/budget/` et non sous
`src/lib/`, parce qu'il connaît la forme du document budgétaire — contrairement à `money`, `date` et
`storage` qui sont des primitives. Seul `download.ts` rejoint `src/lib/` : il isole l'unique API
navigateur non testable directement (`URL.createObjectURL`), ce qui garde `transfer.ts`
entièrement pur et donc testable sans simulation.

La frontière `"use client"` reste celle de 002 : les nouveaux composants sont importés depuis
`BudgetProvider` et rejoignent le graphe client sans nouvelle directive.

## Suivi de complexité

> À remplir uniquement si le contrôle de conformité relève des violations à justifier.

Aucune violation relevée. Ce tableau reste vide.

## Séquencement

Cette fonctionnalité est **implémentable immédiatement** : elle ne dépend que du document de données,
qui existe depuis 002.

Elle est **indifférente au contenu** : elle exporte et importe le document quel qu'il soit. Quand 003
portera le document en version 2 en ajoutant les dépenses, l'export et l'import suivront sans
modification, à une exception près — la table des versions de format du contrat
[fichier-export.md](./contracts/fichier-export.md) devra gagner une ligne. C'est le seul point de
contact, et il est délibérément réduit à cela.

Recommandation inchangée : **livrer 004 avant 003**. Chaque semaine où l'application accumule des
données sans porte de sortie est une semaine de risque de perte sèche, que le README signale
aujourd'hui comme une limite connue.
