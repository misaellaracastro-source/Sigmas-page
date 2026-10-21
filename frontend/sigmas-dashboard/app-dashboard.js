// Dashboard: resumen de la empresa con sus datos reales (inventario, referencias, cotizaciones, facturas y pendientes).
import { api, urlArchivo, formatoPesos, formatoNumero, escapeHtml } from "../sigmas-inventario/util-inventario.js";

const $ = (id) => document.getElementById(id);
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const plural = (n, uno, varios) => `${formatoNumero(n)} ${n === 1 ? uno : varios}`;

function leerFecha(texto) {
  const [d, h = "00:00"] = texto.split("T");
  const [a, m, dia] = d.split("-").map(Number);
  const [hh, mm] = h.split(":").map(Number);
  return new Date(a, m - 1, dia, hh, mm);
}

const fechaCorta = (texto) => leerFecha(texto).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

// "Hoy 3:00 p. m.", "Mañana", "Vie 24 oct" o "Hace 2 días"
function cuando(texto, conHora = true) {
  const fecha = leerFecha(texto);
  const hoy = new Date();
  const dias = Math.round((new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()) - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000);
  const hora = conHora ? ` ${fecha.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}` : "";
  if (dias === 0) return `Hoy${hora}`;
  if (dias === 1) return `Mañana${hora}`;
  if (dias === -1) return `Ayer${hora}`;
  if (dias < 0) return `Hace ${-dias} días`;
  return mayuscula(fecha.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })) + hora;
}

/* ================= Indicadores ================= */

function pintarIndicadores(d) {
  const totalMateriales = d.inventario.insumos + d.inventario.telas;
  $("kpi-materiales").textContent = formatoNumero(totalMateriales);
  $("kpi-materiales-hint").innerHTML = `${plural(d.inventario.telas, "tela", "telas")} · ${plural(d.inventario.insumos, "insumo", "insumos")}${
    d.inventario.bajos ? ` · <span class="kpi-alerta">${plural(d.inventario.bajos, "bajo el mínimo", "bajo el mínimo")}</span>` : ""
  }`;
  $("kpi-valor").textContent = formatoPesos(d.inventario.valor);
  $("kpi-referencias").textContent = formatoNumero(d.referencias.total);
  $("kpi-referencias-hint").textContent = d.referencias.total
    ? `${plural(d.referencias.este_mes, "creada", "creadas")} este mes · costo promedio ${formatoPesos(d.referencias.promedio)}`
    : "Crea tu primera referencia";
  $("kpi-cotizaciones").textContent = formatoNumero(d.cotizaciones.total);
  $("kpi-cotizaciones-hint").textContent = d.cotizaciones.total
    ? `${formatoPesos(d.cotizaciones.cobrado)} a cobrar · ${plural(d.cotizaciones.este_mes, "este mes", "este mes")}`
    : "Aún no tienes cotizaciones";
  $("kpis").setAttribute("aria-busy", "false");
}

/* ================= Gráfica: total a cobrar por mes ================= */

const ALTO = 220;
const MARGEN = { arriba: 26, derecha: 8, abajo: 30, izquierda: 56 };
const ANCHO_BARRA = 24;
const RADIO = 4;

// $12 M, $850 mil, $0
function compacto(n) {
  if (n >= 1e6) return `$${formatoNumero(Math.round((n / 1e6) * 10) / 10)} M`;
  if (n >= 1e3) return `$${formatoNumero(Math.round(n / 1e3))} mil`;
  return `$${formatoNumero(n)}`;
}

// Tope "redondo" del eje: 1, 2, 2.5 o 5 por potencia de 10
function topeRedondo(valor) {
  if (valor <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(valor));
  return [1, 2, 2.5, 5, 10].map((f) => f * potencia).find((t) => t >= valor);
}

const nombreMes = (mes, formato = "short") => {
  const [a, m] = mes.split("-").map(Number);
  return new Date(a, m - 1, 1).toLocaleDateString("es-CO", formato === "short" ? { month: "short" } : { month: "long", year: "numeric" });
};

let datosGrafica = [];

