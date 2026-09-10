# Budget

Application web de budget personnel, mono-utilisateur et **locale d'abord** : vos données
financières ne quittent jamais les machines que vous possédez — votre navigateur, et le serveur que
vous hébergez vous-même pour les retrouver sur tous vos appareils.

Elle répond à une question simple, mois par mois : **combien me reste-t-il une fois mes charges
récurrentes payées ?**

## Fonctionnalités

- **Revenus** ponctuels et récurrents, avec périodicité, date de début et date de fin facultative.
- **Abonnements** mensuels, trimestriels, semestriels ou annuels. Chaque échéance est imputée au
  mois où elle tombe réellement — une assurance annuelle pèse sur son mois, elle n'est pas lissée.
  Un coût mensuel moyen est affiché à titre indicatif, sans jamais entrer dans les totaux.
- **Budget mensuel** : revenus, charges engagées, reste disponible et taux d'engagement, avec
  ventilation des charges du montant le plus élevé au plus faible.
- **Navigation et anticipation** : passage d'un mois à l'autre, projection sur douze mois avec
  signalement des mois déficitaires, liste des prochaines échéances.
- **Cycle de vie des abonnements** : changement de tarif à une date donnée, mise en pause,
  résiliation. L'historique est conservé : les mois antérieurs ne sont jamais réécrits.
- **Saisie des dépenses** en quelques secondes : le montant suffit, la date du jour est appliquée
  par défaut.
- **Anneau du reste mensuel** : ce qu'il vous reste à dépenser d'ici la fin du mois, avec la part
  déjà consommée. Un dépassement s'affiche comme un montant de dépassement, jamais comme un reste
  négatif.
- **Allocation quotidienne fluctuante** : ce que vous pouvez dépenser aujourd'hui, obtenu en
  répartissant le reste du mois sur les jours restants. Dépenser moins qu'un jour augmente les
  suivants ; le report de la veille est affiché comme un gain ou une perte.
- **Journal des dépenses** présenté comme un relevé bancaire : antéchronologique, groupé par jour
  avec sous-totaux, recherche insensible aux accents, filtre par mois.
- **Enveloppes budgétaires** : un plafond de dépense par catégorie et par mois, confronté à la
  dépense réelle. Chaque enveloppe affiche son plafond, son dépensé et son restant, et porte un
  **libellé d'état** — non entamée, maîtrisée, proche du plafond, en dépassement — de sorte que
  retirer la couleur ne fasse rien perdre. L'alerte se déclenche à **85 %** du plafond, comparés
  par multiplication entière et non par division. Un plafond de zéro est valide : il signifie
  « ne rien dépenser ici ».
- **Regroupement « non budgété »** : les dépenses qui ne relèvent d'aucun plafond du mois, qu'il
  s'agisse d'une catégorie non plafonnée ou d'une dépense sans catégorie, avec leur ventilation.
- **Report des plafonds** d'un mois sur le suivant, en une action, avec confirmation avant tout
  remplacement. Les copies sont indépendantes : ajuster un plafond ne touche pas le mois d'origine,
  et les montants dépensés repartent de zéro.
- **Sauvegarde et restauration** : export intégral dans un fichier que vous possédez, et import
  qui le restitue à l'identique, avec confirmation et retour arrière.
- **Synchronisation entre appareils** : le budget vit sur un serveur que vous hébergez, et se
  retrouve identique sur votre ordinateur et votre téléphone. **Hors connexion, tout continue de
  fonctionner** : vous consultez et vous saisissez, et ce qui n'est pas encore parti est signalé
  puis synchronisé de lui-même au retour du réseau. Si deux appareils ont modifié le budget sans
  s'être vus, rien n'est écrasé en silence — c'est vous qui tranchez.

## Démarrage

```bash
npm install
npm run dev
```

