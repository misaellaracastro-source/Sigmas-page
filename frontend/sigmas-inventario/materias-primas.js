// Pestaña Materia prima: listado de telas, búsqueda, agregar, editar y eliminar
import {
  api,
  formatoNumero,
  leerNumero,
  escapeHtml,
  sinTildes,
  CODIGO_RE,
  normalizarCodigo,
  estaBajo,
  avisar,
  avisarAlerta,
  mostrarError,
  limpiarErrores,
  prepararDrawer,
  confirmar,
  mostrarVacio,
  renderProveedores,
  llenarSelectProveedores,
} from "./util-inventario.js";
import { crearSelectorColor, nombreColor } from "./selector-color.js";
import { crearEditorPrecios, textoPrecios } from "./editor-precios.js";

const $ = (id) => document.getElementById(id);

const UNIDAD_CORTA = { metro: "m", "metro cuadrado": "m²", kilogramo: "kg", rollo: "rollos", pieza: "piezas", centimetro: "cm" };

// Campo del servidor → id del control en el formulario
const CAMPOS = {
  id_materia: "mat-id",
  nombre: "mat-nombre",
  id_vinculado: "mat-proveedor",
  cantidad: "mat-cantidad",
  unidad_medida: "mat-unidad",
  precios: "mat-precios",
  stock_minimo: "mat-stock",
  color: "mat-color",
  composicion: "mat-composicion",
  tipo_tejido: "mat-tejido",
  descripcion: "mat-descripcion",
};

