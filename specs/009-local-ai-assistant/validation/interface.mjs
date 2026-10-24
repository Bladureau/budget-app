// Parties F (interface) et H du quickstart, dans Chromium sans écran. Voir README.md pour le lancement.
//
// Variables : BUDGET_URL, BUDGET_TOKEN_FILE, CAPTURES (dossier des captures, défaut ./captures),
// DEMO_NOW (instant simulé, défaut 2026-10-24 à midi, heure de Paris, pour tomber sur le mois du jeu de démo).

import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const BASE = process.env.BUDGET_URL ?? "http://127.0.0.1:3001";
const JETON = readFileSync(process.env.BUDGET_TOKEN_FILE, "utf8").trim();
const CAPTURES = process.env.CAPTURES ?? "captures";
const MAINTENANT = new Date(process.env.DEMO_NOW ?? "2026-10-24T12:00:00+02:00");
const ECHANGES = 'ol[aria-label="Conversation"] > li';

mkdirSync(CAPTURES, { recursive: true });
const navigateur = await chromium.launch();

async function nouvellePage(options = {}) {
  const contexte = await navigateur.newContext({ locale: "fr-FR", timezoneId: "Europe/Paris", ...options });
  await contexte.addCookies([{ name: "budget_access", value: JETON, url: BASE }]);
  await contexte.clock.setFixedTime(MAINTENANT);
  return contexte.newPage();
}

async function attendreEchanges(page, nombre) {
  await page.waitForFunction(
    ([selecteur, n]) => document.querySelectorAll(`${selecteur}[aria-busy="false"]`).length >= n,
    [ECHANGES, nombre],
    { timeout: 120000 },
  );
}

const largeurs = (page) =>
  page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);

// 360 px, thème clair : barre d'onglets, envoi, état pendant la réponse, annonces, Maj+Entrée, Échap.
{
  const page = await nouvellePage({ viewport: { width: 360, height: 740 }, colorScheme: "light" });
  await page.goto(`${BASE}/?onglet=assistant`);
  const champ = page.getByRole("textbox").first();
  await champ.waitFor();
  console.log("H 360 px — scrollWidth / clientWidth :", await largeurs(page));
  console.log("H 360 px — barres :", await page.locator("nav").evaluateAll((n) => n.map((e) => e.innerText.replace(/\s+/g, " "))));
  await page.screenshot({ path: `${CAPTURES}/360-clair.png`, fullPage: true });

  const annonces = [];
  await page.exposeFunction("noterAnnonce", (texte) => annonces.push(texte));
  await page.evaluate(() => {
    const zone = document.querySelector('[role="status"]');
    new MutationObserver(() => window.noterAnnonce(zone.textContent)).observe(zone, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

  await champ.fill("Quelles sont mes dernières dépenses ?");
  await champ.press("Enter");
  await page.waitForTimeout(400);
  console.log("F4 pendant la réponse :", {
    champDesactive: await champ.isDisabled(),
    envoyerDesactive: await page.getByRole("button", { name: /envoyer/i }).first().isDisabled(),
    focus: await page.evaluate(() => document.activeElement?.textContent?.trim()),
  });
  await page.screenshot({ path: `${CAPTURES}/pendant-reponse.png`, fullPage: true });
  await attendreEchanges(page, 1);
  console.log("H annonces (role=status) :", annonces);
  await page.screenshot({ path: `${CAPTURES}/reponse-360.png`, fullPage: true });

  await champ.fill("ligne 1");
  await champ.press("Shift+Enter");
  await champ.pressSequentially("ligne 2");
  console.log("H Maj+Entrée :", JSON.stringify(await champ.inputValue()));

  await champ.fill("Fais-moi un résumé détaillé de tout mon budget");
  await champ.press("Enter");
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  console.log("F1 Échap → « Réponse annulée » :", await page.getByText(/réponse annulée/i).first().isVisible());
  await page.screenshot({ path: `${CAPTURES}/annulee.png`, fullPage: true });
  await page.context().close();
}

// Modification de la première question d'une conversation de trois échanges (F5), puis changement de mois.
{
  const page = await nouvellePage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/?onglet=assistant`);
  const champ = page.getByRole("textbox").first();
  const questions = ["Combien ai-je dépensé en courses ?", "Et en loisirs ?", "Quel est mon revenu du mois ?"];
  for (const [i, question] of questions.entries()) {
    await champ.fill(question);
    await champ.press("Enter");
    await attendreEchanges(page, i + 1);
  }
  const avant = await page.locator(ECHANGES).count();
  await page.getByRole("button", { name: /modifier/i }).first().click();
  await champ.fill("Combien me reste-t-il sur l'enveloppe courses ?");
  await champ.press("Enter");
  await attendreEchanges(page, 1);
  console.log("F5 échanges avant / après modification :", avant, await page.locator(ECHANGES).count());
  console.log("F5 réponse :", (await page.locator(ECHANGES).first().innerText()).replace(/\s+/g, " ").slice(0, 200));
  await page.screenshot({ path: `${CAPTURES}/modification.png`, fullPage: true });

  await page.getByRole("button", { name: /mois suivant/i }).click();
  await page.waitForTimeout(500);
  console.log("H changement de mois — échanges restants :", await page.locator(ECHANGES).count());
  await page.context().close();
}

// Thème sombre, zoom 200 % (1 280 px affichés à 640 px CSS), parcours au clavier, onglet inconnu.
{
  const page = await nouvellePage({ viewport: { width: 640, height: 400 }, colorScheme: "dark" });
  await page.goto(`${BASE}/?onglet=assistant`);
  await page.getByRole("textbox").first().waitFor();
  console.log("H zoom 200 % — scrollWidth / clientWidth :", await largeurs(page));
  await page.screenshot({ path: `${CAPTURES}/sombre-zoom200.png`, fullPage: true });

  const parcours = [];
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    parcours.push(
      await page.evaluate(() => {
        const e = document.activeElement;
        const style = getComputedStyle(e);
        const marque = style.outlineStyle !== "none" ? "contour" : style.boxShadow !== "none" ? "ombre" : "AUCUNE";
        return `${e.tagName} « ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30)} » (${marque})`;
      }),
    );
  }
  console.log("H clavier :", parcours);

  await page.goto(`${BASE}/?onglet=nimportequoi`);
  await page.waitForTimeout(800);
  console.log("H onglet inconnu → actif :", await page.locator('[aria-current="page"]').allInnerTexts());
  await page.context().close();
}

await navigateur.close();
