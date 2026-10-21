// Las peticiones van con el token de la sesión (../sigmas-comun/sesion.js)
const API_URL = "/api/vinculados";

const TIPOS = { Proveedor: "Proveedores", Cliente: "Clientes", Tercero: "Terceros" };
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO_RE = /^[\d\s+()-]{7,20}$/;

const toast = document.getElementById("toast");
const form = document.getElementById("vinculado-form");
const tipoIdSelect = document.getElementById("tipo_id");
const identificacionInput = document.getElementById("identificacion");
const identificacionHint = document.getElementById("identificacion-hint");
const providerBox = document.getElementById("provider-box");
const guardarBtn = document.getElementById("btn-guardar");
const buscarInput = document.getElementById("buscar");
const tbody = document.getElementById("vinculados-body");
const emptyState = document.getElementById("empty-state");

let toastTimer;
let vinculados = [];
let filtroTipo = "";
let filtroInventario = ""; // solo para proveedores: Insumo o Materia prima
let cargado = false;
let editando = null; // identificación del vinculado que se está editando

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3000);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/* ---------- Pestañas ---------- */

const tabs = [...document.querySelectorAll(".tab-btn")];

function activarPestana(tab) {
  tabs.forEach((t) => {
    const activa = t === tab;
    t.classList.toggle("is-active", activa);
    t.setAttribute("aria-selected", String(activa));
    t.tabIndex = activa ? 0 : -1;
    document.getElementById(t.getAttribute("aria-controls")).hidden = !activa;
  });
  history.replaceState(null, "", tab.id === "tab-listado" ? "#listado" : "#agregar");
  if (tab.id === "tab-listado" && !cargado) cargarVinculados();
}

tabs.forEach((tab, i) => {
  tab.addEventListener("click", () => activarPestana(tab));
  // Flechas izquierda/derecha para moverse entre pestañas
  tab.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const siguiente = tabs[(i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    siguiente.focus();
    activarPestana(siguiente);
  });
});

/* ---------- Identificación (NIT / cédula) ---------- */

// Devuelve { valor } normalizado (NIT 900123456-7, cédula solo dígitos) o { error }
function normalizarIdentificacion(tipoId, valor) {
  const limpio = valor.replace(/[.\s]/g, "");
  if (!limpio) return { error: "Escribe la identificación." };
  if (tipoId === "NIT") {
    // Solo se revisa el formato: número, guion y un dígito al final
    if (!/^\d{8,10}-\d$/.test(limpio)) return { error: "Escribe el NIT con guion antes del último dígito. Ej: 900123456-7" };
    return { valor: limpio };
  }
  if (!/^\d{5,10}$/.test(limpio)) return { error: "La cédula debe tener entre 5 y 10 dígitos, sin puntos ni letras." };
  return { valor: limpio };
}

function actualizarAyudaIdentificacion() {
  if (tipoIdSelect.value === "NIT") {
    identificacionInput.placeholder = "900123456-7";
    identificacionHint.textContent = "Solo números y el guion. Ej: 900123456-7";
  } else {
    identificacionInput.placeholder = "1020304050";
    identificacionHint.textContent = "Solo números, sin puntos. Ej: 1020304050";
  }
}

// Mientras escribe solo se permiten los caracteres válidos para cada tipo
identificacionInput.addEventListener("input", () => {
  const permitido = tipoIdSelect.value === "NIT" ? /[^\d-]/g : /[^\d]/g;
  identificacionInput.value = identificacionInput.value.replace(permitido, "");
  identificacionInput.classList.remove("is-ok");
  setError("identificacion", "");
});

identificacionInput.addEventListener("blur", validarIdentificacion);

tipoIdSelect.addEventListener("change", () => {
  actualizarAyudaIdentificacion();
  if (identificacionInput.value) validarIdentificacion();
});

let ultimaConsulta = 0;

