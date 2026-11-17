# Cómo entrar a administrar los pedidos

Esto no es documentación del código: es la nota que vas a querer encontrar el día que no te
acuerdes cómo entrar.

## La puerta

```
https://regalos-qr-nine.vercel.app/admin
```

Usuario y contraseña. Guardalos en el gestor de contraseñas del teléfono —ahí el formulario
se autocompleta solo— y no en una nota.

La sesión queda abierta **12 horas** en ese navegador y **se renueva sola cada vez que abrís
la cola**: entrás a la mañana y no te vuelve a pedir nada en toda la jornada. Doce horas sin
tocarla y hay que escribir las credenciales de nuevo. En el teléfono conviene **agregar la
página a la pantalla de inicio**: queda como una app.

Cuando terminás en un navegador que no es tuyo, apretá **Salir**.

## Por qué `/pedidos` contesta "no existe" si entrás sin la sesión

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

## Cambiar la contraseña (o si perdés el teléfono)

```bash
npm run ops:clave -- charles
```

Te pide la contraseña nueva dos veces sin mostrarla e imprime las dos líneas para pegar. La
contraseña en texto plano no queda guardada en ningún lado: ni en `.env`, ni en el historial
del shell, ni en la salida del script. Lo que se guarda es `OPS_PASSWORD_HASH`, un hash
scrypt con sal — con eso no se entra.

Pegá las dos líneas en tu `.env` local y subí el hash a Vercel:

```bash
vercel env rm OPS_PASSWORD_HASH production --yes
printf '%s' '<el hash que imprimió el script>' | vercel env add OPS_PASSWORD_HASH production
vercel --prod
```

Eso **cierra todas las sesiones abiertas de golpe**, en todos los teléfonos, porque la cookie
va firmada con una clave derivada del hash. No hay lista de sesiones que revisar.

## La otra credencial: `OPS_SECRET`

No se usa para entrar por el navegador. Es la credencial de las **máquinas**: las rutas de API
(`Authorization: Bearer <OPS_SECRET>`) y los scripts de operación. También sirve de vía de
emergencia para abrir la cola sin formulario, por si alguna vez tenés el entorno del proyecto
a mano y la contraseña no:

```
/pedidos?clave=<OPS_SECRET>
```

Evitá ese camino salvo apuro real: el secreto queda en el historial del navegador, en las
sugerencias de la barra de direcciones y en cualquier captura de pantalla. Para eso existe
`/admin`.

```bash
# copiarlo al portapapeles desde el proyecto
grep ^OPS_SECRET= .env | cut -d= -f2- | tr -d '\n' | pbcopy
```

Rotarlo también cierra todas las sesiones abiertas:

```bash
vercel env rm OPS_SECRET production --yes
printf '%s' "$(openssl rand -hex 32)" | vercel env add OPS_SECRET production
vercel --prod
```

Acordate de actualizar también tu `.env` local, que lo usan los scripts de operación.
