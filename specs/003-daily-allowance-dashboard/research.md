# Phase 0 — Recherche et décisions techniques

**Fonctionnalité** : `003-daily-allowance-dashboard` | **Date** : 2026-09-06

Aucun marqueur « NEEDS CLARIFICATION » ne subsistait. Ce document consigne les décisions, leur
justification et les alternatives écartées.

Sources : `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`,
`01-app/02-guides/testing/vitest.md`. Code relu avant de décider : `src/lib/storage.ts`,
`src/features/budget/calculs.ts`, `src/features/budget/transfer.ts`, `src/features/budget/types.ts`.

---

## D1 — L'allocation quotidienne est dérivée, jamais stockée

**Décision** : l'allocation d'un jour et le report de la veille sont **calculés à la demande**, à
partir de trois données déjà présentes : le montant disponible du mois, les dépenses antérieures au
jour considéré, et le nombre de jours restants.

```text
allocation(J)   = tronque_au_centime( (disponible − dépensé_avant(J)) ÷ jours_restants(J) )
jours_restants(J) = jours_du_mois − quantième(J) + 1
report(veille)  = allocation(J−1) − dépensé(J−1)
```

**Vérification** : les quatre scénarios chiffrés du récit 3 se reproduisent exactement.

| Scénario de la spécification | Attendu | Obtenu |
| --- | --- | --- |
| 300,00 € sur 10 jours | 30,00 € | 30,00 € |
| 10,00 € dépensés → lendemain | 32,22 € | 32,22 € |
| 80,00 € dépensés → lendemain | 24,44 € | 24,44 € |
| Dernier jour du mois | totalité du reste | totalité du reste |

**Justification** : cette décision supprime une entité persistée entière et, avec elle, une classe de
défauts. Stocker un instantané quotidien supposerait que l'application soit ouverte chaque jour ; les
jours d'absence n'auraient aucun enregistrement et le report afficherait des trous. La dérivation
donne toujours une réponse, y compris pour un mois entier passé sans ouvrir l'application. Elle
respecte aussi la règle du contrat de stockage de 002 selon laquelle aucune écriture n'a lieu en
dehors d'une action utilisateur.

**Conséquence sur la spécification** : **EF-020 doit être amendée.** Elle impose la conservation ; ce
plan ne l'implémente pas et le signale plutôt que de le contourner. Le comportement attendu par les
neuf scénarios d'acceptation du récit 3 est intégralement rendu.

**Effet de bord assumé** : modifier un revenu ou un abonnement en cours de mois recalcule les
allocations passées du mois courant. C'est cohérent avec le reste de l'application, où tous les
totaux sont dérivés, et c'est préférable à un historique qui contredirait ses propres composantes.

**Alternative écartée** : *un instantané quotidien écrit à l'ouverture de l'application* — écarté
pour les trous, pour l'écriture hors action utilisateur, et parce qu'il ferait diverger deux sources
de vérité pour une même valeur.

---

## D2 — Troncature au centime inférieur

**Décision** : l'allocation est tronquée au centime inférieur, pas arrondie au plus proche. En
arithmétique entière : `reste // jours`.

**Justification** : le principe II impose d'énoncer la règle d'arrondi au point de division, et
CS-004 exige que la somme des allocations restantes n'excède **jamais** le montant réellement
disponible. La troncature garantit cette propriété par construction, là où l'arrondi au plus proche
peut promettre plus que ce qui existe.

**Vérification** : propriété testée sur **20 000 tirages aléatoires** (reste de 0 à 5 000,00 €, de 1
à 31 jours), en réallouant chaque jour jusqu'à la fin du mois. **Zéro violation.** Les centimes non
répartis restent dans le montant restant et se redistribuent les jours suivants ; le dernier jour
reçoit la totalité du reliquat, donc rien n'est perdu.

**Alternative écartée** : *arrondi au centime le plus proche* — écarté car il peut faire dépasser la
somme des allocations, ce qui reviendrait à promettre à l'utilisateur de l'argent qu'il n'a pas.

---

## D3 — Stockage : réexamen de `localStorage` promis par la fonctionnalité 002

