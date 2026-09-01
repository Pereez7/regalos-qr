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
const UMBRAL_AA_TEXTO_GRANDE = 3.0;

// Pares fondo/texto por tema y su umbral, tal como quedan documentados en el
// encabezado de cada archivo tokens-*.css. acento/realce que el encabezado marca
// "solo texto grande" se validan contra 3:1, no 4.5:1.
const PARES_POR_TEMA: Record<string, [string, string, number][]> = {
  "tokens-luminoso.css": [
    ["texto", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["texto-suave", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["acento", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["realce", "fondo", UMBRAL_AA_TEXTO_NORMAL],
  ],
  "tokens-nocturno.css": [
    ["texto", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["texto-suave", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["realce", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["acento", "fondo", UMBRAL_AA_TEXTO_GRANDE], // solo gráficos y texto grande
  ],
  "tokens-papel.css": [
    ["texto", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["texto-suave", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["acento", "fondo", UMBRAL_AA_TEXTO_NORMAL],
    ["realce", "fondo", UMBRAL_AA_TEXTO_GRANDE], // AA para texto grande
  ],
};

for (const [archivo, pares] of Object.entries(PARES_POR_TEMA)) {
  test(`contraste AA de cada par fondo/texto documentado en ${archivo}`, () => {
    const tokens = leerTokens(archivo);

    for (const [texto, fondo, umbral] of pares) {
      expect(tokens[texto], `token --${texto} definido en ${archivo}`).toBeTruthy();
      expect(tokens[fondo], `token --${fondo} definido en ${archivo}`).toBeTruthy();

      const ratio = ratioContraste(tokens[texto], tokens[fondo]);
      expect(ratio, `--${texto} sobre --${fondo} en ${archivo}`).toBeGreaterThanOrEqual(umbral);
    }
  });
}
