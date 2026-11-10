# Specification Quality Checklist: De la Compra al QR

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-10
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Validación pasada en la primera iteración. Observaciones del proceso:

- **Cero marcadores [NEEDS CLARIFICATION]**: cada hueco se resolvió con un supuesto
  documentado en la sección Assumptions, no con una pregunta. Los tres que estuvieron más
  cerca de necesitar clarificación, y por qué se resolvieron solos:
  1. *¿El entregable es un archivo imprimible o una tarjeta física enviada?* Se asumió
     archivo imprimible. Una tarjeta física arrastra logística, envío y domicilio del
     comprador, lo que choca de frente con el Principio V (datos mínimos). Si el negocio
     decide enviar tarjetas, es una feature aparte, no un detalle de esta.
  2. *¿Cómo pide correcciones el comprador después de ver la revisión?* Lo decide la
     constitución, no el gusto: el Principio III exige poder corregir sin límite, y el
     único camino que no inventa un segundo mecanismo de edición es volver a la propia
     carga mientras el regalo siga en revisión (FR-014).
  3. *¿Los regalos nacen con expiración?* Se asumió vigencia permanente. La feature 001 ya
     hace cumplir una expiración si existe; fijarla en nulo es coherente con que lo
     entregado es inmutable.

- **Tensión de principios que el plan debe resolver, no esconder**: FR-020 (las fotos no
  accesibles de forma permanente, acceso resuelto al mostrarlas) revisa la decisión #6 de
  `specs/001-pagina-regalo/research.md`, que había descartado explícitamente las direcciones
  firmadas por miedo a que una firma vencida rompiera un QR ya impreso. El spec enuncia el
  requisito en términos de resultado observable y deja la resolución al plan; la salida
  esperada es que la dirección de acceso nazca y muera dentro de cada visualización, sin
  quedar nunca guardada ni impresa, con lo cual el Principio VI queda intacto.

- **FR-005 y FR-024 no son requisitos genéricos**: los dos salen de algo verificado, no
  supuesto. FR-024 (no emitir QR sin dominio propio) viene de que hoy la dirección pública es
  un deploy interno de simulación. FR-005 (verificar autenticidad, nunca procedencia) viene de
  una medición en el entorno real, refinada durante el plan: el rechazo por falta de cabecera
  de origen **depende del content-type**. Un aviso en `application/json` pasa incluso sin esa
  cabecera —y es lo que mandan los proveedores de pago habituales—, mientras que uno en
  formulario o sin content-type se rechaza con 403. El requisito queda igual de válido: la
  protección correcta es la firma, y la del chequeo de origen no es una protección sobre la
  que se pueda apoyar un webhook. Lo que cambia es que no hace falta debilitar esa
  configuración para recibir avisos, como se había supuesto al escribir el spec.

- **Revisión posterior a las decisiones del negocio (2026-11-10)**: dos supuestos cambiaron
  tras confirmarlos con quien vende, y el spec se actualizó sin perder ningún item del
  checklist.
  1. *Peso de las fotos*: se agregan FR-037 a FR-039. El original de hasta 10 MB se sigue
     aceptando, pero no se almacena: cada foto se reduce al subirla al tamaño que la página
     realmente necesita y se le quitan los metadatos. Un requisito de ahorro de almacenamiento
     que además sirve al Principio I (página más rápida) y al Principio V (desaparecen los
     datos de ubicación que traen las fotos de celular). Medido por SC-013 a SC-015.
  2. *Número de celular para publicidad*: se agregan FR-034 a FR-036. Este **no era un cambio
     de spec sino de gobernanza**: el Principio V, tal como estaba escrito, prohíbe guardar
     cualquier dato que no sea necesario para renderizar y entregar la página, y un teléfono
     para publicidad no lo es. Se enmendó la constitución a v1.3.0 con una excepción acotada
     —opcional, propósito declarado al pedirlo, consentimiento no pre-aceptado, vía de baja que
     borra— antes de escribir el requisito. El spec no habría podido cumplir el checklist
     contradiciendo la constitución vigente.

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
