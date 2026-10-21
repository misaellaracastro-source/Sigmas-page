// Ficha técnica: referencia (con su foto y descripciones), cantidades por talla y procesos.
// Lista de fichas creadas con búsqueda y filtro por fecha; ver, editar, eliminar y exportar a PDF.
import {
  api,
  urlArchivo,
  formatoNumero,
  escapeHtml,
  avisar,
  mostrarError,
  confirmar,
  mostrarVacio,
} from "../sigmas-inventario/util-inventario.js";
import { crearDesplegable } from "../sigmas-referencias/desplegable.js";
import { imagenComoDataUrl, agruparDescripciones } from "../sigmas-referencias/imagen-referencia.js";
import { fechaLarga } from "../sigmas-referencias/exportar-referencia.js";
import { cargarTallasUsadas, conectarTalla, recordarTalla } from "../sigmas-comun/tallas.js";

const $ = (id) => document.getElementById(id);
const MAX_PRENDAS = 1000000;
const ICONO_QUITAR =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>';

let referencias = [];
let refActual = null;
let detalleRef = null; // descripciones de la referencia elegida
let fichas = [];
let detalleActual = null;
let editando = null; // ficha que se está editando

const numeroFicha = (id) => `FT-${String(id).padStart(4, "0")}`;

function hoyIso() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}

/* ================= Pestañas ================= */

const tabs = [$("tab-nueva"), $("tab-lista")];

function activarPestana(tab) {
  tabs.forEach((t) => {
    const activa = t === tab;
    t.classList.toggle("is-active", activa);
    t.setAttribute("aria-selected", String(activa));
    t.tabIndex = activa ? 0 : -1;
    $(t.getAttribute("aria-controls")).hidden = !activa;
  });
  history.replaceState(null, "", tab.id === "tab-lista" ? "#lista" : "#nueva");
  if (tab.id === "tab-lista") cargarLista();
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => activarPestana(tab));
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const otra = tabs[(i + 1) % tabs.length];
    otra.focus();
    activarPestana(otra);
  });
});

/* ================= Referencia ================= */

function fotoMini(r) {
  return r?.foto
    ? `<img class="opt-foto" src="${escapeHtml(urlArchivo(r.foto))}" alt="" loading="lazy" />`
    : '<span class="opt-foto" aria-hidden="true"></span>';
}

const refPick = crearDesplegable({
  contenedor: $("ref-pick"),
  textoVacio: 'Aún no tienes referencias. <a href="../sigmas-referencias/referencias.html">Créalas en Referencias</a>.',
  alElegir: (id) => elegirReferencia(id),
});

async function cargarReferencias() {
  try {
    referencias = await api("/referencias");
  } catch (error) {
    return avisar(error.message);
  }
  refPick.fijarOpciones(
    referencias.map((r) => ({
      valor: r.id_referencia,
      html: `<span class="opt">${fotoMini(r)}<span class="opt-text"><strong>${escapeHtml(r.id_referencia)}</strong><small>${escapeHtml(r.tipo)}</small></span></span>`,
    })),
  );
}

function tablaDescripciones(descripciones) {
  if (!descripciones.length) return '<p class="hint">Esta referencia no tiene descripciones.</p>';
  return `<table class="tabla-resumen"><caption>Descripciones de la referencia</caption><tbody>${agruparDescripciones(descripciones)
    .map(
      (g, i) =>
        `<tr><td><strong>${i + 1}. ${escapeHtml(g.nombre)}</strong>${g.items.length ? `<ul class="desc-lista">${g.items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>` : ""}</td></tr>`,
    )
    .join("")}</tbody></table>`;
}

let pedidoRef = 0;

