// Calendario: vista del mes con los pendientes (inicio y entrega) y los vencimientos de facturas,
// lista del día elegido, próximos 14 días, y crear, editar, completar o eliminar pendientes.
import { api, escapeHtml, avisar, mostrarError, confirmar } from "../sigmas-inventario/util-inventario.js";

const $ = (id) => document.getElementById(id);

const TIPOS = [
  ["Pendiente", "Pendiente", "t-pendiente"],
  ["Entrega", "Entrega", "t-entrega"],
  ["Reunion", "Reunión", "t-reunion"],
  ["Pago", "Pago", "t-pago"],
  ["Compra", "Compra", "t-compra"],
  ["Produccion", "Producción", "t-produccion"],
  ["Otro", "Otro", "t-otro"],
];
const NOMBRE_TIPO = Object.fromEntries(TIPOS.map(([valor, texto]) => [valor, texto]));
const CLASE_TIPO = Object.fromEntries(TIPOS.map(([valor, , clase]) => [valor, clase]));
const MAX_POR_DIA = 3;
const VINCULOS = {
  id_insumo: ["insumos", "Insumo", "../sigmas-inventario/inventario.html#insumos"],
  id_materia: ["materias", "Materia prima", "../sigmas-inventario/inventario.html#materias"],
  id_vinculado: ["vinculados", "Vinculado", "../sigmas-vinculados/vinculados.html"],
  id_referencia: ["referencias", "Referencia", "../sigmas-referencias/referencias.html#lista"],
  id_cotizacion: ["cotizaciones", "Cotización", "../sigmas-cotizaciones/cotizaciones.html#lista"],
  nombre_factura: ["facturas", "Factura", "../sigmas-factura/factura.html#lista"],
};

let mesActual = primerDia(new Date());
let diaElegido = iso(new Date());
let eventos = [];
let facturas = [];
let opciones = null;
let detalleActual = null;
let editando = null;

/* ================= Fechas ================= */

function primerDia(fecha) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
}

function iso(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

// "2026-10-21T14:30" o "2026-10-21" → Date en la hora local
function leerFecha(texto) {
  if (!texto) return null;
  const [d, h = "00:00"] = texto.split("T");
  const [a, m, dia] = d.split("-").map(Number);
  const [hh, mm] = h.split(":").map(Number);
  return new Date(a, m - 1, dia, hh, mm);
}

function aInput(fecha) {
  return `${iso(fecha)}T${String(fecha.getHours()).padStart(2, "0")}:${String(fecha.getMinutes()).padStart(2, "0")}`;
}

const horaTexto = (texto) => leerFecha(texto).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
const fechaHoraTexto = (texto) =>
  leerFecha(texto).toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
// Solo la primera letra en mayúscula: "Miércoles, 21 de octubre"
const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const fechaLarga = (dia) => mayuscula(leerFecha(dia).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }));

/* ================= Datos ================= */

