import { defineConfig, devices } from "@playwright/test";

// `npx playwright test` no carga `.env` solo (a diferencia de `tsx --env-file=.env`
// que usan los scripts de seed). Lo cargamos acá para que tests/e2e/utils/crear-regalo.ts
// y el webServer (heredan process.env) tengan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
// En CI las vars ya vienen inyectadas y no hay `.env`: falla en silencio.
try {
  process.loadEnvFile();
} catch {
  // sin .env (CI u otro entorno con vars ya seteadas) — seguimos con process.env tal cual.
}

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
    // `exec` reemplaza el shell intermedio por el proceso de node (mismo PID): sin eso,
    // la señal de apagado que manda Playwright al terminar puede no llegarle al server
    // y el puerto 4321 queda ocupado entre corridas.
    command: "npm run build && exec node ./dist/server/entry.mjs",
    // `port` (no `url`): solo espera a que el puerto acepte conexiones TCP, sin
    // exigir 2xx. La app no tiene página en `/` (devuelve 404 ahí), así que `url`
    // nunca se daba por lista.
    port: 4321,
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