export function crearMateriasPrimas({ alCambiarConteo }) {
  const drawer = $("drawer-materia");
  const form = $("form-materia");
  const idInput = $("mat-id");
  const unidadSelect = $("mat-unidad");
  const proveedorSelect = $("mat-proveedor");
  const guardarBtn = $("mat-guardar");
  const tbody = $("mat-body");
  const vacio = $("mat-empty");
  const colorBtn = $("mat-color-btn");
  const precios = crearEditorPrecios({ prefijo: "mat", tipo: "materia" });

  let materias = [];
  let proveedores = [];
  let editando = null;
  let cargado = false;

  const selectorColor = crearSelectorColor({
    prefijo: "mat",
    alCambiar: (hex) => hex && mostrarError("mat-color", "", colorBtn),
  });

  /* ---------- Datos ---------- */

  async function cargar() {
    try {
      materias = await api("/materias-primas");
      cargado = true;
      render();
    } catch (error) {
      materias = [];
      tbody.innerHTML = "";
      mostrarVacio(vacio, "No se pudo cargar el inventario", error.message, true);
    }
    alCambiarConteo(materias.length);
  }

  async function cargarProveedores() {
    try {
      proveedores = await api("/vinculados?tipo=Proveedor&tipo_inventario=Materia%20prima");
      renderProveedores($("mat-prov-grid"), $("mat-prov-count"), proveedores, "Materia prima");
    } catch (error) {
      proveedores = [];
      $("mat-prov-grid").innerHTML = `<p class="providers-empty">${escapeHtml(error.message)}</p>`;
    }
    $("mat-stat-prov").textContent = proveedores.length;
  }


  // Trae otra vez los proveedores al abrir el formulario: pudieron registrarse en Vinculados
  // después de abrir esta página
  function refrescarSelectProveedores(seleccion = "", nombreActual = "") {
    llenarSelectProveedores(proveedorSelect, $("mat-proveedor-hint"), proveedores, "materia prima", seleccion, nombreActual);
    cargarProveedores().then(() => {
      if (!drawer.open) return;
      llenarSelectProveedores(proveedorSelect, $("mat-proveedor-hint"), proveedores, "materia prima", proveedorSelect.value || seleccion, nombreActual);
    });
  }

  /* ---------- Listado ---------- */

  function visibles() {
    const q = sinTildes($("mat-buscar").value.trim());
    const soloBajo = $("mat-solo-bajo").checked;
    return materias.filter((m) => {
      if (soloBajo && !estaBajo(m.cantidad, m.stock_minimo)) return false;
      if (!q) return true;
      return [m.id_materia, m.nombre, m.composicion, m.tipo_tejido, m.proveedor, nombreColor(m.color)].some((campo) =>
        sinTildes(campo).includes(q),
      );
    });
  }

  function unidadCorta(unidad) {
    return UNIDAD_CORTA[unidad] || unidad;
  }

  function celdaPrecios(lista = []) {
    if (lista.length === 0) return '<span class="cell-muted">—</span>';
    const [principal, ...otros] = lista;
    return `<span class="price-list-cell"><strong>${escapeHtml(textoPrecios([principal]))}</strong>${
      otros.length ? `<small>${escapeHtml(textoPrecios(otros))}</small>` : ""
    }</span>`;
  }

  function render() {
    const bajos = materias.filter((m) => estaBajo(m.cantidad, m.stock_minimo)).length;
    $("mat-stat-total").textContent = formatoNumero(materias.length);
    $("mat-stat-bajo").textContent = bajos;
    $("mat-stat-bajo").closest(".stat-card").classList.toggle("has-items", bajos > 0);
    $("mat-stat-colores").textContent = new Set(materias.map((m) => m.color).filter(Boolean)).size;

    const lista = visibles();
    vacio.hidden = true;
    tbody.innerHTML = lista
      .map((m) => {
        const bajo = estaBajo(m.cantidad, m.stock_minimo);
        const unidad = unidadCorta(m.unidad_medida);
        const detalle = [m.composicion, m.tipo_tejido].filter(Boolean).map(escapeHtml).join(" · ");
        return `
          <tr class="${bajo ? "is-low" : ""}">
            <td class="cell-item" data-label="Tela">
              <div class="item-cell">
                <span class="item-swatch" style="background:${escapeHtml(m.color || "#eceef6")}" title="${escapeHtml(nombreColor(m.color))}"></span>
                <span>
                  <span class="item-name">${escapeHtml(m.nombre)}</span>
                  <span class="item-code">${escapeHtml(m.id_materia)} · ${escapeHtml(nombreColor(m.color) || "Sin color")}</span>
                </span>
              </div>
            </td>
            <td data-label="Proveedor">${m.proveedor ? escapeHtml(m.proveedor) : '<span class="cell-muted">Sin proveedor</span>'}</td>
            <td data-label="Composición">${detalle || '<span class="cell-muted">—</span>'}</td>
            <td class="num" data-label="Cantidad">${formatoNumero(m.cantidad)} ${escapeHtml(unidad)}</td>
            <td class="num" data-label="Precios">${celdaPrecios(m.precios)}</td>
            <td data-label="Stock">
              <span class="badge ${bajo ? "badge-low" : "badge-ok"}">${bajo ? "Bajo" : "Disponible"}</span>
              <span class="cell-sub">Mín. ${formatoNumero(m.stock_minimo)} ${escapeHtml(unidad)}</span>
            </td>
            <td class="cell-actions" data-label="Acciones">
              <div class="row-actions">
                <button type="button" class="action-btn" data-accion="editar" data-id="${escapeHtml(m.id_materia)}" aria-label="Editar ${escapeHtml(m.nombre)}">Editar</button>
                <button type="button" class="action-btn is-danger" data-accion="eliminar" data-id="${escapeHtml(m.id_materia)}" aria-label="Eliminar ${escapeHtml(m.nombre)}">Eliminar</button>
              </div>
            </td>
          </tr>`;
      })
      .join("");

    if (materias.length === 0) {
      mostrarVacio(vacio, "Aún no tienes telas registradas", "Usa “Agregar materia prima” para registrar tus telas con su color, composición y precios.");
      $("mat-showing").textContent = "";
    } else if (lista.length === 0) {
      mostrarVacio(vacio, "Sin resultados", "Ninguna tela coincide con la búsqueda.");
      $("mat-showing").textContent = `0 de ${materias.length} telas`;
    } else {
      $("mat-showing").textContent = `Mostrando ${lista.length} de ${materias.length} telas`;
    }
  }

  $("mat-buscar").addEventListener("input", render);
  $("mat-solo-bajo").addEventListener("change", render);

  tbody.addEventListener("click", (event) => {
    const boton = event.target.closest("[data-accion]");
    const materia = boton && materias.find((m) => m.id_materia === boton.dataset.id);
    if (!materia) return;
    if (boton.dataset.accion === "editar") abrirEdicion(materia);
    else eliminar(materia);
  });

  /* ---------- Formulario ---------- */

  ["mat-cantidad", "mat-stock", "mat-nombre", "mat-composicion", "mat-tejido", "mat-descripcion", "mat-proveedor"].forEach((id) =>
    $(id).addEventListener("input", () => mostrarError(id, "")),
  );

  // El código es la llave primaria: se valida que no exista al salir del campo
  idInput.addEventListener("input", () => {
    idInput.classList.remove("is-ok");
    mostrarError("mat-id", "");
  });

  idInput.addEventListener("blur", async () => {
    if (editando || !idInput.value.trim()) return;
    const codigo = normalizarCodigo(idInput.value);
    idInput.value = codigo;
    if (!CODIGO_RE.test(codigo)) return mostrarError("mat-id", "Usa letras, números y guiones, máximo 30. Ej: TEL-001");
    try {
      const { existe } = await api(`/materias-primas/existe?id=${encodeURIComponent(codigo)}`);
      if (idInput.value !== codigo) return;
      if (existe) mostrarError("mat-id", `El código ${codigo} ya está registrado. Usa otro.`);
      else idInput.classList.add("is-ok");
    } catch {
      // Sin conexión: el servidor vuelve a validar al guardar
    }
  });

  function prepararFormulario() {
    form.reset();
    limpiarErrores(form);
    idInput.classList.remove("is-ok");
    selectorColor.cerrar(false);
  }

  function abrirNuevo() {
    editando = null;
    prepararFormulario();
    refrescarSelectProveedores();
    precios.fijar([]);
    selectorColor.fijar("");
    idInput.disabled = false;
    $("mat-id-hint").textContent = "Código único. Letras, números y guiones.";
    $("mat-drawer-title").textContent = "Nueva materia prima";
    guardarBtn.textContent = "Guardar materia prima";
    drawer.showModal();
    idInput.focus();
  }

  function abrirEdicion(materia) {
    editando = materia;
    prepararFormulario();
    refrescarSelectProveedores(materia.id_vinculado, materia.proveedor);
    precios.fijar(materia.precios);
    idInput.value = materia.id_materia;
    idInput.disabled = true;
    $("mat-id-hint").textContent = "El código no se puede cambiar.";
    $("mat-nombre").value = materia.nombre;
    $("mat-cantidad").value = Number(materia.cantidad);
    if (![...unidadSelect.options].some((o) => o.value === materia.unidad_medida)) {
      unidadSelect.add(new Option(`${materia.unidad_medida} (anterior)`, materia.unidad_medida));
    }
    unidadSelect.value = materia.unidad_medida;
    $("mat-stock").value = Number(materia.stock_minimo);
    $("mat-composicion").value = materia.composicion || "";
    $("mat-tejido").value = materia.tipo_tejido || "";
    $("mat-descripcion").value = materia.descripcion || "";
    selectorColor.fijar(materia.color);
    $("mat-drawer-title").textContent = `Editar ${materia.nombre}`;
    guardarBtn.textContent = "Guardar cambios";
    drawer.showModal();
    $("mat-nombre").focus();
  }

  function validar(datos) {
    const errores = {};
    if (!editando && !CODIGO_RE.test(datos.id_materia)) errores["mat-id"] = "Usa letras, números y guiones, máximo 30. Ej: TEL-001";
    if (datos.nombre.length < 2) errores["mat-nombre"] = "Escribe el nombre de la tela.";
    if (!datos.color) errores["mat-color"] = "Elige un color de la paleta.";
    if (datos.cantidad === null) errores["mat-cantidad"] = "Escribe una cantidad válida (0 o más).";
    if (datos.stock_minimo === null) errores["mat-stock"] = "Escribe el stock mínimo (0 o más).";
    return errores;
  }

  function mostrarErrores(errores) {
    Object.entries(errores).forEach(([id, mensaje]) => {
      if (id === "mat-precios") precios.mostrarError(mensaje);
      else mostrarError(id, mensaje, id === "mat-color" ? colorBtn : undefined);
    });
    const primero = Object.keys(errores)[0];
    const foco = { "mat-color": colorBtn, "mat-precios": precios.primerCampo() }[primero] || $(primero);
    foco?.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    limpiarErrores(form);
    selectorColor.cerrar(false);

    const datos = {
      id_materia: normalizarCodigo(idInput.value),
      nombre: $("mat-nombre").value.trim(),
      id_vinculado: proveedorSelect.value,
      cantidad: leerNumero($("mat-cantidad").value),
      unidad_medida: unidadSelect.value,
      stock_minimo: leerNumero($("mat-stock").value),
      color: selectorColor.valor(),
      composicion: $("mat-composicion").value.trim(),
      tipo_tejido: $("mat-tejido").value.trim(),
      descripcion: $("mat-descripcion").value.trim(),
    };
    const errores = validar(datos);
    const listaPrecios = precios.leer();
    if (listaPrecios.error) errores["mat-precios"] = listaPrecios.error;
    if (Object.keys(errores).length > 0) return mostrarErrores(errores);
    datos.precios = listaPrecios.precios;

    guardarBtn.disabled = true;
    const textoBoton = guardarBtn.textContent;
    guardarBtn.textContent = "Guardando…";
    try {
      const ruta = editando ? `/materias-primas/${encodeURIComponent(editando.id_materia)}` : "/materias-primas";
      const { materia, alerta } = await api(ruta, { method: editando ? "PUT" : "POST", body: JSON.stringify(datos) });
      drawer.close();
      if (alerta) avisarAlerta(materia.nombre);
      else avisar(editando ? `Se guardaron los cambios de ${materia.nombre}.` : `${materia.nombre} se agregó al inventario.`);
      await cargar();
    } catch (error) {
      if (error.errores) {
        mostrarErrores(Object.fromEntries(Object.entries(error.errores).map(([campo, mensaje]) => [CAMPOS[campo] || campo, mensaje])));
      }
      avisar(error.message);
    } finally {
      guardarBtn.disabled = false;
      guardarBtn.textContent = textoBoton;
    }
  });

  prepararDrawer(drawer, () => {
    editando = null;
    selectorColor.cerrar(false);
  });

  // Esc con la paleta abierta cierra solo la paleta, no el panel
  drawer.addEventListener("cancel", (event) => {
    if (selectorColor.estaAbierto()) {
      event.preventDefault();
      selectorColor.cerrar();
    }
  });

  /* ---------- Eliminar ---------- */

  async function eliminar(materia) {
    const ok = await confirmar({
      titulo: "¿Eliminar materia prima?",
      texto: `Se eliminará ${materia.nombre} (${materia.id_materia}) del inventario. Esta acción no se puede deshacer.`,
      aviso: "También se borran sus precios y alertas de stock. Los eventos del calendario que la mencionen se conservan.",
    });
    if (!ok) return;
    try {
      await api(`/materias-primas/${encodeURIComponent(materia.id_materia)}`, { method: "DELETE" });
      avisar(`${materia.nombre} fue eliminada.`);
    } catch (error) {
      avisar(error.message);
    }
    await cargar();
  }

  /* ---------- Exportar ---------- */

  const columnas = [
    ["Código", (m) => m.id_materia],
    ["Nombre", (m) => m.nombre],
    ["Color", (m) => nombreColor(m.color)],
    ["Proveedor", (m) => m.proveedor || ""],
    ["Composición", (m) => m.composicion || ""],
    ["Tipo de tejido", (m) => m.tipo_tejido || ""],
    ["Cantidad", (m) => Number(m.cantidad)],
    ["Unidad", (m) => m.unidad_medida],
    ["Precios", (m) => textoPrecios(m.precios)],
    ["Stock mínimo", (m) => Number(m.stock_minimo)],
    ["Estado", (m) => (estaBajo(m.cantidad, m.stock_minimo) ? "Bajo stock" : "Disponible")],
    ["Descripción", (m) => m.descripcion || ""],
  ];

  return {
    cargar: () => Promise.all([cargar(), cargarProveedores()]),
    estaCargado: () => cargado,
    abrirNuevo,
    exportable: () => ({
      titulo: "Materia prima",
      archivo: "materia-prima",
      filas: visibles(),
      columnas,
    }),
  };
}
