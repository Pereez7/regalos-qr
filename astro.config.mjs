import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import node from "@astrojs/node";

// @astrojs/vercel emite un bundle de función serverless (.vercel/output/) que
// `astro preview` no puede servir (research.md #1 explica por qué el adapter es
// Node serverless igual). Vercel setea process.env.VERCEL en su propio build/deploy;
// localmente (build + preview de quickstart.md, Playwright) usamos @astrojs/node en
// modo standalone, que sí genera un dist/server/entry.mjs previsualizable.
export default defineConfig({
  output: "server",
  adapter: process.env.VERCEL ? vercel() : node({ mode: "standalone" }),
});
