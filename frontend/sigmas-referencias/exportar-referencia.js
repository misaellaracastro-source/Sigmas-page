// Exportar una referencia: ficha completa en PDF (los insumos y las telas se exportan desde Inventario).
// Todo sale con el logo y los datos de la empresa.
import { imagenComoDataUrl, agruparDescripciones } from "./imagen-referencia.js";
import { nombreColor } from "../sigmas-inventario/selector-color.js";

const pesosFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const numerosFmt = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
const pesos = (n) => "$" + pesosFmt.format(Math.round(Number(n) || 0));
const num = (n) => numerosFmt.format(Number(n) || 0);

export function fechaLarga(fecha) {
  const [a, m, d] = String(fecha).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

function verificarPdf() {
  if (!window.jspdf?.jsPDF) throw new Error("No se pudo cargar el exportador de PDF. Revisa tu conexión a internet.");
}

function formatoImagen(dataUrl) {
  return /^data:image\/png/.test(dataUrl) ? "PNG" : "JPEG";
}

function datosEmpresa() {
  const u = SigmaSesion.usuario || {};
  return {
    nombre: u.nombre_empresa || "Mi empresa",
    lineas: [
      [u.nit_temporal ? "" : `NIT ${u.nit}`, u.direccion_empresa].filter(Boolean).join("  ·  "),
      [u.telefono_contacto && `Tel. ${u.telefono_contacto}`, u.correo, u.red_social].filter(Boolean).join("  ·  "),
    ].filter(Boolean),
    logo: u.logo_empresa,
  };
}

/* ---------- Filas de las tablas ---------- */

const COLUMNAS_INSUMOS = ["Insumo", "Código", "Categoría", "Unidad", "Valor unitario", "Cantidad", "Valor total"];
const COLUMNAS_MATERIAS = ["Tela", "Código", "Color", "Tallas (cantidad)", "Promedio", "Unidad", "Valor unidad", "Valor total"];

function filasInsumos(ref) {
  return ref.insumos.map((i) => [i.nombre, i.id_insumo || "—", i.categoria || "", i.unidad, pesos(i.valor_unitario), num(i.cantidad), pesos(i.valor_total)]);
}

function filasMaterias(ref) {
  return ref.materias.map((m) => [
    m.nombre,
    m.id_materia || "—",
    nombreColor(m.color),
    m.tallas.map((t) => `${t.talla}: ${num(t.cantidad)}`).join(", "),
    num(m.cantidad),
    m.unidad,
    pesos(m.valor_unitario),
    pesos(m.valor_total),
  ]);
}

const suma = (lista) => lista.reduce((total, s) => total + Number(s.valor_total), 0);

/* ---------- PDF ---------- */

const estiloTabla = {
  styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: [10, 17, 35], lineColor: [220, 222, 234] },
  headStyles: { fillColor: [58, 62, 108], textColor: 255, fontStyle: "bold" },
  footStyles: { fillColor: [243, 244, 250], textColor: [10, 17, 35], fontStyle: "bold" },
  alternateRowStyles: { fillColor: [248, 248, 252] },
  margin: { left: 40, right: 40 },
};

