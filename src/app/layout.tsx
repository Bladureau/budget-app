import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Budget",
  description:
    "Suivi de budget personnel : revenus, abonnements et reste disponible mois par mois. Données conservées uniquement sur cet appareil.",
};

/**
 * `viewportFit: "cover"` : sans lui, `env(safe-area-inset-*)` vaut toujours 0 sur iOS, et la
 * barre d'onglets fixée en bas passerait sous la zone de geste (specs/007-navigation-menu, R5).
 * Le zoom n'est volontairement pas bridé (`maximumScale`, `userScalable`) : principe VII.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
