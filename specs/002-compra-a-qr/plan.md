# Implementation Plan: De la Compra al QR

**Branch**: `002-compra-a-qr` | **Date**: 2026-11-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-compra-a-qr/spec.md`

## Summary

Construir el camino comercial que le falta al producto: una landing que explica y vende, un
cobro que registra el pedido antes de cualquier acción derivada, un formulario por pasos donde
el comprador carga su historia con autoguardado real, la traducción de esa historia al contenido
versionado que ya consume el motor de la feature 001, y la generación del QR y la tarjeta
imprimible. Todo tiene que poder recorrerse de punta a punta sin cuenta en ningún proveedor de
pago ni de correo y sin dominio propio: el pago y el correo viven detrás de adaptadores con un
proveedor simulado, y el generador de QR se niega a emitir mientras la dirección pública del
sitio sea el deploy interno de simulación.

El motor de bloques de la feature 001 no se modifica. Lo único que cambia del código existente
son dos archivos de la capa de datos: un campo opcional nuevo en el esquema de contenido
(`foto.ruta`) y la resolución de ese campo a una dirección firmada dentro de `src/lib/regalos.ts`,
de modo que los ocho componentes de bloque sigan recibiendo `foto.url` ya resuelto sin saber que
detrás hay un bucket privado.

## Technical Context

**Language/Version**: TypeScript 5.x sobre Astro 7 (Node.js 20 LTS en runtime serverless)

**Primary Dependencies**: Astro 7 (`output: "server"`), `@astrojs/vercel` en el deploy y
`@astrojs/node` en local, `@supabase/supabase-js`, `zod` (dos esquemas separados: borrador y
contenido), `sharp` (reducción de fotos y composición de la tarjeta), `qrcode` (generación del
código), `resend` (proveedor real de correo, detrás del adaptador), `@playwright/test` (dev)

**Storage**: Supabase Postgres — tablas nuevas `pedidos`, `pagos`, `eventos_pago`, `avisos`,
sin tocar `regalos`, `slugs` ni `aperturas`. Supabase Storage — bucket `fotos` privado,
declarado con `public = false` en `supabase/config.toml`

**Testing**: Playwright contra un build de preview, con un test de recorrido completo
(`venta-completa.spec.ts`) más un gate por requisito crítico. Los 28 tests de la feature 001
siguen siendo el perímetro: si alguno rompe, el cambio salió de lo acordado

**Target Platform**: Web, SSR en Vercel (funciones serverless Node). Comprador mayormente desde
escritorio o celular; destinatario desde celular

**Performance Goals**: la página del regalo mantiene los presupuestos de la feature 001
(portada visible en menos de 2,5 s en 3G simulada, JavaScript por debajo de 100 KB duro). Las
páginas nuevas de compra y carga no heredan ese presupuesto, pero deben funcionar completas sin
JavaScript

**Constraints**: cuerpo de petición limitado a 4,5 MB en Vercel, lo que obliga a reducir la foto
en el navegador antes de subirla (research.md #5); `security.checkOrigin` queda encendido y los
webhooks aceptan solo `application/json` (research.md #1); ninguna firma de acceso a una foto se
persiste ni se imprime (research.md #6); el slug se asigna una sola vez y no cambia entre
correcciones (research.md #9); ningún campo de comercio dentro de `regalos` (research.md #10)

**Scale/Scope**: un solo producto con un solo precio. Cuatro historias de usuario, 39 requisitos
funcionales, 4 tablas nuevas, 2 adaptadores con proveedor simulado, 1 generador de QR. Sin panel
de administración, sin redacción asistida por IA, sin catálogo de ediciones temáticas, sin envío
físico (todo fuera de alcance, ver spec.md)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución vigente: **v1.3.1**, siete principios y 17 Compuertas de Aceptación.

| # | Principio / regla | Estado | Cómo se cumple |
|---|---|---|---|
| I | El regalo abre primero | PASS | La página del regalo no recibe ni un byte nuevo de JavaScript (research.md #17). La única ida y vuelta añadida a su render es la firma por lote de las fotos (research.md #6), vigilada por el `lcp.spec.ts` que ya existe. Las páginas nuevas funcionan completas sin JavaScript: cada paso del formulario es un `<form>` que hace POST (research.md #8). |
| II | Bloques, no plantillas | PASS | No se agrega ni se modifica ningún tipo de bloque. El borrador se traduce a una receta usando los ocho tipos existentes. El principio se aplica además a dos superficies nuevas: el adaptador de pago y el de correo son un archivo por proveedor con un registro, igual que `src/bloques/registro.ts` (research.md #3, #12). Ningún campo de comercio entra en `regalos` (research.md #10). |
| III | Nada se publica sin aprobación | PASS | El regalo nace en `en_revision` y la aprobación sigue siendo la de la feature 001, sin reimplementarse. FR-014 hace cumplible la parte que hasta hoy estaba declarada y no construida —corregir sin límite— volviendo a la propia carga mientras el regalo siga en revisión (research.md #9). |
| IV | La IA redacta, no inventa | N/A | La redacción asistida está fuera de alcance (spec.md). Sin superficie de IA que verificar. |
| V | Datos mínimos, borrado real | PASS | Bucket privado y declarado como infraestructura (research.md #15). Originales no almacenados y metadatos eliminados, incluida la ubicación GPS de las fotos de celular (research.md #5). Borrado extendido a las cuatro tablas nuevas conservando la fila de `slugs` (research.md #16). Sin analítica de terceros. El celular publicitario se apoya en la excepción acotada que la constitución v1.3.0 incorporó explícitamente, con consentimiento no pre-aceptado, propósito declarado y baja que borra (research.md #13). |
| VI | Lo entregado es inmutable | PASS | `/r/[slug]` no cambia de forma. El slug se asigna una vez y sobrevive a las correcciones; las filas de `slugs` nunca se borran (research.md #9, #16). `foto.ruta` se agrega como campo opcional sin tocar `foto.url`, y el fixture dorado `contenido-v1.json` queda intacto como gate (research.md #7). La compuerta del QR hace imposible emitir un código que apunte al deploy interno (research.md #11). |
| VII | Ningún pedido se pierde | PASS | El pedido nace antes de ir a pagar (research.md #4). La idempotencia la garantiza una restricción única en `eventos_pago`, con la firma verificada antes de insertar para que nadie pueda envenenar la clave de idempotencia (research.md #2). La protección del webhook es la firma, y la medición de research.md #1 confirma que no hace falta tocar la configuración de origen para recibirla. Cero datos de tarjeta. Cola operativa en una sola ruta, con compuerta propia e independiente de la del deploy interno, porque sus ciclos de vida son opuestos (research.md #14). Proveedor detrás de adaptador, con simulado (research.md #3). |
| — | Presupuesto de JS (<100 KB duro) | PASS | Presupuesto por página: `/r/[slug]` y `/revisar/[id]` quedan en cero añadido y `presupuesto-js.spec.ts` lo vigila. La reducción de fotos en el navegador son unas pocas líneas de canvas vanilla, y viven en las páginas de carga, no en la del regalo (research.md #5, #17). |
| — | Accesibilidad y 360 px | PASS | FR-032 exige 320–1440 px sin scroll horizontal en todas las páginas nuevas, con el mismo gate que ya usa la feature 001. Los formularios son HTML nativo con etiquetas asociadas, lo que resuelve foco y lectores de pantalla sin trabajo extra. |
| — | Sin HTML crudo del comprador | PASS | FR-017 lo exige en la carga y en el regalo. `escape-html.spec.ts` de la feature 001 ya cubre el lado del render; esta feature agrega la verificación del lado de la carga. |

Sin violaciones que requieran la sección de Complexity Tracking.

**Re-chequeo post Phase 1** (tras research.md, data-model.md, contracts/ y quickstart.md):
ningún artefacto de diseño introdujo una violación nueva. Dos puntos merecen registro porque
cambiaron de "cumplido por diseño" a "cumplido y verificable":

- **Principio VII** — la idempotencia pasó de ser una intención a ser una restricción de base
  de datos sobre `(proveedor, evento_id)`, con la firma verificada *antes* de insertar, y el
  contrato del webhook fija
  que un duplicado responde 200 y nunca 409, para no provocar reintentos infinitos del proveedor.
- **Principio VI** — la compuerta del QR dejó de ser una advertencia y pasó a ser una negativa:
  el generador no emite si el host de `SITIO_URL` termina en `vercel.app`, es `localhost` o es
  una IP, y lo que emite marcado como simulación lleva la palabra estampada sobre la tarjeta, no
  solo en el nombre del archivo.

**Corrección registrada durante Phase 0**: el spec se escribió asumiendo que la configuración de
origen de Astro rechazaría los avisos de pago y que habría que debilitarla. La medición contra el
deploy real (research.md #1) mostró que el rechazo depende del content-type y que un aviso en
`application/json` pasa sin problema. El requisito FR-005 no cambia —la protección correcta sigue
siendo la firma— pero el plan **no** debilita ninguna configuración de seguridad, que era el
riesgo que esa suposición traía. La razón del Principio VII en la constitución se corrigió en
v1.3.1 por el mismo motivo.

## Project Structure

### Documentation (this feature)

```text
specs/002-compra-a-qr/
├── plan.md                      # This file (/speckit-plan command output)
├── spec.md                      # Feature specification
├── research.md                  # Phase 0 output — 23 decisiones
├── data-model.md                # Phase 1 output
├── quickstart.md                # Phase 1 output
├── contracts/                   # Phase 1 output
│   ├── api-iniciar-compra.md
│   ├── api-webhook-pago.md
│   ├── api-borrador.md
│   ├── api-fotos.md
│   ├── api-enviar-historia.md
│   ├── api-baja-publicidad.md
│   ├── borrador.schema.md
│   └── qr-y-tarjeta.md
├── checklists/
│   └── requirements.md
└── tasks.md                     # Phase 2 output (/speckit-tasks — NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── pagos/                       # Principio II aplicado al cobro: un archivo por proveedor
│   │   ├── tipos.ts                 # iniciarCobro() / interpretarAviso()
│   │   ├── registro.ts              # Mapa proveedor (string) → adaptador
│   │   └── simulado.ts              # Único proveedor al cierre; firma HMAC real (research.md #3)
│   ├── correo/                      # Mismo patrón para los avisos
│   │   ├── tipos.ts
│   │   ├── registro.ts
│   │   ├── consola.ts               # Proveedor de desarrollo y simulación
│   │   └── resend.ts                # Proveedor de producción
│   ├── borrador/
│   │   ├── esquema.ts               # zod del borrador: admite incompleto (research.md #8)
│   │   └── a-contenido.ts           # Traducción borrador → contenido v1 del motor
│   ├── pedidos.ts                   # Altas, transiciones de estado, cola operativa
│   ├── fotos.ts                     # Reducción con sharp, metadatos fuera, firma por lote
│   ├── qr.ts                        # Generación + compuerta de SITIO_URL (research.md #11)
│   ├── contenido/
│   │   ├── esquema.ts               # MODIFICADO: foto.ruta opcional (research.md #7)
│   │   └── tipos-bloque.ts          # MODIFICADO: foto.ruta opcional
│   └── regalos.ts                   # MODIFICADO: resuelve foto.ruta a firma (research.md #6)
├── pages/
│   ├── index.astro                  # Landing: propuesta, ejemplos, precio, una sola acción
│   ├── comprar.astro                # POST → crea pedido `iniciado` y redirige al cobro
│   ├── gracias/[pedido].astro       # Estado real del pedido + enlace de carga
│   ├── contar/
│   │   └── [pedido]/[paso].astro    # Un paso por petición, sin JavaScript obligatorio
│   ├── baja/[token].astro           # Baja publicitaria que borra el número (research.md #13)
│   ├── pedidos.astro                # Cola operativa, compuerta propia de OPS_SECRET (#14)
│   └── api/
│       ├── pagos/
│       │   └── webhook/[proveedor].ts   # Solo application/json; firma primero, luego insert
│       ├── regalos/[id]/
│       │   └── aprobar.ts               # MODIFICADO (001): emite el aviso de aprobación
│       └── pedidos/[id]/
│           ├── borrador.ts
│           ├── fotos.ts
│           ├── enviar.ts
│           └── eliminar.ts              # FR-030, con OPS_SECRET (research.md #16)
└── middleware.ts                    # Sin cambios. Ojo: NO protege /pedidos (research.md #14)

