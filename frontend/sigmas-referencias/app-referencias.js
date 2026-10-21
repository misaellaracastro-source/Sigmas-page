// Referencias: asistente para crear una referencia (datos, insumos, materia prima, descripción y valor)
// y listado de las referencias creadas con búsqueda, filtro por fecha y exportación.
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
import { nombreColor } from "../sigmas-inventario/selector-color.js";
import { crearDesplegable } from "./desplegable.js";
import { generarImagenReferencia, imagenComoDataUrl, agruparDescripciones } from "./imagen-referencia.js";
import { exportarFicha, fechaLarga } from "./exportar-referencia.js";
import { cargarTallasUsadas, conectarTalla, recordarTalla } from "../sigmas-comun/tallas.js";

const $ = (id) => document.getElementById(id);
const redondear = (n) => Math.round(n * 100) / 100;
const TOTAL_PASOS = 5;

const catalogo = { insumos: [], materias: [] };
// Lo que se va armando en el asistente
const nueva = { insumos: [], materias: [] };
let paso = 0;
let pasoMaximo = 0;
let idVerificado = "";
let imagenGenerada = "";
let referencias = [];
let detalleActual = null;
// Referencia que se está editando (número y foto actual); null al crear una nueva
let editando = null;

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

/* ================= Catálogo (inventario) ================= */

async function cargarCatalogo() {
  try {
    const [insumos, materias] = await Promise.all([api("/insumos"), api("/materias-primas")]);
    // Solo sirven los que tienen al menos un precio
    catalogo.insumos = insumos.filter((i) => i.precios?.length);
    catalogo.materias = materias.filter((m) => m.precios?.length);
    pintarCategorias();
    pintarTelas();
  } catch (error) {
    avisar(error.message);
  }
}

function miniatura(insumo) {
  return insumo.foto
    ? `<img class="opt-thumb" src="${escapeHtml(urlArchivo(insumo.foto))}" alt="" />`
    : `<span class="opt-thumb">${escapeHtml(insumo.nombre.slice(0, 2).toUpperCase())}</span>`;
}

/* ================= Paso 2: insumos ================= */

const categorias = crearDesplegable({
  contenedor: $("cat-pick"),
  textoVacio: 'Aún no tienes insumos con precio. <a href="../sigmas-inventario/inventario.html">Regístralos en Inventario</a>.',
  alElegir: (categoria) => {
    const lista = catalogo.insumos.filter((i) => i.categoria === categoria);
    $("ins-pick").querySelector(".pick-btn").dataset.placeholder = "Elige un insumo";
    insumosPick.fijarOpciones(
      lista.map((i) => ({
        valor: i.id_insumo,
        html: `<span class="opt">${miniatura(i)}<span class="opt-text"><strong>${escapeHtml(i.nombre)}</strong><small>${escapeHtml(i.id_insumo)}${i.talla ? ` · Talla ${escapeHtml(i.talla)}` : ""}</small></span></span>`,
      })),
    );
    insumosPick.elegir("", false);
    insumosPick.habilitar(true);
    insumoActual = null;
    $("ins-config").hidden = true;
    insumosPick.enfocar();
  },
});

const insumosPick = crearDesplegable({
  contenedor: $("ins-pick"),
  textoVacio: "No hay insumos en esta categoría.",
  alElegir: (id) => mostrarConfigInsumo(catalogo.insumos.find((i) => i.id_insumo === id)),
});

function pintarCategorias() {
  const conteo = new Map();
  catalogo.insumos.forEach((i) => conteo.set(i.categoria, (conteo.get(i.categoria) || 0) + 1));
  categorias.fijarOpciones(
    [...conteo.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([categoria, cantidad]) => ({
        valor: categoria,
        html: `<span class="opt"><span class="opt-text"><strong>${escapeHtml(categoria)}</strong></span><span class="opt-count">${cantidad}</span></span>`,
      })),
  );
}

let insumoActual = null;

function mostrarConfigInsumo(insumo) {
  insumoActual = insumo;
  mostrarError("ins", "");
  if (!insumo) {
    $("ins-config").hidden = true;
    return;
  }
  $("ins-unidad").innerHTML = insumo.precios
    .map((p) => `<option value="${escapeHtml(p.unidad)}">${escapeHtml(p.unidad)}</option>`)
    .join("");
  $("ins-cantidad").value = "";
  $("ins-config").hidden = false;
  calcularInsumo();
  $("ins-cantidad").focus();
}

function calcularInsumo() {
  if (!insumoActual) return null;
  const precio = insumoActual.precios.find((p) => p.unidad === $("ins-unidad").value);
  const cantidad = leerNumero($("ins-cantidad").value);
  const total = redondear((cantidad || 0) * precio.valor);
  $("ins-valor").textContent = formatoPesos(precio.valor);
  $("ins-total").textContent = formatoPesos(total);
  return { precio, cantidad, total };
}

$("ins-unidad").addEventListener("change", calcularInsumo);
$("ins-cantidad").addEventListener("input", () => {
  $("ins-cantidad").classList.remove("is-bad");
  mostrarError("ins", "");
  calcularInsumo();
});
$("ins-cantidad").addEventListener("keydown", (event) => {
  if (event.key === "Enter") agregarInsumo();
});

function agregarInsumo() {
  const calculo = calcularInsumo();
  if (!calculo) return;
  if (!calculo.cantidad) {
    $("ins-cantidad").classList.add("is-bad");
    $("ins-cantidad").focus();
    return mostrarError("ins", "Escribe una cantidad mayor que 0.");
  }
  if (nueva.insumos.some((i) => i.id_insumo === insumoActual.id_insumo && i.unidad === calculo.precio.unidad)) {
    return mostrarError("ins", `${insumoActual.nombre} (por ${calculo.precio.unidad}) ya está agregado. Quítalo de la lista para cambiarlo.`);
  }
  nueva.insumos.push({
    id_insumo: insumoActual.id_insumo,
    nombre: insumoActual.nombre,
    categoria: insumoActual.categoria,
    foto: insumoActual.foto,
    unidad: calculo.precio.unidad,
    valor_unitario: calculo.precio.valor,
    cantidad: calculo.cantidad,
    total: calculo.total,
  });
  avisar(`${insumoActual.nombre} se agregó a la referencia.`);
  insumosPick.elegir("", false);
  $("ins-config").hidden = true;
  insumoActual = null;
  pintarSeleccion();
  insumosPick.enfocar();
}

