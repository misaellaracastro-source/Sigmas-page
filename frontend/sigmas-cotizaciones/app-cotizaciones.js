// Cotizaciones: calcula lo que se cobra por un pedido (referencia × cantidad + utilidad + IVA),
// muestra los materiales que se necesitan y lista las cotizaciones guardadas con búsqueda y filtros.
import {
  api,
  urlArchivo,
  formatoPesos,
  formatoNumero,
  leerNumero,
  escapeHtml,
  CODIGO_RE,
  normalizarCodigo,
  avisar,
  mostrarError,
  confirmar,
  mostrarVacio,
} from "../sigmas-inventario/util-inventario.js";
import { crearDesplegable } from "../sigmas-referencias/desplegable.js";
import { imagenComoDataUrl } from "../sigmas-referencias/imagen-referencia.js";
import { fechaLarga } from "../sigmas-referencias/exportar-referencia.js";

const $ = (id) => document.getElementById(id);
const redondear = (n) => Math.round(n * 100) / 100;
const MAX_PRENDAS = 1000000;

let referencias = [];
let clientes = [];
let refActual = null;
let idVerificado = "";
let cotizaciones = [];
let detalleActual = null;
let editando = null; // número de la cotización que se está editando

function hoyIso() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}

/**
 * Igual que en el servidor:
 *   valor    = valor de la prenda × cantidad
 *   subtotal = valor + valor × utilidad %   (valor con utilidad)
 *   total    = subtotal + subtotal × IVA %  (lo que se cobra)
 */
function calcular(valorPrenda, cantidad, utilidad, iva) {
  const valor = redondear(valorPrenda * cantidad);
  const valorUtilidad = redondear((valor * utilidad) / 100);
  const subtotal = redondear(valor + valorUtilidad);
  const valorIva = redondear((subtotal * iva) / 100);
  return { valor, valorUtilidad, subtotal, valorIva, total: redondear(subtotal + valorIva) };
}

const porcentaje = (n) => `${formatoNumero(n)} %`;

