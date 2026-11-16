# Cómo entrar a administrar los pedidos

Esto no es documentación del código: es la nota que vas a querer encontrar el día que no te
acuerdes cómo entrar.

## La puerta

```
https://regalos-qr-nine.vercel.app/admin
```

Pegás la **clave de operación** y entrás. La clave es el valor de `OPS_SECRET`.

```bash
# copiarla al portapapeles desde el proyecto
grep ^OPS_SECRET= .env | cut -d= -f2- | tr -d '\n' | pbcopy
```

Guardala en el gestor de contraseñas del teléfono. Es la única llave.

Una vez adentro, el navegador queda recordado **30 días** y entrás escribiendo `/pedidos` a
secas. En el teléfono conviene **agregar la página a la pantalla de inicio**: queda como una
app y abre sin pedir nada.

## Por qué `/pedidos` contesta "no existe" si entrás sin la clave

No es un error. Esa página lista correos de compradores y tiene el botón que confirma pagos,
así que sin credencial responde **404** y no "no autorizado": un 401 le confirmaría a
cualquiera que ahí hay algo que forzar. La puerta es `/admin`.

## Qué vas a ver

Cinco listas, en el orden en que importan:

1. **Pagos por QR esperando confirmación.** Lo que vas a usar todos los días. Alguien dice
   haber pagado y dejó su número de comprobante. Lo buscás en tu app del banco y, si está,
   apretás **Recibí este pago**. Confirmar dos veces no cobra dos veces.
2. **Pagados sin regalo entregado.** Pagaron y todavía no mandaron su historia, o la mandaron
   y falta que el comprador la apruebe.
3. **Intentos abandonados.** Empezaron a comprar y nunca pagaron. Es basura inofensiva.
4. **Avisos de pago sin pedido.** No debería haber ninguno nunca. Si aparece algo, miralo.
5. **Discrepancias de monto.** Pagaron distinto de lo cotizado. El pedido no se bloquea: el
   comprador recibe lo suyo y vos decidís qué hacer con la diferencia.

## Lo que todavía tenés que hacer a mano

**Mandar el enlace al comprador.** Mientras no haya dominio propio no se pueden enviar
correos, así que después de confirmar un pago hay que escribirle vos. El correo está en la
misma fila de la cola.

## Si perdés el teléfono

Cambiá `OPS_SECRET` en Vercel y volvé a desplegar. Eso **invalida todas las sesiones abiertas
de golpe**, porque la cookie guarda un valor derivado de ese secreto y no el secreto mismo. No
hay lista de sesiones que revisar.

```bash
vercel env rm OPS_SECRET production --yes
printf '%s' "$(openssl rand -hex 32)" | vercel env add OPS_SECRET production
vercel --prod
```

Acordate de actualizar también tu `.env` local, que lo usan los scripts de operación.
