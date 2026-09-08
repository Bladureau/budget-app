# Contrat — Fichier d'export

**Fonctionnalité** : `004-data-export-import` | **Version de format** : 2

Ce document **est** la documentation du format exigée par la constitution : « un format documenté et
portable ». Il fait partie de la livraison, au même titre que le code.

## Identité du fichier

| Élément | Valeur |
| --- | --- |
| Type | JSON, UTF-8 |
| Extension | `.json` |
| Nom proposé | `budget-AAAA-MM-JJ-HHmm.json`, en heure locale |
| Marqueur | champ racine `application` valant `"budget-app"` |

Le nom comporte date et heure pour que deux sauvegardes ne se masquent pas (EF-005), et se trie
chronologiquement par ordre alphabétique dans un explorateur de fichiers.

## Structure

```json
{
  "application": "budget-app",
  "formatVersion": 3,
  "exportedAt": "2026-09-06T09:12:33.000Z",
  "data": {
    "version": 3,
    "incomes": [
      {
        "id": "3f2a…",
        "label": "Salaire",
        "amountCents": 240000,
        "kind": "recurring",
        "periodicity": "monthly",
        "startDate": "2026-01-05",
        "endDate": null
      }
    ],
    "subscriptions": [
      {
        "id": "b7d4…",
        "label": "Assurance habitation",
        "periodicity": "annual",
        "startDate": "2026-09-10",
        "endDate": null,
        "amounts": [{ "amountCents": 12000, "effectiveFrom": "2026-09-10" }],
        "pauses": []
      }
    ],
    "expenses": [
      {
        "id": "c4e1…",
        "amountCents": 1240,
        "date": "2026-09-06",
        "label": "Boulangerie",
        "category": "Courses"
      }
    ],
    "envelopes": [
      {
        "id": "9a52…",
        "category": "Courses",
        "month": "2026-09",
        "limitCents": 40000
      }
    ]
  }
}
```

### En-tête

| Champ | Rôle |
| --- | --- |
| `application` | Identifie l'origine du fichier. C'est lui qui permet de distinguer un fichier étranger d'un export abîmé, et donc de produire deux messages de refus différents. |
| `formatVersion` | Version de ce contrat. Un fichier de version supérieure est refusé sans être ouvert plus avant. |
| `exportedAt` | Date et heure de l'export, en UTC. **Seul champ qui change d'un export à l'autre à données constantes** ; il est donc exclu de toute comparaison d'identité. |

### Contenu

`data` est le document budgétaire tel que défini par
`specs/002-income-subscriptions-budget/contracts/stockage.md`, étendu par
`specs/003-daily-allowance-dashboard/contracts/stockage-v2.md`. Ce contrat ne le redécrit pas : il
s'y réfère, pour qu'une seule définition fasse foi.

**Lisibilité** (EF-003) : le JSON est indenté de deux espaces. Un fichier lisible dans un éditeur de
texte est ce qui rend la portabilité réelle plutôt que théorique — l'utilisateur peut constater de
ses yeux ce que contient sa sauvegarde.

## Montants

Les montants sont des **entiers de centimes**, comme partout dans l'application : `240000` vaut
2 400,00 €. Cette convention est la raison pour laquelle l'aller-retour est exact au centime
(CS-004) : aucune valeur décimale n'existe dans le fichier, donc aucun arrondi ne peut survenir à la
lecture.

Quiconque lit ce fichier hors de l'application doit le savoir : **diviser par 100 pour obtenir des
euros**.

## Garantie d'aller-retour

Pour deux exports encadrant un import du premier, les champs `data` sérialisés sont **identiques
octet pour octet** (EF-011, CS-003).

Cette garantie repose sur une propriété de `parseDocument()` : il ne propage pas l'objet reçu, il en
reconstruit un nouveau champ par champ, dans un ordre de clés fixe. L'ordre des clés du fichier
d'entrée n'a donc aucun effet sur la sortie.

Elle ne couvre volontairement pas `exportedAt`, qui diffère par construction.

## Versions de format

| Version | Contenu | Statut |
| --- | --- | --- |
| 1 | `data` en version 1 : revenus et abonnements | Acceptée, migrée à la lecture |
| 2 | `data` en version 2 : ajout des dépenses. Ajout purement additif ; la migration ascendante est celle du document. | Acceptée, migrée à la lecture |
| 3 | `data` en version 3 : ajout des enveloppes budgétaires. Ajout purement additif, comme le précédent. | **Courante** |

> **EF-024 est active depuis la fonctionnalité 003**, qui a porté le document en version 2. Un
> fichier d'export de format 1 est accepté et son contenu migré à la lecture, sans perte. Le
> comportement est couvert par les tests de `src/features/budget/transfer.test.ts`.
>
> **Étendu à la version 3 par la fonctionnalité 001.** Un fichier de format 1 traverse désormais
> **deux** migrations d'affilée avant d'être relu. Le passage en version 3 n'a demandé aucune
> modification du code d'export ni d'import — seulement le report du numéro et la mise à jour des
> témoins de test. C'est la deuxième vérification, après 003, que ce contrat est bien indifférent
> au contenu du document.

Règles applicables à toute version future :

- une version **inférieure** est acceptée et migrée par le chemin de migration du document (EF-024) ;
- une version **supérieure** est refusée, avec un message expliquant que le fichier provient d'une
  version plus récente de l'application (EF-025) ;
- la version de format suit celle du document : les deux avancent ensemble, ce qui évite d'entretenir
  une seconde table de compatibilité.

## Ce que le fichier ne contient pas

Énoncé explicitement, parce que l'absence est ici une garantie :

- **aucune donnée de télémétrie**, aucun identifiant d'appareil, aucune adresse ;
- **aucun secret**, aucun jeton, aucun identifiant de connexion ;
- **aucune donnée dérivée** — totaux mensuels, restes disponibles, échéances projetées sont tous
  recalculés à la lecture, jamais transportés. Un total transporté pourrait contredire ses propres
  composantes ; recalculé, il ne le peut pas.