// Número y tipo de la referencia. Si se eliminó, la cotización conserva su copia.
function textoReferencia(c) {
  if (!c.codigo_referencia) return "Sin referencia";
  return `${c.codigo_referencia} · ${c.tipo || ""}${c.id_referencia ? "" : " (referencia eliminada)"}`;
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

/* ================= Datos: referencias y clientes ================= */

async function cargarDatos() {
  try {
    [referencias, clientes] = await Promise.all([api("/referencias"), api("/vinculados?tipo=Cliente")]);
  } catch (error) {
    return avisar(error.message);
  }
  pintarTipos();
  pintarReferencias();
  pintarClientes();
}

function pintarClientes() {
  const opciones = clientes
    .map((c) => `<option value="${escapeHtml(c.identificacion)}">${escapeHtml(c.nombre)} · ${escapeHtml(c.identificacion)}</option>`)
    .join("");
  const elegido = $("cot-cliente").value;
  $("cot-cliente").innerHTML = '<option value="">Elige el cliente</option>' + opciones;
  $("cot-cliente").value = elegido;
  $("cot-cliente-hint").innerHTML = clientes.length
    ? "Clientes registrados en Vinculados."
    : 'Aún no tienes clientes. <a class="link-btn" href="../sigmas-vinculados/vinculados.html">Regístralos en Vinculados</a>.';

  // Filtros de la lista
  $("lista-cliente").innerHTML = '<option value="">Todos</option>' + opciones;
  $("lista-referencia").innerHTML =
    '<option value="">Todas</option>' +
    referencias.map((r) => `<option value="${escapeHtml(r.id_referencia)}">${escapeHtml(r.id_referencia)} · ${escapeHtml(r.tipo)}</option>`).join("");
}

/* ================= Referencia: tipo → referencia, o búsqueda por número ================= */

function fotoMini(r, clase = "opt-foto") {
  return r?.foto
    ? `<img class="${clase}" src="${escapeHtml(urlArchivo(r.foto))}" alt="" loading="lazy" />`
    : `<span class="${clase} ref-sin-foto" aria-hidden="true"></span>`;
}

const tipos = crearDesplegable({
  contenedor: $("tipo-pick"),
  textoVacio: 'Aún no tienes referencias. <a href="../sigmas-referencias/referencias.html">Créalas en Referencias</a>.',
  alElegir: () => {
    $("ref-buscar").value = "";
    pintarReferencias();
    refPick.enfocar();
  },
});

const refPick = crearDesplegable({
  contenedor: $("ref-pick"),
  textoVacio: "Ninguna referencia coincide.",
  alElegir: (id) => elegirReferencia(id),
});

function pintarTipos() {
  const conteo = new Map();
  referencias.forEach((r) => conteo.set(r.tipo, (conteo.get(r.tipo) || 0) + 1));
  const opcion = (valor, nombre, cantidad) => ({
    valor,
    html: `<span class="opt"><span class="opt-text"><strong>${escapeHtml(nombre)}</strong></span><span class="opt-count">${cantidad}</span></span>`,
  });
  tipos.fijarOpciones(
    referencias.length
      ? [
          opcion("", "Todos los tipos", referencias.length),
          ...[...conteo.entries()].sort(([a], [b]) => a.localeCompare(b, "es")).map(([tipo, n]) => opcion(tipo, tipo, n)),
        ]
      : [],
  );
}

// Referencias del tipo elegido que coinciden con la búsqueda
function pintarReferencias() {
  const tipo = tipos.valor();
  const q = normalizarCodigo($("ref-buscar").value);
  const lista = referencias.filter((r) => (!tipo || r.tipo === tipo) && (!q || r.id_referencia.includes(q)));
  refPick.fijarOpciones(
    lista.map((r) => ({
      valor: r.id_referencia,
      html: `<span class="opt">${fotoMini(r)}<span class="opt-text"><strong>${escapeHtml(r.id_referencia)}</strong><small>${escapeHtml(r.tipo)} · ${formatoPesos(r.valor_prenda)}</small></span></span>`,
    })),
  );
  // Si la búsqueda deja una sola referencia (o el número exacto), se elige sola
  const exacta = q && (lista.find((r) => r.id_referencia === q) || (lista.length === 1 ? lista[0] : null));
  if (exacta) refPick.elegir(exacta.id_referencia);
  else if (refPick.valor() !== (refActual?.id_referencia || "")) elegirReferencia(refPick.valor());
}

let esperaRef;
$("ref-buscar").addEventListener("input", () => {
  clearTimeout(esperaRef);
  esperaRef = setTimeout(() => {
    // La búsqueda es por número en todos los tipos
    tipos.elegir("", false);
    pintarReferencias();
  }, 200);
});

function elegirReferencia(id) {
  refActual = referencias.find((r) => r.id_referencia === id) || null;
  mostrarError("ref", "");
  $("ref-pick").querySelector(".pick-btn").classList.remove("is-bad");
  $("ref-elegida").hidden = !refActual;
  if (refActual) {
    $("ref-foto").hidden = !refActual.foto;
    $("ref-sin-foto").hidden = Boolean(refActual.foto);
    if (refActual.foto) {
      $("ref-foto").src = urlArchivo(refActual.foto);
      $("ref-foto").alt = `Foto de la referencia ${refActual.id_referencia}`;
    }
    $("ref-elegida-id").textContent = refActual.id_referencia;
    $("ref-elegida-tipo").textContent = refActual.tipo;
    $("ref-elegida-valor").textContent = formatoPesos(refActual.valor_prenda);
  }
  recalcular();
}

/* ================= Cálculo ================= */

function leerEntradas() {
  const textoCantidad = $("cot-cantidad").value.trim();
  return {
    cantidad: /^\d+$/.test(textoCantidad) ? Number(textoCantidad) : null,
    utilidad: leerNumero($("cot-utilidad").value),
    iva: leerNumero($("cot-iva").value),
  };
}

function recalcular() {
  const { cantidad, utilidad, iva } = leerEntradas();
  const valorPrenda = refActual?.valor_prenda || 0;
  const r = calcular(valorPrenda, cantidad || 0, utilidad || 0, iva || 0);
  $("res-prenda").textContent = formatoPesos(valorPrenda);
  $("res-valor-label").textContent = `× ${formatoNumero(cantidad || 0)} prendas`;
  $("res-valor").textContent = formatoPesos(r.valor);
  $("res-utilidad-label").textContent = `+ Utilidad (${porcentaje(utilidad || 0)})`;
  $("res-utilidad").textContent = formatoPesos(r.valorUtilidad);
  $("res-subtotal").textContent = formatoPesos(r.subtotal);
  $("res-iva-label").textContent = `+ IVA (${porcentaje(iva || 0)})`;
  $("res-iva").textContent = formatoPesos(r.valorIva);
  $("res-total").textContent = $("res-total-2").textContent = formatoPesos(r.total);
  cargarMateriales();
}

["cot-cantidad", "cot-utilidad", "cot-iva"].forEach((id) =>
  $(id).addEventListener("input", () => {
    mostrarError(id, "");
    recalcular();
  }),
);
$("cot-cliente").addEventListener("change", () => mostrarError("cot-cliente", ""));

/* ================= Materiales para la cantidad de prendas ================= */

// Lo que hay en el inventario (solo en la vista previa, antes de guardar)
function celdaInventario(m) {
  if (m.disponible === undefined) return "";
  if (m.disponible === null) return '<td class="num"><span class="hint">No se puede comparar</span></td>';
  const texto = `${formatoNumero(m.disponible)} ${escapeHtml(m.unidad || "")}`;
  return m.alcanza
    ? `<td class="num">${texto}</td>`
    : `<td class="num"><span class="falta">${texto}<br><small>Faltan ${formatoNumero(m.total - m.disponible)}</small></span></td>`;
}

function tablaMateriales(materiales, cantidad) {
  if (!materiales.length) return '<p class="hint">Esta referencia no tiene insumos ni telas registrados.</p>';
  const conInventario = materiales.some((m) => m.disponible !== undefined);
  const tabla = (titulo, tipo) => {
    const lista = materiales.filter((m) => m.tipo === tipo);
    if (!lista.length) return "";
    const filas = lista
      .map(
        (m) => `<tr>
          <td><span class="opt">${m.color ? `<span class="opt-swatch" style="background:${escapeHtml(m.color)}"></span>` : ""}<span class="opt-text"><strong>${escapeHtml(m.nombre)}</strong><small>${escapeHtml(m.categoria || m.tipo)}${m.codigo ? ` · ${escapeHtml(m.codigo)}` : ""}</small></span></span></td>
          <td class="num">${formatoNumero(m.por_prenda)} ${escapeHtml(m.unidad || "")}</td>
          <td class="num"><span class="mat-cantidad">${formatoNumero(m.total)} ${escapeHtml(m.unidad || "")}</span></td>
          ${celdaInventario(m)}
          <td class="num">${formatoPesos(m.valor_unitario)}</td>
          <td class="num">${formatoPesos(m.costo)}</td>
        </tr>`,
      )
      .join("");
    return `<table class="tabla-resumen">
      <caption>${titulo}</caption>
      <thead><tr><th scope="col">Material</th><th scope="col" class="num">Por prenda</th><th scope="col" class="num">Para ${formatoNumero(cantidad)} prendas</th>${conInventario ? '<th scope="col" class="num">En inventario</th>' : ""}<th scope="col" class="num">Valor unidad</th><th scope="col" class="num">Costo</th></tr></thead>
      <tbody>${filas}</tbody>
      <tfoot><tr><td colspan="${conInventario ? 5 : 4}">Total</td><td class="num">${formatoPesos(lista.reduce((s, m) => s + m.costo, 0))}</td></tr></tfoot>
    </table>`;
  };
  return tabla("Materia prima (telas)", "Materia prima") + tabla("Insumos", "Insumo");
}

let esperaMateriales;
let pedidoMateriales = 0;

function cargarMateriales() {
  clearTimeout(esperaMateriales);
  pedidoMateriales++;
  const { cantidad } = leerEntradas();
  if (!refActual || !(cantidad >= 1 && cantidad <= MAX_PRENDAS)) {
    $("mat-titulo").textContent = "Materiales para la cantidad de prendas";
    $("materiales").innerHTML = "";
    return;
  }
  $("mat-titulo").textContent = `Materiales para ${formatoNumero(cantidad)} prendas`;
  const pedido = pedidoMateriales;
  esperaMateriales = setTimeout(async () => {
    try {
      const edicion = editando ? `&cotizacion=${encodeURIComponent(editando)}` : "";
      const materiales = await api(`/cotizaciones/materiales?referencia=${encodeURIComponent(refActual.id_referencia)}&cantidad=${cantidad}${edicion}`);
      if (pedido === pedidoMateriales) $("materiales").innerHTML = tablaMateriales(materiales, cantidad);
    } catch (error) {
      if (pedido === pedidoMateriales) $("materiales").innerHTML = `<p class="field-error">${escapeHtml(error.message)}</p>`;
    }
  }, 300);
}

/* ================= Guardar ================= */

$("cot-id").addEventListener("input", () => {
  idVerificado = "";
  mostrarError("cot-id", "");
});

async function validarId() {
  if (editando) return true;
  const id = normalizarCodigo($("cot-id").value);
  $("cot-id").value = id;
  if (!CODIGO_RE.test(id)) {
    mostrarError("cot-id", "Escribe el número de cotización: letras, números y guiones. Ej: COT-001");
    return false;
  }
  if (id === idVerificado) return true;
  try {
    const { existe } = await api(`/cotizaciones/existe?id=${encodeURIComponent(id)}`);
    if (existe) {
      mostrarError("cot-id", `La cotización ${id} ya existe. Usa otro número.`);
      return false;
    }
    idVerificado = id;
    return true;
  } catch (error) {
    mostrarError("cot-id", error.message);
    return false;
  }
}

$("cot-id").addEventListener("blur", () => {
  if ($("cot-id").value.trim()) validarId();
});

function mostrarErrores(errores) {
  const campos = { id_cotizacion: "cot-id", id_vinculado: "cot-cliente", cantidad: "cot-cantidad", utilidad: "cot-utilidad", iva: "cot-iva" };
  Object.entries(errores).forEach(([campo, mensaje]) => {
    if (campo === "id_referencia") {
      mostrarError("ref", mensaje);
      $("ref-pick").querySelector(".pick-btn").classList.add("is-bad");
    } else if (campos[campo]) mostrarError(campos[campo], mensaje);
  });
}

$("btn-guardar").addEventListener("click", async () => {
  const boton = $("btn-guardar");
  $("guardar-error").hidden = true;
  const { cantidad, utilidad, iva } = leerEntradas();
  const errores = {};
  if (!$("cot-cliente").value) errores.id_vinculado = "Elige el cliente de la cotización.";
  if (!refActual) errores.id_referencia = "Elige una referencia.";
  if (!(cantidad >= 1 && cantidad <= MAX_PRENDAS)) errores.cantidad = "Escribe un número entero de prendas mayor que 0.";
  if (utilidad === null || utilidad > 999.99) errores.utilidad = "Escribe el porcentaje de utilidad (0 a 999).";
  if (iva === null || iva > 100) errores.iva = "Escribe el porcentaje de IVA (0 a 100).";
  const idOk = await validarId();
  mostrarErrores(errores);
  if (!idOk || Object.keys(errores).length) {
    document.querySelector("#panel-nueva .is-bad")?.focus();
    return;
  }

  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const ruta = editando ? `/cotizaciones/${encodeURIComponent(editando)}` : "/cotizaciones";
    const { cotizacion, inventario } = await api(ruta, {
      method: editando ? "PUT" : "POST",
      body: JSON.stringify({
        id_cotizacion: normalizarCodigo($("cot-id").value),
        id_vinculado: $("cot-cliente").value,
        id_referencia: refActual.id_referencia,
        cantidad,
        utilidad,
        iva,
      }),
    });
    avisar(`La cotización ${cotizacion.id_cotizacion} quedó ${editando ? "actualizada" : "guardada"}.`);
    limpiarFormulario();
    activarPestana($("tab-lista"));
    abrirDetalle(cotizacion.id_cotizacion, inventario);
    if (inventario?.alertas) window.dispatchEvent(new Event("sigmas:alertas"));
  } catch (error) {
    if (error.errores) mostrarErrores(error.errores);
    $("guardar-error").textContent = error.message;
    $("guardar-error").hidden = false;
  } finally {
    boton.disabled = false;
    if (boton.textContent === "Guardando…") boton.textContent = textoBoton;
  }
});