scripts/
└── generar-qr.ts                    # npm run qr -- <slug>; se niega sin dominio propio

supabase/
├── config.toml                      # MODIFICADO: bucket fotos con public = false
└── migrations/
    └── 0002_pedidos.sql             # pedidos, pagos, eventos_pago, avisos + índices

tests/
└── e2e/
    ├── venta-completa.spec.ts           # El recorrido entero: landing → QR
    ├── pago-idempotente.spec.ts         # Avisos duplicados y simultáneos; firma inválida; 415
    ├── borrador-autoguardado.spec.ts    # Cerrar la pestaña y volver sin perder nada
    ├── envio-unico.spec.ts              # Doble envío = un solo regalo, un solo slug
    ├── fotos-privadas.spec.ts           # Original no almacenado, sin metadatos, inaccesible
    ├── celular-opcional.spec.ts         # Compra sin celular; baja que borra
    ├── qr-compuerta.spec.ts             # Se niega a emitir sin dominio propio
    └── cola-operativa.spec.ts           # Pedido pagado sin regalo aparece en la cola
```

**Structure Decision**: se mantiene el proyecto único Astro de la feature 001 (páginas SSR y
rutas API en el mismo despliegue). No se introduce separación frontend/backend porque no hay
backend independiente ni cliente SPA: la interactividad sigue viviendo en `<script>` vanilla por
página, y las páginas de esta feature funcionan completas sin JavaScript.

Del código de la feature 001 se tocan exactamente tres archivos (research.md #20):
`src/lib/contenido/esquema.ts` con `tipos-bloque.ts` (campo `foto.ruta` opcional),
`src/lib/regalos.ts` (resolución de la firma) y `src/pages/api/regalos/[id]/aprobar.ts`, que
emite el aviso de aprobación por ser el único punto del sistema que se entera de que la
aprobación ocurrió. Ninguno forma parte del motor de bloques, y los 28 tests de la feature 001
son el gate.

Los dos puntos de extensión nuevos —`src/lib/pagos/` y `src/lib/correo/`— replican
deliberadamente la forma de `src/bloques/`: una interfaz, un registro, un archivo por
implementación. Es el Principio II leído como lo que es, una regla sobre cómo se agregan cosas
al sistema, y no solo una regla sobre bloques de contenido.

## Complexity Tracking

*Sin violaciones a la constitución. Sección no aplica.*
