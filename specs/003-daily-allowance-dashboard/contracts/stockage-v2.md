# Contrat — Document persisté, version 2

**Fonctionnalité** : `003-daily-allowance-dashboard` | **Version du document** : 2

Ce contrat **étend** `specs/002-income-subscriptions-budget/contracts/stockage.md` sans le remplacer.
Tout ce qui n'est pas mentionné ici reste inchangé : emplacement, règles de lecture, quarantaine,
règles d'écriture.

## Ce qui change

| Élément | Version 1 | Version 2 |
| --- | --- | --- |
| `version` | `1` | `2` |
| `incomes` | présent | **inchangé** |
| `subscriptions` | présent | **inchangé** |
| `expenses` | absent | **ajouté**, tableau de dépenses |

La clé de stockage reste `budget-app:v1`. Elle nomme la clé, pas la version du document — celle-ci
vit dans le champ `version`, qui est la seule autorité. Renommer la clé ferait perdre les données
existantes à tous les utilisateurs, ce que la constitution interdit.

## Forme du document

```json
{
  "version": 2,
  "incomes": [],
  "subscriptions": [],
  "expenses": [
    {
      "id": "c4e1…",
      "amountCents": 1240,
      "date": "2026-09-06",
      "label": "Boulangerie",
      "category": "Courses"
    },
    {
      "id": "9a77…",
      "amountCents": 3500,
      "date": "2026-09-05",
      "label": "Pharmacie",
      "category": null
    }
  ]
}
```

`label` peut être absent, `category` peut être `null` ou absente.

## Migration 1 → 2

```text
{ version: 1, incomes, subscriptions }
        ↓
{ version: 2, incomes, subscriptions, expenses: [] }
```

**Purement additive.** `incomes` et `subscriptions` sont repris par référence, sans transformation.
Une migration qui ne modifie rien ne peut rien perdre : c'est la propriété qui rend celle-ci sûre, et
c'est pourquoi il faut résister à la tentation d'en profiter pour « nettoyer » autre chose au passage.

Contraintes en vigueur, héritées de 002 :

- la migration s'exécute **après** validation réussie du document dans sa version d'origine ;
- elle est écrite comme une fonction pure et testée ;
- le document source reste en quarantaine tant qu'elle n'a pas abouti ;
- la version n'est jamais rétrogradée.

## Règles de lecture, rappelées

Inchangées, mais leurs conséquences méritent d'être explicitées pour la version 2 :

| Situation | Comportement |
| --- | --- |
| `version: 1` | Migré vers 2, puis validé. |
| `version: 2` | Validé directement. |
| `version: 3` ou plus | **Quarantaine.** Document écrit par une version plus récente de l'application : l'écraser détruirait des données que celle-ci ne sait pas lire. |
| `expenses` absente d'un document v2 | Document invalide → quarantaine. Après migration, la collection existe toujours, fût-elle vide. |
| Une seule dépense invalide | Le document **entier** est refusé. Aucun import partiel : un document à moitié appliqué produirait des totaux faux sans que l'utilisateur en soit averti. |

## Validation d'une dépense

| Champ | Règle |
| --- | --- |
| `id` | Chaîne non vide, unique **dans le document entier** — revenus et abonnements compris. |
| `amountCents` | Entier strictement positif, dans les bornes du domaine monétaire. |
| `date` | `AAAA-MM-JJ` syntaxiquement et calendairement valide. |
| `label` | Absent, ou chaîne de 1 à 80 caractères après nettoyage. |
| `category` | Absente, `null`, ou chaîne de 1 à 80 caractères. |

## Volume et seuil de bascule

Réexamen mené en décision D3 de [research.md](../research.md) :

| Dépenses | Taille | Verdict |
| --- | --- | --- |
| 2 000 (cible CS-008) | ≈ 240 Ko | Confortable |
| 10 000 | ≈ 1,2 Mo | Limite — **seuil de bascule** |
| 20 000 | ≈ 2,4 Mo | Proche du quota, bascule requise |

Au-delà de 10 000 dépenses, ou si l'écriture devient perceptible à la saisie, passer à IndexedDB avec
écritures partielles. Le champ `version` existe pour rendre cette bascule possible sans perte.

## Effet sur l'export et l'import (fonctionnalité 004)

Un seul point de contact, prévu dès la conception de 004 :

- `FORMAT_VERSION` de `src/features/budget/transfer.ts` passe de **1 à 2** ;
- la table des versions de `specs/004-data-export-import/contracts/fichier-export.md` gagne sa ligne.

**Aucune autre modification.** `parseImport` délègue au `parseDocument` du document, lequel gère
désormais la version 2. Les 43 tests de 004 doivent passer **sans être modifiés** : c'est le contrôle
qui prouve que l'extension était bien additive.

Conséquence favorable : un fichier d'export de format 1 importé dans l'application v2 est accepté et
migré. **EF-024 de la fonctionnalité 004, jusqu'ici sans objet, devient testable** — c'est le
déclencheur annoncé dans l'encadré de son contrat d'export.