// Modo edición: el número queda fijo y el botón guarda los cambios
function fijarEdicion(id) {
  editando = id;
  $("cot-id").disabled = Boolean(id);
  $("editando-aviso").hidden = !id;
  $("editando-texto").textContent = id ? `Estás editando la cotización ${id}. La fecha de creación no cambia.` : "";
  $("tab-nueva").textContent = id ? "Editar cotización" : "Nueva cotización";
  $("btn-guardar").textContent = id ? "Guardar cambios" : "Guardar cotización";
}

function editarCotizacion(c) {
  limpiarFormulario();
  fijarEdicion(c.id_cotizacion);
  $("cot-id").value = c.id_cotizacion;
  // Si el cliente ya no está en la lista, se agrega para no perderlo
  if (c.id_vinculado && ![...$("cot-cliente").options].some((o) => o.value === c.id_vinculado)) {
    $("cot-cliente").add(new Option(c.cliente || c.id_vinculado, c.id_vinculado));
  }
  $("cot-cliente").value = c.id_vinculado || "";
  $("cot-cantidad").value = c.cantidad;
  $("cot-utilidad").value = String(c.utilidad).replace(".", ",");
  $("cot-iva").value = String(c.iva).replace(".", ",");
  if (c.id_referencia && referencias.some((r) => r.id_referencia === c.id_referencia)) refPick.elegir(c.id_referencia);
  else mostrarError("ref", `La referencia ${c.codigo_referencia || ""} fue eliminada. La cotización conserva sus datos; para guardar cambios elige otra referencia.`);
  recalcular();
  activarPestana($("tab-nueva"));
  $("cot-cliente").focus();
}

