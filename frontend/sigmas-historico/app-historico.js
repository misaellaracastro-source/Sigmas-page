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
  // Una hoja con todo y una por cada sección que tenga movimientos
  hoja(filas, "Todo");
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
      doc.text(`SigmaS · Página ${doc.internal.getNumberOfPages()}`, ancho - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    },
  });
  doc.save(nombreArchivo("pdf"));
  avisar(`PDF descargado · ${filas.length} movimientos`);
});

/* ================= Inicio ================= */

fijarRango("mes");
cargar();
