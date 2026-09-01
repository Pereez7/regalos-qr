/* ═══════════════════════════════════════════════════════════════════
   CORAZONES · lluvia al abrir el sobre y al responder la pregunta
   Sin dependencias. Toma el color del tema activo.
   Se apaga solo. Respeta prefers-reduced-motion.
   ═══════════════════════════════════════════════════════════════════ */

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
let raf;

function dibujarCorazon(ctx, x, y, s, rot, color, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 3);
  ctx.bezierCurveTo(-5, -2, -5, -7, 0, -4.5);
  ctx.bezierCurveTo(5, -7, 5, -2, 0, 3);
  ctx.fill();
  ctx.restore();
}

export function lluviaDeCorazones(cuantos = 34, duracion = 8000) {
  if (reduce) return;

  const cv = document.getElementById("corazones");
  if (!cv) return;
  const ctx = cv.getContext("2d");

  cancelAnimationFrame(raf);
  cv.width = innerWidth;
  cv.height = innerHeight;

  const color = getComputedStyle(document.documentElement)
    .getPropertyValue("--acento").trim();

  const ps = Array.from({ length: cuantos }, () => ({
    x: Math.random() * cv.width,
    y: -Math.random() * cv.height * 0.6,
    s: 1.4 + Math.random() * 2.4,
    v: 0.55 + Math.random() * 1.15,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.045,
    a: 0.35 + Math.random() * 0.45,
    f: Math.random() * 6
  }));

  const t0 = Date.now();

  (function paso() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    const t = Date.now() - t0;
    const fade = t > duracion - 1400 ? Math.max(0, (duracion - t) / 1400) : 1;

    for (const p of ps) {
      p.y += p.v;
      p.x += Math.sin((p.y + p.f * 40) / 60) * 0.75;
      p.r += p.vr;
      if (p.y > cv.height + 24) p.y = -24;
      dibujarCorazon(ctx, p.x, p.y, p.s, p.r, color, p.a * fade);
    }

    if (t < duracion) raf = requestAnimationFrame(paso);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

/* ─── Apertura del sobre ──────────────────────────────────────────────
   Secuencia escalonada. El orden importa: si todo pasa junto se ve a
   efecto; escalonado se ve a objeto que se abre.
     0 ms     sello se hunde, solapa empieza a rotar
     380 ms   la tarjeta empieza a salir
     700 ms   arrancan los corazones
     1450 ms  se revela la página                                     */

export function activarSobre(alAbrir) {
  const sobre = document.getElementById("sobre");
  const boton = document.getElementById("abrir-sobre");
  if (!sobre || !boton) return;

  boton.addEventListener("click", () => {
    sobre.classList.add("abriendo");
    setTimeout(() => lluviaDeCorazones(34, 8000), 700);
    setTimeout(() => {
      sobre.classList.add("fin");
      document.body.classList.remove("bloqueado");
      if (typeof alAbrir === "function") alAbrir();
    }, 1450);
  }, { once: true });
}