L'application est disponible sur <http://localhost:3000>.

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` | Construction de production, avec vérification TypeScript |
| `npm run lint` | Analyse statique ESLint |
| `npm run test` | Suite de tests Vitest, une seule passe |
| `npm run test:watch` | Tests en surveillance |

`build`, `lint` et `test` doivent tous passer sans erreur avant qu'une modification soit
considérée comme terminée.

## Configuration du stockage central

Le stockage central (fonctionnalité 005) se configure par deux variables d'environnement, à placer
dans `.env.local` :

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `BUDGET_ACCESS_TOKEN` | Secret autorisant un appareil. **Obligatoire** : sans lui, l'API refuse tout accès. 32 caractères au minimum. | *(aucun)* |
| `BUDGET_DATA_DIR` | Répertoire où le serveur écrit le budget. | `./data` |

Engendrer un jeton :

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

> **Aucun fichier `.env.example` n'est fourni**, et ce n'est pas un oubli : `.gitignore` couvre
> `.env*` en entier, si bien qu'un tel fichier serait ignoré et ne documenterait rien. Le tableau
> ci-dessus tient ce rôle.
>
> Le préfixe `NEXT_PUBLIC_` est **interdit** pour ces deux variables : tout ce qui le porte est
> exposé au navigateur. Le répertoire `data/` est lui aussi ignoré par Git — il contient votre
> budget réel.

## Protéger l'accès

Le budget est désormais joignable par le réseau : c'est le risque **créé** par la synchronisation.
Deux couches le couvrent, et **aucune ne remplace l'autre**.

1. **Isolation réseau.** Le service ne doit écouter que sur votre réseau privé ou votre VPN
   (Tailscale, WireGuard). **Ne l'exposez jamais à Internet.** Cette couche relève de votre
   déploiement, pas du code.
2. **Jeton d'appareil.** Chaque appareil échange une fois `BUDGET_ACCESS_TOKEN` contre un cookie
   `httpOnly`, en ouvrant `/authorize`. Toute requête d'API vérifie ce cookie.

Sans jeton valide, l'API répond `401` et ne divulgue rien — ni montant, ni horodatage, ni même
l'existence d'un budget. Et si `BUDGET_ACCESS_TOKEN` n'est pas configuré, **tout accès est refusé** :
une erreur de configuration rend l'application inutilisable, jamais publique.

Il n'y a ni compte, ni profil, ni mot de passe utilisateur. Le jeton autorise un appareil ; il
n'identifie personne.

## Héberger sur un NAS ou un petit serveur

### Avec Docker

Aucune installation de Node n'est nécessaire sur le serveur.

```bash
# Sur le serveur, à la racine du projet
echo "BUDGET_ACCESS_TOKEN=<votre jeton>" > .env
docker compose up -d --build
```

L'application écoute sur `127.0.0.1:3000` — **seulement** sur la boucle locale, jamais sur le
réseau. C'est votre proxy inverse qui décide de l'exposition, et lui seul.

Le budget vit dans le volume Docker `budget-data`, jamais dans l'image. Reconstruire l'image
n'efface rien.

```bash
docker compose logs -f budget          # journal
docker compose exec budget cat /data/budget.json   # état du stockage
docker run --rm -v budget-app_budget-data:/d -v "$PWD":/s alpine \
  cp /d/budget.json /s/sauvegarde.json               # copie de sauvegarde