$("editando-cancelar").addEventListener("click", () => {
  limpiarFormulario();
  avisar("Se canceló la edición.");
});

function limpiarFormulario() {
  fijarEdicion(null);
  ["cot-id", "cot-cantidad", "cot-utilidad", "cot-iva", "cot-cliente", "ref-buscar"].forEach((id) => {
    $(id).value = "";
    mostrarError(id, "");
  });
  $("guardar-error").hidden = true;
  idVerificado = "";
  tipos.elegir("", false);
  refPick.elegir("", false);
  pintarReferencias();
  elegirReferencia("");
}

$("btn-limpiar").addEventListener("click", () => {
  limpiarFormulario();
  $("cot-id").focus();
});

/* ================= Cotizaciones registradas ================= */

let esperaBusqueda;

function filtros() {
  const params = new URLSearchParams();
  const valores = {
    q: $("lista-buscar").value.trim(),
    cliente: $("lista-cliente").value,
    referencia: $("lista-referencia").value,
    desde: $("lista-desde").value,
    hasta: $("lista-hasta").value,
  };
  Object.entries(valores).forEach(([clave, valor]) => {
    if (valor) params.set(clave, valor);
  });
  return params;
}

async function cargarLista() {
  const params = filtros();
  try {
    cotizaciones = await api(`/cotizaciones${params.size ? `?${params}` : ""}`);
    if (!params.size) $("tab-count").textContent = cotizaciones.length;
    pintarLista(params.size > 0);
  } catch (error) {
    $("lista-cuerpo").innerHTML = "";
    $("lista-mostrando").textContent = "";
    mostrarVacio($("lista-vacia"), "No se pudieron cargar las cotizaciones", error.message, true);
  }
}

