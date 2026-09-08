# Phase 1 — Modèle de données

**Fonctionnalité** : `004-data-export-import` | **Date** : 2026-09-06

Cette fonctionnalité **ne persiste aucune donnée nouvelle**. Elle transporte le document défini par
la fonctionnalité 002 et manipule des structures éphémères, vivantes le temps d'une opération.

---

## Ce qui n'est pas redéfini

Le contenu transporté est le `BudgetDocument` de `src/features/budget/types.ts`, avec ses `Income` et
ses `Subscription`. Cette fonctionnalité ne connaît pas leur détail et n'a pas à le connaître : elle
délègue leur validation à `parseDocument()`. C'est ce qui la rend valide sans modification lorsque
003 portera le document en version 2.

---

## Entité transportée : `ExportEnvelope`

La seule structure sérialisée. Voir [contracts/fichier-export.md](./contracts/fichier-export.md).

| Champ | Type | Obligatoire | Règles |
| --- | --- | --- | --- |
| `application` | `"budget-app"` | oui | Marqueur d'identification. Toute autre valeur, ou son absence, classe le fichier comme non reconnu (EF-022). |
| `formatVersion` | `number` | oui | Entier `>= 1`. Supérieur à la version connue → refus `futureVersion` (EF-025). |
| `exportedAt` | `string` | oui | Horodatage ISO 8601 en UTC. **Seul champ variable d'un export à l'autre**, donc exclu de la comparaison d'aller-retour (EF-011). |
| `data` | `unknown` → `BudgetDocument` | oui | Contenu confié tel quel à `parseDocument()`. Jamais transtypé. |

`FORMAT_VERSION` vaut **1** et suit la version du document : les deux évoluent ensemble, ce qui évite
une seconde table de compatibilité à tenir.

---

## Entités éphémères

Aucune n'est persistée ; toutes vivent dans l'état React du fournisseur.

### `ImportPreview` — résumé avant remplacement (EF-016)

Présenté à l'utilisateur avant toute écriture, pour qu'il sache ce qu'il charge et ce qu'il perd.

| Champ | Type | Définition |
| --- | --- | --- |
| `exportedAt` | `string` | Date d'export lue dans l'enveloppe, formatée à l'affichage. |
| `incomingIncomes` | `number` | Nombre de revenus dans le fichier. |
| `incomingSubscriptions` | `number` | Nombre d'abonnements dans le fichier. |
| `currentIncomes` | `number` | Nombre de revenus actuellement dans l'application. |
| `currentSubscriptions` | `number` | Nombre d'abonnements actuellement dans l'application. |
| `document` | `BudgetDocument` | Le document validé, retenu en attente de confirmation. |

Les compteurs `current*` ne sont pas décoratifs : l'utilisateur ne peut pas peser un remplacement
sans savoir ce qu'il remplace. Ils rendent visible le cas où l'on écraserait un contenu riche par un
fichier vide — cas limite explicite de la spécification.

### `ImportReport` — compte rendu après import (EF-014)

| Champ | Type | Définition |
| --- | --- | --- |
| `restoredIncomes` | `number` | Revenus restaurés. |
| `restoredSubscriptions` | `number` | Abonnements restaurés. |
| `canUndo` | `boolean` | Vrai tant que le point de restauration de la session est disponible. |

### `RestorePoint` — filet de sécurité (EF-019, EF-020)

| Champ | Type | Définition |
| --- | --- | --- |
| `document` | `BudgetDocument` | L'état antérieur, capturé avant écriture. |

Vit en mémoire uniquement (décision D5). Constitué **avant** l'écriture, jamais après. Effacé au
rechargement de l'application.

### `ImportRefusal` — motif de refus (EF-022, EF-023, EF-025)

```ts
type ImportRefusal = "notAnExport" | "futureVersion" | "corrupted";
```

Trois valeurs, trois messages distincts, trois actions correctives différentes (CS-007). La
correspondance avec les `ParseFailure` existants de `storage.ts` :

