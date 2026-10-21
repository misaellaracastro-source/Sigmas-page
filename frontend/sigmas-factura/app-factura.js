// Facturas: subir una factura (empresa, fecha, archivo y estado), verlas, filtrarlas por fecha y estado,
// abrir el archivo, editar y eliminar.
import { api, escapeHtml, avisar, mostrarError, confirmar, mostrarVacio } from "../sigmas-inventario/util-inventario.js";

const $ = (id) => document.getElementById(id);
const TAMANO_MAXIMO = 5 * 1024 * 1024;
const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const CLASE_ESTADO = { Pagada: "is-pagada", "En proceso": "is-proceso", Vencida: "is-vencida" };

let facturas = [];
let editando = null; // factura que se está editando
let archivoNuevo = null; // { base64, nombre }
let nombreVerificado = "";

function hoyIso() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
}

function fechaCorta(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

// "Vence en 2 días", "Vence hoy", "Venció hace 3 días" (solo si no está pagada)
function textoVencimiento(f) {
  if (!f.fecha_vencimiento) return '<span class="hint">—</span>';
  const fecha = fechaCorta(f.fecha_vencimiento);
  if (f.estado === "Pagada") return fecha;
  const [a, m, d] = f.fecha_vencimiento.split("-").map(Number);
  const hoy = new Date();
  const dias = Math.round((new Date(a, m - 1, d) - new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) / 86400000);
  const nota = dias < 0 ? `Venció hace ${-dias} día${dias === -1 ? "" : "s"}` : dias === 0 ? "Vence hoy" : `Vence en ${dias} día${dias === 1 ? "" : "s"}`;
  return `${fecha}<br><small class="${dias <= 3 ? "vence-pronto" : "hint"}">${nota}</small>`;
}

const badge = (estado) => `<span class="estado-badge ${CLASE_ESTADO[estado] || ""}">${escapeHtml(estado)}</span>`;

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

/* ================= Archivo ================= */

const drop = $("fa-archivo-drop");

function mostrarArchivo(texto, tieneArchivo) {
  $("fa-archivo-texto").textContent = texto;
  drop.classList.toggle("tiene-archivo", tieneArchivo);
}

function leerArchivo(archivo) {
  mostrarError("fa-archivo", "", drop);
  if (!TIPOS.includes(archivo.type)) return mostrarError("fa-archivo", "El archivo debe ser PDF, JPG, PNG o WEBP.", drop);
  if (archivo.size > TAMANO_MAXIMO) return mostrarError("fa-archivo", "El archivo es demasiado grande (máximo 5 MB).", drop);
  const lector = new FileReader();
  lector.onload = () => {
    archivoNuevo = { base64: lector.result, nombre: archivo.name };
    mostrarArchivo(`${archivo.name} · ${(archivo.size / 1024 / 1024).toFixed(2)} MB`, true);
  };
  lector.onerror = () => mostrarError("fa-archivo", "No se pudo leer el archivo.", drop);
  lector.readAsDataURL(archivo);
}

drop.addEventListener("click", () => $("fa-archivo").click());
drop.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    $("fa-archivo").click();
  }
});
drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("is-over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("is-over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("is-over");
  if (event.dataTransfer.files[0]) leerArchivo(event.dataTransfer.files[0]);
});
$("fa-archivo").addEventListener("change", () => {
  if ($("fa-archivo").files[0]) leerArchivo($("fa-archivo").files[0]);
  $("fa-archivo").value = "";
});

/* ================= Empresas sugeridas (Vinculados) ================= */

api("/vinculados")
  .then((vinculados) => {
    const nombres = [...new Set(vinculados.map((v) => v.nombre))].sort((a, b) => a.localeCompare(b, "es"));
    $("lista-empresas").innerHTML = nombres.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
  })
  .catch(() => {});

/* ================= Guardar ================= */

const estadoElegido = () => document.querySelector('input[name="estado"]:checked')?.value || "";