function pintarGrafica() {
  const contenedor = $("grafica");
  const meses = datosGrafica;
  const ancho = Math.max(280, contenedor.clientWidth);
  const tope = topeRedondo(Math.max(...meses.map((m) => m.total)));
  const area = { ancho: ancho - MARGEN.izquierda - MARGEN.derecha, alto: ALTO - MARGEN.arriba - MARGEN.abajo };
  const y = (v) => MARGEN.arriba + area.alto - (v / tope) * area.alto;
  const banda = area.ancho / meses.length;
  const ultimo = meses.length - 1;
  const hayDatos = meses.some((m) => m.total > 0);

  const lineas = [0, tope / 2, tope]
    .map(
      (v) => `<line x1="${MARGEN.izquierda}" x2="${ancho - MARGEN.derecha}" y1="${y(v)}" y2="${y(v)}" class="g-rejilla" />
        <text x="${MARGEN.izquierda - 8}" y="${y(v)}" class="g-eje" text-anchor="end" dominant-baseline="middle">${compacto(v)}</text>`,
    )
    .join("");

  const barras = meses
    .map((m, i) => {
      const centro = MARGEN.izquierda + banda * i + banda / 2;
      const x = centro - ANCHO_BARRA / 2;
      const alto = y(0) - y(m.total);
      // Barra con la punta redondeada (4px) y la base recta sobre el eje
      const r = Math.min(RADIO, alto);
      const barra =
        m.total > 0
          ? `<path class="g-barra" d="M${x},${y(0)} V${y(m.total) + r} Q${x},${y(m.total)} ${x + r},${y(m.total)} H${x + ANCHO_BARRA - r} Q${x + ANCHO_BARRA},${y(m.total)} ${x + ANCHO_BARRA},${y(m.total) + r} V${y(0)} Z" />`
          : "";
      // Solo el mes actual lleva su valor escrito; los demás se ven al pasar el mouse
      const etiqueta = i === ultimo && m.total > 0 ? `<text x="${centro}" y="${y(m.total) - 8}" class="g-valor" text-anchor="middle">${compacto(m.total)}</text>` : "";
      const descripcion = `${mayuscula(nombreMes(m.mes, "long"))}: ${formatoPesos(m.total)}, ${plural(m.cotizaciones, "cotización", "cotizaciones")}`;
      return `<g class="g-mes" data-i="${i}" tabindex="0" role="img" aria-label="${escapeHtml(descripcion)}">
          <rect class="g-zona" x="${MARGEN.izquierda + banda * i}" y="${MARGEN.arriba}" width="${banda}" height="${area.alto}" />
          ${barra}${etiqueta}
          <text x="${centro}" y="${ALTO - 8}" class="g-eje${i === ultimo ? " es-actual" : ""}" text-anchor="middle">${nombreMes(m.mes).replace(".", "")}</text>
        </g>`;
    })
    .join("");

  contenedor.innerHTML = `
    <svg width="${ancho}" height="${ALTO}" viewBox="0 0 ${ancho} ${ALTO}" aria-hidden="false" focusable="false">
      ${lineas}
      <line x1="${MARGEN.izquierda}" x2="${ancho - MARGEN.derecha}" y1="${y(0)}" y2="${y(0)}" class="g-base" />
      ${barras}
    </svg>
    <div class="g-tooltip" id="g-tooltip" role="status" hidden></div>
    ${hayDatos ? "" : '<p class="g-vacio">Aún no hay cotizaciones en estos meses. <a href="../sigmas-cotizaciones/cotizaciones.html">Crea la primera →</a></p>'}`;

  $("grafica-tabla").querySelector("tbody").innerHTML = meses
    .map((m) => `<tr><td>${mayuscula(nombreMes(m.mes, "long"))}</td><td>${m.cotizaciones}</td><td>${formatoPesos(m.total)}</td></tr>`)
    .join("");
}

// Detalle al pasar el mouse o al moverse con el teclado por los meses
function mostrarDetalle(grupo) {
  const tooltip = $("g-tooltip");
  if (!grupo) return (tooltip.hidden = true);
  const m = datosGrafica[Number(grupo.dataset.i)];
  tooltip.innerHTML = `<strong>${mayuscula(nombreMes(m.mes, "long"))}</strong><span>${formatoPesos(m.total)}</span><small>${plural(m.cotizaciones, "cotización", "cotizaciones")}</small>`;
  tooltip.hidden = false;
  const caja = $("grafica").getBoundingClientRect();
  const zona = grupo.querySelector(".g-zona").getBoundingClientRect();
  const izquierda = Math.min(Math.max(zona.left - caja.left + zona.width / 2 - tooltip.offsetWidth / 2, 0), caja.width - tooltip.offsetWidth);
  tooltip.style.left = `${izquierda}px`;
  $("grafica").querySelectorAll(".g-mes").forEach((g) => g.classList.toggle("is-activo", g === grupo));
}