// Valida el formato y consulta si ya existe (la identificación es la llave primaria)
async function validarIdentificacion() {
  const raw = identificacionInput.value.trim();
  if (!raw || editando) return false;
  const resultado = normalizarIdentificacion(tipoIdSelect.value, raw);
  if (resultado.error) {
    setError("identificacion", resultado.error);
    return false;
  }
  identificacionInput.value = resultado.valor;

  const consulta = ++ultimaConsulta;
  try {
    const params = new URLSearchParams({ tipo_id: tipoIdSelect.value, identificacion: resultado.valor });
    const res = await SigmaSesion.fetch(`${API_URL}/existe?${params}`);
    const data = await res.json();
    if (consulta !== ultimaConsulta) return true;
    if (data.existe) {
      setError("identificacion", `La identificación ${resultado.valor} ya está registrada.`);
      return false;
    }
    identificacionInput.classList.add("is-ok");
  } catch {
    // Sin conexión: el servidor vuelve a validar al guardar
  }
  return true;
}

/* ---------- Tipo de vinculado ---------- */

function tipoSeleccionado() {
  return form.querySelector('input[name="tipo"]:checked')?.value || "";
}

function inventarioSeleccionado() {
  return form.querySelector('input[name="tipo_inventario"]:checked')?.value || "";
}

// Proveedor: actividad obligatoria y tipo de inventario. Tercero: actividad opcional. Cliente: ninguno.
function mostrarCamposTipo(tipo) {
  const esProveedor = tipo === "Proveedor";
  const esTercero = tipo === "Tercero";
  providerBox.hidden = !esProveedor && !esTercero;
  document.getElementById("provider-title").textContent = esTercero ? "Datos del tercero" : "Datos del proveedor";
  document.getElementById("actividad-req").hidden = esTercero;
  document.getElementById("actividad-hint").hidden = !esTercero;
  document.getElementById("actividad").placeholder = esTercero ? "Ej: Taller de confección satélite" : "Ej: Fabricación de hilos y cintas";
  document.getElementById("inventario-campo").hidden = !esProveedor;
  if (!esProveedor) setError("tipo_inventario", "");
  if (!esProveedor && !esTercero) setError("actividad", "");
}

form.querySelectorAll('input[name="tipo"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    setError("tipo", "");
    mostrarCamposTipo(tipoSeleccionado());
  });
});

form.querySelectorAll('input[name="tipo_inventario"]').forEach((radio) => {
  radio.addEventListener("change", () => setError("tipo_inventario", ""));
});

/* ---------- Errores ---------- */

const contenedorError = {
  tipo: () => document.getElementById("tipo-group"),
  tipo_inventario: () => document.querySelector(".segmented"),
};

function setError(campo, mensaje) {
  const error = document.getElementById(`${campo}-error`);
  const control = contenedorError[campo]?.() || document.getElementById(campo);
  if (error) {
    error.textContent = mensaje;
    error.hidden = !mensaje;
  }
  if (control) {
    control.classList.toggle("is-bad", Boolean(mensaje));
    if (mensaje) control.classList.remove("is-ok");
    if (control.matches("input, select")) {
      control.setAttribute("aria-invalid", String(Boolean(mensaje)));
      if (mensaje) control.setAttribute("aria-describedby", `${campo}-error`);
      else control.removeAttribute("aria-describedby");
    }
  }
}

function limpiarErrores() {
  ["identificacion", "nombre", "direccion", "ciudad", "contacto", "correo", "tipo", "actividad", "tipo_inventario"].forEach((c) =>
    setError(c, ""),
  );
}

// Al corregir un campo se quita su error
["nombre", "direccion", "ciudad", "contacto", "correo", "actividad"].forEach((campo) => {
  document.getElementById(campo).addEventListener("input", () => setError(campo, ""));
});

/* ---------- Guardar ---------- */