La décision D3 de 002 annonçait : *« À réexaminer lors de la fonctionnalité 003, dont le critère
CS-008 vise 2 000 dépenses. »* Voici ce réexamen.

**Décision** : **rester sur `localStorage`** pour la version 2 du document, avec un seuil de bascule
documenté.

**Chiffres**. Une dépense sérialisée pèse environ 120 octets (identifiant, montant, date, libellé,
catégorie). Aux volumes qui comptent :

| Dépenses | Taille du document | Écriture par saisie | Verdict |
| --- | --- | --- | --- |
| 2 000 (cible CS-008) | ≈ 240 Ko | quelques millisecondes | Confortable |
| 10 000 (≈ 8 ans d'usage) | ≈ 1,2 Mo | perceptible sur mobile ancien | Limite |
| 20 000 | ≈ 2,4 Mo | proche du quota de 5 Mo | Bascule requise |

**Justification** : à la cible visée, la réécriture intégrale du document à chaque saisie reste
imperceptible, et l'API synchrone maintient toute la logique métier exempte d'asynchronisme — ce qui
garde les tests simples et sert le principe VI. Basculer aujourd'hui sur IndexedDB contaminerait
d'asynchronisme des fonctions aujourd'hui pures, pour un besoin non démontré.

**Seuil de bascule, à consigner** : au-delà de **10 000 dépenses**, ou si l'écriture devient
perceptible à la saisie, passer à IndexedDB avec écritures partielles. Le champ `version` du document
existe précisément pour rendre cette bascule possible sans perte. Ce n'est pas un engagement à le
faire, c'est un critère pour décider.

**Alternative écartée** : *IndexedDB dès maintenant* — écartée par le principe VI. **À réexaminer**
si un usage réel approche les 10 000 dépenses, ou si la fonctionnalité 001 ajoute un volume
comparable.

---

## D4 — Migration du document en version 2

**Décision** : ajout de la collection `expenses`, migration **purement additive**. La fonction
`migrer()` de `src/lib/storage.ts`, aujourd'hui réduite à un passe-plat, reçoit son premier vrai cas :
un document en version 1 est repris tel quel, `expenses` initialisée à vide, `version` portée à 2.

**Justification** : c'est exactement ce que le contrat de stockage de 002 avait réservé. L'additivité
garantit qu'aucune donnée existante n'est touchée — la migration ne peut pas perdre ce qu'elle ne
modifie pas.

**Garde-fous, hérités sans effort** : la validation totale avant écriture, la quarantaine d'un
document illisible et le refus d'une version supérieure sont déjà implémentés et testés. Un document
en version 2 ouvert par une version antérieure de l'application partira en quarantaine plutôt que
d'être écrasé.

**Sous obligation de test** (principe III) : un document v1 réaliste doit migrer sans perdre un seul
revenu ni un seul abonnement, et un document déjà en v2 doit passer inchangé.

---

## D5 — Impact sur la fonctionnalité 004 : un seul point de contact

**Décision** : `FORMAT_VERSION` de `src/features/budget/transfer.ts` passe de 1 à 2, et la table des
versions de `specs/004-data-export-import/contracts/fichier-export.md` gagne une ligne. **Rien
d'autre ne change** dans l'export ni dans l'import.

**Justification** : c'est la validation de la conception de 004, qui avait été écrite pour être
indifférente au contenu. `parseImport` délègue au `parseDocument` du document, lequel gère désormais
la version 2 : l'export et l'import suivent sans y toucher.

**Contrôle** : les 43 tests de 004 doivent continuer à passer **sans modification**. S'ils échouent,
c'est que l'extension du document n'était pas aussi additive qu'annoncé — ce contrôle vaut donc test
de non-régression de l'architecture, pas seulement du code.

**Effet secondaire favorable** : EF-024 de la fonctionnalité 004, jusqu'ici sans objet faute de
version antérieure, **devient testable**. Un fichier de format 1 importé dans l'application v2 doit
être accepté et migré. C'est le déclencheur annoncé dans l'encadré du contrat d'export.

---

## D6 — Journal : pagination incrémentale sans dépendance

**Décision** : le journal affiche une tranche de dépenses (50 par défaut) et en charge davantage
lorsqu'une sentinelle placée en fin de liste devient visible, via `IntersectionObserver`. Aucune
virtualisation, aucune bibliothèque.

**Justification** : EF-028 demande un chargement au fil du défilement, sans pagination explicite. Une
tranche croissante plus un observateur représente une trentaine de lignes ; une bibliothèque de
virtualisation coûterait une dépendance d'exécution pour un gain qui ne se manifeste qu'à plusieurs
milliers d'éléments **affichés simultanément**, ce que la pagination évite précisément.

**Vérification au titre du principe V** : aucune page de la documentation Next.js installée ne traite
de la virtualisation de liste ni d'`IntersectionObserver`. Ce sont des API de plateforme ; la seule
contrainte du framework applicable est celle déjà connue — les API navigateur relèvent des Composants
Client.

**Repli** : si le défilement devient poussif au-delà de quelques centaines d'éléments affichés,
réduire la taille de tranche avant d'envisager une bibliothèque.

**Alternative écartée** : *`react-window` ou `@tanstack/virtual`* — écartées par le principe VI,
faute de besoin démontré à cette échelle.

---

## D7 — Recherche insensible à la casse et aux accents

**Décision** : normalisation Unicode `NFD` avec retrait des diacritiques, puis comparaison en
minuscules :

```text
normaliser(t) = t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr")
```

**Justification** : EF-026 exige que la recherche ignore casse et accents. Sur un corpus français,
« café » doit être trouvé en tapant « cafe » — sans quoi la recherche paraît cassée. `normalize` est
une API de plateforme, aucune dépendance n'est nécessaire.

**Alternative écartée** : *`Intl.Collator` avec `sensitivity: "base"`* — pertinent pour comparer ou
trier, mal adapté à la recherche de sous-chaîne qui est le besoin ici.

---

## D8 — Anneau en SVG inline

**Décision** : l'anneau est un `<circle>` SVG dont le `stroke-dasharray` matérialise la proportion
consommée. Le montant est du texte HTML au centre, pas du texte SVG. La transition est désactivée
sous `prefers-reduced-motion`.

**Justification** : un cercle de progression tient en une vingtaine de lignes de SVG ; une
bibliothèque de graphiques serait injustifiable au regard du principe VI. Garder le montant en HTML
plutôt qu'en `<text>` SVG le rend sélectionnable, correctement mis à l'échelle au zoom, et lisible
par les lecteurs d'écran sans traitement particulier — ce qui sert CS-010.

**Accessibilité** : l'anneau est décoratif (`aria-hidden`), l'information étant intégralement portée
par le texte adjacent. C'est ce qui satisfait CS-009 : retirer la couleur, ou l'anneau lui-même, ne
fait perdre aucune information. En cas de dépassement, le remplissage est plafonné au tour complet
(EF-012).

**Alternative écartée** : *Chart.js, Recharts, ou un `<canvas>`* — écartées : dépendance ou perte
d'accessibilité pour un unique cercle.

---

## D9 — Changement de jour et de mois pendant que l'application est ouverte

**Décision** : la date du jour est rafraîchie par une minuterie qui vérifie le franchissement de
minuit, et le mois consulté bascule si l'utilisateur se trouvait sur le mois courant.

**Justification** : EF-023 l'exige, et le cas est réel — une application de budget reste ouverte dans
un onglet pendant des jours. Sans cela, l'allocation du jour resterait figée sur une date périmée et
afficherait un montant faux, ce qui est pire que de ne rien afficher.

**Précaution** : si l'utilisateur consulte délibérément un autre mois, la bascule ne le déplace pas —
elle ne s'applique qu'à celui qui suit le mois courant.

---

## D10 — Aucune dépendance ajoutée

**Décision** : cette fonctionnalité n'ajoute **aucune** dépendance, ni d'exécution ni de
développement.

**Justification** : anneau en SVG, pagination par `IntersectionObserver`, recherche par `normalize`,
tests par l'outillage existant. Troisième fonctionnalité consécutive sans ajout — le résultat de
décisions prises une par une, pas d'une contrainte de façade.
