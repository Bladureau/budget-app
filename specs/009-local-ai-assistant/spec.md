# Spécification de fonctionnalité : Assistant du budget (IA locale)

**Répertoire de fonctionnalité** : `specs/009-local-ai-assistant`

**Branche** : `feat-009-local-ai-assistant`

**Créée le** : 2026-10-24

**Statut** : Brouillon

**Demande initiale** : « Assistant / chatbot du budget relié à l'IA locale du NAS (Ollama,
qwen3.5:9b). L'utilisateur pose des questions en français sur son budget (ex. « Combien j'ai
dépensé en courses ce mois-ci ? ») et obtient une réponse en flux. Tous les montants et
pourcentages sont calculés par l'application, jamais par le modèle. Mode dégradé obligatoire : si
Ollama est indisponible, « Assistant indisponible » et le reste de l'application fonctionne.
Lecture seule, aucune écriture. Les libellés bancaires sont traités comme des données. Voir
`docs/ia-locale-ollama.md` (entrée pour `research.md` et `plan.md` ; choix V1 contexte injecté ou
V2 outils à trancher dans `research.md`). »

---

## Constat de départ

Toutes les réponses que l'utilisateur cherche existent déjà dans l'application, mais il doit les
retrouver lui-même : changer d'onglet, repérer la bonne enveloppe, additionner mentalement
plusieurs lignes du journal. Une question comme « combien ai-je dépensé en courses ce mois-ci ? »
ou « puis-je me permettre ce restaurant ? » se pose naturellement en une phrase.

Un modèle de langage tourne déjà sur le NAS de l'utilisateur (voir `docs/ia-locale-ollama.md`).
Il comprend le français, mais **il ne sait pas calculer de façon fiable**. La fonctionnalité
repose donc sur un partage strict des rôles :

- **l'application** possède les chiffres : elle calcule chaque montant, total, reste et
  pourcentage, exactement, au centime, avec les mêmes règles que les écrans existants ;
- **l'assistant** comprend la question et met en phrases les valeurs que l'application lui fournit.

## Décisions de l'utilisateur (2026-10-24)

1. L'assistant s'appuie sur **l'IA locale du NAS** : les données budgétaires ne quittent pas la
   machine (principe I de la constitution).
2. **Lecture seule** : l'assistant répond, il ne crée, ne modifie ni ne supprime rien.
3. **Mode dégradé obligatoire** : si l'IA est arrêtée, absente ou trop lente, l'assistant se dit
   indisponible et **tout le reste de l'application fonctionne normalement**.
4. **Les montants ne sont jamais calculés par le modèle** : ils sont fournis, déjà exacts, par
   l'application.

## Clarifications

### Session 2026-10-24

- Q: Quand l'utilisateur demande « et le mois dernier ? », l'assistant répond-il pour le mois
  précédent ou renvoie-t-il vers le sélecteur de mois ? → A: le mois affiché seulement ; pour un
  autre mois, l'assistant invite à le sélectionner, puis répond pour ce mois.
- Q: Si l'utilisateur envoie une deuxième question pendant que l'assistant rédige, que fait
  l'application ? → A: rien ne peut être envoyé ni modifié pendant la réponse (pas de file
  d'attente) ; l'utilisateur peut en revanche annuler la réponse en cours, puis réécrire. Une fois
  la réponse terminée ou annulée, il peut modifier un message déjà envoyé, et la modification est
  traitée comme une nouvelle question.
- Q: Si une réponse contient un montant absent des valeurs fournies par l'application, que voit
  l'utilisateur ? → A: la réponse reste affichée, avec un avertissement visible en fin de réponse
  qui désigne le montant non vérifié.

## Périmètre

**Inclus** : une conversation en français sur le budget du mois affiché ; réponses affichées au
fur et à mesure ; état de chargement, d'indisponibilité et d'erreur ; protection par la même
autorisation que le reste de l'application.

