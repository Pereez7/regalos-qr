import { test, expect } from "@playwright/test";
import { crearRegalo } from "./utils/crear-regalo.ts";

// Constitution Compuerta 4: contraste AA (contraste-aa.spec.ts), foco visible y
// `prefers-reduced-motion` — estas dos últimas sin cobertura automatizada hasta ahora.
test("prefers-reduced-motion se respeta y el foco visible está presente", async ({ page }) => {
  const { slug } = await crearRegalo({
    v: 1,
    receta: [{ tipo: "cierre", posicion: 0, texto: "Fin" }],
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`/r/${slug}`);

  const duracionTransicionSegundos = await page.evaluate(() => {
    const el = document.getElementById("sobre");
    if (!el) return null;
    // El navegador normaliza el valor computado a segundos (p. ej. "1e-6s" para
    // "0.001ms"); comparamos el número, no el string.
    return parseFloat(getComputedStyle(el).transitionDuration);
  });
  expect(duracionTransicionSegundos).not.toBeNull();
  expect(duracionTransicionSegundos as number).toBeLessThan(0.01);

  await page.keyboard.press("Tab");
  const foco = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    const estilos = getComputedStyle(el);
    return { tag: el.tagName, outlineStyle: estilos.outlineStyle, outlineWidth: estilos.outlineWidth };
  });

  expect(foco?.tag).toBe("BUTTON");
  expect(foco?.outlineStyle).not.toBe("none");
  expect(foco?.outlineWidth).not.toBe("0px");
});