```

### Exposer sur le tailnet, et nulle part ailleurs

Voir [`deploy/Caddyfile.exemple`](deploy/Caddyfile.exemple), qui documente la configuration
Caddy — l'essentiel tenant dans la directive `bind` sur l'adresse Tailscale du serveur.

Plus simple encore, si Caddy ne vous sert pas déjà à autre chose :

```bash
sudo tailscale serve --bg --https=443 http://127.0.0.1:3000
```

Vrai certificat, renouvelé seul, joignable du seul tailnet. **N'activez jamais `tailscale
funnel`** sur ce service : il le publierait sur Internet.

### Sans Docker

```bash
npm run build && npm start
```

### À vérifier dans les deux cas

| Point | Pourquoi |
| --- | --- |
| **Une seule instance** | Le verrou qui sérialise les écritures est en mémoire. Un conteneur, pas deux, pas de réplication. |
| **`BUDGET_DATA_DIR` sur un disque local** | Pas sur un partage SMB/NFS monté : l'écriture atomique repose sur un `rename` dans le même système de fichiers, et un partage réseau n'en garantit ni l'atomicité ni la durabilité. |
| **Node 20 ou plus** | Exigé par Next.js 16. |
| **Le jeton en variable d'environnement** | Jamais dans une image ni dans un `docker-compose.yml` versionné. |
| **`data/budget.json` dans les sauvegardes** | Et gardez l'export manuel : lui seul reste lisible si la machine disparaît. |
| **Aucune redirection de port** | Un VPN personnel (Tailscale, WireGuard) plutôt qu'une ouverture sur Internet. |

Le cookie d'accès est marqué `Secure` **uniquement si la requête a réellement été servie en
HTTPS**, ce que l'application déduit de l'en-tête `x-forwarded-proto`. C'est délibéré : un
navigateur refuse un cookie `Secure` reçu en HTTP, et l'y forcer rendrait toute autorisation
impossible sur une installation en HTTP simple. Vous n'avez donc rien à régler dans les deux cas —
mais si vous pouvez servir en HTTPS (`tailscale serve` le fait avec un vrai certificat), faites-le :
le cookie sera protégé sans que vous ayez à y penser.

## Où sont mes données ?

À deux endroits, et la distinction compte.

- **Dans le `localStorage` de votre navigateur**, sous la clé `budget-app:v1`, au format JSON en
  version 3. C'est la **copie de travail** : elle est lue et écrite immédiatement, ce qui rend
  l'application utilisable hors connexion et empêche le réseau de ralentir une saisie.
- **Dans `data/budget.json` sur votre serveur**, la **référence partagée** entre vos appareils.

Elles ne sont transmises à **aucun service tiers** : le serveur est le vôtre. L'application n'a ni
télémétrie, ni analyse d'audience.

> **Hors connexion**, l'application continue d'afficher et d'enregistrer. Ce qui n'est pas encore
> parti est signalé en toutes lettres, et rejoint le serveur dès son retour, sans action de votre
> part et sans doublon.
>
> **Si deux appareils modifient le budget sans s'être vus**, rien n'est écrasé en silence :
> l'application vous présente les deux versions et vous demande laquelle garder.
>
> La clé nomme l'emplacement, pas la version : celle-ci vit dans le champ `version` du document, et
> la migration est automatique et sans perte. Chaque étape n'ajoute qu'un champ sans jamais en
> retirer, et les étapes se composent : un document en version 1 traverse 1 → 2 → 3 d'affilée.

Conséquences à connaître :

- **Vider les données du site n'efface plus votre budget** : il reste sur le serveur, et le
  navigateur le retrouvera à la prochaine synchronisation. En revanche, **effacer
  `data/budget.json` l'efface pour de bon** — c'est désormais lui qui fait référence.
- **Un budget saisi hors connexion et jamais synchronisé n'existe que dans ce navigateur.**
  L'application vous le signale tant que c'est le cas.

**Un contenu illisible n'est jamais écrasé**, ni d'un côté ni de l'autre : le navigateur le conserve
sous une clé `budget-app:corrupted:<horodatage>`, le serveur sous un fichier
`data/budget.corrupted-<horodatage>.json`. Dans les deux cas l'application redémarre sur un budget
vide et vous en informe.

Un fichier central écrit par une **version plus récente** de l'application n'est ni lu ni déplacé :
mettez l'application à jour plutôt que d'enregistrer par-dessus.

## Sauvegarder et restaurer

La section **Vos données**, en bas de l'application, est votre porte de sortie.

- **Télécharger une sauvegarde** produit un fichier `budget-AAAA-MM-JJ-HHmm.json` contenant
  l'intégralité de vos revenus et abonnements. Le nom comporte la date et l'heure, si bien que
  plusieurs sauvegardes ne se masquent pas entre elles. Rangez-le où vous voulez : il n'est envoyé
  nulle part.
- **Restaurer une sauvegarde** recharge un fichier précédemment téléchargé. Avant tout
  remplacement, un résumé vous indique ce que contient le fichier **et** ce que contient
  l'application, et vous devez confirmer explicitement. Après l'import, un retour en arrière reste
  possible jusqu'à la fermeture de l'application.

L'import **remplace** le contenu actuel, il ne le fusionne pas. Un fichier refusé — mauvais
fichier, version plus récente, contenu abîmé — ne modifie jamais vos données, et le message vous
dit lequel des trois cas s'applique.

Le format du fichier est documenté dans
`specs/004-data-export-import/contracts/fichier-export.md`. Il est lisible dans un éditeur de
texte ; les montants y sont en centimes entiers (2 400,00 € s'écrit `240000`).

### Sauvegarder le stockage central

La centralisation crée un point de défaillance unique là où il n'y en avait pas. Deux filets, à ne
pas confondre :

| Filet | Ce qu'il couvre |
| --- | --- |
| Copie de `data/budget.json` | Panne de la machine, disque perdu. |
| **Export déclenché à la main** | Tout le reste. |

L'**export reste le filet de référence** : il ne dépend ni du serveur, ni de sa configuration, ni
même de cette version de l'application. C'est le seul qui garantisse que vos données vous restent
lisibles si tout le reste disparaît.

### Reprendre un budget déjà présent dans un navigateur

Exportez depuis le navigateur qui détient le budget, puis importez dans l'application reliée au
serveur : l'import emprunte le chemin d'écriture ordinaire et atteint donc le stockage central sans
ressaisie. Vérifiez ensuite depuis un second appareil que tout y est.

## Architecture

Application **locale d'abord, adossée à un serveur**, à l'intérieur de l'App Router de Next.js 16.
Le navigateur détient la copie de travail ; une route d'API expose la référence partagée.

```text
src/
├── app/
│   ├── api/budget/route.ts   Lecture et écriture du budget central (GET, PUT)
│   ├── authorize/            Échange du jeton contre un cookie httpOnly
│   └── …                     Coquille serveur et styles globaux
├── features/budget/
│   ├── budget-provider.tsx   Frontière cliente : état, chargement, écriture, synchronisation
│   ├── sync.ts               Protocole client : lecture, poussée, conflit
│   ├── calculs.ts            Logique budgétaire pure — sous obligation de test
│   ├── expenses.ts           Anneau, allocation quotidienne, journal — sous obligation de test
│   ├── envelopes.ts          Plafonds par catégorie, états, alerte — sous obligation de test
│   ├── transfer.ts           Format d'échange : export et import
│   ├── types.ts              Types du domaine
│   └── components/           Interface
└── lib/
    ├── money.ts              Montants en centimes entiers, analyse et formatage
    ├── date.ts               Dates calendaires, échéances, bornes de mois
    ├── format.ts             Formatage des dates et des taux
    ├── download.ts           Téléchargement d'un fichier (API navigateur isolée)
    ├── budget-document.ts    Analyse et migration du document — partagé client/serveur
    ├── storage.ts            Adaptateur localStorage : quarantaine, copie de travail
    ├── sync-metadata.ts      Révision de base et drapeau « en attente »
    └── server/               **Ne rejoint jamais le graphe client**
        ├── budget-store.ts   Fichier JSON atomique, verrou, quarantaine
        └── authorization.ts  Jeton d'appareil, comparaison à temps constant
