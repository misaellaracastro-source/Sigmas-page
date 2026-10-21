// Inventario: une las pestañas de Insumos y Materia prima, el botón Agregar y la exportación
import { avisar } from "./util-inventario.js";
import { crearInsumos } from "./insumos.js";
import { crearMateriasPrimas } from "./materias-primas.js";

const $ = (id) => document.getElementById(id);

const secciones = {
  insumos: {
    tab: $("tab-insumos"),
    modulo: crearInsumos({ alCambiarConteo: (n) => ($("count-insumos").textContent = n) }),
    agregar: "Agregar insumo",
  },
  materias: {
    tab: $("tab-materias"),
    modulo: crearMateriasPrimas({ alCambiarConteo: (n) => ($("count-materias").textContent = n) }),
    agregar: "Agregar materia prima",
  },
};

let activa = "insumos";

/* ---------- Pestañas ---------- */

function activar(nombre, { enfocar = false } = {}) {
  activa = nombre;
  Object.entries(secciones).forEach(([clave, { tab }]) => {
    const esActiva = clave === nombre;
    tab.classList.toggle("is-active", esActiva);
    tab.setAttribute("aria-selected", String(esActiva));
    tab.tabIndex = esActiva ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !esActiva;
  });
  $("btn-agregar-label").textContent = secciones[nombre].agregar;
  if (enfocar) secciones[nombre].tab.focus();
  history.replaceState(null, "", `#${nombre}`);
}

const claves = Object.keys(secciones);
claves.forEach((clave, i) => {
  const { tab } = secciones[clave];
  tab.addEventListener("click", () => activar(clave));
  // Flechas izquierda/derecha para cambiar de pestaña
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const siguiente = claves[(i + (event.key === "ArrowRight" ? 1 : claves.length - 1)) % claves.length];
    activar(siguiente, { enfocar: true });
  });
});

$("btn-agregar").addEventListener("click", () => secciones[activa].modulo.abrirNuevo());

/* ---------- Exportar ---------- */

const exportBtn = $("btn-exportar");
const exportList = $("export-list");

function abrirMenu(abrir) {
  exportList.hidden = !abrir;
  exportBtn.setAttribute("aria-expanded", String(abrir));
  if (abrir) {
    const { filas } = secciones[activa].modulo.exportable();
    $("export-caption").textContent = `Se exportarán ${filas.length} registros, tal como los ves en la lista.`;
    exportList.querySelector("button").focus();
  }
}

exportBtn.addEventListener("click", () => abrirMenu(exportList.hidden));
document.addEventListener("click", (event) => {
  if (!exportList.hidden && !event.target.closest(".export-menu")) abrirMenu(false);
});
exportList.addEventListener("keydown", (event) => {
  const opciones = [...exportList.querySelectorAll("button")];
  const i = opciones.indexOf(document.activeElement);
  if (event.key === "Escape") {
    abrirMenu(false);
    exportBtn.focus();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    opciones[(i + (event.key === "ArrowDown" ? 1 : opciones.length - 1)) % opciones.length].focus();
  }
});

exportList.addEventListener("click", (event) => {
  const opcion = event.target.closest("[data-exportar]");
  if (!opcion) return;
  abrirMenu(false);
  const datos = secciones[activa].modulo.exportable();
  if (datos.filas.length === 0) return avisar("No hay registros para exportar con los filtros actuales.");
  if (opcion.dataset.exportar === "excel") exportarExcel(datos);
  else exportarPdf(datos);
});

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}

function exportarExcel({ titulo, archivo, filas, columnas }) {
  if (!window.XLSX) return avisar("No se pudo cargar el exportador de Excel. Revisa tu conexión a internet.");
  const datos = filas.map((fila) => Object.fromEntries(columnas.map(([nombre, valor]) => [nombre, valor(fila)])));
  const hoja = XLSX.utils.json_to_sheet(datos);
  hoja["!cols"] = columnas.map(([nombre]) => ({
    wch: Math.min(50, Math.max(nombre.length, ...datos.map((d) => String(d[nombre]).length)) + 2),
  }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, titulo.replace(/[\\/?*[\]:]/g, "").slice(0, 31));
  XLSX.writeFile(libro, `${archivo}-${fechaArchivo()}.xlsx`);
  avisar(`Excel descargado · ${filas.length} registros`);
}

function exportarPdf({ titulo, archivo, filas, columnas }) {
  if (!window.jspdf?.jsPDF) return avisar("No se pudo cargar el exportador de PDF. Revisa tu conexión a internet.");
  const numeros = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
  const formatear = (valor) => (typeof valor === "number" ? numeros.format(valor) : String(valor));

  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(10, 17, 35);
  doc.rect(0, 0, ancho, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Inventario · ${titulo}`, 40, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${SigmaSesion.usuario.nombre_empresa} · Generado el ${new Date().toLocaleDateString("es-CO")} · ${filas.length} registros`, 40, 48);

  const numericas = columnas.map(([, valor]) => typeof valor(filas[0]) === "number");
  doc.autoTable({
    startY: 84,
    head: [columnas.map(([nombre]) => nombre)],
    body: filas.map((fila) => columnas.map(([, valor]) => formatear(valor(fila)))),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 5, textColor: [10, 17, 35], lineColor: [220, 222, 234] },
    headStyles: { fillColor: [58, 62, 108], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [243, 244, 250] },
    columnStyles: Object.fromEntries(numericas.map((esNumero, i) => [i, esNumero ? { halign: "right" } : {}])),
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(87, 91, 128);
      doc.text(`Systex · Página ${doc.internal.getNumberOfPages()}`, ancho - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    },
  });
  doc.save(`${archivo}-${fechaArchivo()}.pdf`);
  avisar(`PDF descargado · ${filas.length} registros`);
}

/* ---------- Inicio ---------- */

activar(window.location.hash === "#materias" ? "materias" : "insumos");
Object.values(secciones).forEach(({ modulo }) => modulo.cargar());