async function elegirReferencia(id) {
  refActual = referencias.find((r) => r.id_referencia === id) || null;
  detalleRef = null;
  mostrarError("ref", "");
  $("ref-pick").querySelector(".pick-btn").classList.remove("is-bad");
  $("aside-ref").textContent = refActual ? refActual.id_referencia : "Sin referencia";
  $("aside-tipo").textContent = refActual?.tipo || "";
  $("ref-foto").hidden = !refActual?.foto;
  if (refActual?.foto) {
    $("ref-foto").src = urlArchivo(refActual.foto);
    $("ref-foto").alt = `Foto de la referencia ${refActual.id_referencia}`;
  }
  $("ref-foto-texto").textContent = refActual ? "Esta referencia no tiene foto." : "Elige una referencia para ver su foto.";
  $("ref-descripciones").innerHTML = refActual ? '<p class="hint">Cargando descripciones…</p>' : "";
  if (!refActual) return;
  const pedido = ++pedidoRef;
  try {
    const detalle = await api(`/referencias/${encodeURIComponent(refActual.id_referencia)}`);
    if (pedido !== pedidoRef) return;
    detalleRef = detalle;
    $("ref-descripciones").innerHTML = tablaDescripciones(detalle.descripciones);
  } catch (error) {
    if (pedido === pedidoRef) $("ref-descripciones").innerHTML = `<p class="field-error">${escapeHtml(error.message)}</p>`;
  }
}

/* ================= Tallas y cantidades ================= */

function filaTalla(talla = "", cantidad = "") {
  const fila = document.createElement("div");
  fila.className = "talla-row";
  fila.innerHTML = `
    <div class="talla-campo"><input class="form-control talla-nombre" maxlength="20" aria-label="Talla" value="${escapeHtml(talla)}" /></div>
    <input class="form-control talla-cantidad" inputmode="numeric" placeholder="Cantidad de prendas" aria-label="Cantidad de prendas" value="${escapeHtml(cantidad)}" />
    <button type="button" class="icon-btn" aria-label="Quitar talla">${ICONO_QUITAR}</button>`;
  fila.talla = conectarTalla(fila.querySelector(".talla-nombre"));
  $("tallas").append(fila);
  actualizarTallas();
  return fila;
}

function leerTallas() {
  return [...$("tallas").children].map((fila) => {
    const texto = fila.querySelector(".talla-cantidad").value.trim();
    return {
      fila,
      talla: fila.querySelector(".talla-nombre").value.trim().toUpperCase(),
      cantidad: /^\d+$/.test(texto) ? Number(texto) : null,
      vacia: !fila.querySelector(".talla-nombre").value.trim() && !texto,
    };
  });
}

function actualizarTallas() {
  const filas = [...$("tallas").children];
  filas.forEach((f) => (f.querySelector(".icon-btn").hidden = filas.length === 1));
  const validas = leerTallas().filter((t) => t.talla && t.cantidad > 0);
  const total = validas.reduce((s, t) => s + t.cantidad, 0);
  $("total-prendas").textContent = $("aside-prendas").textContent = formatoNumero(total);
  $("aside-tallas").textContent = validas.length ? validas.map((t) => t.talla).join(", ") : "0";
}

$("tallas").addEventListener("input", (event) => {
  event.target.classList.remove("is-bad");
  event.target.previousElementSibling?.classList.remove("is-bad");
  mostrarError("tallas", "", null);
  actualizarTallas();
});
$("tallas").addEventListener("click", (event) => {
  const quitar = event.target.closest(".icon-btn");
  if (!quitar) return;
  quitar.closest(".talla-row").remove();
  actualizarTallas();
});
$("talla-agregar").addEventListener("click", () => filaTalla().talla.control().focus());

/* ================= Procesos ================= */

