# Contrat : stockage et export

**Fonctionnalité** : `specs/008-savings-reserve` | **Date** : 2026-10-03

Complète `specs/002-income-subscriptions-budget/contracts/stockage.md` et les contrats de 004 à
006. Aucun point d'entrée serveur n'est ajouté ni modifié : le serveur lit et écrit le document
par `parseDocument`, qui porte seul la nouveauté.

## 1. Document, version 5

```json
{
  "version": 5,
  "incomes": [],
  "subscriptions": [],
  "expenses": [],
  "envelopes": [],
  "refunds": [],
  "banking": { "…": "inchangé" },
  "reserve": [
    { "fromMonth": "2026-10", "kind": "open", "balanceCents": 600000, "months": 12 },
    { "fromMonth": "2027-02", "kind": "closed" }
  ]
}
```

## 2. Validation de `reserve`

Le document est refusé (`invalidData`) si :

| Règle | Exemple refusé |
| --- | --- |
| `reserve` n'est pas un tableau | `"reserve": null`, champ absent en version 5 |
| un élément n'est pas un objet | `[42]` |
| `fromMonth` n'est pas un mois valide | `"2026-13"`, `"2026-10-01"` |
| `kind` n'est ni `"open"` ni `"closed"` | `"kind": "paused"` |
| `open` : `balanceCents` non entier, négatif ou supérieur à 9 000 000 000 | `12.5`, `-1`, `"600000"` |
| `open` : `months` non entier, inférieur à 1 ou supérieur à 120 | `0`, `1.5`, `121` |
| les `fromMonth` ne sont pas strictement croissants | deux déclarations en `2026-10` ; ordre inversé |

Les champs inconnus d'une déclaration sont ignorés et non réécrits, comme pour les autres entités.

## 3. Migration

| Depuis | Étapes |
| --- | --- |
| 1, 2, 3 | Étapes existantes jusqu'à 4, puis 4 → 5. |
| 4 | Ajout de `"reserve": []`, `version: 5`. Rien d'autre ne change. |
| 5 | Aucune. |
| > 5 | Refus `futureVersion` : le document n'est ni lu ni écrasé (comportement existant). |

Une migration en échec laisse les données antérieures intactes (mise en quarantaine existante).

## 4. Export / import

- `formatVersion` : 5.
- Un export 5 restitue `reserve` à l'identique (FR-024).
- Un export 1 à 4 s'importe ; la réserve est vide (FR-025).
- Un export de format supérieur est refusé avec le message « version postérieure » existant.

## 5. Synchronisation

Aucun changement de protocole. Déclarer, recaler et retirer sont des mutations ordinaires :
elles avancent la révision, et un conflit se résout par le dialogue existant.
