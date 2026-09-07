# Mise en service et validation : stockage centralisé

**Fonctionnalité** : [spec.md](./spec.md) | **Plan** : [plan.md](./plan.md) | **Date** : 2026-09-07

Ce guide sert à **prouver que la fonctionnalité marche**, pas à décrire comment elle est écrite. Les
détails d'implémentation vivent dans [contracts/](./contracts/) et dans `tasks.md`.

---

## Prérequis

- Node.js installé, dépôt cloné, `npm install` déjà passé.
- Deux appareils, ou à défaut deux navigateurs différents sur la même machine — les deux voient le
  même budget, c'est précisément ce que vérifie le récit 1.
- Le serveur et les appareils sur le même réseau privé.

---

## 1. Configuration

### Le secret d'accès

Engendrer un jeton et le placer dans `.env.local`, qui **ne doit jamais être versionné** :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

```bash
# .env.local
BUDGET_ACCESS_TOKEN=<le jeton engendré>
BUDGET_DATA_DIR=./data
```

> Le préfixe `NEXT_PUBLIC_` est **interdit** ici : tout ce qui le porte est public par définition.
>
> **`.gitignore` doit être complété.** À la date de ce plan, `.env*` y figure déjà, mais **`data/`
> n'y figure pas** : en l'état, le répertoire contenant les données financières réelles serait
> versionné au premier `git add`. L'ajout de `data/` est une tâche de la phase de préparation, pas
> une recommandation.

Vérifier que rien ne fuit avant de commiter :

```bash
git check-ignore -v .env.local data/   # doit signaler les deux comme ignorés
git status --porcelain                 # ne doit montrer ni .env.local ni data/
```

### Isolation réseau

Seconde moitié de la protection (voir [contracts/authorization.md](./contracts/authorization.md)) :
le service ne doit **jamais** être exposé à Internet. Au choix, un VPN personnel (Tailscale,
WireGuard) ou une écoute restreinte au réseau local. Le jeton ne dispense pas de cette mesure ; les
deux couches sont complémentaires.

---

## 2. Démarrage

```bash
npm run build && npm start        # ou `npm run dev` en développement
```

Autoriser chaque appareil **une fois** : ouvrir `/authorize`, coller le jeton, valider. L'appareil
est redirigé vers `/` et n'aura plus à le faire.

---

## 3. Contrôles de conformité

À passer avant de considérer la fonctionnalité terminée (constitution, points 1 à 3) :

```bash
npm run build     # aucune erreur TypeScript
npm run lint      # aucune erreur
npm test          # tests du principe III
```

---

## 4. Scénarios de validation

Un scénario par récit, chacun correspondant au « test indépendant » de la spécification. Ils sont
ordonnés par priorité : le premier seul constitue déjà un incrément livrable.

### V1 — Synchronisation entre appareils (récit 1, P1)

**Vérifie** : CS-001, EF-001 à EF-005

1. Sur l'appareil A, saisir une dépense de 12,50 € dans la catégorie « Courses ».
2. Sur l'appareil B, rafraîchir la page.
3. **Attendu** : la dépense apparaît en moins de 5 secondes, à 12,50 € exactement, et les totaux du
   mois sont recalculés en conséquence.
4. Sur B, modifier un plafond d'enveloppe. Rafraîchir A.
5. **Attendu** : la modification est présente sur A.
6. Sur A, supprimer la dépense. Rafraîchir B.
7. **Attendu** : elle a disparu de B.

### V2 — Reprise du budget existant (récit 2, P1)

**Vérifie** : CS-002, CS-009, EF-013 à EF-015

1. Depuis le navigateur détenant le budget actuel, **exporter** avant toute autre manipulation.
2. Noter, à partir du fichier, le nombre d'éléments de chacune des quatre collections et la somme de
   tous les montants.
3. Importer ce fichier dans l'application reliée au stockage central, confirmer le remplacement.
4. **Attendu** : compte par collection et somme des montants **identiques au centime**.
5. Ouvrir depuis un second appareil.
6. **Attendu** : le budget complet s'y trouve, historiques de tarifs et périodes de pause des
   abonnements compris — ce sont eux dont la perte réécrirait des mois passés.

> L'opération doit tenir en moins de 5 minutes et ne demander aucune ressaisie.

### V3 — Hors connexion (récit 3, P2)