function leerFormulario() {
  const valor = (id) => document.getElementById(id).value.trim();
  return {
    tipo_id: tipoIdSelect.value,
    identificacion: valor("identificacion"),
    nombre: valor("nombre"),
    direccion: valor("direccion"),
    ciudad: valor("ciudad"),
    contacto: valor("contacto"),
    correo: valor("correo").toLowerCase(),
    tipo: tipoSeleccionado(),
    actividad: valor("actividad"),
    tipo_inventario: inventarioSeleccionado(),
  };
}

function validarFormulario(datos) {
  const errores = {};
  const identificacion = normalizarIdentificacion(datos.tipo_id, datos.identificacion);
  if (identificacion.error) errores.identificacion = identificacion.error;
  if (datos.nombre.length < 2) errores.nombre = "Escribe el nombre o la razón social.";
  if (!datos.direccion) errores.direccion = "Escribe la dirección.";
  if (!datos.ciudad) errores.ciudad = "Escribe la ciudad.";
  if (!TELEFONO_RE.test(datos.contacto)) errores.contacto = "Escribe un teléfono válido (7 a 20 dígitos).";
  if (!CORREO_RE.test(datos.correo)) errores.correo = "Escribe un correo válido, por ejemplo ventas@empresa.com.";
  if (!datos.tipo) errores.tipo = "Elige si es proveedor, cliente o tercero.";
  if (datos.tipo === "Proveedor") {
    if (!datos.actividad) errores.actividad = "Escribe la actividad del proveedor.";
    if (!datos.tipo_inventario) errores.tipo_inventario = "Elige si suministra insumo o materia prima.";
  }
  return errores;
}

function mostrarErrores(errores) {
  Object.entries(errores).forEach(([campo, mensaje]) => setError(campo, mensaje));
  const primero = Object.keys(errores)[0];
  const foco =
    primero === "tipo"
      ? form.querySelector('input[name="tipo"]')
      : primero === "tipo_inventario"
        ? form.querySelector('input[name="tipo_inventario"]')
        : document.getElementById(primero);
  foco?.focus();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  limpiarErrores();

  const datos = leerFormulario();
  const errores = validarFormulario(datos);
  if (Object.keys(errores).length > 0) {
    mostrarErrores(errores);
    return;
  }
  // La actividad se guarda para proveedores y terceros; el tipo de inventario, solo para proveedores
  if (datos.tipo !== "Proveedor") datos.tipo_inventario = "";
  if (datos.tipo !== "Proveedor" && datos.tipo !== "Tercero") datos.actividad = "";

  const esEdicion = Boolean(editando);
  guardarBtn.disabled = true;
  guardarBtn.textContent = "Guardando…";
  try {
    const res = await SigmaSesion.fetch(esEdicion ? `${API_URL}/${encodeURIComponent(editando)}` : API_URL, {
      method: esEdicion ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.errores) mostrarErrores(data.errores);
      showToast(data.message || "No se pudo guardar el vinculado.");
      return;
    }
    await cargarVinculados();
    if (esEdicion) {
      showToast(`Se guardaron los cambios de ${data.vinculado.nombre}.`);
      reiniciarFormulario();
      activarPestana(document.getElementById("tab-listado"));
    } else {
      showToast(`${data.vinculado.nombre} quedó registrado como ${data.vinculado.tipo.toLowerCase()}.`);
      reiniciarFormulario();
    }
  } catch {
    showToast("No hay conexión con el servidor. Verifica que el backend esté encendido.");
  } finally {
    guardarBtn.disabled = false;
    guardarBtn.textContent = editando ? "Guardar cambios" : "Guardar vinculado";
  }
});

function reiniciarFormulario() {
  salirEdicion();
  form.reset();
  limpiarErrores();
  identificacionInput.classList.remove("is-ok");
  mostrarCamposTipo("");
  actualizarAyudaIdentificacion();
  identificacionInput.focus();
}

document.getElementById("btn-limpiar").addEventListener("click", reiniciarFormulario);

/* ---------- Editar ---------- */

