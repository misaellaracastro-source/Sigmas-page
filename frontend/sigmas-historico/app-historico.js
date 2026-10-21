// Histórico: referencias, cotizaciones, fichas técnicas, facturas y pendientes en una línea de tiempo por fecha,
// con filtros de periodo, búsqueda y secciones, y el reporte en Excel o PDF.
import { api, escapeHtml, formatoPesos, avisar, mostrarVacio } from "../sigmas-inventario/util-inventario.js";

const $ = (id) => document.getElementById(id);

const SECCIONES = {
  referencia: { nombre: "Referencias", singular: "Referencia", enlace: "../sigmas-referencias/referencias.html#lista" },
  cotizacion: { nombre: "Cotizaciones", singular: "Cotización", enlace: "../sigmas-cotizaciones/cotizaciones.html#lista" },
  ficha: { nombre: "Fichas técnicas", singular: "Ficha técnica", enlace: "../sigmas-ficha-tecnica/ficha-tecnica.html#lista" },
  factura: { nombre: "Facturas", singular: "Factura", enlace: "../sigmas-factura/factura.html#lista" },
  pendiente: { nombre: "Pendientes", singular: "Pendiente", enlace: "../sigmas-calendario/calendario.html" },
};
const CLASE_ESTADO = { Pagada: "is-bien", Completado: "is-bien", "En proceso": "is-proceso", Pendiente: "is-proceso", Vencida: "is-mal", Cancelado: "" };

let filas = [];
let esperaBusqueda;

