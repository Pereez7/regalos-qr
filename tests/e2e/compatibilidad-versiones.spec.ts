import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { parsearContenido } from "../../src/lib/contenido/esquema.ts";
import type { Contenido } from "../../src/lib/contenido/tipos-bloque.ts";
import { crearRegalo } from "./utils/crear-regalo.ts";

// Principio VI: este fixture y este test son un test de regresión PERMANENTE — no se
// editan nunca, aunque exista un esquema v2 (research.md #17). Si algo acá falla,
// el problema es el cambio nuevo, no el fixture.
const FIXTURE_PATH = fileURLToPath(
  new URL("../fixtures/contenido-v1.json", import.meta.url),
);

test("el fixture contenido.v=1 sigue renderizando igual con el esquema/registro actuales", async ({
  page,
}) => {
  const crudo = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));

  // El esquema actual DEBE seguir aceptando v1 sin cambios (Compuerta 12).
  const contenido: Contenido = parsearContenido(crudo);
  expect(contenido.v).toBe(1);

  const { slug } = await crearRegalo(contenido);

  await page.goto(`/r/${slug}`);
  await expect(page.locator("[data-pantalla-apertura] p")).toContainText("Ana");
  await page.locator("[data-pantalla-apertura]").click();

  await expect(page.locator('[data-bloque="portada"] h1')).toHaveText("Ana");
  await expect(page.locator('[data-bloque="portada"] p')).toHaveText("para vos");

  await expect(page.locator('[data-bloque="contador"] [data-contador-valor]')).not.toHaveText(
    "—",
  );

  await expect(page.locator('[data-bloque="momento"] h2')).toHaveText("Primer viaje");
  await expect(page.locator('[data-bloque="momento"] img')).toHaveAttribute(
    "alt",
    "Los dos en el aeropuerto",
  );

  await expect(page.locator('[data-bloque="galeria"] img')).toHaveAttribute(
    "alt",
    "Los dos en la playa",
  );

  await expect(page.locator('[data-bloque="cancion"] [data-boton-cancion]')).toContainText(
    "Never Gonna Give You Up",
  );

  await expect(page.locator('[data-bloque="carta"] p')).toContainText(
    "Todo lo que quiero decirte",
  );

  await expect(page.locator('[data-bloque="pregunta"] p')).toHaveText("¿Te casás conmigo?");

  await expect(page.locator('[data-bloque="cierre"] p')).toHaveText("Fin");
});