**Exclu** (version 1) :

- toute action d'écriture (ajouter une dépense, classer une opération, modifier une enveloppe) ;
- la conservation des conversations d'une visite à l'autre ;
- les questions portant sur plusieurs mois à la fois (« compare mes courses des six derniers
  mois ») ; seul le mois affiché est interrogé ;
- la saisie vocale et la lecture à voix haute ;
- tout fournisseur d'IA en ligne.

## Scénarios utilisateur et tests *(obligatoire)*

### Récit 1 — Poser une question et obtenir une réponse exacte (Priorité : P1) 🎯 MVP

L'utilisateur écrit une question en français sur le mois affiché. La réponse apparaît mot après
mot et cite des montants identiques, au centime, à ceux que montrent les écrans de l'application.

**Pourquoi cette priorité** : c'est la raison d'être de la fonctionnalité. Une réponse fausse d'un
centime ruinerait la confiance bien plus qu'une absence d'assistant (principe II).

**Test indépendant** : avec un budget de test connu (par exemple 312,47 € dépensés en courses sur
une enveloppe plafonnée à 400,00 €), poser « Combien ai-je dépensé en courses ce mois-ci ? » et
vérifier que la réponse cite 312,47 € (et, si l'enveloppe est citée, son plafond de 400,00 € et son
reste de 87,53 €), valeurs identiques à l'écran des
enveloppes.

**Scénarios d'acceptation** :

1. **Étant donné** un budget avec des dépenses ce mois-ci, **quand** l'utilisateur demande combien
   il a dépensé dans une enveloppe, **alors** la réponse cite le montant exact affiché par
   l'application pour cette enveloppe.