function filaProceso(nombre = "", descripcion = "") {
  const fila = document.createElement("div");
  fila.className = "proceso";
  fila.innerHTML = `
    <span class="proceso-num" aria-hidden="true"></span>
    <div class="proceso-campos">
      <input class="form-control proceso-nombre" maxlength="100" list="lista-procesos" placeholder="Proceso (ej: Corte)" aria-label="Nombre del proceso" value="${escapeHtml(nombre)}" />
      <textarea class="form-control proceso-descripcion" maxlength="1000" rows="2" placeholder="Cómo se hace (opcional)" aria-label="Descripción del proceso">${escapeHtml(descripcion)}</textarea>
    </div>
    <div class="proceso-orden">
      <button type="button" class="icon-btn" data-subir aria-label="Subir proceso">↑</button>
      <button type="button" class="icon-btn" data-bajar aria-label="Bajar proceso">↓</button>
      <button type="button" class="icon-btn" data-quitar aria-label="Quitar proceso">${ICONO_QUITAR}</button>
    </div>`;
  $("procesos").append(fila);
  numerarProcesos();
  return fila;
}

function numerarProcesos() {
  const filas = [...$("procesos").children];
  filas.forEach((f, i) => {
    f.querySelector(".proceso-num").textContent = i + 1;
    f.querySelector("[data-subir]").disabled = i === 0;
    f.querySelector("[data-bajar]").disabled = i === filas.length - 1;
    f.querySelector("[data-quitar]").hidden = filas.length === 1;
  });
  $("aside-procesos").textContent = leerProcesos().length;
}

function leerProcesos() {
  return [...$("procesos").children]
    .map((f) => ({ fila: f, nombre: f.querySelector(".proceso-nombre").value.trim(), descripcion: f.querySelector(".proceso-descripcion").value.trim() }))
    .filter((p) => p.nombre || p.descripcion);
}

$("procesos").addEventListener("click", (event) => {
  const fila = event.target.closest(".proceso");
  if (event.target.closest("[data-quitar]")) fila.remove();
  else if (event.target.closest("[data-subir]")) fila.previousElementSibling?.before(fila);
  else if (event.target.closest("[data-bajar]")) fila.nextElementSibling?.after(fila);
  else return;
  numerarProcesos();
});
$("procesos").addEventListener("input", (event) => {
  event.target.classList.remove("is-bad");
  mostrarError("procesos", "", null);
  numerarProcesos();
});
$("proceso-agregar").addEventListener("click", () => filaProceso().querySelector(".proceso-nombre").focus());
$("observaciones").addEventListener("input", () => mostrarError("observaciones", ""));

/* ================= Guardar ================= */

function validar() {
  let primero = null;
  const marcar = (control, campo, mensaje) => {
    control.classList.add("is-bad");
    // Los contenedores de tallas y procesos no se marcan: se marca el control con el error
    mostrarError(campo, mensaje, null);
    primero ??= control;
  };

  if (!refActual) marcar($("ref-pick").querySelector(".pick-btn"), "ref", "Elige una referencia.");

  const tallas = leerTallas().filter((t) => !t.vacia);
  if (tallas.length === 0) marcar(leerTallas()[0].fila.talla.control(), "tallas", "Agrega al menos una talla con su cantidad.");
  for (const t of tallas) {
    if (!t.talla) {
      marcar(t.fila.talla.control(), "tallas", "Elige o escribe la talla de cada fila.");
      break;
    }
    if (!(t.cantidad >= 1 && t.cantidad <= MAX_PRENDAS)) {
      marcar(t.fila.querySelector(".talla-cantidad"), "tallas", `Escribe una cantidad entera mayor que 0 para la talla ${t.talla}.`);
      break;
    }
  }
  if (new Set(tallas.map((t) => t.talla)).size !== tallas.length) marcar(tallas.at(-1).fila.talla.control(), "tallas", "Hay tallas repetidas.");

  const procesos = leerProcesos();
  if (procesos.length === 0) marcar($("procesos").querySelector(".proceso-nombre"), "procesos", "Agrega al menos un proceso.");
  const sinNombre = procesos.find((p) => !p.nombre);
  if (sinNombre) marcar(sinNombre.fila.querySelector(".proceso-nombre"), "procesos", "Escribe el nombre de cada proceso.");

  primero?.focus();
  return primero
    ? null
    : {
        id_referencia: refActual.id_referencia,
        tallas: tallas.map(({ talla, cantidad }) => ({ talla, cantidad })),
        procesos: procesos.map(({ nombre, descripcion }) => ({ nombre, descripcion })),
        observaciones: $("observaciones").value.trim(),
      };
}

