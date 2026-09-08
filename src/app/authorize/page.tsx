/**
 * Autorisation d'un appareil.
 *
 * Voir specs/005-server-side-storage/contracts/authorization.md.
 *
 * Opération effectuée **une fois par appareil** : le jeton est échangé contre un cookie
 * `httpOnly`, que chaque requête d'API vérifiera ensuite.
 *
 * **Aucune directive `"use client"`.** L'état d'erreur transite par la barre d'adresse plutôt
 * que par un état React, ce qui évite d'ouvrir une frontière cliente pour un formulaire de un
 * champ. Le formulaire fonctionne donc sans JavaScript, ce qui n'est pas un objectif en soi
 * mais une conséquence agréable.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";

import {
  ACCESS_COOKIE_NAME,
  configuredToken,
  matchesToken,
} from "@/lib/server/authorization";

/** Un an : autoriser une fois, pas à chaque ouverture. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

type Etat = "invalide" | "absent";

async function autoriser(formData: FormData): Promise<void> {
  "use server";

  // Une fonction serveur est joignable par un POST direct, pas seulement par ce formulaire :
  // la validation vit donc ici, et non dans l'interface.
  const candidat = formData.get("token");
  const jeton = typeof candidat === "string" ? candidat.trim() : "";

  if (!matchesToken(jeton)) {
    redirect(`/authorize?etat=${configuredToken() === null ? "absent" : "invalide"}`);
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: ACCESS_COOKIE_NAME,
    value: jeton,
    httpOnly: true,
    sameSite: "strict",
    // En HTTP sur réseau privé, `secure` empêcherait le cookie d'être posé et rendrait
    // l'application inutilisable. Il est donc adossé au protocole réellement servi.
    secure: process.env.NODE_ENV === "production" && process.env.BUDGET_INSECURE_COOKIE !== "1",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });

  redirect("/");
}

const MESSAGES: Readonly<Record<Etat, string>> = {
  // Ne révèle ni la longueur ni la forme attendue : un message précis aiderait qui cherche.
  invalide: "Ce jeton n’est pas valide. Vérifiez-le et saisissez-le à nouveau.",
  absent:
    "Ce serveur n’est pas configuré : aucun jeton d’accès n’y est défini. Renseignez " +
    "BUDGET_ACCESS_TOKEN puis redémarrez-le.",
};

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const parametres = await searchParams;
  const brut = parametres.etat;
  const etat: Etat | null = brut === "invalide" || brut === "absent" ? brut : null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Autoriser cet appareil
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Saisissez le jeton d’accès du serveur. Cet appareil s’en souviendra ; vous n’aurez
          pas à le refaire.
        </p>
      </div>

      {etat !== null && (
        // L'erreur est portée par du texte, jamais par la seule couleur (principe VII).
        <p
          role="alert"
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--deficit)]"
        >
          <strong className="font-semibold">Échec : </strong>
          {MESSAGES[etat]}
        </p>
      )}

      <form action={autoriser} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="token"
            className="text-sm font-medium"
          >
            Jeton d’accès
          </label>
          <input
            id="token"
            name="token"
            type="password"
            required
            autoComplete="off"
            autoFocus
            className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-base font-medium text-white hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Autoriser
        </button>
      </form>

      <Link
        href="/"
        className="text-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        Retour au budget
      </Link>
    </main>
  );
}