$("ins-agregar").addEventListener("click", agregarInsumo);

/* ================= Paso 3: materia prima ================= */

const telas = crearDesplegable({
  contenedor: $("tela-pick"),
  textoVacio: 'Aún no tienes telas con precio. <a href="../sigmas-inventario/inventario.html#materias">Regístralas en Inventario</a>.',
  alElegir: (id) => mostrarConfigMateria(catalogo.materias.find((m) => m.id_materia === id)),
});

function pintarTelas() {
  telas.fijarOpciones(
    catalogo.materias.map((m) => ({
      valor: m.id_materia,
      html: `<span class="opt"><span class="opt-swatch" style="background:${escapeHtml(m.color || "#eceef6")}"></span><span class="opt-text"><strong>${escapeHtml(m.nombre)}</strong><small>${escapeHtml(m.id_materia)} · ${escapeHtml(nombreColor(m.color) || "Sin color")}</small></span></span>`,
    })),
  );
}

let materiaActual = null;

function filaTalla(talla = "", cantidad = "") {
  const fila = document.createElement("div");
  fila.className = "talla-row";
  fila.innerHTML = `
    <div class="talla-campo"><input class="form-control talla-nombre" maxlength="20" aria-label="Talla" value="${escapeHtml(talla)}" /></div>
    <input class="form-control talla-cantidad" inputmode="decimal" placeholder="Cantidad de tela para esta talla" aria-label="Cantidad" value="${escapeHtml(cantidad)}" />
    <button type="button" class="icon-btn" aria-label="Quitar talla">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    </button>`;
  fila.talla = conectarTalla(fila.querySelector(".talla-nombre"));
  $("tallas").append(fila);
  actualizarTallas();
  return fila;
}

function actualizarTallas() {
  const filas = [...$("tallas").children];
  filas.forEach((f) => (f.querySelector(".icon-btn").hidden = filas.length === 1));
}

$("tallas").addEventListener("input", (event) => {
  event.target.classList.remove("is-bad");
  // La talla elegida en la lista llega por el <input>: también se limpia la lista
  event.target.previousElementSibling?.classList.remove("is-bad");
  mostrarError("mat", "");
  calcularMateria();
});
$("tallas").addEventListener("click", (event) => {
  const quitar = event.target.closest(".icon-btn");
  if (!quitar) return;
  quitar.closest(".talla-row").remove();
  actualizarTallas();
  calcularMateria();
});
$("talla-agregar").addEventListener("click", () => filaTalla().talla.control().focus());

function mostrarConfigMateria(materia) {
  materiaActual = materia;
  mostrarError("mat", "");
  if (!materia) {
    $("mat-config").hidden = true;
    return;
  }
  $("tallas").innerHTML = "";
  filaTalla();
  $("mat-unidad").innerHTML = materia.precios
    .map((p) => `<option value="${escapeHtml(p.unidad)}">${escapeHtml(p.unidad)}</option>`)
    .join("");
  $("mat-config").hidden = false;
  calcularMateria();
  $("tallas").firstElementChild.talla.control().focus();
}

// Promedio de las cantidades por talla × valor de la unidad elegida
function calcularMateria() {
  if (!materiaActual) return null;
  const tallas = [...$("tallas").children].map((fila) => ({
    fila,
    talla: fila.querySelector(".talla-nombre").value.trim().toUpperCase(),
    cantidad: leerNumero(fila.querySelector(".talla-cantidad").value),
  }));
  const validas = tallas.filter((t) => t.cantidad > 0);
  const promedio = validas.length ? redondear(validas.reduce((s, t) => s + t.cantidad, 0) / validas.length) : 0;
  const precio = materiaActual.precios.find((p) => p.unidad === $("mat-unidad").value);
  const total = redondear(promedio * precio.valor);
  $("mat-promedio").textContent = `${formatoNumero(promedio)} ${precio.unidad}`;
  $("mat-valor").textContent = formatoPesos(precio.valor);
  $("mat-total").textContent = formatoPesos(total);
  return { tallas, promedio, precio, total };
}

$("mat-unidad").addEventListener("change", calcularMateria);

function agregarMateria() {
  const calculo = calcularMateria();
  if (!calculo) return;
  const usadas = calculo.tallas.filter((t) => t.talla || t.cantidad !== null);
  for (const t of usadas) {
    if (!t.talla) {
      t.fila.talla.control().classList.add("is-bad");
      t.fila.talla.control().focus();
      return mostrarError("mat", "Elige o escribe la talla de cada fila.");
    }
    if (!(t.cantidad > 0)) {
      t.fila.querySelector(".talla-cantidad").classList.add("is-bad");
      t.fila.querySelector(".talla-cantidad").focus();
      return mostrarError("mat", `Escribe una cantidad mayor que 0 para la talla ${t.talla}.`);
    }
  }
  if (usadas.length === 0) {
    $("tallas").firstElementChild.talla.control().focus();
    return mostrarError("mat", "Agrega al menos una talla con su cantidad.");
  }
  if (new Set(usadas.map((t) => t.talla)).size !== usadas.length) return mostrarError("mat", "Hay tallas repetidas.");
  if (nueva.materias.some((m) => m.id_materia === materiaActual.id_materia && m.unidad === calculo.precio.unidad)) {
    return mostrarError("mat", `${materiaActual.nombre} (por ${calculo.precio.unidad}) ya está agregada. Quítala de la lista para cambiarla.`);
  }
  nueva.materias.push({
    id_materia: materiaActual.id_materia,
    nombre: materiaActual.nombre,
    color: materiaActual.color,
    unidad: calculo.precio.unidad,
    valor_unitario: calculo.precio.valor,
    tallas: usadas.map(({ talla, cantidad }) => ({ talla, cantidad })),
    promedio: calculo.promedio,
    total: calculo.total,
  });
  avisar(`${materiaActual.nombre} se agregó a la referencia.`);
  telas.elegir("", false);
  $("mat-config").hidden = true;
  materiaActual = null;
  pintarSeleccion();
  telas.enfocar();
}

