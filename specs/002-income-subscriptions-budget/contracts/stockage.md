# Contrat — Document persisté

**Fonctionnalité** : `002-income-subscriptions-budget` | **Version du document** : 1

Ce contrat définit la seule chose que l'application écrit en dehors de sa propre mémoire. Il est
conçu pour être étendu par les fonctionnalités 003 et 001 sans perte de données.

## Emplacement

| Élément | Valeur |
| --- | --- |
| Support | `localStorage` du navigateur |
| Clé principale | `budget-app:v1` |
| Préfixe de quarantaine | `budget-app:corrupted:<horodatage ISO>` |
| Encodage | JSON, UTF-8 |

Aucune autre clé n'est écrite par cette fonctionnalité.

## Forme du document

```json
{
  "version": 1,
  "incomes": [
    {
      "id": "3f2a…",
      "label": "Salaire",
      "amountCents": 240000,
      "kind": "recurring",
      "periodicity": "monthly",
      "startDate": "2026-01-05",
      "endDate": null
    },
    {
      "id": "9c81…",
      "label": "Prime",
      "amountCents": 50000,
      "kind": "oneOff",
      "date": "2026-03-15"
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
  ]
}
```

`version` est le premier champ lu ; il gouverne tout le reste.

## Règles de lecture

1. Clé absente ou valeur vide → état initial vide, aucune écriture, aucune erreur affichée.
2. JSON non analysable → **quarantaine**, puis état initial vide.
3. `version` absente, non entière, ou supérieure à la version connue → **quarantaine**, puis état
   initial vide. Une version supérieure signale un document écrit par une version plus récente de
   l'application : l'écraser détruirait des données que cette version ne sait pas lire.
4. `version` inférieure à la version courante → migration ascendante (voir plus bas).
5. `version` égale à la version courante → validation champ par champ. Toute violation des règles du
   [modèle de données](../data-model.md) invalide le document **entier** → quarantaine, puis état
   initial vide.

La validation est totale, jamais partielle : un document à moitié appliqué produirait des totaux
faux sans que l'utilisateur en soit averti, ce qui est pire qu'un démarrage à vide accompagné d'un
message.

## Quarantaine

Mettre en quarantaine signifie : copier la **valeur brute non modifiée** sous
`budget-app:corrupted:<horodatage ISO>`, puis retirer la clé principale et démarrer sur un état vide.
L'utilisateur est informé par un message expliquant que les données précédentes n'ont pas pu être
lues, qu'elles sont conservées et qu'elles n'ont pas été détruites.

Cette règle applique la contrainte de la constitution : *« une migration en échec DOIT laisser les
données antérieures intactes »*.

## Règles d'écriture

1. L'écriture porte toujours sur le document entier, jamais sur un champ isolé.
2. Le document sérialisé est revalidé avant écriture ; un document invalide n'est jamais écrit.
3. Un échec d'écriture — quota dépassé, stockage indisponible en navigation privée — n'est pas
   silencieux : l'état en mémoire est conservé et un message signale que la modification n'a pas pu
   être enregistrée.
4. Aucune écriture n'a lieu pendant le rendu ; uniquement en réponse à une action utilisateur.

## Migrations

| De | Vers | Règle |
| --- | --- | --- |
| — | 1 | Création initiale : `{ version: 1, incomes: [], subscriptions: [] }`. |
| 1 | 2 | **Réservé à la fonctionnalité 003** : ajout de la collection `expenses`. Migration purement additive — les collections `incomes` et `subscriptions` sont reprises telles quelles, `expenses` est initialisée à vide. |

Contraintes applicables à toute migration future :

- elle est écrite comme une fonction pure `migrate(document, deVersion) → document` et testée, la
  perte de données étant l'anomalie que le principe III vise en priorité ;
- elle ne s'exécute qu'après validation réussie du document source dans sa version d'origine ;
- le document source est conservé en quarantaine tant que la migration n'a pas abouti ;
- la version n'est jamais rétrogradée.

## Notes d'évolution

Le volume attendu pour la version 1 est de quelques kilo-octets, très loin de la limite de
`localStorage`. La fonctionnalité 003 introduira les dépenses, dont le critère CS-008 vise
2 000 entrées : le volume resterait de l'ordre de 300 Ko, acceptable, mais la réécriture intégrale à
chaque saisie devra être réexaminée à ce moment-là — le passage à IndexedDB est la bascule prévue, et
c'est la raison d'être du champ `version`.