// Primer lunes de la cuadrícula y las 42 celdas del mes
function celdasDelMes() {
  const inicio = new Date(mesActual);
  inicio.setDate(1 - ((mesActual.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
}

async function cargarMes() {
  const celdas = celdasDelMes();
  const params = new URLSearchParams({ desde: iso(celdas[0]), hasta: iso(celdas.at(-1)) });
  if ($("filtro-tipo").value) params.set("tipo", $("filtro-tipo").value);
  if ($("filtro-estado").value) params.set("estado", $("filtro-estado").value);
  try {
    ({ eventos, facturas } = await api(`/calendario?${params}`));
  } catch (error) {
    eventos = [];
    facturas = [];
    avisar(error.message);
  }
  pintarMes();
  pintarDia();
}

// Lo que aparece en un día: inicios, entregas y vencimientos de facturas
function itemsDelDia(dia) {
  const items = [];
  for (const e of eventos) {
    const inicio = e.fecha_inicio.slice(0, 10);
    const entrega = e.fecha_entrega?.slice(0, 10);
    if (inicio === dia) items.push({ clase: "evento", evento: e, hora: e.fecha_inicio, texto: e.titulo });
    if (entrega === dia && entrega !== inicio) items.push({ clase: "entrega", evento: e, hora: e.fecha_entrega, texto: `Entrega: ${e.titulo}` });
  }
  items.sort((a, b) => a.hora.localeCompare(b.hora));
  if (!$("filtro-tipo").value && !$("filtro-estado").value) {
    for (const f of facturas.filter((f) => f.fecha_vencimiento === dia)) {
      items.push({ clase: "factura", factura: f, texto: `Vence factura ${f.nombre_factura}` });
    }
  }
  return items;
}

/* ================= Mes ================= */

function chip(item) {
  if (item.factura) {
    return `<button type="button" class="cal-evento t-factura${item.factura.estado === "Pagada" ? " is-hecho" : ""}" data-factura="${escapeHtml(item.factura.nombre_factura)}" title="${escapeHtml(item.texto)} · ${escapeHtml(item.factura.empresa)}">
      <span class="texto">${escapeHtml(item.texto)}</span></button>`;
  }
  const e = item.evento;
  const hecho = e.estado === "Completado" || e.estado === "Cancelado";
  return `<button type="button" class="cal-evento ${CLASE_TIPO[e.tipo]}${hecho ? " is-hecho" : ""}${e.prioridad === "Alta" ? " is-alta" : ""}" data-evento="${e.id_evento}" title="${escapeHtml(item.texto)}">
    <span class="hora">${horaTexto(item.hora)}</span><span class="texto">${escapeHtml(item.texto)}</span></button>`;
}

function pintarMes() {
  $("cal-mes").textContent = mayuscula(mesActual.toLocaleDateString("es-CO", { month: "long", year: "numeric" }));
  const hoy = iso(new Date());
  $("cal-grid").innerHTML = celdasDelMes()
    .map((fecha) => {
      const dia = iso(fecha);
      const items = itemsDelDia(dia);
      const clases = [
        "cal-dia",
        fecha.getMonth() !== mesActual.getMonth() ? "is-fuera" : "",
        dia === hoy ? "is-hoy" : "",
        dia === diaElegido ? "is-elegido" : "",
        fecha.getDay() === 0 || fecha.getDay() === 6 ? "is-finde" : "",
      ].filter(Boolean);
      const etiqueta = `${fecha.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}${items.length ? `, ${items.length} en el calendario` : ""}`;
      return `<div class="${clases.join(" ")}" role="gridcell" tabindex="${dia === diaElegido ? 0 : -1}" data-dia="${dia}" aria-label="${escapeHtml(etiqueta)}" aria-selected="${dia === diaElegido}">
        <span class="cal-num" aria-hidden="true">${fecha.getDate()}</span>
        <div class="cal-eventos-dia">
          ${items.slice(0, MAX_POR_DIA).map(chip).join("")}
          ${items.length > MAX_POR_DIA ? `<span class="cal-mas">+${items.length - MAX_POR_DIA} más</span>` : ""}
        </div>
      </div>`;
    })
    .join("");
}

function elegirDia(dia, { enfocar = false } = {}) {
  diaElegido = dia;
  const fecha = leerFecha(dia);
  // Si el día es de otro mes, se cambia de mes
  if (fecha.getMonth() !== mesActual.getMonth() || fecha.getFullYear() !== mesActual.getFullYear()) {
    mesActual = primerDia(fecha);
    cargarMes().then(() => enfocar && document.querySelector(`[data-dia="${dia}"]`)?.focus());
    return;
  }
  pintarMes();
  pintarDia();
  if (enfocar) document.querySelector(`[data-dia="${dia}"]`)?.focus();
}

$("cal-grid").addEventListener("click", (event) => {
  const evento = event.target.closest("[data-evento]");
  const factura = event.target.closest("[data-factura]");
  if (evento) return abrirDetalle(eventos.find((e) => String(e.id_evento) === evento.dataset.evento));
  if (factura) return (location.href = "../sigmas-factura/factura.html#lista");
  const celda = event.target.closest("[data-dia]");
  if (celda) elegirDia(celda.dataset.dia);
});
// Doble clic en un día: nuevo pendiente ese día
$("cal-grid").addEventListener("dblclick", (event) => {
  if (event.target.closest("[data-evento], [data-factura]")) return;
  const celda = event.target.closest("[data-dia]");
  if (celda) abrirFormulario(null, celda.dataset.dia);
});
// Teclado: flechas para moverse entre días, Enter para agregar
$("cal-grid").addEventListener("keydown", (event) => {
  const celda = event.target.closest("[data-dia]");
  if (!celda || event.target !== celda) return;
  const pasos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (pasos[event.key]) {
    event.preventDefault();
    const fecha = leerFecha(celda.dataset.dia);
    fecha.setDate(fecha.getDate() + pasos[event.key]);
    elegirDia(iso(fecha), { enfocar: true });
  } else if (event.key === "Enter") {
    event.preventDefault();
    abrirFormulario(null, celda.dataset.dia);
  }
});

function cambiarMes(delta) {
  mesActual = new Date(mesActual.getFullYear(), mesActual.getMonth() + delta, 1);
  diaElegido = iso(mesActual.getMonth() === new Date().getMonth() && mesActual.getFullYear() === new Date().getFullYear() ? new Date() : mesActual);
  cargarMes();
}

$("mes-anterior").addEventListener("click", () => cambiarMes(-1));
$("mes-siguiente").addEventListener("click", () => cambiarMes(1));
$("mes-hoy").addEventListener("click", () => elegirDia(iso(new Date())));
["filtro-tipo", "filtro-estado"].forEach((id) => $(id).addEventListener("change", cargarMes));

/* ================= Día elegido y próximos ================= */

function itemLista(e, { atrasado = false, cuando } = {}) {
  const hecho = e.estado === "Completado" || e.estado === "Cancelado";
  return `<button type="button" class="dia-item ${CLASE_TIPO[e.tipo]}${hecho ? " is-hecho" : ""}" data-evento="${e.id_evento}">
    <strong>${escapeHtml(e.titulo)}</strong>
    <small>${atrasado ? '<span class="is-atrasado">Atrasado · </span>' : ""}${escapeHtml(cuando)} · ${escapeHtml(NOMBRE_TIPO[e.tipo])} · ${escapeHtml(e.estado)}</small>
  </button>`;
}

function pintarDia() {
  $("dia-titulo").textContent = fechaLarga(diaElegido);
  const items = itemsDelDia(diaElegido);
  $("dia-lista").innerHTML = items.length
    ? items
        .map((item) =>
          item.factura
            ? `<a class="dia-item t-factura" href="../sigmas-factura/factura.html#lista"><strong>${escapeHtml(item.texto)}</strong><small>${escapeHtml(item.factura.empresa)} · ${escapeHtml(item.factura.estado)}</small></a>`
            : itemLista(item.evento, { cuando: `${item.clase === "entrega" ? "Entrega " : ""}${horaTexto(item.hora)}` }),
        )
        .join("")
    : '<p class="dia-vacio">Nada para este día.</p>';
}

async function cargarProximos() {
  try {
    const lista = await api("/calendario/proximos");
    const ahora = new Date();
    $("proximos").innerHTML = lista.length
      ? lista
          .map((e) => {
            const fecha = e.fecha_entrega || e.fecha_inicio;
            return itemLista(e, { atrasado: leerFecha(fecha) < ahora, cuando: `${e.fecha_entrega ? "Entrega " : ""}${fechaHoraTexto(fecha)}` });
          })
          .join("")
      : '<p class="dia-vacio">No tienes pendientes en los próximos 14 días.</p>';
  } catch (error) {
    $("proximos").innerHTML = `<p class="dia-vacio">${escapeHtml(error.message)}</p>`;
  }
}

[$("dia-lista"), $("proximos")].forEach((lista) =>
  lista.addEventListener("click", async (event) => {
    const boton = event.target.closest("[data-evento]");
    if (!boton) return;
    const enMes = eventos.find((e) => String(e.id_evento) === boton.dataset.evento);
    try {
      abrirDetalle(enMes || (await api(`/calendario/${boton.dataset.evento}`)));
    } catch (error) {
      avisar(error.message);
    }
  }),
);
$("dia-agregar").addEventListener("click", () => abrirFormulario(null, diaElegido));
$("btn-nuevo").addEventListener("click", () => abrirFormulario(null, diaElegido));

/* ================= Detalle ================= */

const detalle = $("ev-detalle");

function abrirDetalle(e) {
  if (!e) return;
  detalleActual = e;
  $("det-tipo").textContent = NOMBRE_TIPO[e.tipo];
  $("det-titulo").textContent = e.titulo;
  $("det-fechas").textContent = fechaHoraTexto(e.fecha_inicio);
  const claseEstado = { Completado: "is-completado", "En proceso": "is-proceso" }[e.estado] || "";
  const relacionados = Object.entries(VINCULOS)
    .filter(([columna]) => e[columna])
    .map(([columna, [, nombre, enlace]]) => {
      const texto = { id_insumo: e.insumo, id_materia: e.materia, id_vinculado: e.vinculado }[columna] || e[columna];
      return `<div><dt>${nombre}</dt><dd><a class="link-btn" href="${enlace}">${escapeHtml(texto)}</a></dd></div>`;
    })
    .join("");
  $("det-cuerpo").innerHTML = `
    <div class="ev-etiquetas">
      <span class="ev-etiqueta ${claseEstado}">${escapeHtml(e.estado)}</span>
      <span class="ev-etiqueta${e.prioridad === "Alta" ? " is-alta" : ""}">Prioridad ${escapeHtml(e.prioridad.toLowerCase())}</span>
    </div>
    ${e.descripcion ? `<p class="ev-texto">${escapeHtml(e.descripcion)}</p>` : ""}
    <dl class="ev-datos">
      <div><dt>Inicio</dt><dd>${escapeHtml(fechaHoraTexto(e.fecha_inicio))}</dd></div>
      ${e.fecha_entrega ? `<div><dt>Entrega</dt><dd>${escapeHtml(fechaHoraTexto(e.fecha_entrega))}</dd></div>` : ""}
      <div><dt>Recordatorio</dt><dd>${e.recordatorio ? escapeHtml(fechaHoraTexto(e.recordatorio)) : "1 día antes (automático)"}</dd></div>
      ${relacionados}
    </dl>`;
  const hecho = e.estado === "Completado";
  $("det-completar").textContent = hecho ? "Marcar como pendiente" : "Marcar como completado";
  detalle.showModal();
}

$("det-completar").addEventListener("click", async () => {
  if (!detalleActual) return;
  const estado = detalleActual.estado === "Completado" ? "Pendiente" : "Completado";
  try {
    const { evento } = await api(`/calendario/${detalleActual.id_evento}/estado`, { method: "PATCH", body: JSON.stringify({ estado }) });
    avisar(estado === "Completado" ? `“${evento.titulo}” quedó completado.` : `“${evento.titulo}” volvió a pendiente.`);
    detalle.close();
    refrescar();
  } catch (error) {
    avisar(error.message);
  }
});

$("det-editar").addEventListener("click", () => {
  detalle.close();
  abrirFormulario(detalleActual);
});

$("det-eliminar").addEventListener("click", async () => {
  if (!detalleActual) return;
  const { id_evento, titulo } = detalleActual;
  detalle.close();
  const ok = await confirmar({ titulo: "¿Eliminar pendiente?", texto: `Se eliminará “${titulo}” del calendario y sus alertas. Esta acción no se puede deshacer.` });
  if (!ok) return;
  try {
    await api(`/calendario/${id_evento}`, { method: "DELETE" });
    avisar(`“${titulo}” se eliminó del calendario.`);
    refrescar();
  } catch (error) {
    avisar(error.message);
  }
});

/* ================= Formulario ================= */

const dialogoForm = $("ev-form-dialog");
const form = $("ev-form");

async function cargarOpciones() {
  if (opciones) return;
  try {
    opciones = await api("/calendario/opciones");
  } catch (error) {
    opciones = {};
    avisar(error.message);
  }
  document.querySelectorAll("[data-vinculo]").forEach((select) => {
    const lista = opciones[select.dataset.vinculo] || [];
    select.innerHTML =
      '<option value="">Ninguno</option>' + lista.map((o) => `<option value="${escapeHtml(o.valor)}">${escapeHtml(o.texto)}</option>`).join("");
  });
}

// El recordatorio se elige como "X antes del inicio" o una fecha exacta
function fijarRecordatorio(recordatorio, inicio) {
  $("ev-recordatorio").value = recordatorio || "";
  if (!recordatorio) $("ev-aviso").value = "";
  else {
    const minutos = Math.round((leerFecha(inicio) - leerFecha(recordatorio)) / 60000);
    const preset = [...$("ev-aviso").options].find((o) => o.value === String(minutos));
    $("ev-aviso").value = preset ? preset.value : "otra";
  }
  $("ev-recordatorio-campo").hidden = $("ev-aviso").value !== "otra";
}

function leerRecordatorio() {
  const aviso = $("ev-aviso").value;
  if (!aviso) return "";
  if (aviso === "otra") return $("ev-recordatorio").value;
  const inicio = leerFecha($("ev-inicio").value);
  return inicio ? aInput(new Date(inicio.getTime() - Number(aviso) * 60000)) : "";
}

$("ev-aviso").addEventListener("change", () => {
  const otra = $("ev-aviso").value === "otra";
  $("ev-recordatorio-campo").hidden = !otra;
  if (otra && !$("ev-recordatorio").value && $("ev-inicio").value) {
    $("ev-recordatorio").value = aInput(new Date(leerFecha($("ev-inicio").value).getTime() - 86400000));
  }
  if (otra) $("ev-recordatorio").focus();
});

function limpiarErrores() {
  form.querySelectorAll(".field-error").forEach((p) => {
    p.hidden = true;
    p.textContent = "";
  });
  form.querySelectorAll(".is-bad").forEach((el) => el.classList.remove("is-bad"));
}

async function abrirFormulario(evento, dia) {
  editando = evento;
  form.reset();
  limpiarErrores();
  await cargarOpciones();
  $("form-titulo").textContent = evento ? "Editar pendiente" : "Nuevo pendiente";
  $("btn-guardar").textContent = evento ? "Guardar cambios" : "Guardar pendiente";
  if (evento) {
    $("ev-titulo").value = evento.titulo;
    $("ev-descripcion").value = evento.descripcion || "";
    $("ev-tipo").value = evento.tipo;
    $("ev-estado").value = evento.estado;
    form.querySelector(`input[name="prioridad"][value="${evento.prioridad}"]`).checked = true;
    $("ev-inicio").value = evento.fecha_inicio;
    $("ev-entrega").value = evento.fecha_entrega || "";
    fijarRecordatorio(evento.recordatorio, evento.fecha_inicio);
    Object.keys(VINCULOS).forEach((columna) => ($(`ev-${columna}`).value = evento[columna] || ""));
    $("ev-vinculos").open = Object.keys(VINCULOS).some((columna) => evento[columna]);
  } else {
    $("ev-inicio").value = `${dia || iso(new Date())}T09:00`;
    fijarRecordatorio("", "");
    $("ev-vinculos").open = false;
  }
  dialogoForm.showModal();
  $("ev-titulo").focus();
}

const CAMPOS = {
  titulo: "ev-titulo",
  descripcion: "ev-descripcion",
  tipo: "ev-tipo",
  estado: "ev-estado",
  prioridad: "ev-prioridad",
  fecha_inicio: "ev-inicio",
  fecha_entrega: "ev-entrega",
  recordatorio: "ev-recordatorio",
  ...Object.fromEntries(Object.keys(VINCULOS).map((c) => [c, `ev-${c}`])),
};

form.addEventListener("input", (event) => {
  event.target.classList.remove("is-bad");
  const error = $(`${event.target.id}-error`);
  if (error) error.hidden = true;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  limpiarErrores();
  $("guardar-error").hidden = true;
  const datos = {
    titulo: $("ev-titulo").value.trim(),
    descripcion: $("ev-descripcion").value.trim(),
    tipo: $("ev-tipo").value,
    estado: $("ev-estado").value,
    prioridad: form.querySelector('input[name="prioridad"]:checked')?.value || "",
    fecha_inicio: $("ev-inicio").value,
    fecha_entrega: $("ev-entrega").value,
    recordatorio: leerRecordatorio(),
    ...Object.fromEntries(Object.keys(VINCULOS).map((c) => [c, $(`ev-${c}`).value])),
  };
  const errores = {};
  if (datos.titulo.length < 2) errores.titulo = "Escribe el título del pendiente.";
  if (!datos.fecha_inicio) errores.fecha_inicio = "Elige la fecha y hora de inicio.";
  if (datos.fecha_entrega && datos.fecha_inicio && datos.fecha_entrega < datos.fecha_inicio) errores.fecha_entrega = "La entrega no puede ser antes del inicio.";
  if (datos.recordatorio && datos.fecha_inicio && datos.recordatorio > datos.fecha_inicio) errores.recordatorio = "El recordatorio debe ser antes del inicio.";
  if (Object.keys(errores).length) return mostrarErrores(errores);

  const boton = $("btn-guardar");
  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const ruta = editando ? `/calendario/${editando.id_evento}` : "/calendario";
    const { evento } = await api(ruta, { method: editando ? "PUT" : "POST", body: JSON.stringify(datos) });
    avisar(editando ? `Se guardaron los cambios de “${evento.titulo}”.` : `“${evento.titulo}” quedó en el calendario.`);
    dialogoForm.close();
    // Se muestra el día del pendiente
    diaElegido = evento.fecha_inicio.slice(0, 10);
    mesActual = primerDia(leerFecha(diaElegido));
    refrescar();
  } catch (error) {
    if (error.errores) mostrarErrores(error.errores);
    $("guardar-error").textContent = error.message;
    $("guardar-error").hidden = false;
  } finally {
    boton.disabled = false;
    if (boton.textContent === "Guardando…") boton.textContent = textoBoton;
  }
});

function mostrarErrores(errores) {
  Object.entries(errores).forEach(([campo, mensaje]) => {
    const id = CAMPOS[campo];
    if (!id) return;
    if (campo === "recordatorio") {
      $("ev-aviso").value = "otra";
      $("ev-recordatorio-campo").hidden = false;
    }
    if (VINCULOS[campo]) $("ev-vinculos").open = true;
    mostrarError(id, mensaje, campo === "prioridad" ? null : undefined);
  });
  form.querySelector(".is-bad")?.focus();
}

[detalle, dialogoForm].forEach((dialogo) => {
  dialogo.querySelectorAll("[data-cerrar]").forEach((boton) => boton.addEventListener("click", () => dialogo.close()));
  dialogo.addEventListener("click", (event) => {
    if (event.target === dialogo) dialogo.close();
  });
});

/* ================= Inicio ================= */

function refrescar() {
  cargarMes();
  cargarProximos();
  // La campana revisa si ya toca algún aviso
  window.dispatchEvent(new Event("sigmas:alertas"));
}

const opcionesTipo = TIPOS.map(([valor, texto]) => `<option value="${valor}">${texto}</option>`).join("");
$("ev-tipo").innerHTML = opcionesTipo;
$("filtro-tipo").insertAdjacentHTML("beforeend", opcionesTipo);
$("leyenda").innerHTML =
  TIPOS.map(([, texto, clase]) => `<li class="${clase}">${texto}</li>`).join("") + '<li class="t-factura">Vence factura</li>';

refrescar();

// Desde una alerta: calendario.html#evento-12 abre ese pendiente (también si ya se está en el calendario)
function abrirDesdeEnlace() {
  const enlace = location.hash.match(/^#evento-(\d+)$/);
  if (!enlace) return;
  api(`/calendario/${enlace[1]}`)
    .then((e) => {
      diaElegido = e.fecha_inicio.slice(0, 10);
      mesActual = primerDia(leerFecha(diaElegido));
      cargarMes();
      if (detalle.open) detalle.close();
      abrirDetalle(e);
    })
    .catch((error) => avisar(error.message));
}

abrirDesdeEnlace();
window.addEventListener("hashchange", abrirDesdeEnlace);