$("mat-agregar").addEventListener("click", agregarMateria);

/* ================= Seleccionados (lista y resumen lateral) ================= */

const tallasTexto = (tallas) => tallas.map((t) => `${t.talla}: ${formatoNumero(t.cantidad)}`).join(" · ");
const totalNueva = () => redondear([...nueva.insumos, ...nueva.materias].reduce((s, x) => s + x.total, 0));

const botonQuitar = (tipo, i, nombre) =>
  `<button type="button" class="icon-btn" data-quitar="${tipo}" data-indice="${i}" aria-label="Quitar ${escapeHtml(nombre)}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
  </button>`;

function pintarSeleccion() {
  $("ins-seleccionados").innerHTML = nueva.insumos.length
    ? nueva.insumos
        .map(
          (i, n) => `
      <div class="sel-item">
        <span class="opt">${miniatura(i)}<span class="opt-text"><strong>${escapeHtml(i.nombre)}</strong><small>${escapeHtml(i.categoria)} · por ${escapeHtml(i.unidad)}</small></span></span>
        <span class="sel-calc">${formatoNumero(i.cantidad)} × ${formatoPesos(i.valor_unitario)}<strong>${formatoPesos(i.total)}</strong></span>
        ${botonQuitar("insumo", n, i.nombre)}
      </div>`,
        )
        .join("")
    : '<p class="sel-empty">Todavía no has agregado insumos.</p>';

  $("mat-seleccionadas").innerHTML = nueva.materias.length
    ? nueva.materias
        .map(
          (m, n) => `
      <div class="sel-item">
        <span class="opt"><span class="opt-swatch" style="background:${escapeHtml(m.color || "#eceef6")}"></span><span class="opt-text"><strong>${escapeHtml(m.nombre)}</strong><small>${escapeHtml(tallasTexto(m.tallas))}</small></span></span>
        <span class="sel-calc">Prom. ${formatoNumero(m.promedio)} ${escapeHtml(m.unidad)} × ${formatoPesos(m.valor_unitario)}<strong>${formatoPesos(m.total)}</strong></span>
        ${botonQuitar("materia", n, m.nombre)}
      </div>`,
        )
        .join("")
    : '<p class="sel-empty">Todavía no has agregado telas.</p>';

  $("ins-count").textContent = $("aside-ins-count").textContent = nueva.insumos.length;
  $("mat-count").textContent = $("aside-mat-count").textContent = nueva.materias.length;
  const item = (nombre, total) => `<li><span>${escapeHtml(nombre)}</span><strong>${formatoPesos(total)}</strong></li>`;
  $("aside-insumos").innerHTML = nueva.insumos.map((i) => item(i.nombre, i.total)).join("") || '<li class="aside-empty">Ninguno</li>';
  $("aside-materias").innerHTML = nueva.materias.map((m) => item(m.nombre, m.total)).join("") || '<li class="aside-empty">Ninguna</li>';
  $("aside-total").textContent = formatoPesos(totalNueva());
  guardarBorrador();
}

document.querySelector(".wizard-main").addEventListener("click", (event) => {
  const boton = event.target.closest("[data-quitar]");
  if (!boton) return;
  const lista = boton.dataset.quitar === "insumo" ? nueva.insumos : nueva.materias;
  const [quitado] = lista.splice(Number(boton.dataset.indice), 1);
  avisar(`${quitado.nombre} se quitó de la referencia.`);
  pintarSeleccion();
});

/* ================= Paso 4: descripción ================= */

// Cada título (ej: Escote) puede tener varias descripciones
const ICONO_QUITAR =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>';

function itemDescripcion(contenedor, texto = "") {
  const item = document.createElement("div");
  item.className = "desc-item";
  item.innerHTML = `
    <textarea class="form-control desc-texto" maxlength="1000" rows="2" placeholder="Descripción (ej: En V profundo con ribete)" aria-label="Descripción">${escapeHtml(texto)}</textarea>
    <button type="button" class="icon-btn" data-quitar-item aria-label="Quitar esta descripción">${ICONO_QUITAR}</button>`;
  contenedor.append(item);
  return item;
}

function grupoDescripcion(titulo = "", textos = [""]) {
  const grupo = document.createElement("div");
  grupo.className = "desc-grupo";
  grupo.innerHTML = `
    <div class="desc-head">
      <span class="desc-num" aria-hidden="true"></span>
      <input class="form-control desc-nombre" maxlength="100" placeholder="Título (ej: Escote)" aria-label="Título de la descripción" value="${escapeHtml(titulo)}" />
      <button type="button" class="icon-btn" data-quitar-grupo aria-label="Quitar este título y sus descripciones">${ICONO_QUITAR}</button>
    </div>
    <div class="desc-items"></div>
    <button type="button" class="link-btn desc-mas">＋ Más descripciones para este título</button>`;
  const items = grupo.querySelector(".desc-items");
  (textos.length ? textos : [""]).forEach((t) => itemDescripcion(items, t));
  $("descripciones").append(grupo);
  numerarDescripciones();
  return grupo;
}

function numerarDescripciones() {
  const grupos = [...$("descripciones").children];
  grupos.forEach((g, i) => {
    g.querySelector(".desc-num").textContent = i + 1;
    g.querySelector("[data-quitar-grupo]").hidden = grupos.length === 1;
    const items = [...g.querySelectorAll(".desc-item")];
    items.forEach((it) => (it.querySelector("[data-quitar-item]").hidden = items.length === 1));
  });
}

