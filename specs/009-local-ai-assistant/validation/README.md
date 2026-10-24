# Outillage des validations manuelles (T050 à T054)

De quoi rejouer les parties D à H du [quickstart](../quickstart.md) sur le NAS, **sans toucher au vrai
budget** : une instance de démonstration tourne à côté du déploiement, avec le jeu de données du
quickstart et un jeton jetable. Les résultats de référence (24/10/2026) sont dans la section
« Résultats » du quickstart.

| Fichier | Rôle |
|---|---|
| `budget-demo.json` | Jeu de données du quickstart (octobre 2026), plus deux opérations « À classer ». Format du fichier central (`revision`, `document` en version 5). |
| `lancer-demo.sh` | Démarre le conteneur `budget-demo-009` sur `127.0.0.1:3001` (réseau `ollama`), données et jeton dans un dossier temporaire. |
| `questions.json` | Les 18 questions de la partie D et la valeur attendue de chacune. |
| `questions.py` | Partie D : pose les questions à l'API, affiche réponse et référence, mesure le délai avant le premier texte. |
| `interface.mjs` | Parties F et H dans Chromium sans écran (Playwright) : 360 px, zoom 200 %, thème sombre, clavier, annonces, Échap, modification, changement de mois, onglet inconnu. Captures dans `captures/`. |

Rien de tout cela n'entre dans l'image (`specs` est exclu par `.dockerignore`) ni dans `npm test`.

## Prérequis

- Image à jour : `docker compose build` à la racine du projet (l'image `budget-app-budget` doit
  contenir le code à valider).
- Pile Ollama démarrée (`docker exec ollama ollama list` montre `qwen3.5:9b`).
- Python 3 sur l'hôte. Pas de Node sur l'hôte : Playwright tourne dans son image Docker.

## Rejouer

Depuis ce dossier :

```bash
./lancer-demo.sh                     # écrit BUDGET_URL et BUDGET_TOKEN_FILE dans .demo.env (hors Git)
source .demo.env                     # utile seulement pour la commande Docker ; questions.py le lit seul

# Partie D : les 18 questions, puis les questions fragiles plusieurs fois (le modèle varie)
python3 -I questions.py
python3 -I questions.py --seules 5 7 9 10 12 --fois 3 --sortie resultats-rep.json

# Parties F et H (interface)
docker run --rm --network host -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e BUDGET_TOKEN_FILE=/jeton -e CAPTURES=/validation/captures \
  -v "$BUDGET_TOKEN_FILE:/jeton:ro" -v "$PWD:/validation" -w /tmp \
  mcr.microsoft.com/playwright:v1.56.1-noble \
  sh -c 'npm i -s --no-audit --no-fund playwright@1.56.1 >/dev/null 2>&1 && cp /validation/interface.mjs . && node interface.mjs'

docker rm -f budget-demo-009         # à la fin
```

Les dates sont figées sur le jeu de démo (`DEMO_MONTH=2026-10`, `DEMO_TODAY=2026-10-24`,
`DEMO_NOW` pour le navigateur) : les essais restent valables les mois suivants. Pour changer les
données, modifier `budget-demo.json` et relancer `lancer-demo.sh` ; s'il est refusé, le script le dit
(un « À classer » doit aussi figurer au registre avec `outcome: "inbox"`).

## Ce que ces scripts ne couvrent pas

- **Références** : les valeurs de `questions.json` sortent de `buildAssistantContext`, recoupées à la
  main. Si le calcul du budget change, les recalculer.
- **Partie B** (isolation), **E** (`docker stop ollama`, modèle déchargé, deux questions simultanées),
  **F2** (GPU libéré : `nvidia-smi` et `docker logs ollama | grep cancel` juste après une annulation) et
  **G** (flux par Tailscale Serve, qui pointe sur le vrai déploiement) : commandes dans le quickstart.
- **À faire par une personne** : lecteur d'écran réel, essai de l'onglet par quelqu'un qui ne l'a
  jamais vu (CR-007), relecture des captures (contraste, astérisques du Markdown).
