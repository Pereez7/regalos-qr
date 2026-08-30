import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

test("revisar/[id] renderiza igual que r/[slug] publicado; la aprobación explícita habilita lo público", async ({
  page,
}) => {
  const contenido = {
    v: 1 as const,
    receta: [
      { tipo: "portada" as const, posicion: 0, nombreDestinatario: "Ana" },
      { tipo: "cierre" as const, posicion: 1, texto: "Fin" },
    ],
  };

  const { id, slug } = await crearRegalo(contenido, { estado: "en_revision" });

  // Acceptance Scenario: sin aprobación, /r/[slug] da "no disponible".
  await page.goto(`/r/${slug}`);
  await expect(page.getByText("no está disponible")).toBeVisible();

  // /revisar/[id] muestra el contenido exacto, incluida la pantalla de apertura.
  await page.goto(`/revisar/${id}`);
  await expect(page.locator("[data-pantalla-apertura]")).toBeVisible();
  await page.locator("[data-pantalla-apertura]").click();
  await expect(page.locator('[data-bloque="portada"] h1')).toHaveText("Ana");
  await expect(page.locator("[data-form-aprobar]")).toBeVisible();

  // Aprobación explícita.
  await page.locator('[data-form-aprobar] button[type="submit"]').click();
  await expect(page).toHaveURL(new RegExp(`/revisar/${id}$`));
  await expect(page.locator("[data-estado-publicado]")).toBeVisible();
  await expect(page.locator("[data-form-aprobar]")).toHaveCount(0);

  // Tras aprobar, /r/[slug] sirve el mismo contenido, idéntico al aprobado.
  await page.goto(`/r/${slug}`);
  await page.locator("[data-pantalla-apertura]").click();
  await expect(page.locator('[data-bloque="portada"] h1')).toHaveText("Ana");
});