// [{ titulo, textos: [...] }] tal como están en pantalla (para el borrador)
function leerGrupos() {
  return [...$("descripciones").children].map((g) => ({
    titulo: g.querySelector(".desc-nombre").value.trim(),
    textos: [...g.querySelectorAll(".desc-texto")].map((t) => t.value.trim()),
  }));
}

// Lo que se guarda: una fila por descripción con el título como nombre
function leerDescripciones() {
  return leerGrupos().flatMap(({ titulo, textos }) => {
    const llenos = textos.filter(Boolean);
    if (!titulo && !llenos.length) return [];
    return llenos.length ? llenos.map((descripcion) => ({ nombre: titulo, descripcion })) : [{ nombre: titulo, descripcion: "" }];
  });
}

function pintarGrupos(grupos) {
  $("descripciones").innerHTML = "";
  (grupos?.length ? grupos : [{ titulo: "", textos: [""] }]).forEach((g) => grupoDescripcion(g.titulo, g.textos));
}

$("descripciones").addEventListener("click", (event) => {
  const grupo = event.target.closest(".desc-grupo");
  if (event.target.closest("[data-quitar-grupo]")) {
    grupo.remove();
  } else if (event.target.closest("[data-quitar-item]")) {
    event.target.closest(".desc-item").remove();
  } else if (event.target.closest(".desc-mas")) {
    itemDescripcion(grupo.querySelector(".desc-items")).querySelector("textarea").focus();
  } else return;
  numerarDescripciones();
  guardarBorrador();
});
$("descripciones").addEventListener("input", (event) => {
  event.target.classList.remove("is-bad");
  mostrarError("desc", "");
});
$("desc-agregar").addEventListener("click", () => {
  grupoDescripcion().querySelector(".desc-nombre").focus();
  guardarBorrador();
});

/* ================= Borrador: lo que se lleva no se pierde al ir a otra sección ================= */

const CLAVE_BORRADOR = `sigmas-borrador-referencia-${SigmaSesion.usuario?.nit || ""}`;
let esperaBorrador;
let restaurando = false;

function guardarBorrador() {
  // Al editar no se guarda borrador: los cambios se aplican solo al guardar
  if (restaurando || editando) return;
  clearTimeout(esperaBorrador);
  esperaBorrador = setTimeout(() => {
    if (editando) return;
    const borrador = {
      id: $("ref-id").value,
      tipo: $("ref-tipo").value,
      insumos: nueva.insumos,
      materias: nueva.materias,
      grupos: leerGrupos(),
      paso,
      pasoMaximo,
    };
    const vacio = !borrador.id && !borrador.tipo && !borrador.insumos.length && !borrador.materias.length && !leerDescripciones().length;
    try {
      if (vacio) localStorage.removeItem(CLAVE_BORRADOR);
      else localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(borrador));
    } catch {
      // sin almacenamiento disponible: el asistente sigue funcionando
    }
  }, 250);
}

function borrarBorrador() {
  clearTimeout(esperaBorrador);
  try {
    localStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // nada que borrar
  }
}

function restaurarBorrador() {
  let borrador = null;
  try {
    borrador = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || "null");
  } catch {
    borrador = null;
  }
  if (!borrador) return false;
  restaurando = true;
  $("ref-id").value = borrador.id || "";
  $("ref-tipo").value = borrador.tipo || "";
  $("aside-id").textContent = normalizarCodigo(borrador.id) || "Sin número";
  $("aside-tipo").textContent = (borrador.tipo || "").trim() || "Sin tipo";
  nueva.insumos = Array.isArray(borrador.insumos) ? borrador.insumos : [];
  nueva.materias = Array.isArray(borrador.materias) ? borrador.materias : [];
  pintarGrupos(borrador.grupos);
  pintarSeleccion();
  // Como máximo vuelve al paso 4: el 5 pide una foto nueva a la IA y gastaría el cupo en cada visita
  pasoMaximo = Math.min(Number(borrador.pasoMaximo) || 0, TOTAL_PASOS - 2);
  irA(Math.min(Number(borrador.paso) || 0, pasoMaximo), { desplazar: false });
  restaurando = false;
  $("borrador-aviso").hidden = false;
  return true;
}

// Cualquier cambio en el asistente actualiza el borrador
$("panel-nueva").addEventListener("input", guardarBorrador);
$("borrador-descartar").addEventListener("click", () => {
  borrarBorrador();
  reiniciarAsistente();
  $("borrador-aviso").hidden = true;
  avisar("Se descartó la referencia que estabas creando.");
});

/* ================= Paso 5: valor de la prenda ================= */

function datosParaGuardar() {
  return {
    id_referencia: normalizarCodigo($("ref-id").value),
    tipo: $("ref-tipo").value.trim(),
    insumos: nueva.insumos.map(({ id_insumo, unidad, cantidad }) => ({ id_insumo, unidad, cantidad })),
    materias: nueva.materias.map(({ id_materia, unidad, tallas }) => ({ id_materia, unidad, tallas })),
    descripciones: leerDescripciones(),
  };
}

function tablaResumen(titulo, filas, columnas, total) {
  if (!filas.length) return "";
  return `<table class="tabla-resumen">
    <caption>${titulo}</caption>
    <thead><tr>${columnas.map((c, i) => `<th scope="col"${i >= columnas.length - 2 ? ' class="num"' : ""}>${c}</th>`).join("")}</tr></thead>
    <tbody>${filas.join("")}</tbody>
    <tfoot><tr><td colspan="${columnas.length - 1}">Total</td><td class="num">${formatoPesos(total)}</td></tr></tfoot>
  </table>`;
}

