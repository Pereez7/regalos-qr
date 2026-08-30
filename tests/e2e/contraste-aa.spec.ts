import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

// research.md #11 / SC-006: calcula el ratio de contraste WCAG directamente sobre los
// tokens de cada tema — no depende de un render en navegador.

function leerTokens(archivo: string): Record<string, string> {
  const ruta = fileURLToPath(new URL(`../../src/temas/${archivo}`, import.meta.url));
  const css = readFileSync(ruta, "utf-8");
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[match[1]] = match[2];
  }
  return tokens;
}

function canalLineal(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminanciaRelativa(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.2126 * canalLineal(r) + 0.7152 * canalLineal(g) + 0.0722 * canalLineal(b);
}

function ratioContraste(a: string, b: string): number {
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  const [claro, oscuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (oscuro + 0.05);
}

const UMBRAL_AA_TEXTO_NORMAL = 4.5;

const TEMAS = ["tokens-nocturno.css", "tokens-papel.css", "tokens-luminoso.css"];

const PARES_TEXTO_FONDO: [string, string][] = [
  ["color-texto", "color-fondo"],
  ["color-texto-sobre-superficie", "color-superficie"],
  ["color-texto-sobre-acento", "color-acento"],
];

for (const archivo of TEMAS) {
  test(`contraste AA (4.5:1) en cada par fondo/texto de ${archivo}`, () => {
    const tokens = leerTokens(archivo);

    for (const [texto, fondo] of PARES_TEXTO_FONDO) {
      expect(tokens[texto], `token ${texto} definido en ${archivo}`).toBeTruthy();
      expect(tokens[fondo], `token ${fondo} definido en ${archivo}`).toBeTruthy();

      const ratio = ratioContraste(tokens[texto], tokens[fondo]);
      expect(ratio, `${texto} sobre ${fondo} en ${archivo}`).toBeGreaterThanOrEqual(
        UMBRAL_AA_TEXTO_NORMAL,
      );
    }
  });
}