["fa-nombre", "fa-empresa", "fa-fecha", "fa-vencimiento"].forEach((id) =>
  $(id).addEventListener("input", () => {
    mostrarError(id, "");
    if (id === "fa-nombre") nombreVerificado = "";
  }),
);
$("fa-estado").addEventListener("change", () => mostrarError("fa-estado", "", null));

async function validarNombre() {
  if (editando) return true;
  const nombre = $("fa-nombre").value.trim();
  if (!nombre) {
    mostrarError("fa-nombre", "Escribe el nombre de la factura.");
    return false;
  }
  if (nombre === nombreVerificado) return true;
  try {
    const { existe } = await api(`/facturas/existe?nombre=${encodeURIComponent(nombre)}`);
    if (existe) {
      mostrarError("fa-nombre", `La factura ${nombre} ya existe. Usa otro nombre.`);
      return false;
    }
    nombreVerificado = nombre;
    return true;
  } catch (error) {
    mostrarError("fa-nombre", error.message);
    return false;
  }
}

$("fa-nombre").addEventListener("blur", () => {
  if ($("fa-nombre").value.trim()) validarNombre();
});

function mostrarErrores(errores) {
  const campos = { nombre_factura: "fa-nombre", empresa: "fa-empresa", fecha: "fa-fecha", fecha_vencimiento: "fa-vencimiento" };
  Object.entries(errores).forEach(([campo, mensaje]) => {
    if (campo === "archivo") mostrarError("fa-archivo", mensaje, drop);
    else if (campo === "estado") mostrarError("fa-estado", mensaje, null);
    else if (campos[campo]) mostrarError(campos[campo], mensaje);
  });
}

$("fa-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("guardar-error").hidden = true;
  const datos = {
    nombre_factura: $("fa-nombre").value.trim(),
    empresa: $("fa-empresa").value.trim(),
    fecha: $("fa-fecha").value,
    fecha_vencimiento: $("fa-vencimiento").value,
    estado: estadoElegido(),
  };
  const errores = {};
  if (datos.empresa.length < 2) errores.empresa = "Escribe la empresa.";
  if (!datos.fecha) errores.fecha = "Elige la fecha de la factura.";
  if (datos.fecha_vencimiento && datos.fecha && datos.fecha_vencimiento < datos.fecha) errores.fecha_vencimiento = "El vencimiento no puede ser antes de la fecha de la factura.";
  if (!datos.estado) errores.estado = "Elige el estado.";
  if (!editando && !archivoNuevo) errores.archivo = "Sube el archivo de la factura.";
  const nombreOk = await validarNombre();
  mostrarErrores(errores);
  if (!nombreOk || Object.keys(errores).length) {
    document.querySelector("#fa-form .is-bad")?.focus();
    return;
  }
  if (archivoNuevo) {
    datos.archivo_base64 = archivoNuevo.base64;
    datos.archivo_nombre = archivoNuevo.nombre;
  }

  const boton = $("btn-guardar");
  const textoBoton = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const ruta = editando ? `/facturas/${encodeURIComponent(editando)}` : "/facturas";
    const { factura } = await api(ruta, { method: editando ? "PUT" : "POST", body: JSON.stringify(datos) });
    avisar(`La factura ${factura.nombre_factura} quedó ${editando ? "actualizada" : "guardada"}.`);
    limpiarFormulario();
    activarPestana($("tab-lista"));
  } catch (error) {
    if (error.errores) mostrarErrores(error.errores);
    $("guardar-error").textContent = error.status === 413 ? "El archivo es demasiado grande (máximo 5 MB)." : error.message;
    $("guardar-error").hidden = false;
  } finally {
    boton.disabled = false;
    if (boton.textContent === "Guardando…") boton.textContent = textoBoton;
  }
});