// Tablas de insumos y materia prima (sirve para el resumen y para el detalle)
function tablasSuministros(insumos, materias) {
  const totalDe = (x) => x.total ?? x.valor_total;
  return (
    tablaResumen(
      "Insumos",
      insumos.map(
        (i) => `<tr><td>${escapeHtml(i.nombre)}<br><small class="hint">${escapeHtml(i.categoria || "")} · por ${escapeHtml(i.unidad)}</small></td>
          <td class="num">${formatoNumero(i.cantidad)} × ${formatoPesos(i.valor_unitario)}</td><td class="num">${formatoPesos(totalDe(i))}</td></tr>`,
      ),
      ["Insumo", "Cantidad × valor", "Total"],
      insumos.reduce((s, i) => s + Number(totalDe(i)), 0),
    ) +
    tablaResumen(
      "Materia prima",
      materias.map(
        (m) => `<tr><td>${escapeHtml(m.nombre)}<br><small class="hint">${escapeHtml(tallasTexto(m.tallas))}</small></td>
          <td class="num">${formatoNumero(m.promedio ?? m.cantidad)} ${escapeHtml(m.unidad)} × ${formatoPesos(m.valor_unitario)}</td><td class="num">${formatoPesos(totalDe(m))}</td></tr>`,
      ),
      ["Tela (tallas)", "Promedio × valor", "Total"],
      materias.reduce((s, m) => s + Number(totalDe(m)), 0),
    )
  );
}

let datosImagen = null;

async function prepararResumen() {
  $("guardar-error").hidden = true;
  $("resumen-detalle").innerHTML = '<p class="hint">Calculando con los precios de tu inventario…</p>';
  $("btn-guardar").disabled = true;
  try {
    // El servidor calcula con los precios actuales del inventario
    const calculo = await api("/referencias/calcular", { method: "POST", body: JSON.stringify(datosParaGuardar()) });
    $("valor-prenda").textContent = formatoPesos(calculo.valor_prenda);
    $("aside-total").textContent = formatoPesos(calculo.valor_prenda);
    $("resumen-detalle").innerHTML = tablasSuministros(calculo.insumos, calculo.materias);
    datosImagen = {
      id: normalizarCodigo($("ref-id").value),
      tipo: $("ref-tipo").value.trim(),
      fecha: hoyIso(),
      insumos: calculo.insumos,
      materias: calculo.materias,
      descripciones: leerDescripciones(),
      valor: calculo.valor_prenda,
    };
    // Al editar se conserva la imagen actual hasta que se genere o suba una foto nueva
    if (editando && !fotoIA && !fotoSubida) mostrarImagenActual();
    else await generarImagen();
  } catch (error) {
    $("resumen-detalle").innerHTML = "";
    mostrarError("guardar", error.errores ? Object.values(error.errores).join(" ") : error.message);
  }
}

// Foto con IA: solo se vuelve a pedir si cambió algo de la prenda (o al pulsar "Generar foto con IA"),
// para no gastar el cupo gratuito diario. Si el usuario sube su propia foto, se usa esa.
let fotoIA = "";
let firmaFotoIA = "";
let fotoSubida = "";

function firmaPrenda() {
  return JSON.stringify([
    datosImagen.tipo,
    nueva.materias.map((m) => m.id_materia),
    nueva.insumos.map((i) => i.nombre),
    datosImagen.descripciones,
  ]);
}

function mostrarImagenActual() {
  imagenGenerada = "";
  $("imagen-cargando").hidden = Boolean(editando.foto);
  $("imagen-cargando").textContent = "Esta referencia no tiene imagen.";
  $("imagen-preview").hidden = !editando.foto;
  if (editando.foto) $("imagen-preview").src = urlArchivo(editando.foto);
  $("imagen-origen").textContent =
    "Imagen actual de la referencia. Si cambiaste insumos, telas o descripciones, genera o sube una foto para actualizar la ficha.";
  $("btn-guardar").disabled = false;
}

async function pedirFotoIA() {
  $("imagen-cargando").textContent = "Creando la foto de la prenda con IA… (puede tardar unos segundos)";
  try {
    const { imagen } = await api("/referencias/imagen-ia", {
      method: "POST",
      body: JSON.stringify({
        tipo: datosImagen.tipo,
        materias: nueva.materias.map(({ id_materia }) => ({ id_materia })),
        insumos: nueva.insumos.map(({ nombre }) => ({ nombre })),
        descripciones: datosImagen.descripciones,
      }),
    });
    fotoIA = imagen;
    firmaFotoIA = firmaPrenda();
    $("imagen-origen").textContent = "Foto creada con IA (FLUX) a partir del tipo, las telas, los insumos y las descripciones.";
  } catch (error) {
    fotoIA = "";
    firmaFotoIA = "";
    $("imagen-origen").textContent = `Ilustración de la prenda. ${error.message}`;
  }
}

async function generarImagen({ nuevaFoto = false } = {}) {
  if (!datosImagen) return;
  $("imagen-preview").hidden = true;
  $("imagen-cargando").hidden = false;
  $("btn-guardar").disabled = true;
  try {
    if (!fotoSubida && (nuevaFoto || !fotoIA || firmaFotoIA !== firmaPrenda())) await pedirFotoIA();
    $("imagen-cargando").textContent = "Armando la ficha…";
    const empresa = SigmaSesion.usuario || {};
    const logo = await imagenComoDataUrl(SigmaSesion.archivo(empresa.logo_empresa));
    imagenGenerada = await generarImagenReferencia({
      ...datosImagen,
      empresa,
      logo,
      foto: fotoSubida || fotoIA,
      fotoSubida: Boolean(fotoSubida),
    });
    $("imagen-preview").src = imagenGenerada;
    $("imagen-preview").hidden = false;
  } catch {
    imagenGenerada = "";
    avisar("No se pudo generar la imagen. Puedes guardar la referencia sin ella.");
  } finally {
    $("imagen-cargando").hidden = true;
    $("btn-guardar").disabled = false;
  }
}

$("imagen-regenerar").addEventListener("click", () => {
  fotoSubida = "";
  generarImagen({ nuevaFoto: true });
});