$("grafica").addEventListener("pointermove", (event) => mostrarDetalle(event.target.closest(".g-mes")));
$("grafica").addEventListener("pointerleave", () => {
  mostrarDetalle(null);
  $("grafica").querySelectorAll(".g-mes").forEach((g) => g.classList.remove("is-activo"));
});
$("grafica").addEventListener("focusin", (event) => mostrarDetalle(event.target.closest(".g-mes")));
$("grafica").addEventListener("focusout", () => mostrarDetalle(null));

new ResizeObserver(() => datosGrafica.length && pintarGrafica()).observe($("grafica"));

/* ================= Referencia destacada ================= */

const CAMISETA = `<svg class="tee-svg" viewBox="0 0 120 140" width="120" height="140"><rect width="120" height="140" rx="12" fill="#3a3e6c" />
  <path d="M38 34c8-10 36-10 44 0l14 12-10 10-8-6v52H42V50l-8 6-10-10 14-12Z" fill="#f4f5fb" stroke="#959bb5" stroke-width="1.2" /></svg>`;

function pintarDestacada(r) {
  if (!r) {
    $("destacada-media").innerHTML = CAMISETA;
    return;
  }
  $("destacada-media").innerHTML = r.foto ? `<img class="feature-foto" src="${escapeHtml(urlArchivo(r.foto))}" alt="" />` : CAMISETA;
  $("destacada-kicker").textContent = `${r.prendas ? "La más cotizada" : "La más reciente"} · ${r.id_referencia}`;
  $("destacada-titulo").textContent = r.tipo || r.id_referencia;
  $("destacada-spec").textContent = [
    plural(Number(r.materiales), "material", "materiales"),
    r.prendas ? `${plural(r.prendas, "prenda cotizada", "prendas cotizadas")}` : `creada ${fechaCorta(r.fecha)}`,
  ].join(" · ");
  $("destacada-precio").textContent = formatoPesos(r.valor_prenda);
  $("destacada-hint").textContent = "Materiales por prenda · COP";
  $("destacada-enlace").textContent = "Ver referencias →";
  $("destacada-enlace").href = "../sigmas-referencias/referencias.html#lista";
}

/* ================= Materiales ================= */

function pintarMateriales(materiales) {
  if (!materiales.length) {
    $("stock-lista").innerHTML = '<p class="dash-vacio">Aún no tienes materiales. <a href="../sigmas-inventario/inventario.html">Regístralos en Inventario →</a></p>';
    return;
  }
  $("stock-lista").innerHTML = materiales
    .map((m) => {
      // La barra llega al 100 % cuando hay 3 veces el mínimo; sin mínimo, se ve llena
      const lleno = m.stock_minimo > 0 ? Math.min(100, Math.max(0, (m.cantidad / (m.stock_minimo * 3)) * 100)) : 100;
      const unidad = m.unidad ? ` ${escapeHtml(m.unidad)}` : "";
      return `<div class="stock-row${m.bajo ? " is-bajo" : ""}">
        <div class="stock-meta">
          <span class="stock-name">${escapeHtml(m.nombre)} <small>${m.tipo === "Insumo" ? "Insumo" : "Tela"} · ${escapeHtml(m.codigo)}</small></span>
          <span class="stock-qty">${formatoNumero(m.cantidad)}${unidad}</span>
        </div>
        <div class="bar" role="img" aria-label="${escapeHtml(`${m.nombre}: ${formatoNumero(m.cantidad)}${m.unidad ? ` ${m.unidad}` : ""}, mínimo ${formatoNumero(m.stock_minimo)}`)}">
          <span class="bar-fill" style="width: ${lleno}%"></span>
        </div>
        <p class="stock-detail">${m.bajo ? '<span class="estado-bajo">⚠ Bajo el mínimo</span> · ' : ""}Mínimo ${formatoNumero(m.stock_minimo)}${unidad}</p>
      </div>`;
    })
    .join("");
}

/* ================= Lo que viene ================= */

