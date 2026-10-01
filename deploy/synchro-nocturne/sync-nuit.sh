#!/data/data/com.termux/files/usr/bin/bash
#
# Réveil nocturne du NAS pour la synchronisation bancaire, depuis le téléphone relais.
#
# À installer dans Termux, lancé par cron. Voir deploy/synchro-nocturne/LISEZMOI.md.
#
# Règle de sûreté : si le NAS est **déjà allumé**, ce script ne fait rien. Il n'éteint donc
# jamais une machine que quelqu'un est en train d'utiliser ; seule une machine qu'il a
# lui-même réveillée est remise en veille.

set -u

# --- À adapter --------------------------------------------------------------------------------
# Hôte SSH du NAS (nom Tailscale ou alias de ~/.ssh/config).
NAS="nasmaison"
# Script de réveil existant.
WAKE="$HOME/wake.sh"
# ------------------------------------------------------------------------------------------------

ATTENTE_MAX_S=600

journal() {
  printf '%s %s\n' "$(date -Iseconds)" "$*"
}

joignable() {
  ssh -o BatchMode=yes -o ConnectTimeout=5 "$NAS" true 2>/dev/null
}

if joignable; then
  journal "NAS déjà allumé : rien à faire (la synchronisation se fera à l'ouverture de l'application)"
  exit 0
fi

journal "réveil du NAS"
bash "$WAKE"

debut=$(date +%s)
until joignable; do
  if [ $(( $(date +%s) - debut )) -ge "$ATTENTE_MAX_S" ]; then
    journal "échec : le NAS ne répond pas après ${ATTENTE_MAX_S} s"
    exit 1
  fi
  sleep 10
done

journal "NAS joignable, synchronisation puis mise en veille"
# La connexion se coupe quand le NAS s'éteint : un code de sortie non nul est alors attendu.
ssh -o BatchMode=yes "$NAS" sudo -n /usr/local/sbin/budget-sync-et-veille || true
journal "terminé"
