# Contrat — Document persisté, version 3

**Fonctionnalité** : `001-monthly-budget-envelopes` | **Version du document** : 3

Ce contrat **étend** `specs/002-income-subscriptions-budget/contracts/stockage.md` et
`specs/003-daily-allowance-dashboard/contracts/stockage-v2.md`. Tout ce qui n'est pas mentionné ici
reste inchangé : emplacement, règles de lecture, quarantaine, règles d'écriture.

## Ce qui change

| Élément | Version 2 | Version 3 |
| --- | --- | --- |
| `version` | `2` | `3` |
| `incomes`, `subscriptions`, `expenses` | présents | **inchangés** |
| `envelopes` | absent | **ajouté**, tableau de plafonds |

La clé de stockage reste `budget-app:v1`. Elle nomme l'emplacement, pas la version : celle-ci vit
dans le champ `version`, seule autorité. La renommer ferait perdre leurs données à tous les
utilisateurs existants.

## Forme du document

```json
{
  "version": 3,
  "incomes": [],
  "subscriptions": [],
  "expenses": [],
  "envelopes": [
    { "id": "e1a4…", "category": "Courses", "month": "2026-03", "limitCents": 40000 },
    { "id": "b902…", "category": "Transport", "month": "2026-03", "limitCents": 0 }
  ]
}
```

Le second exemple n'est pas une erreur : un plafond à `0` signifie « ne rien dépenser dans cette
catégorie », et toute dépense y place l'enveloppe en dépassement.

## Migration

```text
{ version: 1, incomes, subscriptions }
        ↓  (fonctionnalité 003)
{ version: 2, incomes, subscriptions, expenses: [] }
        ↓  (fonctionnalité 001)
{ version: 3, incomes, subscriptions, expenses, envelopes: [] }
```

**Purement additive à chaque étape.** Un document en version 1 traverse les deux migrations : le
chemin se compose, et chaque étape reprend sans transformation ce qu'elle ne crée pas.

Contraintes en vigueur, héritées : migration après validation réussie de la version d'origine,
fonction pure et testée, quarantaine du document source tant qu'elle n'a pas abouti, version jamais
rétrogradée.

## Validation d'une enveloppe

| Champ | Règle |
| --- | --- |
| `id` | Chaîne non vide, unique **dans le document entier**. |
| `category` | Chaîne de 1 à 80 caractères après nettoyage. |
| `month` | `AAAA-MM` valide. |
| `limitCents` | Entier **`>= 0`**, dans les bornes du domaine monétaire. |

**Invariant supplémentaire** : au plus une enveloppe par couple (`category`, `month`). Un doublon
rend le document invalide.

> `limitCents >= 0` est la seule exception du projet à la règle « un montant est strictement
> positif ». Elle est délibérée : zéro est ici une intention explicite, pas une absence. L'absence
> d'intention se traduit par l'absence d'enveloppe.

## Règles de lecture, rappelées

| Situation | Comportement |
| --- | --- |
| `version: 1` | Migré 1 → 2 → 3, puis validé. |
| `version: 2` | Migré 2 → 3, puis validé. |
| `version: 3` | Validé directement. |
| `version: 4` ou plus | **Quarantaine.** Document écrit par une version plus récente. |
| `envelopes` absente d'un document v3 | Document invalide → quarantaine. |
| Une seule enveloppe invalide | Le document **entier** est refusé. Aucun import partiel. |

## Effet sur l'export et l'import (fonctionnalité 004)

Un seul point de contact, désormais éprouvé une fois par la fonctionnalité 003 :

- `FORMAT_VERSION` de `src/features/budget/transfer.ts` passe de **2 à 3** ;
- la table des versions de `specs/004-data-export-import/contracts/fichier-export.md` gagne sa ligne.

**Aucune autre modification.** Les tests d'export doivent passer sans autre changement que leurs
témoins portés en version 3. Ce sera la **deuxième vérification** que l'export est bien indifférent au
contenu — et s'il fallait cette fois davantage, ce serait le signe que l'extension n'est plus
additive, et qu'il faut s'arrêter pour comprendre pourquoi.

Un fichier d'export de format 1 ou 2 reste accepté et migré à la lecture (EF-024 de 004).