// Modo edición: el nombre queda fijo y el archivo es opcional (si no se sube otro, se conserva)
function fijarEdicion(factura) {
  editando = factura?.nombre_factura || null;
  $("fa-nombre").disabled = Boolean(factura);
  $("fa-nombre-hint").textContent = factura ? "El nombre no se puede cambiar." : "Único: no se puede repetir.";
  $("fa-archivo-req").hidden = Boolean(factura);
  $("editando-aviso").hidden = !factura;
  $("editando-texto").textContent = factura ? `Estás editando la factura ${factura.nombre_factura}.` : "";
  $("tab-nueva").textContent = factura ? "Editar factura" : "Nueva factura";
  $("btn-guardar").textContent = factura ? "Guardar cambios" : "Guardar factura";
}

function limpiarFormulario() {
  $("fa-form").reset();
  fijarEdicion(null);
  archivoNuevo = null;
  nombreVerificado = "";
  $("fa-fecha").value = hoyIso();
  mostrarArchivo("Arrastra el archivo aquí o haz clic para elegirlo", false);
  ["fa-nombre", "fa-empresa", "fa-fecha", "fa-vencimiento"].forEach((id) => mostrarError(id, ""));
  mostrarError("fa-archivo", "", drop);
  mostrarError("fa-estado", "", null);
  $("guardar-error").hidden = true;
}

function editarFactura(f) {
  limpiarFormulario();
  fijarEdicion(f);
  $("fa-nombre").value = f.nombre_factura;
  $("fa-empresa").value = f.empresa;
  $("fa-fecha").value = f.fecha;
  $("fa-vencimiento").value = f.fecha_vencimiento || "";
  const radio = document.querySelector(`input[name="estado"][value="${f.estado}"]`);
  if (radio) radio.checked = true;
  mostrarArchivo(
    f.tiene_archivo ? `Archivo actual: ${f.archivo_nombre || "factura"} · haz clic para reemplazarlo` : "Arrastra el archivo aquí o haz clic para elegirlo",
    f.tiene_archivo,
  );
  activarPestana($("tab-nueva"));
  $("fa-empresa").focus();
}

$("editando-cancelar").addEventListener("click", () => {
  limpiarFormulario();
  avisar("Se canceló la edición.");
});
$("btn-limpiar").addEventListener("click", () => {
  limpiarFormulario();
  $("fa-nombre").focus();
});

/* ================= Lista ================= */

let esperaBusqueda;

function filtros() {
  const params = new URLSearchParams();
  const valores = {
    q: $("lista-buscar").value.trim(),
    estado: $("lista-estado").value,
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
    facturas = await api(`/facturas${params.size ? `?${params}` : ""}`);
    if (!params.size) $("tab-count").textContent = facturas.length;
    pintarLista(params.size > 0);
  } catch (error) {
    $("lista-cuerpo").innerHTML = "";
    $("lista-mostrando").textContent = "";
    mostrarVacio($("lista-vacia"), "No se pudieron cargar las facturas", error.message, true);
  }
}

// Tarjetas con cuántas facturas hay en cada estado (con los filtros de búsqueda y fecha); al pulsarlas filtran
function pintarResumen() {
  const conteo = { Pagada: 0, "En proceso": 0, Vencida: 0 };
  facturas.forEach((f) => (conteo[f.estado] = (conteo[f.estado] || 0) + 1));
  const elegido = $("lista-estado").value;
  $("estado-resumen").innerHTML = Object.entries(conteo)
    .map(
      ([estado, n]) =>
        `<button type="button" class="estado-tarjeta ${CLASE_ESTADO[estado]}" data-estado="${escapeHtml(estado)}" aria-pressed="${elegido === estado}">
          ${badge(estado)}<strong>${elegido && elegido !== estado ? "—" : n}</strong>
        </button>`,
    )
    .join("");
}