$("btn-guardar").addEventListener("click", async () => {
  $("guardar-error").hidden = true;
  const datos = validar();
  if (!datos) return;
  const boton = $("btn-guardar");
  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const ruta = editando ? `/fichas-tecnicas/${editando.id_ficha}` : "/fichas-tecnicas";
    const { ficha } = await api(ruta, { method: editando ? "PUT" : "POST", body: JSON.stringify(datos) });
    ficha.tallas.forEach((t) => recordarTalla(t.talla));
    avisar(`La ficha técnica ${numeroFicha(ficha.id_ficha)} quedó ${editando ? "actualizada" : "guardada"}.`);
    limpiarFormulario();
    activarPestana($("tab-lista"));
    abrirDetalle(ficha.id_ficha);
  } catch (error) {
    const errores = error.errores || {};
    if (errores.id_referencia) mostrarError("ref", errores.id_referencia);
    ["tallas", "procesos", "observaciones"].forEach((campo) => errores[campo] && mostrarError(campo, errores[campo], null));
    $("guardar-error").textContent = error.message;
    $("guardar-error").hidden = false;
  } finally {
    boton.disabled = false;
    if (boton.textContent === "Guardando…") boton.textContent = textoBoton;
  }
});

// Modo edición: el botón guarda los cambios y se muestra la fecha en que se creó
function fijarEdicion(ficha) {
  editando = ficha;
  $("editando-aviso").hidden = !ficha;
  $("editando-texto").textContent = ficha ? `Estás editando la ficha técnica ${numeroFicha(ficha.id_ficha)}. La fecha de creación no cambia.` : "";
  $("tab-nueva").textContent = ficha ? "Editar ficha técnica" : "Nueva ficha técnica";
  $("btn-guardar").textContent = ficha ? "Guardar cambios" : "Guardar ficha técnica";
  $("ft-fecha").textContent = fechaLarga(ficha ? ficha.fecha : hoyIso());
}

function limpiarFormulario() {
  fijarEdicion(null);
  refPick.elegir("");
  $("tallas").innerHTML = "";
  filaTalla();
  $("procesos").innerHTML = "";
  filaProceso();
  $("observaciones").value = "";
  ["ref", "tallas", "procesos", "observaciones"].forEach((campo) => mostrarError(campo, "", null));
  $("guardar-error").hidden = true;
}

function editarFicha(f) {
  limpiarFormulario();
  fijarEdicion(f);
  if (f.id_referencia && referencias.some((r) => r.id_referencia === f.id_referencia)) refPick.elegir(f.id_referencia);
  else mostrarError("ref", "La referencia de esta ficha fue eliminada. Elige otra.");
  $("tallas").innerHTML = "";
  (f.tallas.length ? f.tallas : [{ talla: "", cantidad: "" }]).forEach((t) => filaTalla(t.talla, t.cantidad));
  $("procesos").innerHTML = "";
  (f.procesos.length ? f.procesos : [{ nombre: "", descripcion: "" }]).forEach((p) => filaProceso(p.nombre, p.descripcion || ""));
  $("observaciones").value = f.observaciones || "";
  actualizarTallas();
  activarPestana($("tab-nueva"));
  refPick.enfocar();
}

$("editando-cancelar").addEventListener("click", () => {
  limpiarFormulario();
  avisar("Se canceló la edición.");
});
$("btn-limpiar").addEventListener("click", () => {
  limpiarFormulario();
  refPick.enfocar();
});

/* ================= Fichas creadas ================= */

let esperaBusqueda;