// Foto subida: se reduce a máximo 1200 px para que la ficha no pese demasiado
function leerFotoSubida(archivo) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(archivo);
    img.onload = () => {
      const escala = Math.min(1, 1200 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

$("imagen-subir").addEventListener("click", () => $("imagen-archivo").click());
$("imagen-archivo").addEventListener("change", async () => {
  const archivo = $("imagen-archivo").files[0];
  $("imagen-archivo").value = "";
  if (!archivo) return;
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return avisar("La foto debe ser JPG, PNG o WEBP.");
  if (archivo.size > 10 * 1024 * 1024) return avisar("La foto es demasiado grande (máximo 10 MB).");
  try {
    fotoSubida = await leerFotoSubida(archivo);
    $("imagen-origen").textContent = "Foto subida por ti.";
    generarImagen();
  } catch (error) {
    avisar(error.message);
  }
});

$("btn-guardar").addEventListener("click", async () => {
  const boton = $("btn-guardar");
  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const datos = datosParaGuardar();
    if (imagenGenerada) datos.imagen_base64 = imagenGenerada;
    const ruta = editando ? `/referencias/${encodeURIComponent(editando.id)}` : "/referencias";
    const { referencia } = await api(ruta, { method: editando ? "PUT" : "POST", body: JSON.stringify(datos) });
    referencia.materias.forEach((m) => m.tallas.forEach((t) => recordarTalla(t.talla)));
    avisar(`La referencia ${referencia.id_referencia} quedó ${editando ? "actualizada" : "guardada"}.`);
    // Al terminar una edición vuelve el borrador de la referencia nueva que se estaba creando (si había)
    const eraEdicion = Boolean(editando);
    if (!eraEdicion) borrarBorrador();
    reiniciarAsistente();
    $("borrador-aviso").hidden = true;
    if (eraEdicion) restaurarBorrador();
    activarPestana($("tab-lista"));
    abrirDetalle(referencia.id_referencia);
  } catch (error) {
    const errores = error.errores || {};
    if (errores.id_referencia || errores.tipo) {
      irA(0);
      if (errores.id_referencia) mostrarError("ref-id", errores.id_referencia);
      if (errores.tipo) mostrarError("ref-tipo", errores.tipo);
    } else if (errores.insumos) {
      irA(1);
      mostrarError("ins", errores.insumos);
    } else if (errores.materias || errores.suministros) {
      irA(2);
      mostrarError("mat", errores.materias || errores.suministros);
    } else if (errores.descripciones) {
      irA(3);
      mostrarError("desc", errores.descripciones);
    } else {
      mostrarError("guardar", error.message);
    }
    avisar(error.message);
  } finally {
    boton.disabled = false;
    if (boton.textContent === "Guardando…") boton.textContent = textoBoton;
  }
});

/* ================= Navegación del asistente ================= */

async function validarPaso(n) {
  if (n === 0) {
    const id = normalizarCodigo($("ref-id").value);
    $("ref-id").value = id;
    let ok = true;
    if (!CODIGO_RE.test(id)) {
      mostrarError("ref-id", "Escribe el número de referencia: letras, números y guiones. Ej: REF-001");
      ok = false;
    } else if (id !== idVerificado && !editando) {
      try {
        const { existe } = await api(`/referencias/existe?id=${encodeURIComponent(id)}`);
        if (existe) {
          mostrarError("ref-id", `La referencia ${id} ya existe. Usa otro número.`);
          ok = false;
        } else idVerificado = id;
      } catch (error) {
        mostrarError("ref-id", error.message);
        ok = false;
      }
    }
    if ($("ref-tipo").value.trim().length < 2) {
      mostrarError("ref-tipo", "Escribe el tipo de prenda. Ej: Vestido de baño");
      ok = false;
    }
    if (!ok) document.querySelector("#panel-nueva .is-bad")?.focus();
    return ok;
  }
  if (n === 1 && insumoActual && $("ins-cantidad").value.trim()) {
    mostrarError("ins", "Tienes un insumo sin agregar: pulsa “Agregar insumo” o borra la cantidad.");
    return false;
  }
  if (n === 2) {
    if (materiaActual && [...$("tallas").querySelectorAll("input")].some((i) => i.value.trim())) {
      mostrarError("mat", "Tienes una tela sin agregar: pulsa “Agregar materia prima” o elige otra.");
      return false;
    }
    if (nueva.insumos.length === 0 && nueva.materias.length === 0) {
      mostrarError("mat", "Agrega al menos un insumo o una materia prima para calcular el valor de la prenda.");
      return false;
    }
  }
  if (n === 3) {
    const sinTitulo = [...$("descripciones").children].find(
      (g) => !g.querySelector(".desc-nombre").value.trim() && [...g.querySelectorAll(".desc-texto")].some((t) => t.value.trim()),
    );
    if (sinTitulo) {
      sinTitulo.querySelector(".desc-nombre").classList.add("is-bad");
      sinTitulo.querySelector(".desc-nombre").focus();
      mostrarError("desc", "Escribe el título de cada grupo de descripciones.");
      return false;
    }
  }
  return true;
}

function irA(n, { desplazar = true } = {}) {
  paso = n;
  pasoMaximo = Math.max(pasoMaximo, n);
  document.querySelectorAll(".paso").forEach((s) => (s.hidden = Number(s.dataset.paso) !== n));
  document.querySelectorAll("#stepper button").forEach((b) => {
    const i = Number(b.dataset.ir);
    b.classList.toggle("is-current", i === n);
    b.classList.toggle("is-done", i < n);
    b.disabled = i > pasoMaximo;
    if (i === n) b.setAttribute("aria-current", "step");
    else b.removeAttribute("aria-current");
  });
  $("paso-indicador").textContent = `Paso ${n + 1} de ${TOTAL_PASOS}`;
  $("btn-atras").disabled = n === 0;
  $("btn-siguiente").hidden = n === TOTAL_PASOS - 1;
  $("btn-guardar").hidden = n !== TOTAL_PASOS - 1;
  $("btn-siguiente").textContent = n === 3 ? "Calcular valor de la prenda →" : "Continuar →";
  if (n === 1 || n === 2) cargarCatalogo();
  if (n === 4) prepararResumen();
  if (desplazar) document.querySelector(".stepper").scrollIntoView({ block: "nearest", behavior: "smooth" });
  guardarBorrador();
}

$("btn-siguiente").addEventListener("click", async () => {
  if (await validarPaso(paso)) irA(paso + 1);
});
$("btn-atras").addEventListener("click", () => irA(Math.max(0, paso - 1)));
$("stepper").addEventListener("click", async (event) => {
  const boton = event.target.closest("button[data-ir]");
  if (!boton || boton.disabled) return;
  const destino = Number(boton.dataset.ir);
  // Para avanzar se validan los pasos de en medio
  for (let n = paso; n < destino; n++) {
    if (!(await validarPaso(n))) return irA(n);
  }
  irA(destino);
});

["ref-id", "ref-tipo"].forEach((id) =>
  $(id).addEventListener("input", () => {
    mostrarError(id, "");
    if (id === "ref-id") idVerificado = "";
    $("aside-id").textContent = normalizarCodigo($("ref-id").value) || "Sin número";
    $("aside-tipo").textContent = $("ref-tipo").value.trim() || "Sin tipo";
  }),
);

// Modo edición: el número queda fijo y el botón guarda los cambios
function fijarEdicion(referencia) {
  editando = referencia ? { id: referencia.id_referencia, foto: referencia.foto } : null;
  $("ref-id").disabled = Boolean(referencia);
  $("editando-aviso").hidden = !referencia;
  $("editando-texto").textContent = referencia
    ? `Estás editando la referencia ${referencia.id_referencia}. El número y la fecha de creación no cambian.`
    : "";
  $("tab-nueva").textContent = referencia ? "Editar referencia" : "Nueva referencia";
  $("btn-guardar").textContent = referencia ? "Guardar cambios" : "Guardar referencia";
}

function editarReferencia(r) {
  reiniciarAsistente();
  $("borrador-aviso").hidden = true;
  fijarEdicion(r);
  $("ref-id").value = r.id_referencia;
  $("ref-tipo").value = r.tipo;
  $("aside-id").textContent = r.id_referencia;
  $("aside-tipo").textContent = r.tipo;
  nueva.insumos = r.insumos.map((i) => ({
    id_insumo: i.id_insumo,
    nombre: i.nombre,
    categoria: i.categoria,
    foto: catalogo.insumos.find((c) => c.id_insumo === i.id_insumo)?.foto,
    unidad: i.unidad,
    valor_unitario: i.valor_unitario,
    cantidad: i.cantidad,
    total: i.valor_total,
  }));
  nueva.materias = r.materias.map((m) => ({
    id_materia: m.id_materia,
    nombre: m.nombre,
    color: m.color,
    unidad: m.unidad,
    valor_unitario: m.valor_unitario,
    tallas: m.tallas,
    promedio: m.cantidad,
    total: m.valor_total,
  }));
  pintarGrupos(agruparDescripciones(r.descripciones).map((g) => ({ titulo: g.nombre, textos: g.items })));
  pintarSeleccion();
  // Todos los pasos quedan disponibles para ir directo a lo que se quiere cambiar
  pasoMaximo = TOTAL_PASOS - 1;
  activarPestana($("tab-nueva"));
  irA(0);
  $("ref-tipo").focus();
}

$("editando-cancelar").addEventListener("click", () => {
  reiniciarAsistente();
  restaurarBorrador();
  avisar("Se canceló la edición.");
});

function reiniciarAsistente() {
  fijarEdicion(null);
  nueva.insumos = [];
  nueva.materias = [];
  idVerificado = "";
  imagenGenerada = "";
  datosImagen = null;
  pasoMaximo = 0;
  $("ref-id").value = "";
  $("ref-tipo").value = "";
  $("aside-id").textContent = "Sin número";
  $("aside-tipo").textContent = "Sin tipo";
  categorias.elegir("", false);
  insumosPick.fijarOpciones([]);
  insumosPick.habilitar(false);
  telas.elegir("", false);
  $("ins-config").hidden = $("mat-config").hidden = true;
  insumoActual = materiaActual = null;
  fotoIA = firmaFotoIA = fotoSubida = "";
  pintarGrupos();
  pintarSeleccion();
  irA(0, { desplazar: false });
}

/* ================= Referencias creadas ================= */

let esperaBusqueda;

async function cargarLista() {
  const params = new URLSearchParams();
  const q = $("lista-buscar").value.trim();
  if (q) params.set("q", q);
  if ($("lista-desde").value) params.set("desde", $("lista-desde").value);
  if ($("lista-hasta").value) params.set("hasta", $("lista-hasta").value);
  const vacio = $("lista-vacia");
  try {
    referencias = await api(`/referencias${params.size ? `?${params}` : ""}`);
    if (!params.size) $("tab-count").textContent = referencias.length;
    pintarLista(params.size > 0);
  } catch (error) {
    $("ref-grid").innerHTML = "";
    mostrarVacio(vacio, "No se pudieron cargar las referencias", error.message, true);
  }
}

function fechaCorta(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

function pintarLista(conFiltros) {
  const vacio = $("lista-vacia");
  vacio.hidden = true;
  $("ref-grid").innerHTML = referencias
    .map(
      (r) => `
    <article class="ref-card">
      <button type="button" class="ref-thumb" data-ver="${escapeHtml(r.id_referencia)}" aria-label="Ver la referencia ${escapeHtml(r.id_referencia)}">
        ${r.foto ? `<img src="${escapeHtml(urlArchivo(r.foto))}" alt="" loading="lazy" />` : ""}
      </button>
      <div class="ref-body">
        <p class="ref-id">${escapeHtml(r.id_referencia)}</p>
        <p class="ref-meta">${escapeHtml(r.tipo)} · ${fechaCorta(r.fecha)}</p>
        <p class="ref-valor">${formatoPesos(r.valor_prenda)}</p>
        <div class="ref-chips"><span>${r.insumos} insumos</span><span>${r.materias} telas</span><span>${r.descripciones} detalles</span></div>
      </div>
      <div class="ref-actions">
        <button type="button" class="btn-ghost btn-small" data-ver="${escapeHtml(r.id_referencia)}">Ver</button>
        <button type="button" class="btn-ghost btn-small" data-editar="${escapeHtml(r.id_referencia)}">Editar</button>
        <button type="button" class="btn-ghost btn-small" data-pdf="${escapeHtml(r.id_referencia)}">PDF</button>
        <button type="button" class="btn-ghost btn-small is-danger" data-eliminar="${escapeHtml(r.id_referencia)}">Eliminar</button>
      </div>
    </article>`,
    )
    .join("");
  if (referencias.length === 0) {
    if (conFiltros) mostrarVacio(vacio, "Sin resultados", "Ninguna referencia coincide con la búsqueda o las fechas elegidas.");
    else mostrarVacio(vacio, "Aún no tienes referencias", "Crea la primera en la pestaña “Nueva referencia”.");
  }
  $("lista-mostrando").textContent = referencias.length ? `${referencias.length} referencia${referencias.length === 1 ? "" : "s"}` : "";
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

$("ref-grid").addEventListener("click", async (event) => {
  const ver = event.target.closest("[data-ver]");
  const pdf = event.target.closest("[data-pdf]");
  const editar = event.target.closest("[data-editar]");
  const eliminar = event.target.closest("[data-eliminar]");
  if (ver) abrirDetalle(ver.dataset.ver);
  if (eliminar) eliminarReferencia(eliminar.dataset.eliminar);
  if (editar) {
    try {
      editarReferencia(await api(`/referencias/${encodeURIComponent(editar.dataset.editar)}`));
    } catch (error) {
      avisar(error.message);
    }
  }
  if (pdf) {
    try {
      pdf.disabled = true;
      await exportarFicha(await api(`/referencias/${encodeURIComponent(pdf.dataset.pdf)}`));
    } catch (error) {
      avisar(error.message);
    } finally {
      pdf.disabled = false;
    }
  }
});

/* ================= Detalle ================= */

const dialogo = $("ref-dialog");

async function abrirDetalle(id) {
  try {
    detalleActual = await api(`/referencias/${encodeURIComponent(id)}`);
  } catch (error) {
    return avisar(error.message);
  }
  const r = detalleActual;
  $("det-fecha").textContent = `Creada el ${fechaLarga(r.fecha)}`;
  $("det-id").textContent = r.id_referencia;
  $("det-tipo").textContent = r.tipo;
  $("det-imagen").src = r.foto ? urlArchivo(r.foto) : "";
  $("det-imagen").hidden = !r.foto;
  $("det-imagen").alt = `Imagen de la referencia ${r.id_referencia}`;
  $("det-info").innerHTML = `
    <div class="valor-card"><span>Valor de la prenda en materiales</span><strong>${formatoPesos(r.valor_prenda)}</strong></div>
    ${tablasSuministros(r.insumos, r.materias)}
    ${
      r.descripciones.length
        ? `<table class="tabla-resumen"><caption>Descripción</caption><tbody>${agruparDescripciones(r.descripciones)
            .map((g, i) => `<tr><td><strong>${i + 1}. ${escapeHtml(g.nombre)}</strong><ul class="desc-lista">${g.items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul></td></tr>`)
            .join("")}</tbody></table>`
        : ""
    }`;
  dialogo.showModal();
}

$("det-cerrar").addEventListener("click", () => dialogo.close());
dialogo.addEventListener("click", (event) => {
  if (event.target === dialogo) dialogo.close();
});

dialogo.querySelector(".det-foot").addEventListener("click", async (event) => {
  const boton = event.target.closest("[data-exportar]");
  if (!boton || !detalleActual) return;
  boton.disabled = true;
  try {
    await exportarFicha(detalleActual);
  } catch (error) {
    avisar(error.message);
  } finally {
    boton.disabled = false;
  }
});

$("det-editar").addEventListener("click", () => {
  if (!detalleActual) return;
  dialogo.close();
  editarReferencia(detalleActual);
});

$("det-eliminar").addEventListener("click", () => {
  if (!detalleActual) return;
  dialogo.close();
  eliminarReferencia(detalleActual.id_referencia);
});

async function eliminarReferencia(id_referencia) {
  const ok = await confirmar({
    titulo: "¿Eliminar referencia?",
    texto: `Se eliminará la referencia ${id_referencia} con sus suministros, tallas, descripciones e imagen. Esta acción no se puede deshacer.`,
    aviso: "Las cotizaciones que la usen no se borran: conservan el número, la foto y los materiales de la referencia. Las fichas técnicas quedarán sin referencia.",
  });
  if (!ok) return;
  try {
    await api(`/referencias/${encodeURIComponent(id_referencia)}`, { method: "DELETE" });
    avisar(`La referencia ${id_referencia} fue eliminada.`);
    $("tab-count").textContent = Math.max(0, Number($("tab-count").textContent) - 1);
    // Si se estaba editando, se sale de la edición
    if (editando?.id === id_referencia) {
      reiniciarAsistente();
      restaurarBorrador();
    }
    cargarLista();
  } catch (error) {
    avisar(error.message);
  }
}

/* ================= Inicio ================= */

$("fecha-hoy").textContent = fechaLarga(hoyIso());
reiniciarAsistente();
cargarTallasUsadas(api).then(() => [...$("tallas").children].forEach((fila) => fila.talla.refrescar()));
restaurarBorrador();
cargarCatalogo();
api("/referencias")
  .then((lista) => ($("tab-count").textContent = lista.length))
  .catch(() => {});
if (location.hash === "#lista") activarPestana($("tab-lista"));