function pintarLista(conFiltros) {
  $("lista-vacia").hidden = true;
  $("lista-cuerpo").innerHTML = facturas
    .map(
      (f) => `<tr>
        <td data-label="Factura"><strong>${escapeHtml(f.nombre_factura)}</strong></td>
        <td data-label="Empresa">${escapeHtml(f.empresa)}</td>
        <td data-label="Fecha">${fechaCorta(f.fecha)}${f.fecha_pago ? `<br><small class="hint">Pagada el ${fechaCorta(f.fecha_pago)}</small>` : ""}</td>
        <td data-label="Vence">${textoVencimiento(f)}</td>
        <td data-label="Estado">${badge(f.estado)}</td>
        <td data-label="Archivo">${
          f.tiene_archivo
            ? `<button type="button" class="fa-archivo" data-ver="${escapeHtml(f.nombre_factura)}">${escapeHtml(f.archivo_nombre || "Ver archivo")}</button>`
            : '<span class="hint">Sin archivo</span>'
        }</td>
        <td data-label="Acciones" class="fa-acciones-fila">
          <button type="button" class="btn-ghost btn-small" data-editar="${escapeHtml(f.nombre_factura)}">Editar</button>
          <button type="button" class="btn-ghost btn-small is-danger" data-eliminar="${escapeHtml(f.nombre_factura)}">Eliminar</button>
        </td>
      </tr>`,
    )
    .join("");
  pintarResumen();
  if (facturas.length === 0) {
    if (conFiltros) mostrarVacio($("lista-vacia"), "Sin resultados", "Ninguna factura coincide con la búsqueda, el estado o las fechas elegidas.");
    else mostrarVacio($("lista-vacia"), "Aún no tienes facturas", "Sube la primera en la pestaña “Nueva factura”.");
  }
  $("lista-mostrando").textContent = facturas.length ? `${facturas.length} factura${facturas.length === 1 ? "" : "s"}` : "";
}

$("lista-buscar").addEventListener("input", () => {
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(cargarLista, 300);
});
["lista-estado", "lista-desde", "lista-hasta"].forEach((id) => $(id).addEventListener("change", cargarLista));
$("lista-limpiar").addEventListener("click", () => {
  ["lista-buscar", "lista-estado", "lista-desde", "lista-hasta"].forEach((id) => ($(id).value = ""));
  cargarLista();
});
$("estado-resumen").addEventListener("click", (event) => {
  const tarjeta = event.target.closest("[data-estado]");
  if (!tarjeta) return;
  // Pulsar el estado ya elegido quita el filtro
  $("lista-estado").value = $("lista-estado").value === tarjeta.dataset.estado ? "" : tarjeta.dataset.estado;
  cargarLista();
});

// El archivo se pide con la sesión y se abre en otra pestaña
async function verArchivo(nombre) {
  const ventana = window.open("", "_blank");
  try {
    const res = await SigmaSesion.fetch(`/api/facturas/${encodeURIComponent(nombre)}/archivo`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "No se pudo abrir el archivo.");
    const url = URL.createObjectURL(await res.blob());
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    ventana?.close();
    avisar(error.message);
  }
}

async function eliminarFactura(nombre) {
  const ok = await confirmar({
    titulo: "¿Eliminar factura?",
    texto: `Se eliminará la factura ${nombre} y su archivo. Esta acción no se puede deshacer.`,
  });
  if (!ok) return;
  try {
    await api(`/facturas/${encodeURIComponent(nombre)}`, { method: "DELETE" });
    avisar(`La factura ${nombre} fue eliminada.`);
    if (editando === nombre) limpiarFormulario();
    cargarLista();
  } catch (error) {
    avisar(error.message);
  }
}

$("lista-cuerpo").addEventListener("click", (event) => {
  const ver = event.target.closest("[data-ver]");
  const editar = event.target.closest("[data-editar]");
  const eliminar = event.target.closest("[data-eliminar]");
  if (ver) verArchivo(ver.dataset.ver);
  if (editar) editarFactura(facturas.find((f) => f.nombre_factura === editar.dataset.editar));
  if (eliminar) eliminarFactura(eliminar.dataset.eliminar);
});

/* ================= Inicio ================= */

limpiarFormulario();
api("/facturas")
  .then((lista) => ($("tab-count").textContent = lista.length))
  .catch(() => {});
if (location.hash === "#lista") activarPestana($("tab-lista"));