```

Quatre règles structurantes :

- **Les montants sont des entiers de centimes**, partout. Aucune valeur monétaire décimale
  n'existe hors de la frontière d'affichage : c'est ce qui garantit l'exactitude au centime.
  L'allocation quotidienne est tronquée au centime inférieur, de sorte que la somme des allocations
  restantes n'excède jamais ce dont vous disposez réellement.
- **Toute donnée lue depuis le stockage est validée à l'exécution** avant d'être typée, jamais
  transtypée. Cela vaut pour `localStorage` **comme pour les réponses du serveur** : un `200` n'est
  pas une preuve, et le même analyseur — `budget-document.ts` — sert aux deux côtés.
- **Une saisie n'attend jamais le réseau.** L'écriture locale vient d'abord, la synchronisation
  ensuite. C'est ce qui permet à l'application de rester utilisable sans connexion, et ce qui
  empêche une panne de serveur d'empêcher d'enregistrer une dépense.
- **Aucune perte silencieuse.** Une écriture aboutit, ou l'utilisateur en est informé. Le stockage
  central porte un numéro de révision : une écriture fondée sur une révision périmée est refusée, et
  c'est l'utilisateur qui tranche — jamais l'application.

## Documentation du projet

- `.specify/memory/constitution.md` — les principes qui gouvernent le projet
- `specs/002-income-subscriptions-budget/` — spécification, plan, contrats et tâches de la
  fonctionnalité implémentée ici
- `specs/004-data-export-import/` — spécification, plan et contrats de la sauvegarde
- `specs/003-daily-allowance-dashboard/` — spécification, plan et contrats du tableau de bord
- `specs/001-monthly-budget-envelopes/` — spécification, plan et contrats des enveloppes
- `specs/005-server-side-storage/` — spécification, plan et contrats du stockage centralisé

La documentation, les spécifications, les plans et les commentaires de code sont rédigés en
français ; les identifiants de code restent en anglais.

## Licence

MIT — voir [LICENSE](LICENSE).

Le texte de la licence reste en anglais : c'est sa rédaction canonique, celle qui fait foi. Le
traduire l'affaiblirait juridiquement sans rien apporter.
