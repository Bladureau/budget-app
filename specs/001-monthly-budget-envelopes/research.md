# Phase 0 — Recherche et décisions techniques

**Fonctionnalité** : `001-monthly-budget-envelopes` | **Date** : 2026-09-06

Aucun marqueur « NEEDS CLARIFICATION » ne subsistait. Ce document consigne les décisions, leur
justification et les alternatives écartées.

Code relu avant de décider : `src/features/budget/types.ts`, `src/lib/storage.ts`,
`src/features/budget/expenses.ts`, `src/features/budget/transfer.ts`.

---

## D1 — Tout est dérivé sauf le plafond

**Décision** : la seule donnée persistée est le **plafond** : un montant attaché à un couple
(catégorie, mois). Le montant dépensé, le restant, l'état de l'enveloppe, le taux de consommation, le
total non budgété et le nombre d'enveloppes en dépassement sont **tous calculés à la demande** à
partir des dépenses.

**Justification** : c'est la troisième fois que ce projet applique ce principe, et pour la même
raison. Un total stocké peut contredire ses propres composantes ; un total dérivé ne le peut pas.
EF-010 exige d'ailleurs le recalcul à chaque création, modification ou suppression de dépense, **y
compris pour l'ancien et le nouveau mois** lorsqu'une date change — une exigence qui se satisfait
sans effort par dérivation, et qui demanderait une invalidation minutieuse si l'on stockait.

**Alternative écartée** : *un montant dépensé mis en cache par enveloppe* — écartée : aucun besoin de
performance ne le justifie à cette échelle, et l'invalidation serait une source de bogues permanente.

---

## D2 — Seuil d'alerte à 85 %, fixe

**Décision** : une enveloppe passe à l'état « proche du plafond » lorsque le dépensé atteint **85 %**
du plafond sans le dépasser, et à « en dépassement » lorsqu'il l'excède. Le seuil n'est pas
configurable.

**Justification** : la valeur est celle qu'énonce EF-015, retenue par la spécification comme
convention budgétaire courante laissant une marge de réaction exploitable. La rendre configurable
ajouterait un réglage, donc une surface de configuration, sans besoin exprimé — le principe VI s'y
oppose.

**Comparaison en entiers** : le test est `dépensé × 100 >= plafond × 85`, pas `dépensé / plafond >=
0,85`. Multiplier plutôt que diviser évite tout flottant sur une comparaison qui décide d'une alerte.
À l'échelle des montants manipulés, le produit reste très loin des entiers sûrs.

---

## D3 — Une enveloppe référence sa catégorie par son texte

**Décision** : `Envelope.category` est la chaîne de caractères de la catégorie, identique à celle
portée par les dépenses. Aucun identifiant de catégorie, aucune table de catégories.

**Justification** : la fonctionnalité 003 a fait de `Expense.category` une chaîne libre et
facultative, précisément pour ne pas ralentir la saisie. Introduire ici une entité `Category` avec
identifiants supposerait de migrer les dépenses existantes et de construire une gestion de liste —
que la spécification place explicitement hors périmètre.

**Conséquence assumée** : renommer une catégorie dans une dépense la détache de son enveloppe. Le cas
limite anticipé par la spécification devient donc le cas courant. Le traitement retenu :

- une enveloppe dont la catégorie n'apparaît dans **aucune** dépense du mois reste affichée, avec un
  dépensé nul — elle représente une intention, pas une observation ;
- les dépenses dont la catégorie ne correspond à **aucune** enveloppe du mois, y compris celles sans
  catégorie, alimentent le regroupement **« Non budgété »** d'EF-012.

Ce second point donne au regroupement non budgété un rôle plus large que ne l'imaginait la
spécification : il absorbe aussi bien les catégories non plafonnées que les dépenses sans catégorie.
C'est cohérent — dans les deux cas, la dépense n'était pas prévue.

**Comparaison** : sensible à la casse et aux accents. « Courses » et « courses » sont deux catégories
distinctes, comme partout ailleurs dans l'application. Normaliser ici et pas dans le journal créerait
une incohérence plus déroutante que le problème résolu.

**Alternative écartée** : *une entité `Category` avec identifiants stables* — écartée par le principe
VI et par le périmètre de la spécification. À reconsidérer si la gestion des catégories devient une
fonctionnalité à part entière.

---

## D4 — Migration du document en version 3

**Décision** : ajout de la collection `envelopes`, migration **purement additive**, sur le modèle
exact de celle de 003. `migrer()` reçoit son deuxième cas : 2 → 3.

**Justification** : l'additivité est ce qui rend une migration incapable de perdre des données. Le
chemin 1 → 2 → 3 se compose naturellement, un document en version 1 traversant les deux étapes.

**Sous obligation de test** : un document v1 doit migrer jusqu'en v3 sans perdre un revenu, un
abonnement ni une dépense ; un document v2 doit migrer en v3 en conservant ses dépenses.

---

## D5 — Impact sur la fonctionnalité 004 : deuxième vérification

**Décision** : `FORMAT_VERSION` passe de 2 à 3, la table des versions du contrat d'export gagne une
ligne. Rien d'autre.

**Justification** : la fonctionnalité 003 a déjà éprouvé ce point de contact — une seule ligne de
code avait suffi. Cette fonctionnalité le vérifie une seconde fois. Si les tests d'export exigeaient
cette fois davantage qu'une mise à jour de leurs témoins, ce serait le signe que l'extension du
document n'est plus additive, et il faudrait s'arrêter pour comprendre pourquoi.

---

## D6 — Report des plafonds d'un mois sur l'autre

**Décision** : une action copie les plafonds du mois précédent vers le mois consulté. Si le mois cible
en comporte déjà, une **confirmation explicite** est demandée avant remplacement (EF-021). Si le mois
précédent n'en comporte aucun, l'action est indisponible et le dit.

**Justification** : EF-020 et EF-021. La confirmation n'est pas une politesse : la copie remplace, et
sans elle un geste malheureux effacerait un plan déjà ajusté.

**Précision de conception** : la copie duplique les plafonds, elle ne crée pas de lien entre les mois.
Modifier ensuite le plafond d'avril ne touche pas mars. C'est ce qu'exige EF-022 — les mois passés
restent figés — et c'est aussi ce qui rend la copie compréhensible : elle est un point de départ, pas
un abonnement.

---

## D7 — Enveloppe à plafond nul

**Décision** : un plafond de `0` est **valide** et signifie « ne rien dépenser dans cette catégorie ».
Toute dépense y place immédiatement l'enveloppe en dépassement.

**Justification** : cas limite explicite de la spécification. Il impose une exception au motif de
validation employé partout ailleurs dans le projet, où un montant est strictement positif : ici, zéro
est une valeur porteuse de sens, et non l'absence de valeur — laquelle se traduit par l'absence
d'enveloppe.

**Conséquence sur le calcul** : le taux de consommation d'une enveloppe à plafond nul vaut `1` dès
qu'une dépense existe, et `0` sinon. Aucune division par zéro n'est effectuée : le cas est traité
avant.

---

## D8 — Aucune dépendance ajoutée

**Décision** : cette fonctionnalité n'ajoute **aucune** dépendance.

**Justification** : les barres de progression sont des éléments HTML stylés, les calculs sont des
additions, et l'outillage de test existe. Quatrième fonctionnalité consécutive sans ajout.