| Situation | `ParseFailure` | `ImportRefusal` |
| --- | --- | --- |
| Fichier non analysable en JSON | — | `notAnExport` |
| `application` absent ou différent | — | `notAnExport` |
| `formatVersion` trop récente | — | `futureVersion` |
| `data` refusé, marqueur correct | `notAnObject`, `unknownVersion`, `invalidData` | `corrupted` |
| `data.version` trop récente | `futureVersion` | `futureVersion` |

---

## Flux et états

```text
                  ┌──────────┐
                  │  repos   │
                  └────┬─────┘
     exporter          │          choisir un fichier
   ┌───────────────────┴────────────────────┐
   ▼                                        ▼
┌────────────┐                       ┌──────────────┐
│ fichier    │                       │  lecture en  │──── refus ───▶ ┌──────────┐
│ téléchargé │                       │    cours     │                │  refusé  │
└────────────┘                       └──────┬───────┘                └────┬─────┘
                                            │ validé                      │ aucune
                                            ▼                             │ donnée
                                     ┌──────────────┐    annuler          │ modifiée
                                     │   aperçu     │─────────────┐       │
                                     │ (avant tout  │             │       │
                                     │ remplacement)│             ▼       ▼
                                     └──────┬───────┘        ┌──────────┐
                                            │ confirmer      │  repos   │
                                            ▼                └──────────┘
                                     ┌──────────────┐              ▲
                                     │  importé     │── annuler ───┘
                                     │ + point de   │   l'import
                                     │ restauration │
                                     └──────────────┘
```

Deux propriétés du diagramme méritent d'être énoncées, parce qu'elles sont la raison d'être des trois
quarts des exigences :

1. **Aucune flèche ne va de « lecture en cours » ou « refusé » vers une écriture.** Un fichier
   refusé ne touche jamais les données (EF-026, CS-005).
2. **L'écriture n'a lieu qu'après « confirmer ».** Il n'existe aucun chemin de l'ouverture d'un
   fichier au remplacement sans passage par l'aperçu (EF-017).

---

## Règles de validation

Dans l'ordre, chacune arrêtant le traitement :

1. Le fichier est analysable en JSON — sinon `notAnExport`.
2. La racine est un objet et `application === "budget-app"` — sinon `notAnExport`.
3. `formatVersion` est un entier `>= 1` et `<= FORMAT_VERSION` — sinon `futureVersion`.
4. `data` est accepté par `parseDocument()` — sinon `corrupted`.
5. `exportedAt` est une chaîne. Une valeur absente ou illisible **n'invalide pas** le fichier : la
   date d'export est un confort d'affichage, pas une donnée budgétaire. L'aperçu indique alors une
   date inconnue.

La règle 5 est le seul assouplissement délibéré : refuser des données financières intactes à cause
d'un horodatage abîmé serait une perte disproportionnée.

---

## Réévaluation du contrôle de conformité après conception

- **Principe I** — tenu : aucune structure ne comporte de destination, d'identifiant de service ou
  d'adresse. Le fichier ne va nulle part ailleurs que là où l'utilisateur le range.
- **Principe II** — tenu : les montants traversent l'aller-retour en entiers, sans jamais repasser
  par une valeur décimale. `JSON.stringify` d'un entier est exact et `JSON.parse` le restitue tel
  quel.
- **Principe III** — la surface sous obligation de test est `transfer.ts` en entier : elle analyse et
  persiste des montants.
- **Principe IV** — `data` est déclaré `unknown` jusqu'à validation ; aucun `as` sur le contenu.
- **Principe VI** — aucune entité persistée nouvelle, aucun champ anticipant la fusion, le
  chiffrement ou l'export partiel. `RestorePoint` ne contient qu'un document, pas d'historique.

Aucune violation introduite. Le tableau de suivi de complexité du plan reste vide.