function fechaCorta(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function pintarLista(conFiltros) {
  $("lista-vacia").hidden = true;
  $("lista-cuerpo").innerHTML = cotizaciones
    .map(
      (c) => `<tr data-ver="${escapeHtml(c.id_cotizacion)}">
        <td data-label="Cotización"><button type="button" class="cot-link" data-ver="${escapeHtml(c.id_cotizacion)}">${escapeHtml(c.id_cotizacion)}</button></td>
        <td data-label="Fecha">${fechaCorta(c.fecha)}</td>
        <td data-label="Cliente">${c.cliente ? escapeHtml(c.cliente) : '<span class="hint">Sin cliente</span>'}</td>
        <td data-label="Referencia"><span class="cot-ref">${fotoMini(c, "")}<span>${
          c.codigo_referencia
            ? `<strong>${escapeHtml(c.codigo_referencia)}</strong><br><small class="hint">${escapeHtml(c.tipo || "")}${c.id_referencia ? "" : " · eliminada"}</small>`
            : '<span class="hint">Sin referencia</span>'
        }</span></span></td>
        <td data-label="Cantidad" class="num">${formatoNumero(c.cantidad)}</td>
        <td data-label="Valor" class="num">${formatoPesos(c.valor)}</td>
        <td data-label="Utilidad" class="num">${porcentaje(c.utilidad)}</td>
        <td data-label="IVA" class="num">${porcentaje(c.iva)}</td>
        <td data-label="Total a cobrar" class="num"><strong>${formatoPesos(c.precio_final)}</strong></td>
        <td data-label="Acciones" class="cot-acciones">
          <button type="button" class="btn-ghost btn-small" data-editar="${escapeHtml(c.id_cotizacion)}">Editar</button>
          <button type="button" class="btn-ghost btn-small is-danger" data-eliminar="${escapeHtml(c.id_cotizacion)}">Eliminar</button>
        </td>
      </tr>`,
    )
    .join("");
  if (cotizaciones.length === 0) {
    if (conFiltros) mostrarVacio($("lista-vacia"), "Sin resultados", "Ninguna cotización coincide con la búsqueda o los filtros.");
    else mostrarVacio($("lista-vacia"), "Aún no tienes cotizaciones", "Crea la primera en la pestaña “Nueva cotización”.");
  }
  const total = cotizaciones.reduce((s, c) => s + c.precio_final, 0);
  $("lista-mostrando").textContent = cotizaciones.length
    ? `${cotizaciones.length} cotización${cotizaciones.length === 1 ? "" : "es"} · Total a cobrar: ${formatoPesos(total)}`
    : "";
}

$("lista-buscar").addEventListener("input", () => {
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(cargarLista, 300);
});
["lista-cliente", "lista-referencia", "lista-desde", "lista-hasta"].forEach((id) => $(id).addEventListener("change", cargarLista));
$("lista-limpiar").addEventListener("click", () => {
  ["lista-buscar", "lista-cliente", "lista-referencia", "lista-desde", "lista-hasta"].forEach((id) => ($(id).value = ""));
  cargarLista();
});
$("lista-cuerpo").addEventListener("click", async (event) => {
  const editar = event.target.closest("[data-editar]");
  const eliminar = event.target.closest("[data-eliminar]");
  if (eliminar) return eliminarCotizacion(eliminar.dataset.eliminar);
  if (editar) {
    try {
      editarCotizacion(await api(`/cotizaciones/${encodeURIComponent(editar.dataset.editar)}`));
    } catch (error) {
      avisar(error.message);
    }
    return;
  }
  // El resto de la fila abre el detalle
  const fila = event.target.closest("[data-ver]");
  if (fila) abrirDetalle(fila.dataset.ver);
});

/* ================= Detalle ================= */

const dialogo = $("cot-dialog");

function pasosCalculo(c) {
  return `<dl class="cot-pasos">
    <div><dt>Valor de la prenda</dt><dd>${formatoPesos(c.valor_prenda)}</dd></div>
    <div><dt>× ${formatoNumero(c.cantidad)} prendas</dt><dd>${formatoPesos(c.valor)}</dd></div>
    <div><dt>+ Utilidad (${porcentaje(c.utilidad)})</dt><dd>${formatoPesos(c.valor_utilidad)}</dd></div>
    <div class="is-sub"><dt>Valor con utilidad</dt><dd>${formatoPesos(c.subtotal)}</dd></div>
    <div><dt>+ IVA (${porcentaje(c.iva)})</dt><dd>${formatoPesos(c.valor_iva)}</dd></div>
    <div class="is-total"><dt>Total a cobrar</dt><dd>${formatoPesos(c.precio_final)}</dd></div>
  </dl>`;
}

// Resultado del descuento de inventario al guardar
function resumenInventario(inventario) {
  if (!inventario) return "";
  const lineas = inventario.descontados.map(
    (d) => `<li>${escapeHtml(d.nombre)}: −${formatoNumero(d.cantidad)} ${escapeHtml(d.unidad)} · quedan <strong>${formatoNumero(d.queda)}</strong></li>`,
  );
  const avisos = inventario.avisos.map((a) => `<li class="falta">${escapeHtml(a)}</li>`);
  return `<div class="inv-resumen">
    <strong>Se descontó del inventario</strong>
    <ul>${[...lineas, ...avisos].join("") || "<li>No había materiales para descontar.</li>"}</ul>
    ${inventario.alertas ? `<p>⚠ ${inventario.alertas} material${inventario.alertas === 1 ? "" : "es"} llegó al stock mínimo: revisa la campana.</p>` : ""}
  </div>`;
}

async function abrirDetalle(id, inventario = null) {
  try {
    detalleActual = await api(`/cotizaciones/${encodeURIComponent(id)}`);
  } catch (error) {
    return avisar(error.message);
  }
  const c = detalleActual;
  $("det-fecha").textContent = `Creada el ${fechaLarga(c.fecha)}`;
  $("det-id").textContent = c.id_cotizacion;
  $("det-cliente").textContent = c.cliente ? `Cliente: ${c.cliente}` : "Sin cliente";
  $("det-imagen").hidden = !c.foto;
  $("det-imagen").src = c.foto ? urlArchivo(c.foto) : "";
  $("det-imagen").alt = c.codigo_referencia ? `Referencia ${c.codigo_referencia}` : "";
  $("det-info").innerHTML = `
    ${resumenInventario(inventario)}
    <p class="ref-meta">Referencia: <strong>${escapeHtml(textoReferencia(c))}</strong></p>
    ${pasosCalculo(c)}
    ${tablaMateriales(c.materiales, c.cantidad)}`;
  dialogo.showModal();
}

$("det-cerrar").addEventListener("click", () => dialogo.close());
dialogo.addEventListener("click", (event) => {
  if (event.target === dialogo) dialogo.close();
});

$("det-editar").addEventListener("click", () => {
  if (!detalleActual) return;
  dialogo.close();
  editarCotizacion(detalleActual);
});

$("det-eliminar").addEventListener("click", () => {
  if (!detalleActual) return;
  dialogo.close();
  eliminarCotizacion(detalleActual.id_cotizacion);
});

async function eliminarCotizacion(id_cotizacion) {
  const ok = await confirmar({
    titulo: "¿Eliminar cotización?",
    texto: `Se eliminará la cotización ${id_cotizacion} y los materiales que descontó volverán al inventario. Esta acción no se puede deshacer.`,
  });
  if (!ok) return;
  try {
    await api(`/cotizaciones/${encodeURIComponent(id_cotizacion)}`, { method: "DELETE" });
    avisar(`La cotización ${id_cotizacion} fue eliminada y sus materiales volvieron al inventario.`);
    // Si se estaba editando, se sale de la edición
    if (editando === id_cotizacion) limpiarFormulario();
    cargarLista();
  } catch (error) {
    avisar(error.message);
  }
}

/* ================= PDF de la cotización ================= */

async function exportarPdf(c) {
  if (!window.jspdf?.jsPDF) throw new Error("No se pudo cargar el exportador de PDF. Revisa tu conexión a internet.");
  const u = SigmaSesion.usuario || {};
  const doc = new window.jspdf.jsPDF({ unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFillColor(10, 17, 35);
  doc.rect(0, 0, ancho, 86, "F");
  let x = 40;
  const logo = await imagenComoDataUrl(SigmaSesion.archivo(u.logo_empresa));
  if (logo) {
    try {
      doc.addImage(logo, /^data:image\/png/.test(logo) ? "PNG" : "JPEG", 40, 18, 50, 50);
      x = 104;
    } catch {
      // logo en un formato que jsPDF no lee: se omite
    }
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
  doc.text(`COTIZACIÓN ${c.id_cotizacion}`, ancho - 40, 40, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(195, 198, 228);
  doc.text(fechaLarga(c.fecha), ancho - 40, 58, { align: "right" });

  doc.setTextColor(10, 17, 35);
  doc.setFontSize(10);
  doc.text(`Cliente: ${c.cliente || "—"}`, 40, 112);
  doc.text(`Referencia: ${textoReferencia(c)}`, 40, 128);

  const estilo = {
    styles: { font: "helvetica", fontSize: 9, cellPadding: 6, textColor: [10, 17, 35], lineColor: [220, 222, 234] },
    headStyles: { fillColor: [58, 62, 108], textColor: 255, fontStyle: "bold" },
    margin: { left: 40, right: 40 },
  };
  doc.autoTable({
    ...estilo,
    startY: 146,
    head: [["Concepto", "Valor"]],
    body: [
      ["Valor de la prenda", formatoPesos(c.valor_prenda)],
      [`× ${formatoNumero(c.cantidad)} prendas`, formatoPesos(c.valor)],
      [`+ Utilidad (${porcentaje(c.utilidad)})`, formatoPesos(c.valor_utilidad)],
      ["Valor con utilidad", formatoPesos(c.subtotal)],
      [`+ IVA (${porcentaje(c.iva)})`, formatoPesos(c.valor_iva)],
    ],
    foot: [["Total a cobrar", formatoPesos(c.precio_final)]],
    footStyles: { fillColor: [10, 17, 35], textColor: [240, 199, 94], fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" } },
  });
  // Los materiales son de uso interno: no van en el PDF que se entrega al cliente
  doc.save(`cotizacion-${c.id_cotizacion}.pdf`);
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

$("cot-fecha").value = fechaLarga(hoyIso());
recalcular();
cargarDatos();
api("/cotizaciones")
  .then((lista) => ($("tab-count").textContent = lista.length))
  .catch(() => {});
if (location.hash === "#lista") activarPestana($("tab-lista"));