**Vérifie** : CS-008, EF-017 à EF-019, EF-012

1. Arrêter le serveur (ou passer l'appareil en mode avion).
2. Ouvrir l'application.
3. **Attendu** : le budget s'affiche tel qu'à la dernière synchronisation, et un message **textuel**
   indique qu'il peut ne pas être à jour. Compréhensible en moins de 5 secondes.
4. Saisir une dépense.
5. **Attendu** : elle est enregistrée et affichée, signalée comme non synchronisée. La saisie n'est
   pas plus lente qu'à l'ordinaire.
6. Redémarrer le serveur, revenir sur l'onglet.
7. **Attendu** : la dépense rejoint le stockage central **sans action** de l'utilisateur.
8. Rafraîchir deux fois de suite.
9. **Attendu** : **aucun doublon** — c'est le point que la poussée idempotente doit garantir.

### V4 — Accès refusé (récit 4, P2)

**Vérifie** : CS-007, EF-020 à EF-022

Depuis un appareil du réseau **non autorisé** :

```bash
curl -i http://<hôte>:3000/api/budget
curl -i -X PUT http://<hôte>:3000/api/budget \
  -H 'Content-Type: application/json' \
  -d '{"baseRevision":0,"document":{"version":3,"incomes":[],"subscriptions":[],"expenses":[],"envelopes":[]}}'
```

**Attendu pour les deux** : `401`, corps `{"error":"unauthorized"}`. Aucun montant, aucune révision,
aucun horodatage, aucune indication qu'un budget existe. Le `PUT` n'a **rien** modifié : le vérifier
depuis un appareil autorisé.

Contrôle de la fermeture par défaut : retirer `BUDGET_ACCESS_TOKEN`, redémarrer, réessayer.
**Attendu** : `401` également. Le serveur ne doit jamais fonctionner ouvert.

### V5 — Redémarrage et contenu illisible (récit 5, P3)

**Vérifie** : CS-006, EF-008

1. Arrêter le serveur, le relancer.
2. **Attendu** : budget intact, au centime.
3. Arrêter le serveur. Remplacer le contenu de `data/budget.json` par `{ ceci n'est pas du JSON`.
4. Relancer et ouvrir l'application.
5. **Attendu** : le fichier abîmé est **conservé** sous `data/budget.corrupted-<horodatage>.json`,
   **jamais écrasé**, et l'application le signale.

### V6 — Conflit entre appareils (EF-024, EF-025)

**Vérifie** : la seule situation où une perte silencieuse serait possible.

1. Ouvrir l'application sur A et sur B, tous deux synchronisés.
2. Couper le réseau de B.
3. Sur A, saisir une dépense — elle part vers le serveur.
4. Sur B, toujours hors connexion, saisir une **autre** dépense.
5. Rétablir le réseau de B.
6. **Attendu** : B **n'écrase pas** silencieusement. Il annonce le conflit et propose deux actions
   explicites, chacune énonçant ce qu'elle fait perdre, plus la possibilité d'exporter avant de
   trancher.
7. Choisir « reprendre la version du serveur ».
8. **Attendu** : B affiche la dépense de A. La saisie de B est perdue — mais l'utilisateur l'a
   décidé, ce qui est exactement la différence que pose EF-025.

### V7 — Non-régression (CS-004, CS-005)

1. Reprendre les scénarios de validation des fonctionnalités 001 à 004 : anneau du reste mensuel,
   allocation quotidienne, journal des dépenses, budget prévisionnel, cycle de vie des abonnements,
   enveloppes, export et import.
2. **Attendu** : comportement identique du point de vue de l'utilisateur.
3. Charger un budget de 5 000 dépenses.
4. **Attendu** : l'application ne paraît pas figée, et la saisie d'une dépense reste réalisable en
   moins de 10 secondes.

---

## 5. Sauvegarde

La sauvegarde du stockage central relève de l'utilisateur, la spécification le pose en hypothèse.
Deux filets, à ne pas confondre :

| Filet | Ce qu'il couvre |
| --- | --- |
| Copie de `data/budget.json` | Panne de la machine, disque perdu. |
| **Export déclenché à la main** | Tout le reste — c'est le format documenté et portable, la porte de sortie qu'exige la constitution. |

L'export reste le filet de référence : il ne dépend ni du serveur, ni de ce plan, ni de cette version
de l'application.
