"use client";

import type { ReactNode } from "react";

/**
 * Champ de formulaire étiqueté, avec message d’erreur textuel rattaché
 * programmatiquement (principe VII).
 */
export function FormField({
  id,
  label,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  error?: string;
  children: (props: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
  }) => ReactNode;
  className?: string;
}) {
  const idErreur = `${id}-erreur`;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="mt-1">
        {children({
          id,
          "aria-invalid": Boolean(error),
          "aria-describedby": error ? idErreur : undefined,
        })}
      </div>
      {error ? (
        <p id={idErreur} className="mt-1 text-sm text-[var(--deficit)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const inputClassName =
  "w-full min-h-11 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm aria-[invalid=true]:border-[var(--deficit)]";

export const buttonClassName =
  "min-h-11 rounded-md border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm font-medium hover:bg-[var(--background)]";

export const primaryButtonClassName =
  "min-h-11 rounded-md bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] hover:opacity-90";