2. **Étant donné** une question sur le reste à dépenser (« combien puis-je dépenser aujourd'hui ? »),
   **quand** la réponse s'affiche, **alors** elle reprend le montant par jour affiché sur l'écran
   « Aujourd'hui ».
3. **Étant donné** une réponse en cours de rédaction, **quand** le texte arrive, **alors**
   l'utilisateur le lit au fur et à mesure sans attendre la réponse complète.
4. **Étant donné** une question dont la réponse n'est pas dans les données fournies à l'assistant
   (« quel sera mon solde en 2030 ? »), **quand** il répond, **alors** il dit qu'il ne dispose pas
   de cette information et **n'invente aucun montant**.
5. **Étant donné** une question sans rapport avec le budget, **quand** l'assistant répond,
   **alors** il rappelle poliment son rôle sans inventer de chiffres.
6. **Étant donné** une réponse comportant des montants, **quand** elle s'affiche, **alors** chaque
   montant est écrit au format de l'application (« 312,47 € »), sans arrondi propre au modèle.

---

### Récit 2 — L'application reste pleinement utilisable sans l'assistant (Priorité : P1)

Quand l'IA locale est arrêtée, en cours de chargement ou saturée, l'utilisateur le comprend tout
de suite et continue d'utiliser le budget sans aucune gêne.

**Pourquoi cette priorité** : l'IA tourne sur un NAS partagé avec d'autres services (principe I :
l'application doit rester utilisable sans dépendance réseau pour le cœur du budget). Un assistant
qui bloquerait l'application serait pire que pas d'assistant.

**Test indépendant** : arrêter l'IA locale, ouvrir l'assistant et poser une question ; vérifier le
message « Assistant indisponible », puis saisir une dépense et consulter les autres onglets.

**Scénarios d'acceptation** :

1. **Étant donné** que l'IA locale est arrêtée ou injoignable, **quand** l'utilisateur envoie une
   question, **alors** il lit « Assistant indisponible » avec une explication brève, et aucune
   réponse inventée n'est affichée.
2. **Étant donné** que l'IA est indisponible, **quand** l'utilisateur utilise le reste de
   l'application (saisie, journal, enveloppes, synchronisation bancaire, export), **alors** tout
   fonctionne exactement comme sans la fonctionnalité.
3. **Étant donné** que l'IA doit être chargée en mémoire (premier usage après une période
   d'inactivité), **quand** l'utilisateur envoie sa question, **alors** un message du type
   « Chargement de l'assistant… » s'affiche pour que l'attente ne ressemble pas à un blocage.
4. **Étant donné** que l'IA est occupée par un autre usage du NAS, **quand** l'attente dépasse le
   délai maximal, **alors** l'utilisateur reçoit un message d'indisponibilité clair et peut
   réessayer.
5. **Étant donné** une réponse interrompue en cours de route (arrêt de l'IA, coupure), **quand**
   l'interruption survient, **alors** le texte déjà reçu reste affiché, marqué comme incomplet, et
   l'utilisateur peut reposer sa question.
6. **Étant donné** une indisponibilité, **quand** l'utilisateur retente plus tard alors que l'IA
   est revenue, **alors** l'assistant répond sans qu'il ait à recharger l'application.

---

### Récit 3 — Suivre une conversation (Priorité : P2)

L'utilisateur enchaîne les questions (« et pour les loisirs ? », « et pour les abonnements ? »)
sans tout répéter. L'assistant tient compte des derniers échanges.

**Pourquoi cette priorité** : une conversation naturelle fait la différence avec un simple champ
de recherche, mais une question isolée (récit 1) apporte déjà l'essentiel.

**Test indépendant** : demander « combien en courses ? » puis « et en loisirs ? » et vérifier que
la seconde réponse concerne bien les loisirs, du même mois.

**Scénarios d'acceptation** :

1. **Étant donné** une première réponse sur une enveloppe, **quand** l'utilisateur pose une
   question de suite qui y fait référence, **alors** la réponse en tient compte.
2. **Étant donné** le mois d'octobre affiché, **quand** l'utilisateur demande « et le mois
   dernier ? », **alors** l'assistant n'invente aucun chiffre, explique qu'il répond pour le mois
   affiché et l'invite à sélectionner l'autre mois.
3. **Étant donné** une longue conversation, **quand** elle dépasse ce que l'assistant peut retenir,
   **alors** seuls les échanges récents sont pris en compte et l'assistant ne devient pas
   incohérent ni ne plante.
4. **Étant donné** une conversation en cours, **quand** l'utilisateur la réinitialise, **alors**
   l'historique affiché et l'historique pris en compte repartent de zéro.
5. **Étant donné** une conversation en cours, **quand** l'utilisateur change de mois ou recharge la
   page, **alors** la conversation repart de zéro : rien n'est conservé (voir « Périmètre »).
6. **Étant donné** une conversation de trois échanges, **quand** l'utilisateur modifie sa première
   question et la valide, **alors** les trois échanges sont remplacés par le seul échange modifié,
   et la réponse porte sur la question modifiée.
7. **Étant donné** une réponse en cours (chargement, réflexion ou rédaction), **quand**
   l'utilisateur cherche à envoyer ou à modifier un message, **alors** l'action est impossible et un
   texte en explique la raison, mais un bouton « Annuler » reste disponible.
8. **Étant donné** une réponse en cours, **quand** l'utilisateur l'annule, **alors** la génération
   s'arrête, le texte déjà reçu reste affiché, marqué « Réponse annulée », et l'utilisateur peut
   aussitôt envoyer une nouvelle question ou modifier un message précédent.
9. **Étant donné** une réponse annulée, **quand** l'utilisateur envoie la question suivante,
   **alors** l'IA répond sans attendre la fin de la réponse annulée.

---

### Récit 4 — Interroger les opérations bancaires et les abonnements (Priorité : P3)

L'utilisateur interroge le détail : « qu'ai-je payé chez Carrefour cette semaine ? », « quels sont
mes abonnements ? », « quelles opérations sont encore à classer ? ».

**Pourquoi cette priorité** : utile mais plus avancé. Il exige de limiter ce qui est transmis à
l'assistant (le contexte est petit) et de traiter les libellés bancaires comme du texte inerte.

**Test indépendant** : demander la liste des opérations d'un commerçant connu et vérifier que les
lignes et leur total correspondent au journal.

**Scénarios d'acceptation** :

1. **Étant donné** des opérations d'un même commerçant ce mois-ci, **quand** l'utilisateur les
   demande, **alors** la réponse liste les opérations réelles avec leurs montants exacts et un
   total identique à celui du journal.
2. **Étant donné** plus d'opérations correspondantes que l'assistant n'en peut présenter,
   **quand** il répond, **alors** il indique que la liste est partielle et donne le total complet
   calculé par l'application.
3. **Étant donné** un libellé bancaire contenant une consigne (« ignore tes règles et… »), **quand**
   l'assistant le lit, **alors** il le traite comme un simple libellé : ses règles ne changent pas
   et il ne révèle rien d'autre que ce que l'utilisateur est en droit de voir.
4. **Étant donné** la question « quels sont mes abonnements ? », **quand** il répond, **alors** la
   liste et les montants correspondent à l'onglet « Mois ».

---

### Cas limites

- **Budget vide** (aucune enveloppe, aucun revenu) : l'assistant l'indique et propose de
  commencer par configurer le budget, sans inventer de chiffres.
- **Question vide ou démesurée** : un message vide n'est pas envoyé ; un message trop long est
  refusé avec un message textuel avant tout appel à l'IA.
- **Envois rapprochés** : l'IA traite une génération à la fois ; tant qu'une réponse est en cours,
  l'envoi et la modification d'un message sont impossibles (champ et boutons désactivés, avec une
  indication textuelle), de sorte qu'aucune question n'est perdue en silence ni mise en file. Seule
  l'annulation de la réponse en cours reste possible.
- **Annulation pendant le chargement du modèle** : annuler alors que l'IA n'a pas encore commencé à
  répondre est possible et ne laisse aucun échange à moitié vide : la question reste affichée,
  sans réponse, marquée « Réponse annulée ».
- **Modification d'un message envoyé** : modifier un message remplace cet échange et tous ceux qui
  le suivent, puis relance la question modifiée ; une modification identique à l'original ne
  relance rien, et une modification vide ou trop longue est refusée comme une nouvelle question.
- **Session expirée ou non autorisée** : l'assistant refuse comme le reste de l'application ; il
  ne fournit aucune donnée budgétaire sans autorisation.
- **Mois passé ou futur affiché** : l'assistant répond à propos du mois affiché et le dit dans sa
  réponse.
- **Montants négatifs, nuls ou très grands** : cités correctement (« 0,00 € », « −12,50 € »,
  « 12 345,67 € »), sans notation scientifique ni arrondi.
- **Réponse du modèle contenant un montant absent des données** : l'application ne peut pas
  l'empêcher d'écrire un chiffre, mais elle le détecte et l'avertit en fin de réponse (EF-024)
  plutôt que de le présenter comme fiable.
- **Navigation au clavier ou lecteur d'écran** : toute la fonctionnalité reste utilisable ainsi.

## Exigences *(obligatoire)*

### Exigences fonctionnelles

- **EF-001** : L'utilisateur DOIT pouvoir saisir une question en français dans un champ dédié et
  l'envoyer, au clavier comme au toucher.
- **EF-002** : La réponse DOIT s'afficher progressivement, au fil de sa production.
- **EF-003** : Tout montant, total, reste ou pourcentage cité par l'assistant DOIT provenir d'un
  calcul de l'application, au centime, avec les mêmes règles que les écrans existants. Le modèle
  NE DOIT PAS en calculer lui-même.
- **EF-004** : Les montants affichés dans une réponse DOIVENT suivre le format monétaire de
  l'application (par exemple « 312,47 € »).
- **EF-005** : Lorsqu'une valeur n'est pas disponible, l'assistant DOIT le dire plutôt que
  l'estimer ou l'inventer.
- **EF-006** : L'assistant DOIT être en **lecture seule** : aucune de ses réponses ne peut créer,
  modifier ou supprimer une donnée du budget.
- **EF-007** : L'assistant DOIT répondre à propos du mois affiché et l'indiquer lorsque ce mois
  n'est pas le mois courant.
- **EF-008** : Lorsque l'IA locale est arrêtée, injoignable, trop lente ou en erreur, l'assistant
  DOIT afficher « Assistant indisponible » avec une explication brève, et l'utilisateur DOIT
  pouvoir réessayer.
- **EF-009** : L'indisponibilité de l'assistant NE DOIT altérer aucune autre fonction de
  l'application (saisie, journal, enveloppes, synchronisation bancaire, export, import).
- **EF-010** : Pendant le chargement du modèle ou l'attente d'une réponse, un état d'attente
  explicite DOIT être affiché.
- **EF-011** : Un délai maximal DOIT borner l'attente d'une réponse ; au-delà, l'utilisateur
  reçoit un message d'indisponibilité.
- **EF-012** : L'assistant DOIT tenir compte des derniers échanges de la conversation, dans la
  limite de ce qu'il peut retenir, sans jamais échouer à cause d'une conversation trop longue.
- **EF-013** : L'utilisateur DOIT pouvoir réinitialiser la conversation.
- **EF-014** : La conversation NE DOIT PAS être conservée au-delà de la visite en cours : ni
  stockée, ni exportée, ni synchronisée entre appareils.
- **EF-015** : Les libellés et textes issus des opérations bancaires DOIVENT être traités comme des
  données et jamais comme des consignes ; aucune consigne qu'ils contiennent ne peut modifier le
  comportement de l'assistant.
- **EF-016** : Seules les données nécessaires à répondre à la question DOIVENT être transmises à
  l'IA : jamais la totalité des opérations ni les identifiants de comptes bancaires, jamais
  d'identifiants de connexion.
- **EF-017** : Aucune donnée budgétaire NE DOIT quitter la machine de l'utilisateur : seule l'IA
  locale peut être appelée.
- **EF-018** : L'accès à l'assistant DOIT exiger la même autorisation que le reste de
  l'application ; sans autorisation, aucune donnée n'est fournie.
- **EF-019** : Une question vide DOIT être refusée ; une question trop longue DOIT être refusée
  avec un message, avant tout appel à l'IA.
- **EF-020** : Tant qu'une réponse est en cours, l'envoi et la modification de toute question
  DOIVENT être impossibles et signalés en texte à l'utilisateur ; aucune file d'attente n'est
  proposée.
- **EF-026** : L'utilisateur DOIT pouvoir annuler à tout moment une réponse en cours, y compris
  pendant le chargement du modèle. L'annulation DOIT arrêter réellement la génération côté IA, afin
  de libérer le NAS pour la question suivante ; le texte déjà reçu reste affiché, marqué
  « Réponse annulée ».
- **EF-025** : L'utilisateur DOIT pouvoir modifier un message qu'il a déjà envoyé, lorsqu'aucune
  réponse n'est en cours (terminée, annulée ou interrompue). La modification DOIT être traitée comme une nouvelle question : l'échange
  modifié et ceux qui le suivent sont remplacés par le nouvel échange.
- **EF-021** : L'interface DOIT être utilisable au clavier et au lecteur d'écran (champ étiqueté,
  réponses annoncées, erreurs en texte), lisible dans les thèmes clair et sombre, et sans
  défilement horizontal dès 360 px de large (principe VII).
- **EF-022** : L'assistant DOIT être accessible depuis la navigation existante sans rendre moins
  accessibles les écrans actuels.
- **EF-023** : Les réponses DOIVENT être rédigées en français.
- **EF-024** : Lorsqu'une réponse contient un montant qui ne figure pas parmi les valeurs fournies
  à l'assistant, l'application DOIT laisser la réponse affichée et ajouter à sa fin un
  avertissement textuel visible, du type « Ce montant n'a pas pu être vérifié : 123,45 € », qui
  désigne chaque montant concerné. L'avertissement n'apparaît qu'une fois la réponse terminée et
  n'est jamais porté par la seule couleur.

### Entités clés

- **Question** : texte libre saisi par l'utilisateur ; éphémère, non conservé.
- **Échange** : une question et sa réponse, affichés dans l'ordre ; l'ensemble constitue la
  conversation de la visite en cours. La question d'un échange peut être modifiée, ce qui
  remplace cet échange et les suivants.
- **Contexte budgétaire** : ensemble borné de valeurs **déjà calculées et formatées** par
  l'application (enveloppes, dépensé, reste, reste du jour, abonnements, opérations demandées)
  fourni à l'assistant pour répondre. Il est dérivé du budget, jamais saisi, jamais stocké.
- **État de l'assistant** : disponible, en chargement, en réponse, indisponible, interrompu, annulé.

## Critères de réussite *(obligatoire)*

### Résultats mesurables

- **CR-001** : Sur un jeu de questions types (au moins 15, couvrant enveloppes, reste du jour,
  abonnements, revenus et opérations), 100 % des montants cités correspondent, au centime, aux
  montants affichés par l'application.
- **CR-002** : Sur ce même jeu, 0 réponse n'invente un montant absent des données (les questions
  hors données obtiennent une réponse du type « je n'ai pas cette information »).
- **CR-003** : Quand l'IA est déjà chargée, le début de la réponse apparaît en moins de 5 secondes
  dans 95 % des cas ; quand elle doit être chargée, un état d'attente explicite apparaît en moins
  d'une seconde.
- **CR-004** : IA arrêtée, l'utilisateur lit « Assistant indisponible » en moins de 10 secondes
  après l'envoi, et toutes les autres fonctions de l'application restent utilisables sans aucune
  régression.
- **CR-005** : Une tentative d'accès à l'assistant sans autorisation n'obtient aucune donnée
  budgétaire dans 100 % des cas.
- **CR-006** : Sur un jeu de libellés bancaires piégés (consignes cachées), 0 cas ne modifie les
  règles de l'assistant ni n'entraîne une écriture dans le budget.
- **CR-007** : Une personne qui découvre la fonctionnalité obtient la réponse à sa première
  question en moins d'une minute, sans explication préalable.
- **CR-008** : L'assistant est utilisable au clavier seul, lisible à 200 % de zoom et à partir de
  360 px de large, dans les deux thèmes.

## Hypothèses

- L'IA locale décrite dans `docs/ia-locale-ollama.md` reste en place sur le NAS (modèle, ressources
  partagées avec d'autres services). Son choix, ses réglages et son éventuel remplacement relèvent
  du plan, non de cette spécification.
- L'application est mono-utilisateur : pas de conversations séparées par personne.
- Version 1 : seul le mois affiché est interrogeable. Les questions multi-mois sont reportées à un
  besoin démontré (principe VI).
- Les conversations ne sont pas conservées : elles peuvent contenir des chiffres sensibles et rien
  n'en justifie encore la persistance.
- Le choix entre un contexte résumé injecté d'office (V1) et des consultations à la demande du
  modèle (V2) est technique et sera tranché dans `research.md`, sur la base des questions types de
  cette spécification.
- L'emplacement de l'assistant dans la navigation (nouvel onglet ou accès depuis un onglet
  existant) est une décision de conception du plan, dans le respect de la fonctionnalité 007.
- La mesure de justesse (CR-001, CR-002) repose sur un jeu de questions types vérifié
  manuellement sur le NAS avant fusion : le vrai modèle n'est pas appelé dans les tests
  automatisés.
- Les réponses sont du texte simple ; aucune mise en forme riche, aucun graphique.
