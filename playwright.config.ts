import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:4321",
    trace: "on-first-retry",
  },
  webServer: {
    // No usar `npm run preview`: en Astro 7, `astro preview` se demoniza y devuelve el
    // control de inmediato, así que Playwright ve el proceso "salir" antes de tiempo.
    // `node dist/server/entry.mjs` (adapter @astrojs/node standalone) sí queda en
    // foreground, que es lo que Playwright necesita para supervisarlo.
    command: "npm run build && node ./dist/server/entry.mjs",
    url: "http://localhost:4321",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