function pintarAgenda(d) {
  const f = d.facturas;
  const chips = [
    f.vencidas ? `<a class="agenda-chip is-mal" href="../sigmas-factura/factura.html#lista">${plural(f.vencidas, "factura vencida", "facturas vencidas")}</a>` : "",
    f.por_vencer ? `<a class="agenda-chip is-aviso" href="../sigmas-factura/factura.html#lista">${plural(f.por_vencer, "por vencer", "por vencer")}</a>` : "",
    f.en_proceso ? `<a class="agenda-chip" href="../sigmas-factura/factura.html#lista">${plural(f.en_proceso, "factura en proceso", "facturas en proceso")}</a>` : "",
  ].join("");
  $("agenda-chips").innerHTML = chips;
  $("agenda-chips").hidden = !chips;

  const ahora = new Date();
  const items = [
    ...d.proximos.map(
      (e) => `<li><a class="agenda-item${leerFecha(e.fecha) < ahora ? " is-atrasado" : ""}" href="../sigmas-calendario/calendario.html#evento-${e.id_evento}">
        <span class="agenda-icono ${e.es_entrega ? "is-entrega" : "is-pendiente"}" aria-hidden="true"></span>
        <span class="agenda-texto"><strong>${escapeHtml(e.titulo)}</strong><small>${e.es_entrega ? "Entrega · " : ""}${escapeHtml(cuando(e.fecha))}${e.prioridad === "Alta" ? " · prioridad alta" : ""}</small></span>
        ${leerFecha(e.fecha) < ahora ? '<span class="agenda-estado">Atrasado</span>' : ""}
      </a></li>`,
    ),
    ...f.pendientes.map(
      (fa) => `<li><a class="agenda-item${fa.estado === "Vencida" ? " is-atrasado" : ""}" href="../sigmas-factura/factura.html#lista">
        <span class="agenda-icono is-factura" aria-hidden="true"></span>
        <span class="agenda-texto"><strong>Factura ${escapeHtml(fa.nombre_factura)}</strong><small>${escapeHtml(fa.empresa)} · vence ${escapeHtml(cuando(fa.fecha_vencimiento, false).toLowerCase())}</small></span>
        ${fa.estado === "Vencida" ? '<span class="agenda-estado">Vencida</span>' : ""}
      </a></li>`,
    ),
  ];
  $("agenda-lista").innerHTML = items.length
    ? items.join("")
    : '<li class="dash-vacio">Nada pendiente para los próximos 7 días. <a href="../sigmas-calendario/calendario.html">Agrega un pendiente →</a></li>';
}

/* ================= Referencias recientes ================= */

function pintarReferencias(lista) {
  $("refs-cuerpo").innerHTML = lista.length
    ? lista
        .map(
          (r, i) => `<tr${i === 0 ? ' class="is-highlight"' : ""}>
        <td data-label="Referencia"><span class="ref-celda">${r.foto ? `<img src="${escapeHtml(urlArchivo(r.foto))}" alt="" loading="lazy" />` : '<span class="ref-sin-foto" aria-hidden="true"></span>'}<span class="code">${escapeHtml(r.id_referencia)}</span></span></td>
        <td data-label="Tipo de prenda">${escapeHtml(r.tipo || "")}</td>
        <td data-label="Creada">${fechaCorta(r.fecha)}</td>
        <td data-label="Composición">${plural(Number(r.materiales), "material", "materiales")}${r.cotizaciones ? ` · ${plural(Number(r.cotizaciones), "cotización", "cotizaciones")}` : ""}</td>
        <td data-label="Costo / prenda" class="num">${formatoPesos(r.valor_prenda)}</td>
      </tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="dash-vacio">Aún no tienes referencias. <a href="../sigmas-referencias/referencias.html">Crea la primera →</a></td></tr>';
}

/* ================= Inicio ================= */

$("meta-fecha").textContent = mayuscula(new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));

async function cargar() {
  try {
    const d = await api("/dashboard");
    $("dash-error").hidden = true;
    pintarIndicadores(d);
    datosGrafica = d.cotizaciones.meses;
    pintarGrafica();
    $("grafica-sub").textContent = `${formatoPesos(d.cotizaciones.meses.reduce((s, m) => s + m.total, 0))} en los últimos 6 meses · COP`;
    pintarDestacada(d.destacada);
    pintarMateriales(d.inventario.materiales);
    pintarAgenda(d);
    pintarReferencias(d.referencias_recientes);
  } catch (error) {
    $("dash-error").textContent = `No se pudo cargar el resumen: ${error.message}`;
    $("dash-error").hidden = false;
  }
}

cargar();