function iniciarEdicion(vinculado) {
  form.reset();
  limpiarErrores();
  editando = vinculado.identificacion;

  tipoIdSelect.value = vinculado.tipo_id;
  identificacionInput.value = vinculado.identificacion;
  // La identificación es la llave primaria: no se edita
  tipoIdSelect.disabled = true;
  identificacionInput.disabled = true;
  identificacionInput.classList.remove("is-ok");
  identificacionHint.textContent = "La identificación no se puede modificar.";

  ["nombre", "direccion", "ciudad", "contacto", "correo"].forEach((campo) => {
    document.getElementById(campo).value = vinculado[campo] || "";
  });
  form.querySelector(`input[name="tipo"][value="${vinculado.tipo}"]`).checked = true;
  mostrarCamposTipo(vinculado.tipo);
  document.getElementById("actividad").value = vinculado.actividad || "";
  const inventario = form.querySelector(`input[name="tipo_inventario"][value="${vinculado.tipo_inventario}"]`);
  if (inventario) inventario.checked = true;

  document.getElementById("edit-nombre").textContent = vinculado.nombre;
  document.getElementById("edit-banner").hidden = false;
  document.getElementById("tab-agregar-label").textContent = "Editar vinculado";
  guardarBtn.textContent = "Guardar cambios";

  activarPestana(document.getElementById("tab-agregar"));
  renderTabla();
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.getElementById("nombre").focus({ preventScroll: true });
}

function salirEdicion() {
  if (!editando) return;
  editando = null;
  tipoIdSelect.disabled = false;
  identificacionInput.disabled = false;
  document.getElementById("edit-banner").hidden = true;
  document.getElementById("tab-agregar-label").textContent = "Agregar vinculado";
  guardarBtn.textContent = "Guardar vinculado";
  renderTabla();
}

document.getElementById("btn-cancelar-edicion").addEventListener("click", () => {
  reiniciarFormulario();
  activarPestana(document.getElementById("tab-listado"));
});

/* ---------- Eliminar ---------- */

const confirmDialog = document.getElementById("confirm-dialog");
const confirmWarning = document.getElementById("confirm-warning");

// Cuántos registros quedarán sin vinculado (materias primas, referencias, eventos)
async function textoUso(identificacion) {
  try {
    const res = await SigmaSesion.fetch(`${API_URL}/${encodeURIComponent(identificacion)}/uso`);
    if (!res.ok) return "";
    const uso = await res.json();
    const partes = [
      [uso.insumos, "insumo", "insumos"],
      [uso.materias_primas, "materia prima", "materias primas"],
      [uso.referencias, "referencia", "referencias"],
      [uso.eventos, "evento del calendario", "eventos del calendario"],
    ]
      .filter(([n]) => n > 0)
      .map(([n, uno, varios]) => `${n} ${n === 1 ? uno : varios}`);
    if (partes.length === 0) return "";
    return `Está asociado a ${partes.join(", ")}. Esos registros se conservan, pero quedarán sin vinculado.`;
  } catch {
    return "";
  }
}

