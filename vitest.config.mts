import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Résolution native de l'alias `@/*` de tsconfig.json. Le guide de la version installée
  // (node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md) prescrit le greffon
  // vite-tsconfig-paths, mais Vite signale à l'exécution que la fonction est native depuis :
  // une dépendance de moins, conformément au principe VI.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
