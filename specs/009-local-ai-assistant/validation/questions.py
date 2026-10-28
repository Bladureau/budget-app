"""Partie D du quickstart : pose les questions à /api/assistant et mesure le délai avant le premier texte.

    python3 questions.py                         # les 18 questions de questions.json
    python3 questions.py --seules 5 7 9 --fois 3 # reposer certaines questions plusieurs fois

Variables : BUDGET_URL (défaut http://127.0.0.1:3001), BUDGET_TOKEN_FILE (fichier du jeton), lues
dans l'environnement ou, à défaut, dans le `.demo.env` écrit par lancer-demo.sh ; DEMO_MONTH et
DEMO_TODAY (défaut : 2026-10 et 2026-10-24, les dates du jeu de démo).
Chaque question est posée seule, sans historique. Les résultats complets sont écrits en JSON.
"""

import argparse
import http.client
import json
import os
import pathlib
import sys
import time
import urllib.parse

ICI = pathlib.Path(__file__).resolve().parent


def variable(nom, defaut=None):
    """Environnement d'abord, puis `.demo.env` (lignes `export NOM=valeur`)."""
    if nom in os.environ:
        return os.environ[nom]
    fichier = ICI / ".demo.env"
    if fichier.exists():
        for ligne in fichier.read_text().splitlines():
            cle, _, valeur = ligne.removeprefix("export ").partition("=")
            if cle == nom:
                return valeur
    return defaut


URL = urllib.parse.urlsplit(variable("BUDGET_URL", "http://127.0.0.1:3001"))
FICHIER_JETON = variable("BUDGET_TOKEN_FILE")
if FICHIER_JETON is None or not pathlib.Path(FICHIER_JETON).exists():
    sys.exit("Jeton introuvable : lancer d'abord ./lancer-demo.sh (l'instance de démo n'est pas démarrée).")
JETON = pathlib.Path(FICHIER_JETON).read_text().strip()
MOIS = os.environ.get("DEMO_MONTH", "2026-10")
AUJOURDHUI = os.environ.get("DEMO_TODAY", "2026-10-24")


def poser(question):
    corps = json.dumps({"month": MOIS, "today": AUJOURDHUI,
                        "messages": [{"role": "user", "content": question}]})
    connexion = http.client.HTTPConnection(URL.hostname, URL.port or 80, timeout=200)
    t0 = time.monotonic()
    connexion.request("POST", "/api/assistant", corps, {
        "Content-Type": "application/json", "Cookie": f"budget_access={JETON}"})
    reponse = connexion.getresponse()
    if reponse.status != 200:
        return {"statut": reponse.status, "corps": reponse.read().decode(),
                "total": time.monotonic() - t0}

    premier, texte, fin, etats, morceaux, tampon = None, "", None, [], 0, b""
    while bloc := reponse.read1(4096):
        tampon += bloc
        while b"\n" in tampon:
            ligne, tampon = tampon.split(b"\n", 1)
            evenement = json.loads(ligne)
            if evenement["type"] == "text":
                morceaux += 1
                if premier is None:
                    premier = time.monotonic() - t0
                texte += evenement["text"]
            elif evenement["type"] == "status":
                etats.append((evenement["state"], round(time.monotonic() - t0, 3)))
            else:
                fin = evenement
    return {"statut": 200, "premier": premier, "total": time.monotonic() - t0,
            "morceaux": morceaux, "etats": etats, "fin": fin, "texte": texte}


def main():
    arguments = argparse.ArgumentParser()
    arguments.add_argument("--seules", type=int, nargs="*", help="numéros des questions à poser")
    arguments.add_argument("--fois", type=int, default=1, help="nombre de passages")
    arguments.add_argument("--sortie", default="resultats.json")
    options = arguments.parse_args()

    questions = json.loads((ICI / "questions.json").read_text())
    if options.seules:
        questions = [q for q in questions if q["n"] in options.seules]

    resultats = []
    for _ in range(options.fois):
        for q in questions:
            r = {**q, **poser(q["question"])}
            resultats.append(r)
            premier = f"{r['premier']:.2f} s" if r.get("premier") is not None else "-"
            print(f"### {q['n']}. {q['question']}  [statut {r['statut']}, 1er texte {premier}, fin {r.get('fin')}]")
            print(f"Référence : {q['reference']}")
            print(r.get("texte", r.get("corps")), end="\n\n", flush=True)

    delais = sorted(r["premier"] for r in resultats if r.get("premier") is not None)
    if delais:
        print(f"Délais : {len(delais)} mesures, médiane {delais[len(delais) // 2]:.2f} s, "
              f"max {delais[-1]:.2f} s, sous 5 s : {sum(d < 5 for d in delais)}")
    pathlib.Path(options.sortie).write_text(json.dumps(resultats, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