async function confirmarEliminacion(vinculado) {
  document.getElementById("confirm-text").textContent =
    `Se eliminará a ${vinculado.nombre} (${vinculado.tipo_id === "NIT" ? "NIT" : "C.C."} ${vinculado.identificacion}). Esta acción no se puede deshacer.`;
  confirmWarning.hidden = true;
  confirmDialog.returnValue = "";
  confirmDialog.showModal();

  const aviso = await textoUso(vinculado.identificacion);
  if (aviso && confirmDialog.open) {
    confirmWarning.textContent = aviso;
    confirmWarning.hidden = false;
  }

  await new Promise((resolve) => confirmDialog.addEventListener("close", resolve, { once: true }));
  if (confirmDialog.returnValue !== "eliminar") return;

  try {
    const res = await SigmaSesion.fetch(`${API_URL}/${encodeURIComponent(vinculado.identificacion)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 404) {
      showToast(data.message || "No se pudo eliminar el vinculado.");
      return;
    }
    if (editando === vinculado.identificacion) reiniciarFormulario();
    showToast(res.ok ? `${vinculado.nombre} fue eliminado.` : data.message);
    await cargarVinculados();
  } catch {
    showToast("No hay conexión con el servidor. Verifica que el backend esté encendido.");
  }
}

// Un solo manejador para los botones de todas las filas
tbody.addEventListener("click", (event) => {
  const boton = event.target.closest("[data-accion]");
  if (!boton) return;
  const vinculado = vinculados.find((v) => v.identificacion === boton.dataset.id);
  if (!vinculado) return;
  if (boton.dataset.accion === "editar") iniciarEdicion(vinculado);
  else confirmarEliminacion(vinculado);
});

/* ---------- Listado ---------- */

async function cargarVinculados() {
  try {
    const res = await SigmaSesion.fetch(API_URL);
    if (!res.ok) throw new Error();
    vinculados = await res.json();
    cargado = true;
    actualizarConteos();
    renderTabla();
  } catch {
    vinculados = [];
    tbody.innerHTML = "";
    mostrarVacio(
      "No se pudo cargar el listado",
      "Verifica que el backend esté encendido (npm run dev en la carpeta backend) y vuelve a intentarlo.",
      true,
    );
  }
}

function actualizarConteos() {
  document.getElementById("tab-count").textContent = vinculados.length;
  document.querySelectorAll("[data-count]").forEach((el) => {
    const { count: tipo, countInv: inventario } = el.dataset;
    el.textContent = contar(tipo, inventario);
  });
  actualizarBotonProveedores();
}

function contar(tipo, inventario) {
  return vinculados.filter((v) => (!tipo || v.tipo === tipo) && (!inventario || v.tipo_inventario === inventario)).length;
}

function sinTildes(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function filtrar() {
  const q = sinTildes(buscarInput.value.trim());
  return vinculados.filter((v) => {
    if (filtroTipo && v.tipo !== filtroTipo) return false;
    if (filtroInventario && v.tipo_inventario !== filtroInventario) return false;
    if (!q) return true;
    return [v.identificacion, v.nombre, v.ciudad, v.correo, v.contacto, v.actividad].some((campo) => sinTildes(campo).includes(q));
  });
}

function mostrarVacio(titulo, texto, esError = false) {
  document.getElementById("empty-title").textContent = titulo;
  document.getElementById("empty-text").textContent = texto;
  emptyState.classList.toggle("is-error", esError);
  emptyState.hidden = false;
  document.getElementById("showing-label").textContent = "Mostrando 0 vinculados";
}

function renderTabla() {
  const lista = filtrar();
  emptyState.hidden = true;

  tbody.innerHTML = lista
    .map(
      (v) => `
        <tr${v.identificacion === editando ? ' class="is-editing"' : ""}>
          <td class="cell-id" data-label="Identificación">${escapeHtml(v.identificacion)}<small>${v.tipo_id === "NIT" ? "NIT" : "Cédula"}</small></td>
          <td class="cell-name" data-label="Nombre">${escapeHtml(v.nombre)}</td>
          <td data-label="Tipo"><span class="badge badge-${v.tipo.toLowerCase()}">${escapeHtml(v.tipo)}</span></td>
          <td data-label="Ciudad">${escapeHtml(v.ciudad || "—")}</td>
          <td data-label="Contacto">${escapeHtml(v.contacto || "—")}</td>
          <td class="cell-mail" data-label="Correo">${escapeHtml(v.correo || "—")}</td>
          <td data-label="Actividad">${
            v.tipo === "Proveedor"
              ? `${escapeHtml(v.actividad)}<span class="inv-tag">${escapeHtml(v.tipo_inventario)}</span>`
              : v.actividad
                ? escapeHtml(v.actividad)
                : '<span class="cell-muted">—</span>'
          }</td>
          <td class="cell-actions" data-label="Acciones">
            <div class="row-actions">
              <button type="button" class="action-btn" data-accion="editar" data-id="${escapeHtml(v.identificacion)}" aria-label="Editar a ${escapeHtml(v.nombre)}">Editar</button>
              <button type="button" class="action-btn is-danger" data-accion="eliminar" data-id="${escapeHtml(v.identificacion)}" aria-label="Eliminar a ${escapeHtml(v.nombre)}">Eliminar</button>
            </div>
          </td>
        </tr>`,
    )
    .join("");

  if (vinculados.length === 0) {
    mostrarVacio("Aún no tienes vinculados", "Registra tu primer proveedor, cliente o tercero en la pestaña “Agregar vinculado”.");
    return;
  }
  if (lista.length === 0) {
    mostrarVacio("Sin resultados", "Ningún vinculado coincide con la búsqueda o el filtro. Prueba con otro término.");
    return;
  }
  document.getElementById("showing-label").textContent = `Mostrando ${lista.length} de ${vinculados.length} vinculados`;
}

buscarInput.addEventListener("input", renderTabla);

/* Filtros: tipo de vinculado; el botón Proveedores despliega Insumo o Materia prima */

const provBtn = document.getElementById("prov-btn");
const provMenu = document.getElementById("prov-menu");

function aplicarFiltro(tipo, inventario, chipActivo) {
  filtroTipo = tipo;
  filtroInventario = inventario;
  document.querySelectorAll(".filter-chip").forEach((c) => {
    c.classList.toggle("is-active", c === chipActivo);
    c.setAttribute("aria-pressed", String(c === chipActivo));
  });
  provMenu.querySelectorAll("[data-inventario]").forEach((opcion) =>
    opcion.setAttribute("aria-checked", String(tipo === "Proveedor" && opcion.dataset.inventario === inventario)),
  );
  actualizarBotonProveedores();
  // El alcance de exportación sigue al tipo elegido
  document.getElementById("export-scope").value = filtroTipo;
  renderTabla();
}

// El botón muestra lo elegido: "Proveedores · Insumo" y su cantidad
function actualizarBotonProveedores() {
  const inventario = filtroTipo === "Proveedor" ? filtroInventario : "";
  document.getElementById("prov-label").textContent = inventario ? `Proveedores · ${inventario}` : "Proveedores";
  document.getElementById("prov-count").textContent = contar("Proveedor", inventario);
}

function abrirMenuProveedores(abrir) {
  provMenu.hidden = !abrir;
  provBtn.setAttribute("aria-expanded", String(abrir));
  if (abrir) (provMenu.querySelector('[aria-checked="true"]') || provMenu.querySelector("button")).focus();
}

document.querySelectorAll(".filter-chip:not(#prov-btn)").forEach((chip) => {
  chip.addEventListener("click", () => aplicarFiltro(chip.dataset.tipo, "", chip));
});

provBtn.addEventListener("click", () => abrirMenuProveedores(provMenu.hidden));

provMenu.addEventListener("click", (event) => {
  const opcion = event.target.closest("[data-inventario]");
  if (!opcion) return;
  aplicarFiltro("Proveedor", opcion.dataset.inventario, provBtn);
  abrirMenuProveedores(false);
  provBtn.focus();
});

provMenu.addEventListener("keydown", (event) => {
  const opciones = [...provMenu.querySelectorAll("[data-inventario]")];
  const i = opciones.indexOf(document.activeElement);
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    opciones[(i + (event.key === "ArrowDown" ? 1 : opciones.length - 1)) % opciones.length].focus();
  } else if (event.key === "Escape") {
    abrirMenuProveedores(false);
    provBtn.focus();
  }
});

document.addEventListener("click", (event) => {
  if (!provMenu.hidden && !event.target.closest("#prov-dropdown")) abrirMenuProveedores(false);
});

/* ---------- Exportar ---------- */

const COLUMNAS_EXPORTAR = [
  ["Tipo de identificación", (v) => (v.tipo_id === "NIT" ? "NIT" : "Cédula")],
  ["Identificación", (v) => v.identificacion],
  ["Nombre", (v) => v.nombre],
  ["Tipo", (v) => v.tipo],
  ["Dirección", (v) => v.direccion || ""],
  ["Ciudad", (v) => v.ciudad || ""],
  ["Contacto", (v) => v.contacto || ""],
  ["Correo", (v) => v.correo || ""],
  ["Actividad", (v) => v.actividad || ""],
  ["Tipo de inventario", (v) => v.tipo_inventario || ""],
];

function datosExportar() {
  const alcance = document.getElementById("export-scope").value;
  const lista = alcance ? vinculados.filter((v) => v.tipo === alcance) : vinculados;
  const nombre = alcance ? TIPOS[alcance].toLowerCase() : "todos";
  const titulo = alcance ? `Vinculados · ${TIPOS[alcance]}` : "Vinculados · Todos";
  return { lista, nombre, titulo };
}

function fechaArchivo() {
  return new Date().toISOString().slice(0, 10);
}

function exportarExcel() {
  const { lista, nombre, titulo } = datosExportar();
  if (lista.length === 0) return showToast("No hay vinculados para exportar con ese tipo.");
  if (!window.XLSX) return showToast("No se pudo cargar el exportador de Excel. Revisa tu conexión a internet.");

  const filas = lista.map((v) => Object.fromEntries(COLUMNAS_EXPORTAR.map(([titulo, valor]) => [titulo, valor(v)])));
  const hoja = XLSX.utils.json_to_sheet(filas);
  hoja["!cols"] = COLUMNAS_EXPORTAR.map(([titulo]) => ({
    wch: Math.max(titulo.length, ...filas.map((f) => String(f[titulo]).length)) + 2,
  }));
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, titulo.replace("Vinculados · ", "").slice(0, 31));
  XLSX.writeFile(libro, `vinculados-${nombre}-${fechaArchivo()}.xlsx`);
  showToast(`Excel descargado · ${lista.length} vinculados`);
}

function exportarPdf() {
  const { lista, nombre, titulo } = datosExportar();
  if (lista.length === 0) return showToast("No hay vinculados para exportar con ese tipo.");
  if (!window.jspdf?.jsPDF) return showToast("No se pudo cargar el exportador de PDF. Revisa tu conexión a internet.");

  const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const ancho = doc.internal.pageSize.getWidth();

  // Encabezado con los colores de la marca
  doc.setFillColor(10, 17, 35);
  doc.rect(0, 0, ancho, 64, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(titulo, 40, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`${SigmaSesion.usuario.nombre_empresa} · Generado el ${new Date().toLocaleDateString("es-CO")} · ${lista.length} registros`, 40, 48);

  doc.autoTable({
    startY: 84,
    head: [COLUMNAS_EXPORTAR.map(([t]) => t)],
    body: lista.map((v) => COLUMNAS_EXPORTAR.map(([, valor]) => valor(v))),
    styles: { font: "helvetica", fontSize: 7.5, cellPadding: 5, textColor: [10, 17, 35], lineColor: [220, 222, 234] },
    headStyles: { fillColor: [58, 62, 108], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [243, 244, 250] },
    margin: { left: 40, right: 40 },
    didDrawPage: () => {
      doc.setFontSize(8);
      doc.setTextColor(87, 91, 128);
      doc.text(`SigmaS · Página ${doc.internal.getNumberOfPages()}`, ancho - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    },
  });

  doc.save(`vinculados-${nombre}-${fechaArchivo()}.pdf`);
  showToast(`PDF descargado · ${lista.length} vinculados`);
}

document.getElementById("btn-excel").addEventListener("click", exportarExcel);
document.getElementById("btn-pdf").addEventListener("click", exportarPdf);

/* ---------- Inicio ---------- */

actualizarAyudaIdentificacion();
cargarVinculados();
if (window.location.hash === "#listado") activarPestana(document.getElementById("tab-listado"));