async function cargarLista() {
  const params = new URLSearchParams();
  const q = $("lista-buscar").value.trim();
  if (q) params.set("q", q);
  if ($("lista-desde").value) params.set("desde", $("lista-desde").value);
  if ($("lista-hasta").value) params.set("hasta", $("lista-hasta").value);
  try {
    fichas = await api(`/fichas-tecnicas${params.size ? `?${params}` : ""}`);
    if (!params.size) $("tab-count").textContent = fichas.length;
    pintarLista(params.size > 0);
  } catch (error) {
    $("ft-grid").innerHTML = "";
    $("lista-mostrando").textContent = "";
    mostrarVacio($("lista-vacia"), "No se pudieron cargar las fichas técnicas", error.message, true);
  }
}

function fechaCorta(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function pintarLista(conFiltros) {
  $("lista-vacia").hidden = true;
  $("ft-grid").innerHTML = fichas
    .map(
      (f) => `
    <article class="ref-card">
      <button type="button" class="ref-thumb" data-ver="${f.id_ficha}" aria-label="Ver la ficha ${numeroFicha(f.id_ficha)}">
        ${f.foto ? `<img src="${escapeHtml(urlArchivo(f.foto))}" alt="" loading="lazy" />` : ""}
      </button>
      <div class="ref-body">
        <p class="ref-id">${numeroFicha(f.id_ficha)}</p>
        <p class="ref-meta">${f.id_referencia ? `${escapeHtml(f.id_referencia)} · ${escapeHtml(f.tipo || "")}` : "Referencia eliminada"}</p>
        <p class="ref-meta">Creada el ${fechaCorta(f.fecha)}</p>
        <div class="ref-chips"><span>${formatoNumero(f.total_prendas)} prendas</span><span>${f.procesos} procesos</span></div>
        ${f.tallas ? `<p class="ref-meta">${escapeHtml(f.tallas)}</p>` : ""}
      </div>
      <div class="ref-actions">
        <button type="button" class="btn-ghost btn-small" data-ver="${f.id_ficha}">Ver</button>
        <button type="button" class="btn-ghost btn-small" data-editar="${f.id_ficha}">Editar</button>
        <button type="button" class="btn-ghost btn-small is-danger" data-eliminar="${f.id_ficha}">Eliminar</button>
      </div>
    </article>`,
    )
    .join("");
  if (fichas.length === 0) {
    if (conFiltros) mostrarVacio($("lista-vacia"), "Sin resultados", "Ninguna ficha técnica coincide con la búsqueda o las fechas elegidas.");
    else mostrarVacio($("lista-vacia"), "Aún no tienes fichas técnicas", "Crea la primera en la pestaña “Nueva ficha técnica”.");
  }
  $("lista-mostrando").textContent = fichas.length ? `${fichas.length} ficha${fichas.length === 1 ? "" : "s"} técnica${fichas.length === 1 ? "" : "s"}` : "";
}

$("lista-buscar").addEventListener("input", () => {
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(cargarLista, 300);
});
["lista-desde", "lista-hasta"].forEach((id) => $(id).addEventListener("change", cargarLista));
$("lista-limpiar").addEventListener("click", () => {
  $("lista-buscar").value = $("lista-desde").value = $("lista-hasta").value = "";
  cargarLista();
});
$("ft-grid").addEventListener("click", async (event) => {
  const ver = event.target.closest("[data-ver]");
  const editar = event.target.closest("[data-editar]");
  const eliminar = event.target.closest("[data-eliminar]");
  if (ver) abrirDetalle(ver.dataset.ver);
  if (eliminar) eliminarFicha(Number(eliminar.dataset.eliminar));
  if (editar) {
    try {
      editarFicha(await api(`/fichas-tecnicas/${editar.dataset.editar}`));
    } catch (error) {
      avisar(error.message);
    }
  }
});

/* ================= Detalle ================= */

const dialogo = $("ft-dialog");

function tablaTallas(f) {
  return `<table class="tabla-resumen">
    <caption>Tallas y cantidades</caption>
    <thead><tr><th scope="col">Talla</th><th scope="col" class="num">Prendas</th></tr></thead>
    <tbody>${f.tallas.map((t) => `<tr><td>${escapeHtml(t.talla)}</td><td class="num">${formatoNumero(t.cantidad)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${formatoNumero(f.total_prendas)}</td></tr></tfoot>
  </table>`;
}

async function abrirDetalle(id) {
  try {
    detalleActual = await api(`/fichas-tecnicas/${encodeURIComponent(id)}`);
  } catch (error) {
    return avisar(error.message);
  }
  const f = detalleActual;
  $("det-fecha").textContent = `Creada el ${fechaLarga(f.fecha)}`;
  $("det-id").textContent = `Ficha técnica ${numeroFicha(f.id_ficha)}`;
  $("det-ref").textContent = f.id_referencia ? `Referencia ${f.id_referencia} · ${f.tipo || ""}` : "Referencia eliminada";
  $("det-imagen").hidden = !f.foto;
  $("det-imagen").src = f.foto ? urlArchivo(f.foto) : "";
  $("det-imagen").alt = f.id_referencia ? `Foto de la referencia ${f.id_referencia}` : "";
  $("det-info").innerHTML = `
    ${tablaTallas(f)}
    <table class="tabla-resumen"><caption>Procesos</caption><tbody><tr><td>
      <ol class="ft-procesos-lista">${f.procesos.map((p) => `<li><strong>${escapeHtml(p.nombre)}</strong>${p.descripcion ? `<p>${escapeHtml(p.descripcion)}</p>` : ""}</li>`).join("")}</ol>
    </td></tr></tbody></table>
    ${f.id_referencia ? tablaDescripciones(f.descripciones) : ""}
    ${f.observaciones ? `<table class="tabla-resumen"><caption>Observaciones</caption><tbody><tr><td>${escapeHtml(f.observaciones)}</td></tr></tbody></table>` : ""}`;
  dialogo.showModal();
}

$("det-cerrar").addEventListener("click", () => dialogo.close());
dialogo.addEventListener("click", (event) => {
  if (event.target === dialogo) dialogo.close();
});

$("det-editar").addEventListener("click", () => {
  if (!detalleActual) return;
  dialogo.close();
  editarFicha(detalleActual);
});

$("det-eliminar").addEventListener("click", () => {
  if (!detalleActual) return;
  dialogo.close();
  eliminarFicha(detalleActual.id_ficha);
});

async function eliminarFicha(id_ficha) {
  const ok = await confirmar({
    titulo: "¿Eliminar ficha técnica?",
    texto: `Se eliminará la ficha técnica ${numeroFicha(id_ficha)} con sus tallas y procesos. La referencia no se borra. Esta acción no se puede deshacer.`,
  });
  if (!ok) return;
  try {
    await api(`/fichas-tecnicas/${id_ficha}`, { method: "DELETE" });
    avisar(`La ficha técnica ${numeroFicha(id_ficha)} fue eliminada.`);
    if (editando?.id_ficha === id_ficha) limpiarFormulario();
    cargarLista();
  } catch (error) {
    avisar(error.message);
  }
}

/* ================= PDF ================= */

// jsPDF no lee WEBP: se pasa la imagen por un canvas y sale en JPEG
async function imagenJpeg(url) {
  const dataUrl = await imagenComoDataUrl(url);
  if (!dataUrl) return null;
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  return { data: canvas.toDataURL("image/jpeg", 0.9), ancho: img.naturalWidth, alto: img.naturalHeight };
}

async function exportarPdf(f) {
  if (!window.jspdf?.jsPDF) throw new Error("No se pudo cargar el exportador de PDF. Revisa tu conexión a internet.");
  const u = SigmaSesion.usuario || {};
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFillColor(10, 17, 35);
  doc.rect(0, 0, ancho, 86, "F");
  let x = 40;
  const logo = await imagenJpeg(SigmaSesion.archivo(u.logo_empresa)).catch(() => null);
  if (logo) {
    doc.addImage(logo.data, "JPEG", 40, 18, 50, 50);
    x = 104;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(u.nombre_empresa || "Mi empresa", x, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text([u.nit_temporal ? "" : `NIT ${u.nit}`, u.direccion_empresa, u.telefono_contacto].filter(Boolean).join("  ·  "), x, 58);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(240, 199, 94);
  doc.text(`FICHA TÉCNICA ${numeroFicha(f.id_ficha)}`, ancho - 40, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(195, 198, 228);
  doc.text(`Creada el ${fechaLarga(f.fecha)}`, ancho - 40, 58, { align: "right" });

  doc.setTextColor(10, 17, 35);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(f.id_referencia ? `Referencia ${f.id_referencia} · ${f.tipo || ""}` : "Referencia eliminada", 40, 114);

  // Foto de la referencia a la izquierda; tallas a la derecha
  let yFoto = 128;
  const foto = f.foto ? await imagenJpeg(urlArchivo(f.foto)).catch(() => null) : null;
  if (foto) {
    const anchoFoto = 220;
    const altoFoto = Math.min(300, (anchoFoto * foto.alto) / foto.ancho);
    doc.addImage(foto.data, "JPEG", 40, 128, anchoFoto, altoFoto);
    yFoto = 128 + altoFoto;
  }
  const estilo = {
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: [10, 17, 35], lineColor: [220, 222, 234] },
    headStyles: { fillColor: [58, 62, 108], textColor: 255, fontStyle: "bold" },
  };
  doc.autoTable({
    ...estilo,
    startY: 128,
    margin: { left: foto ? 280 : 40, right: 40 },
    head: [["Talla", "Prendas"]],
    body: f.tallas.map((t) => [t.talla, formatoNumero(t.cantidad)]),
    foot: [["Total", formatoNumero(f.total_prendas)]],
    footStyles: { fillColor: [10, 17, 35], textColor: [240, 199, 94], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });

  doc.autoTable({
    ...estilo,
    startY: Math.max(yFoto, doc.lastAutoTable.finalY) + 22,
    margin: { left: 40, right: 40 },
    head: [["#", "Proceso", "Descripción"]],
    body: f.procesos.map((p, i) => [i + 1, p.nombre, p.descripcion || ""]),
    columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 140, fontStyle: "bold" } },
  });

  const grupos = agruparDescripciones(f.descripciones);
  if (grupos.length) {
    doc.autoTable({
      ...estilo,
      startY: doc.lastAutoTable.finalY + 22,
      margin: { left: 40, right: 40 },
      head: [["Descripción", "Detalle"]],
      body: grupos.map((g) => [g.nombre, g.items.join("\n")]),
      columnStyles: { 0: { cellWidth: 140, fontStyle: "bold" } },
    });
  }
  if (f.observaciones) {
    doc.autoTable({
      ...estilo,
      startY: doc.lastAutoTable.finalY + 22,
      margin: { left: 40, right: 40 },
      head: [["Observaciones"]],
      body: [[f.observaciones]],
    });
  }
  doc.save(`ficha-tecnica-${numeroFicha(f.id_ficha)}.pdf`);
}

$("det-pdf").addEventListener("click", async () => {
  if (!detalleActual) return;
  $("det-pdf").disabled = true;
  try {
    await exportarPdf(detalleActual);
  } catch (error) {
    avisar(error.message);
  } finally {
    $("det-pdf").disabled = false;
  }
});

/* ================= Inicio ================= */

limpiarFormulario();
cargarTallasUsadas(api).then(() => [...$("tallas").children].forEach((fila) => fila.talla.refrescar()));
cargarReferencias();
api("/fichas-tecnicas")
  .then((lista) => ($("tab-count").textContent = lista.length))
  .catch(() => {});
if (location.hash === "#lista") activarPestana($("tab-lista"));
