#!/usr/bin/env bash
# Démarre une instance de démonstration du budget, isolée du vrai déploiement.
#
# Même image que `budget-app`, mais conteneur à part (`budget-demo-009`), port 127.0.0.1:3001,
# jeton jetable et données dans un dossier temporaire : le volume `budget-data` n'est jamais touché.
# L'image doit exister (`docker compose build` à la racine du projet) et le réseau `ollama` aussi.
#
#   ./lancer-demo.sh             # démarre et affiche les variables à exporter
#   docker rm -f budget-demo-009 # arrête et supprime l'instance

set -euo pipefail

ICI=$(cd "$(dirname "$0")" && pwd)
IMAGE=${DEMO_IMAGE:-budget-app-budget}
DOSSIER=${DEMO_DIR:-$(mktemp -d -t budget-demo-XXXXXX)}

mkdir -p "$DOSSIER/data"
# L'application tourne sous l'utilisateur `nextjs` (uid 1001) : elle doit pouvoir lire, et mettre
# en quarantaine un fichier illisible.
chmod 777 "$DOSSIER/data"
cp "$ICI/budget-demo.json" "$DOSSIER/data/budget.json"
chmod 666 "$DOSSIER/data/budget.json"

head -c 48 /dev/urandom | base64 | tr -d '/+=' > "$DOSSIER/jeton"
chmod 600 "$DOSSIER/jeton"

docker rm -f budget-demo-009 >/dev/null 2>&1 || true
docker run -d --name budget-demo-009 --network ollama -p 127.0.0.1:3001:3000 \
  -e BUDGET_ACCESS_TOKEN="$(cat "$DOSSIER/jeton")" \
  -e BUDGET_DATA_DIR=/data \
  -e OLLAMA_URL=http://ollama:11434 \
  -e OLLAMA_MODEL=qwen3.5:9b \
  -v "$DOSSIER/data:/data" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: budget_access=$(cat "$DOSSIER/jeton")" \
    http://127.0.0.1:3001/api/budget || true)
  [ "$code" = 200 ] && break
  sleep 1
done
if [ "$code" != 200 ]; then
  echo "L'instance ne répond pas (dernier statut : $code). Voir : docker logs budget-demo-009" >&2
  exit 1
fi
if ls "$DOSSIER"/data/budget.corrupted-* >/dev/null 2>&1; then
  echo "budget-demo.json a été refusé par l'application (mis en quarantaine)." >&2
  exit 1
fi

echo "Instance prête sur http://127.0.0.1:3001"
echo "export BUDGET_URL=http://127.0.0.1:3001"
echo "export BUDGET_TOKEN_FILE=$DOSSIER/jeton"
