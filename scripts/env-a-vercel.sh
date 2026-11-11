#!/usr/bin/env bash
# Carga en Vercel las variables del cobro que están en .env, sin imprimir sus valores.
#
#   bash scripts/env-a-vercel.sh                 # production
#   bash scripts/env-a-vercel.sh preview         # otro entorno
#
# Reemplaza la variable si ya existía. No toca las que no están en la lista: SUPABASE_*,
# OPS_SECRET, SITIO_URL, MODO_INTERNO y ACCESO_INTERNO_SECRETO ya viven en Vercel y se
# administran aparte.
#
# DATABASE_URL no se sube nunca: la aplicación no la usa. Su único uso es aplicar migraciones
# desde esta máquina, y una contraseña de base en el entorno de la app es superficie que no
# hace falta.

set -euo pipefail

ENTORNO="${1:-production}"
ARCHIVO=".env"

VARIABLES=(
  PAGO_PROVEEDOR
  PAGO_QR_SECRETO
  CORREO_PROVEEDOR
  PRECIO
  MONEDA
  QR_PAGO_IMAGEN
  QR_PAGO_TITULAR
  QR_PAGO_BANCO
  EJEMPLO_SLUG
)

[ -f "$ARCHIVO" ] || { echo "no encuentro $ARCHIVO"; exit 1; }

for clave in "${VARIABLES[@]}"; do
  valor="$(grep -E "^${clave}=" "$ARCHIVO" | head -1 | cut -d= -f2-)"

  if [ -z "$valor" ]; then
    echo "  omitida (vacía en $ARCHIVO): $clave"
    continue
  fi

  vercel env rm "$clave" "$ENTORNO" --yes >/dev/null 2>&1 || true
  printf '%s' "$valor" | vercel env add "$clave" "$ENTORNO" >/dev/null
  echo "  cargada: $clave"
done

echo
echo "listo. Las variables se aplican en el PRÓXIMO deploy:"
echo "  vercel --prod"