function iso(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

function leerFecha(texto) {
  const [a, m, d] = texto.split("-").map(Number);
  return new Date(a, m - 1, d);
}

// "1 pagada", "3 pagadas"
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const fechaLarga = (texto) => mayuscula(leerFecha(texto).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
const fechaCorta = (texto) => leerFecha(texto).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric" });

/* ================= Filtros ================= */

$("hi-secciones").innerHTML = Object.entries(SECCIONES)
  .map(([clave, s]) => `<label class="hi-chip s-${clave}"><input type="checkbox" value="${clave}" checked /><span>${s.nombre}</span></label>`)
  .join("");

const seccionesElegidas = () => [...$("hi-secciones").querySelectorAll("input:checked")].map((i) => i.value);

function fijarRango(rango) {
  const hoy = new Date();
  const rangos = {
    mes: [new Date(hoy.getFullYear(), hoy.getMonth(), 1), hoy],
    30: [new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29), hoy],
    anio: [new Date(hoy.getFullYear(), 0, 1), hoy],
    todo: [null, null],
  };
  const [desde, hasta] = rangos[rango];
  $("hi-desde").value = desde ? iso(desde) : "";
  $("hi-hasta").value = hasta ? iso(hasta) : "";
  marcarRango(rango);
}

function marcarRango(rango) {
  document.querySelectorAll("[data-rango]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.rango === rango)));
}

document.querySelector(".hi-rapidos").addEventListener("click", (event) => {
  const boton = event.target.closest("[data-rango]");
  if (!boton) return;
  fijarRango(boton.dataset.rango);
  cargar();
});
["hi-desde", "hi-hasta"].forEach((id) =>
  $(id).addEventListener("change", () => {
    marcarRango("");
    cargar();
  }),
);
$("hi-buscar").addEventListener("input", () => {
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(cargar, 300);
});
$("hi-secciones").addEventListener("change", cargar);

/* ================= Datos ================= */

function periodoTexto() {
  const desde = $("hi-desde").value;
  const hasta = $("hi-hasta").value;
  if (desde && hasta) return `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  if (desde) return `Desde el ${fechaCorta(desde)}`;
  if (hasta) return `Hasta el ${fechaCorta(hasta)}`;
  return "Todo el histórico";
}

async function cargar() {
  const secciones = seccionesElegidas();
  if (secciones.length === 0) {
    filas = [];
    return pintar();
  }
  const params = new URLSearchParams({ secciones: secciones.join(",") });
  if ($("hi-desde").value) params.set("desde", $("hi-desde").value);
  if ($("hi-hasta").value) params.set("hasta", $("hi-hasta").value);
  if ($("hi-buscar").value.trim()) params.set("q", $("hi-buscar").value.trim());
  try {
    filas = await api(`/historico?${params}`);
    pintar();
  } catch (error) {
    filas = [];
    $("hi-linea").innerHTML = "";
    $("hi-resumen").innerHTML = "";
    document.querySelector(".hi-estadistica").hidden = true;
    mostrarVacio($("hi-vacio"), "No se pudo cargar el histórico", error.message, true);
  }
}

/* ================= Pintar ================= */

function pintarResumen() {
  const elegidas = seccionesElegidas();
  $("hi-resumen").innerHTML = Object.entries(SECCIONES)
    .filter(([clave]) => elegidas.includes(clave))
    .map(([clave, s]) => {
      const lista = filas.filter((f) => f.seccion === clave);
      let extra = "";
      if (clave === "cotizacion") extra = `Total cotizado ${formatoPesos(lista.reduce((t, f) => t + (f.valor || 0), 0))}`;
      if (clave === "factura") {
        extra = `${plural(lista.filter((f) => f.estado === "Pagada").length, "pagada", "pagadas")} · ${plural(lista.filter((f) => f.estado === "Vencida").length, "vencida", "vencidas")}`;
      }
      if (clave === "pendiente") extra = plural(lista.filter((f) => f.estado === "Completado").length, "completado", "completados");
      return `<article class="hi-tarjeta s-${clave}"><p>${s.nombre}</p><strong>${lista.length}</strong>${extra ? `<small>${escapeHtml(extra)}</small>` : ""}</article>`;
    })
    .join("");
}

function itemHtml(f) {
  const s = SECCIONES[f.seccion];
  const derecha =
    f.valor !== null ? `<span class="hi-valor">${formatoPesos(f.valor)}</span>` : f.estado ? `<span class="hi-estado ${CLASE_ESTADO[f.estado] ?? ""}">${escapeHtml(f.estado)}</span>` : "<span></span>";
  return `<a class="hi-item s-${f.seccion}" href="${s.enlace}">
    <span class="hi-seccion"><small>${s.singular}</small><strong>${escapeHtml(f.codigo)}</strong></span>
    <span class="hi-texto"><span>${escapeHtml(f.titulo)}</span><small>${escapeHtml(f.detalle || "")}</small></span>
    ${derecha}
  </a>`;
}

function pintar() {
  $("hi-vacio").hidden = true;
  pintarResumen();
  pintarEstadistica();
  const porDia = new Map();
  filas.forEach((f) => porDia.set(f.fecha, [...(porDia.get(f.fecha) || []), f]));
  $("hi-linea").innerHTML = [...porDia]
    .map(([fecha, items]) => `<div class="hi-dia"><h3 class="hi-fecha">${fechaLarga(fecha)}</h3><div class="hi-items">${items.map(itemHtml).join("")}</div></div>`)
    .join("");
  $("hi-mostrando").textContent = filas.length ? `${filas.length} movimiento${filas.length === 1 ? "" : "s"} · ${periodoTexto()}` : "";
  if (!filas.length) {
    mostrarVacio(
      $("hi-vacio"),
      seccionesElegidas().length ? "Sin movimientos" : "Elige qué mostrar",
      seccionesElegidas().length ? "No hay nada en el periodo o con la búsqueda elegida." : "Marca al menos una sección: referencias, cotizaciones, fichas, facturas o pendientes.",
    );
  }
}

/* ================= Estadística: movimientos en el tiempo ================= */

const EST = { alto: 240, arriba: 26, derecha: 8, abajo: 30, izquierda: 34, barra: 24, radio: 4, separacion: 2 };
let estadistica = { porDia: true, periodos: [], secciones: [] };

const colorSeccion = (clave) => getComputedStyle(document.documentElement).getPropertyValue(`--sec-${clave}`).trim();

// Por día si el periodo es de hasta 45 días; si es más largo, por mes
function calcularEstadistica() {
  const secciones = Object.keys(SECCIONES).filter((c) => seccionesElegidas().includes(c));
  const fechas = filas.map((f) => f.fecha).sort();
  const desde = $("hi-desde").value || fechas[0];
  const hasta = $("hi-hasta").value || iso(new Date());
  if (!desde || desde > hasta) return { porDia: true, periodos: [], secciones };
  const inicio = leerFecha(desde);
  const fin = leerFecha(hasta);
  const porDia = Math.round((fin - inicio) / 86400000) + 1 <= 45;
  const claves = [];
  if (porDia) for (const d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) claves.push(iso(d));
  else for (const d = new Date(inicio.getFullYear(), inicio.getMonth(), 1); d <= fin; d.setMonth(d.getMonth() + 1)) claves.push(iso(d).slice(0, 7));
  const periodos = claves.map((clave) => {
    const conteo = Object.fromEntries(secciones.map((s) => [s, 0]));
    filas.forEach((f) => {
      if ((porDia ? f.fecha : f.fecha.slice(0, 7)) === clave && f.seccion in conteo) conteo[f.seccion]++;
    });
    return { clave, conteo, total: Object.values(conteo).reduce((a, b) => a + b, 0) };
  });
  return { porDia, periodos, secciones };
}

function nombrePeriodo(clave, largo = false) {
  if (clave.length === 10) {
    if (largo) return fechaLarga(clave);
    const dia = leerFecha(clave);
    return `${dia.getDate()} ${dia.toLocaleDateString("es-CO", { month: "short" }).replace(".", "")}`;
  }
  const fecha = leerFecha(`${clave}-01`);
  if (largo) return mayuscula(fecha.toLocaleDateString("es-CO", { month: "long", year: "numeric" }));
  const variosAnios = estadistica.periodos[0]?.clave.slice(0, 4) !== estadistica.periodos.at(-1)?.clave.slice(0, 4);
  return fecha.toLocaleDateString("es-CO", variosAnios ? { month: "short", year: "2-digit" } : { month: "short" }).replace(".", "");
}

// Tope del eje en números enteros "redondos": 1, 2, 4, 5, 10, 20, 25, 50…
function topeEntero(maximo) {
  if (maximo <= 2) return Math.max(1, maximo);
  if (maximo <= 4) return 4;
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  return [1, 2, 2.5, 5, 10].map((f) => Math.ceil(f * potencia)).find((t) => t >= maximo);
}

function pintarEstadistica() {
  estadistica = calcularEstadistica();
  const { porDia, periodos, secciones } = estadistica;
  const panel = document.querySelector(".hi-estadistica");
  panel.hidden = !filas.length || !periodos.length;
  if (panel.hidden) return;

  // Leyenda: con dos o más tipos (con uno solo, el título y el resumen ya lo dicen)
  $("est-leyenda").hidden = secciones.length < 2;
  $("est-leyenda").innerHTML = secciones.map((s) => `<li class="s-${s}"><span class="est-muestra" aria-hidden="true"></span>${SECCIONES[s].nombre}</li>`).join("");
  const mayor = periodos.reduce((a, p) => (p.total > a.total ? p : a), periodos[0]);
  $("est-sub").textContent = `${porDia ? "Por día" : "Por mes"} · ${plural(filas.length, "movimiento", "movimientos")}${
    mayor.total ? ` · el ${porDia ? "día" : "mes"} con más: ${nombrePeriodo(mayor.clave, true).toLowerCase()} (${mayor.total})` : ""
  }`;

  const contenedor = $("est-grafica");
  const ancho = Math.max(280, contenedor.clientWidth);
  const area = { ancho: ancho - EST.izquierda - EST.derecha, alto: EST.alto - EST.arriba - EST.abajo };
  const tope = topeEntero(mayor.total);
  const y = (v) => EST.arriba + area.alto - (v / tope) * area.alto;
  const banda = area.ancho / periodos.length;
  const anchoBarra = Math.max(3, Math.min(EST.barra, banda * 0.6));
  // Si hay muchos periodos, solo se escribe una etiqueta cada tantos
  const cadaCuantos = Math.ceil(periodos.length / Math.max(1, Math.floor(area.ancho / 46)));

  const marcas = [0, tope / 2, tope]
    .filter((v) => Number.isInteger(v))
    .map(
      (v) => `<line x1="${EST.izquierda}" x2="${ancho - EST.derecha}" y1="${y(v)}" y2="${y(v)}" class="est-rejilla" />
        <text x="${EST.izquierda - 8}" y="${y(v)}" class="est-eje" text-anchor="end" dominant-baseline="middle">${v}</text>`,
    )
    .join("");

  const columnas = periodos
    .map((p, i) => {
      const centro = EST.izquierda + banda * i + banda / 2;
      const x = centro - anchoBarra / 2;
      let acumulado = 0;
      const visibles = secciones.filter((s) => p.conteo[s] > 0);
      const segmentos = visibles
        .map((s, k) => {
          const abajo = y(acumulado) - (k > 0 ? EST.separacion : 0); // 2px de aire entre tipos
          acumulado += p.conteo[s];
          const arriba = y(acumulado);
          const alto = Math.max(1, abajo - arriba);
          const color = colorSeccion(s);
          if (k < visibles.length - 1) return `<rect x="${x}" y="${arriba}" width="${anchoBarra}" height="${alto}" fill="${color}" />`;
          // El segmento de arriba lleva la punta redondeada; la base queda recta
          const r = Math.min(EST.radio, alto, anchoBarra / 2);
          return `<path fill="${color}" d="M${x},${abajo} V${arriba + r} Q${x},${arriba} ${x + r},${arriba} H${x + anchoBarra - r} Q${x + anchoBarra},${arriba} ${x + anchoBarra},${arriba + r} V${abajo} Z" />`;
        })
        .join("");
      const etiqueta = p === mayor && p.total > 0 ? `<text x="${centro}" y="${y(p.total) - 8}" class="est-valor" text-anchor="middle">${p.total}</text>` : "";
      // Las fechas de las orillas se alinean hacia adentro para no cortarse
      const ancla = centro - EST.izquierda < 22 ? "start" : ancho - EST.derecha - centro < 22 ? "end" : "middle";
      const xFecha = ancla === "start" ? Math.max(centro - anchoBarra / 2, 2) : ancla === "end" ? Math.min(centro + anchoBarra / 2, ancho - 2) : centro;
      const fecha = i % cadaCuantos === 0 || i === periodos.length - 1 ? `<text x="${xFecha}" y="${EST.alto - 8}" class="est-eje" text-anchor="${ancla}">${nombrePeriodo(p.clave)}</text>` : "";
      const detalle = `${nombrePeriodo(p.clave, true)}: ${plural(p.total, "movimiento", "movimientos")}${
        p.total ? ` (${secciones.filter((s) => p.conteo[s]).map((s) => `${SECCIONES[s].nombre.toLowerCase()} ${p.conteo[s]}`).join(", ")})` : ""
      }`;
      return `<g class="est-col" data-i="${i}" tabindex="${i === 0 ? 0 : -1}" role="img" aria-label="${escapeHtml(detalle)}">
          <rect class="est-zona" x="${EST.izquierda + banda * i}" y="${EST.arriba}" width="${banda}" height="${area.alto}" />
          ${segmentos}${etiqueta}${fecha}
        </g>`;
    })
    .join("");

  contenedor.innerHTML = `
    <svg width="${ancho}" height="${EST.alto}" viewBox="0 0 ${ancho} ${EST.alto}">
      ${marcas}
      <line x1="${EST.izquierda}" x2="${ancho - EST.derecha}" y1="${y(0)}" y2="${y(0)}" class="est-base" />
      ${columnas}
    </svg>
    <div class="est-tooltip" id="est-tooltip" role="status" hidden></div>`;

  // Misma información en una tabla para lectores de pantalla
  $("est-tabla").querySelector("thead").innerHTML = `<tr><th scope="col">${porDia ? "Día" : "Mes"}</th>${secciones
    .map((s) => `<th scope="col">${SECCIONES[s].nombre}</th>`)
    .join("")}<th scope="col">Total</th></tr>`;
  $("est-tabla").querySelector("tbody").innerHTML = periodos
    .map((p) => `<tr><th scope="row">${nombrePeriodo(p.clave, true)}</th>${secciones.map((s) => `<td>${p.conteo[s]}</td>`).join("")}<td>${p.total}</td></tr>`)
    .join("");
}

function mostrarDetalleEst(columna) {
  const tooltip = $("est-tooltip");
  $("est-grafica").querySelectorAll(".est-col").forEach((c) => c.classList.toggle("is-activa", c === columna));
  if (!columna || !tooltip) {
    if (tooltip) tooltip.hidden = true;
    return;
  }
  const p = estadistica.periodos[Number(columna.dataset.i)];
  tooltip.innerHTML = `<strong>${nombrePeriodo(p.clave, true)}</strong><span>${plural(p.total, "movimiento", "movimientos")}</span>${estadistica.secciones
    .filter((s) => p.conteo[s])
    .map((s) => `<small class="s-${s}"><span class="est-muestra" aria-hidden="true"></span>${SECCIONES[s].nombre}: ${p.conteo[s]}</small>`)
    .join("")}`;
  tooltip.hidden = false;
  const caja = $("est-grafica").getBoundingClientRect();
  const zona = columna.querySelector(".est-zona").getBoundingClientRect();
  // Al lado de la columna (a la derecha, o a la izquierda si no cabe) para no tapar la barra
  let izquierda = zona.right - caja.left + 8;
  if (izquierda + tooltip.offsetWidth > caja.width) izquierda = zona.left - caja.left - tooltip.offsetWidth - 8;
  tooltip.style.left = `${Math.max(0, izquierda)}px`;
}

$("est-grafica").addEventListener("pointermove", (event) => mostrarDetalleEst(event.target.closest(".est-col")));
$("est-grafica").addEventListener("pointerleave", (event) => event.pointerType === "mouse" && mostrarDetalleEst(null));
// En el celular no hay "pasar el mouse": el detalle aparece al tocar la columna
$("est-grafica").addEventListener("click", (event) => mostrarDetalleEst(event.target.closest(".est-col")));
$("est-grafica").addEventListener("focusin", (event) => mostrarDetalleEst(event.target.closest(".est-col")));
$("est-grafica").addEventListener("focusout", () => mostrarDetalleEst(null));
// Flechas para recorrer los periodos con el teclado
$("est-grafica").addEventListener("keydown", (event) => {
  const actual = event.target.closest(".est-col");
  if (!actual || (event.key !== "ArrowRight" && event.key !== "ArrowLeft")) return;
  event.preventDefault();
  const siguiente = event.key === "ArrowRight" ? actual.nextElementSibling : actual.previousElementSibling;
  if (siguiente?.classList.contains("est-col")) {
    actual.tabIndex = -1;
    siguiente.tabIndex = 0;
    siguiente.focus();
  }
});
new ResizeObserver(() => filas.length && estadistica.periodos.length && pintarEstadistica()).observe($("est-grafica"));
// Al cambiar entre modo claro y oscuro, la gráfica toma los colores del modo nuevo
window.addEventListener("sigmas:modo", () => filas.length && estadistica.periodos.length && pintarEstadistica());

// Filas de la estadística para Excel y PDF
const filasEstadistica = () =>
  estadistica.periodos.map((p) => [nombrePeriodo(p.clave, true), ...estadistica.secciones.map((s) => p.conteo[s]), p.total]);
const encabezadoEstadistica = () => [estadistica.porDia ? "Día" : "Mes", ...estadistica.secciones.map((s) => SECCIONES[s].nombre), "Total"];

/* ================= Exportar ================= */

const columnasReporte = [
  ["Fecha", (f) => fechaCorta(f.fecha)],
  ["Tipo", (f) => SECCIONES[f.seccion].singular],
  ["Código", (f) => f.codigo],
  ["Descripción", (f) => f.titulo],
  ["Detalle", (f) => f.detalle || ""],
  ["Valor (COP)", (f) => (f.valor === null ? "" : f.valor)],
  ["Estado", (f) => f.estado || ""],
];

const nombreArchivo = (extension) => `historico-${$("hi-desde").value || "inicio"}-a-${$("hi-hasta").value || iso(new Date())}.${extension}`;

$("exportar-excel").addEventListener("click", () => {
  if (!window.XLSX) return avisar("No se pudo cargar el exportador de Excel. Revisa tu conexión a internet.");
  if (!filas.length) return avisar("No hay movimientos para exportar con los filtros actuales.");
  const empresa = SigmaSesion.usuario?.nombre_empresa || "Mi empresa";
  const libro = XLSX.utils.book_new();
  const hoja = (lista, titulo) => {
    const datos = [
      [`${empresa} · Histórico`],
      [periodoTexto()],
      [],
      columnasReporte.map(([nombre]) => nombre),
      ...lista.map((f) => columnasReporte.map(([, valor]) => valor(f))),
    ];
    const h = XLSX.utils.aoa_to_sheet(datos);
    h["!cols"] = columnasReporte.map(([nombre], i) => ({
      wch: Math.min(48, Math.max(nombre.length, ...lista.map((f) => String(columnasReporte[i][1](f)).length)) + 2),
    }));
    XLSX.utils.book_append_sheet(libro, h, titulo.slice(0, 31));
  };
  // Una hoja con todo, la estadística por periodo y una por cada sección que tenga movimientos
  hoja(filas, "Todo");
  const est = XLSX.utils.aoa_to_sheet([[`${empresa} · Movimientos ${estadistica.porDia ? "por día" : "por mes"}`], [periodoTexto()], [], encabezadoEstadistica(), ...filasEstadistica()]);
  est["!cols"] = encabezadoEstadistica().map((nombre, i) => ({ wch: i === 0 ? 34 : Math.max(10, nombre.length + 2) }));
  XLSX.utils.book_append_sheet(libro, est, "Estadística");
  Object.entries(SECCIONES).forEach(([clave, s]) => {
    const lista = filas.filter((f) => f.seccion === clave);
    if (lista.length) hoja(lista, s.nombre);
  });
  XLSX.writeFile(libro, nombreArchivo("xlsx"));
  avisar(`Excel descargado · ${filas.length} movimientos`);
});

$("exportar-pdf").addEventListener("click", () => {
  if (!window.jspdf?.jsPDF) return avisar("No se pudo cargar el exportador de PDF. Revisa tu conexión a internet.");
  if (!filas.length) return avisar("No hay movimientos para exportar con los filtros actuales.");
  const u = SigmaSesion.usuario || {};
  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(10, 17, 35);
  doc.rect(0, 0, ancho, 70, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`${u.nombre_empresa || "Mi empresa"} · Histórico`, 40, 32);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${periodoTexto()} · ${filas.length} movimientos · Generado el ${new Date().toLocaleDateString("es-CO")}`, 40, 52);

  // Resumen por sección
  const resumen = Object.entries(SECCIONES)
    .map(([clave, s]) => [s.nombre, filas.filter((f) => f.seccion === clave).length])
    .filter(([, n]) => n > 0)
    .map(([nombre, n]) => `${nombre}: ${n}`)
    .join("   ·   ");
  doc.setTextColor(10, 17, 35);
  doc.setFontSize(10);
  doc.text(resumen, 40, 92);

  doc.autoTable({
    startY: 106,
    head: [columnasReporte.map(([nombre]) => nombre)],
    body: filas.map((f) => columnasReporte.map(([nombre, valor]) => (nombre.startsWith("Valor") && f.valor !== null ? formatoPesos(f.valor) : String(valor(f))))),
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [10, 17, 35], lineColor: [220, 222, 234] },
    headStyles: { fillColor: [58, 62, 108], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [243, 244, 250] },
    columnStyles: { 0: { cellWidth: 62 }, 1: { cellWidth: 74 }, 2: { cellWidth: 80, fontStyle: "bold" }, 5: { halign: "right", cellWidth: 82 } },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(87, 91, 128);
      doc.text(`Systex · Página ${doc.internal.getNumberOfPages()}`, ancho - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    },
  });
  // Estadística: movimientos por periodo (después de la lista; si no cabe el título, en una página nueva)
  let yEstadistica = doc.lastAutoTable.finalY + 30;
  if (yEstadistica > doc.internal.pageSize.getHeight() - 120) {
    doc.addPage();
    yEstadistica = 50;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(10, 17, 35);
  doc.text(`Movimientos ${estadistica.porDia ? "por día" : "por mes"}`, 40, yEstadistica);
  doc.setFont("helvetica", "normal");
  doc.autoTable({
    startY: yEstadistica + 10,
    head: [encabezadoEstadistica()],
    body: filasEstadistica().filter((fila) => fila.at(-1) > 0),
    foot: [["Total", ...estadistica.secciones.map((s) => filas.filter((f) => f.seccion === s).length), filas.length]],
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [10, 17, 35], lineColor: [220, 222, 234], halign: "right" },
    headStyles: { fillColor: [58, 62, 108], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [10, 17, 35], textColor: [240, 199, 94], fontStyle: "bold" },
    columnStyles: { 0: { halign: "left", cellWidth: 200 } },
    margin: { left: 40, right: 40 },
  });
  doc.save(nombreArchivo("pdf"));
  avisar(`PDF descargado · ${filas.length} movimientos`);
});

/* ================= Inicio ================= */

fijarRango("mes");
cargar();