async function encabezadoPdf(doc, titulo, ref) {
  const empresa = datosEmpresa();
  const ancho = doc.internal.pageSize.getWidth();
  doc.setFillColor(10, 17, 35);
  doc.rect(0, 0, ancho, 96, "F");

  let x = 40;
  const logo = await imagenComoDataUrl(SigmaSesion.archivo(empresa.logo));
  if (logo) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(36, 20, 56, 56, 8, 8, "F");
    try {
      doc.addImage(logo, formatoImagen(logo), 40, 24, 48, 48, undefined, "FAST");
      x = 106;
    } catch {
      x = 40;
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(empresa.nombre, x, 42);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(195, 198, 228);
  empresa.lineas.forEach((linea, i) => doc.text(linea, x, 58 + i * 13));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(240, 199, 94);
  doc.text(titulo, ancho - 40, 40, { align: "right" });
  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text(ref.id_referencia, ancho - 40, 60, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(195, 198, 228);
  doc.text(`${ref.tipo} · ${fechaLarga(ref.fecha)}`, ancho - 40, 75, { align: "right" });
  return 122;
}

function piePdf(doc) {
  const paginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(87, 91, 128);
    doc.text(`SYSTEX · Página ${i} de ${paginas}`, doc.internal.pageSize.getWidth() - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
  }
}

function tituloSeccion(doc, texto, y) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(10, 17, 35);
  doc.text(texto, 40, y);
  return y + 8;
}

// Ficha completa: imagen, datos, insumos, materia prima, descripciones y valor de la prenda
export async function exportarFicha(ref) {
  verificarPdf();
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();
  let y = await encabezadoPdf(doc, "FICHA DE REFERENCIA", ref);

  const imagen = await imagenComoDataUrl(SigmaSesion.archivo(ref.foto));
  const xInfo = imagen ? 286 : 40;
  // "FAST" comprime la imagen: sin esto el PDF pesa varios MB
  if (imagen) doc.addImage(imagen, formatoImagen(imagen), 40, y, 228, 285, undefined, "FAST");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(87, 91, 128);
  doc.text("REFERENCIA", xInfo, y + 14);
  doc.setFontSize(22);
  doc.setTextColor(10, 17, 35);
  doc.text(ref.id_referencia, xInfo, y + 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(58, 62, 108);
  doc.text(ref.tipo, xInfo, y + 60);
  doc.setFontSize(9.5);
  doc.setTextColor(87, 91, 128);
  doc.text(`Creada el ${fechaLarga(ref.fecha)}`, xInfo, y + 78);

  doc.setFillColor(10, 17, 35);
  doc.roundedRect(xInfo, y + 96, ancho - 40 - xInfo, 74, 10, 10, "F");
  doc.setFontSize(9);
  doc.setTextColor(195, 198, 228);
  doc.text("VALOR DE LA PRENDA (MATERIALES)", xInfo + 16, y + 120);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(240, 199, 94);
  doc.text(pesos(ref.valor_prenda), xInfo + 16, y + 152);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(70, 74, 112);
  const resumen = [
    `Insumos: ${ref.insumos.length} · ${pesos(suma(ref.insumos))}`,
    `Materia prima: ${ref.materias.length} · ${pesos(suma(ref.materias))}`,
    `Descripciones: ${agruparDescripciones(ref.descripciones).length} títulos`,
  ];
  resumen.forEach((linea, i) => doc.text(linea, xInfo, y + 196 + i * 16));

  y += imagen ? 305 : 260;

  if (ref.insumos.length) {
    y = tituloSeccion(doc, "Insumos", y + 10);
    doc.autoTable({
      ...estiloTabla,
      startY: y,
      head: [COLUMNAS_INSUMOS],
      body: filasInsumos(ref),
      foot: [["Total insumos", "", "", "", "", "", pesos(suma(ref.insumos))]],
      columnStyles: { 4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" } },
    });
    y = doc.lastAutoTable.finalY + 18;
  }
  if (ref.materias.length) {
    y = tituloSeccion(doc, "Materia prima", y + 10);
    doc.autoTable({
      ...estiloTabla,
      startY: y,
      head: [COLUMNAS_MATERIAS],
      body: filasMaterias(ref),
      foot: [["Total materia prima", "", "", "", "", "", "", pesos(suma(ref.materias))]],
      columnStyles: { 4: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" } },
    });
    y = doc.lastAutoTable.finalY + 18;
  }
  if (ref.descripciones.length) {
    y = tituloSeccion(doc, "Descripción", y + 10);
    doc.autoTable({
      ...estiloTabla,
      startY: y,
      head: [["#", "Detalle", "Descripción"]],
      // Un renglón por título, con sus descripciones como viñetas
      body: agruparDescripciones(ref.descripciones).map((g, i) => [i + 1, g.nombre, g.items.map((t) => `• ${t}`).join("\n")]),
      columnStyles: { 0: { cellWidth: 24 }, 1: { cellWidth: 130, fontStyle: "bold" } },
    });
    y = doc.lastAutoTable.finalY + 18;
  }

  doc.autoTable({
    ...estiloTabla,
    startY: y + 4,
    body: [["Valor de la prenda (insumos + materia prima)", pesos(ref.valor_prenda)]],
    styles: { ...estiloTabla.styles, fontSize: 11, fontStyle: "bold", fillColor: [251, 239, 203] },
    columnStyles: { 1: { halign: "right" } },
  });

  piePdf(doc);
  doc.save(`referencia-${ref.id_referencia}.pdf`);
}
