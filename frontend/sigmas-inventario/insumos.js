// Pestaña Insumos: listado, filtros, agregar, editar y eliminar
import {
  api,
  urlArchivo,
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
import { crearEditorPrecios, textoPrecios } from "./editor-precios.js";
import { cargarTallasUsadas, conectarTalla, recordarTalla } from "../sigmas-comun/tallas.js";

const NUEVA = "__nueva__";
const $ = (id) => document.getElementById(id);

// Campo del servidor → id del control en el formulario
const CAMPOS = {
  id_insumo: "ins-id",
  categoria: "ins-categoria",
  nombre: "ins-nombre",
  id_vinculado: "ins-proveedor",
  talla: "ins-talla",
  cantidad: "ins-cantidad",
  stock_minimo: "ins-stock",
  precios: "ins-precios",
  foto: "ins-foto",
};

export function crearInsumos({ alCambiarConteo }) {
  const drawer = $("drawer-insumo");
  const form = $("form-insumo");
  const categoriaSelect = $("ins-categoria");
  const proveedorSelect = $("ins-proveedor");
  const idInput = $("ins-id");
  const guardarBtn = $("ins-guardar");
  const tbody = $("ins-body");
  const vacio = $("ins-empty");
  const precios = crearEditorPrecios({ prefijo: "ins", tipo: "insumo" });
  const talla = conectarTalla($("ins-talla"));
  cargarTallasUsadas(api).then(talla.refrescar);

  let insumos = [];
  let categorias = [];
  let proveedores = [];
  let filtroCategoria = "";
  let editando = null; // insumo que se está editando
  let fotoNueva = null; // imagen en base64 lista para subir
  let quitarFoto = false;
  let cargado = false;

  /* ---------- Datos ---------- */

  async function cargar() {
    try {
      [insumos, categorias] = await Promise.all([api("/insumos"), api("/insumos/categorias")]);
      cargado = true;
      if (filtroCategoria && !insumos.some((i) => i.categoria === filtroCategoria)) filtroCategoria = "";
      render();
    } catch (error) {
      insumos = [];
      tbody.innerHTML = "";
      mostrarVacio(vacio, "No se pudo cargar el inventario", error.message, true);
    }
    alCambiarConteo(insumos.length);
  }

  async function cargarProveedores() {
    try {
      proveedores = await api("/vinculados?tipo=Proveedor&tipo_inventario=Insumo");
      renderProveedores($("ins-prov-grid"), $("ins-prov-count"), proveedores, "Insumo");
    } catch (error) {
      proveedores = [];
      $("ins-prov-grid").innerHTML = `<p class="providers-empty">${escapeHtml(error.message)}</p>`;
    }
    $("ins-stat-prov").textContent = proveedores.length;
  }

  /* ---------- Filtro de categorías (desplegable) ---------- */

  const catBtn = $("ins-cat-btn");
  const catLista = $("ins-cat-list");

  function opcionesCategoria() {
    const enUso = [...new Set(insumos.map((i) => i.categoria))].sort((a, b) => a.localeCompare(b, "es"));
    return [["", "Todas las categorías", insumos.length], ...enUso.map((c) => [c, c, insumos.filter((i) => i.categoria === c).length])];
  }

  function renderFiltroCategoria() {
    $("ins-cat-label").textContent = filtroCategoria || "Todas";
    catBtn.classList.toggle("is-filtered", Boolean(filtroCategoria));
    catLista.innerHTML = opcionesCategoria()
      .map(
        ([valor, texto, cantidad], i) =>
          `<li role="option" id="ins-cat-op-${i}" data-categoria="${escapeHtml(valor)}" aria-selected="${valor === filtroCategoria}">
            ${escapeHtml(texto)} <span>${cantidad}</span></li>`,
      )
      .join("");
  }

  function abrirFiltro(abrir) {
    catLista.hidden = !abrir;
    catBtn.setAttribute("aria-expanded", String(abrir));
    if (abrir) {
      renderFiltroCategoria();
      const actual = catLista.querySelector('[aria-selected="true"]') || catLista.firstElementChild;
      enfocarOpcion(actual);
      catLista.focus();
    }
  }

  function enfocarOpcion(opcion) {
    catLista.querySelectorAll(".is-focused").forEach((o) => o.classList.remove("is-focused"));
    if (!opcion) return;
    opcion.classList.add("is-focused");
    catLista.setAttribute("aria-activedescendant", opcion.id);
    opcion.scrollIntoView({ block: "nearest" });
  }

  function elegirCategoria(opcion) {
    filtroCategoria = opcion.dataset.categoria;
    abrirFiltro(false);
    catBtn.focus();
    render();
  }

  catBtn.addEventListener("click", () => abrirFiltro(catLista.hidden));
  catLista.addEventListener("click", (event) => {
    const opcion = event.target.closest("[role=option]");
    if (opcion) elegirCategoria(opcion);
  });
  catLista.addEventListener("keydown", (event) => {
    const opciones = [...catLista.querySelectorAll("[role=option]")];
    const i = opciones.findIndex((o) => o.classList.contains("is-focused"));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      enfocarOpcion(opciones[Math.min(opciones.length - 1, Math.max(0, i + (event.key === "ArrowDown" ? 1 : -1)))]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (opciones[i]) elegirCategoria(opciones[i]);
    } else if (event.key === "Escape" || event.key === "Tab") {
      abrirFiltro(false);
      if (event.key === "Escape") catBtn.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!catLista.hidden && !event.target.closest("#ins-cat")) abrirFiltro(false);
  });


  // Trae otra vez los proveedores al abrir el formulario: pudieron registrarse en Vinculados
  // después de abrir esta página
  function refrescarSelectProveedores(seleccion = "", nombreActual = "") {
    llenarSelectProveedores(proveedorSelect, $("ins-proveedor-hint"), proveedores, "insumos", seleccion, nombreActual);
    cargarProveedores().then(() => {
      if (!drawer.open) return;
      llenarSelectProveedores(proveedorSelect, $("ins-proveedor-hint"), proveedores, "insumos", proveedorSelect.value || seleccion, nombreActual);
    });
  }

  /* ---------- Listado ---------- */

  function visibles() {
    const q = sinTildes($("ins-buscar").value.trim());
    const soloBajo = $("ins-solo-bajo").checked;
    return insumos.filter((i) => {
      if (filtroCategoria && i.categoria !== filtroCategoria) return false;
      if (soloBajo && !estaBajo(i.cantidad, i.stock_minimo)) return false;
      if (!q) return true;
      return [i.id_insumo, i.nombre, i.categoria, i.talla, i.proveedor].some((campo) => sinTildes(campo).includes(q));
    });
  }

  function renderStats() {
    const bajos = insumos.filter((i) => estaBajo(i.cantidad, i.stock_minimo)).length;
    $("ins-stat-total").textContent = formatoNumero(insumos.length);
    $("ins-stat-bajo").textContent = bajos;
    $("ins-stat-bajo").closest(".stat-card").classList.toggle("has-items", bajos > 0);
    $("ins-stat-categorias").textContent = new Set(insumos.map((i) => i.categoria)).size;
  }

  function miniatura(insumo) {
    if (insumo.foto) return `<img class="item-thumb" src="${escapeHtml(urlArchivo(insumo.foto))}" alt="" loading="lazy" />`;
    return `<span class="item-thumb" aria-hidden="true">${escapeHtml(insumo.nombre.slice(0, 2).toUpperCase())}</span>`;
  }

  function celdaPrecios(lista = []) {
    if (lista.length === 0) return '<span class="cell-muted">—</span>';
    const [principal, ...otros] = lista;
    return `<span class="price-list-cell"><strong>${escapeHtml(textoPrecios([principal]))}</strong>${
      otros.length ? `<small>${escapeHtml(textoPrecios(otros))}</small>` : ""
    }</span>`;
  }

  function render() {
    renderStats();
    renderFiltroCategoria();
    const lista = visibles();
    vacio.hidden = true;

    tbody.innerHTML = lista
      .map((i) => {
        const bajo = estaBajo(i.cantidad, i.stock_minimo);
        return `
          <tr class="${bajo ? "is-low" : ""}">
            <td class="cell-item" data-label="Insumo">
              <div class="item-cell">
                ${miniatura(i)}
                <span><span class="item-name">${escapeHtml(i.nombre)}</span><span class="item-code">${escapeHtml(i.id_insumo)}</span></span>
              </div>
            </td>
            <td data-label="Categoría"><span class="badge badge-cat">${escapeHtml(i.categoria)}</span></td>
            <td data-label="Talla">${i.talla ? escapeHtml(i.talla) : '<span class="cell-muted">—</span>'}</td>
            <td data-label="Proveedor">${i.proveedor ? escapeHtml(i.proveedor) : '<span class="cell-muted">Sin proveedor</span>'}</td>
            <td class="num" data-label="Cantidad">${formatoNumero(i.cantidad)}</td>
            <td class="num" data-label="Precios">${celdaPrecios(i.precios)}</td>
            <td data-label="Stock">
              <span class="badge ${bajo ? "badge-low" : "badge-ok"}">${bajo ? "Bajo" : "Disponible"}</span>
              <span class="cell-sub">Mín. ${formatoNumero(i.stock_minimo)}</span>
            </td>
            <td class="cell-actions" data-label="Acciones">
              <div class="row-actions">
                <button type="button" class="action-btn" data-accion="editar" data-id="${escapeHtml(i.id_insumo)}" aria-label="Editar ${escapeHtml(i.nombre)}">Editar</button>
                <button type="button" class="action-btn is-danger" data-accion="eliminar" data-id="${escapeHtml(i.id_insumo)}" aria-label="Eliminar ${escapeHtml(i.nombre)}">Eliminar</button>
              </div>
            </td>
          </tr>`;
      })
      .join("");

    if (insumos.length === 0) {
      mostrarVacio(vacio, "Aún no tienes insumos", "Usa “Agregar insumo” para registrar botones, cierres, cintas, marquillas y más.");
      $("ins-showing").textContent = "";
    } else if (lista.length === 0) {
      mostrarVacio(vacio, "Sin resultados", "Ningún insumo coincide con la búsqueda o los filtros.");
      $("ins-showing").textContent = `0 de ${insumos.length} insumos`;
    } else {
      $("ins-showing").textContent = `Mostrando ${lista.length} de ${insumos.length} insumos`;
    }
  }

  $("ins-buscar").addEventListener("input", render);
  $("ins-solo-bajo").addEventListener("change", render);

  tbody.addEventListener("click", (event) => {
    const boton = event.target.closest("[data-accion]");
    const insumo = boton && insumos.find((i) => i.id_insumo === boton.dataset.id);
    if (!insumo) return;
    if (boton.dataset.accion === "editar") abrirEdicion(insumo);
    else eliminar(insumo);
  });

  /* ---------- Formulario ---------- */

  function llenarCategorias(seleccion = "") {
    const opciones = [...categorias];
    if (seleccion && !opciones.includes(seleccion)) opciones.push(seleccion);
    categoriaSelect.innerHTML =
      '<option value="" disabled>Elige una categoría</option>' +
      opciones.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("") +
      `<option value="${NUEVA}">＋ Nueva categoría…</option>`;
    categoriaSelect.value = seleccion;
  }

  function categoriaElegida() {
    return categoriaSelect.value === NUEVA ? $("ins-nueva-categoria").value.trim() : categoriaSelect.value;
  }

  // La talla solo se pide para marquillas
  function actualizarCampos() {
    $("ins-nueva-cat-field").hidden = categoriaSelect.value !== NUEVA;
    $("ins-talla-field").hidden = !sinTildes(categoriaElegida()).startsWith("marquilla");
  }

  categoriaSelect.addEventListener("change", () => {
    mostrarError("ins-categoria", "");
    actualizarCampos();
    if (categoriaSelect.value === NUEVA) $("ins-nueva-categoria").focus();
  });
  $("ins-nueva-categoria").addEventListener("input", () => {
    mostrarError("ins-nueva-categoria", "");
    actualizarCampos();
  });
  ["ins-cantidad", "ins-stock", "ins-nombre", "ins-talla", "ins-proveedor"].forEach((id) =>
    $(id).addEventListener("input", () => mostrarError(id, "")),
  );

  // El código es la llave primaria: se valida que no exista al salir del campo
  idInput.addEventListener("input", () => {
    idInput.classList.remove("is-ok");
    mostrarError("ins-id", "");
  });

  idInput.addEventListener("blur", async () => {
    if (editando || !idInput.value.trim()) return;
    const codigo = normalizarCodigo(idInput.value);
    idInput.value = codigo;
    if (!CODIGO_RE.test(codigo)) return mostrarError("ins-id", "Usa letras, números y guiones, máximo 30. Ej: INS-001");
    try {
      const { existe } = await api(`/insumos/existe?id=${encodeURIComponent(codigo)}`);
      if (idInput.value !== codigo) return;
      if (existe) mostrarError("ins-id", `El código ${codigo} ya está registrado. Usa otro.`);
      else idInput.classList.add("is-ok");
    } catch {
      // Sin conexión: el servidor vuelve a validar al guardar
    }
  });

  /* ---------- Foto ---------- */

  const drop = $("ins-foto-drop");
  const archivoInput = $("ins-foto");

  function mostrarFoto(src) {
    $("ins-foto-preview").src = src || "";
    $("ins-foto-preview").hidden = !src;
    $("ins-foto-empty").hidden = Boolean(src);
    drop.classList.toggle("has-photo", Boolean(src));
    $("ins-foto-quitar").hidden = !src;
    $("ins-foto-elegir").textContent = src ? "Cambiar foto" : "Elegir foto";
  }

  // Reduce la imagen a máximo 900 px para que suba rápido
  function prepararImagen(archivo) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return reject(new Error("La foto debe ser JPG, PNG o WEBP."));
      if (archivo.size > 15 * 1024 * 1024) return reject(new Error("La foto es demasiado grande (máximo 15 MB)."));
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, 900 / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * escala);
        canvas.height = Math.round(img.height * escala);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("No se pudo leer la imagen."));
      };
      img.src = url;
    });
  }

  async function usarArchivo(archivo) {
    if (!archivo) return;
    mostrarError("ins-foto", "", drop);
    try {
      fotoNueva = await prepararImagen(archivo);
      quitarFoto = false;
      mostrarFoto(fotoNueva);
    } catch (error) {
      mostrarError("ins-foto", error.message, drop);
    }
  }

  drop.addEventListener("click", () => archivoInput.click());
  drop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      archivoInput.click();
    }
  });
  $("ins-foto-elegir").addEventListener("click", () => archivoInput.click());
  archivoInput.addEventListener("change", () => {
    usarArchivo(archivoInput.files[0]);
    archivoInput.value = "";
  });
  ["dragenter", "dragover"].forEach((tipo) =>
    drop.addEventListener(tipo, (event) => {
      event.preventDefault();
      drop.classList.add("is-dragging");
    }),
  );
  ["dragleave", "drop"].forEach((tipo) => drop.addEventListener(tipo, () => drop.classList.remove("is-dragging")));
  drop.addEventListener("drop", (event) => {
    event.preventDefault();
    usarArchivo(event.dataTransfer.files[0]);
  });
  $("ins-foto-quitar").addEventListener("click", () => {
    fotoNueva = null;
    quitarFoto = Boolean(editando?.foto);
    mostrarFoto("");
  });

  /* ---------- Abrir / guardar ---------- */

  function prepararFormulario() {
    form.reset();
    talla.fijar("");
    limpiarErrores(form);
    idInput.classList.remove("is-ok");
    fotoNueva = null;
    quitarFoto = false;
  }

  function abrirNuevo() {
    editando = null;
    prepararFormulario();
    llenarCategorias(filtroCategoria);
    refrescarSelectProveedores();
    precios.fijar([]);
    idInput.disabled = false;
    $("ins-id-hint").textContent = "Código único. Letras, números y guiones.";
    $("ins-drawer-title").textContent = "Nuevo insumo";
    guardarBtn.textContent = "Guardar insumo";
    mostrarFoto("");
    actualizarCampos();
    drawer.showModal();
    categoriaSelect.value ? idInput.focus() : categoriaSelect.focus();
  }

  function abrirEdicion(insumo) {
    editando = insumo;
    prepararFormulario();
    llenarCategorias(insumo.categoria);
    refrescarSelectProveedores(insumo.id_vinculado, insumo.proveedor);
    precios.fijar(insumo.precios);
    idInput.value = insumo.id_insumo;
    idInput.disabled = true;
    $("ins-id-hint").textContent = "El código no se puede cambiar.";
    $("ins-nombre").value = insumo.nombre;
    talla.fijar(insumo.talla);
    $("ins-cantidad").value = Number(insumo.cantidad);
    $("ins-stock").value = Number(insumo.stock_minimo);
    $("ins-drawer-title").textContent = `Editar ${insumo.nombre}`;
    guardarBtn.textContent = "Guardar cambios";
    mostrarFoto(urlArchivo(insumo.foto));
    actualizarCampos();
    drawer.showModal();
    $("ins-nombre").focus();
  }

  function validar(datos) {
    const errores = {};
    if (!datos.categoria) {
      if (categoriaSelect.value === NUEVA) errores["ins-nueva-categoria"] = "Escribe el nombre de la nueva categoría.";
      else errores["ins-categoria"] = "Elige una categoría.";
    }
    if (!editando && !CODIGO_RE.test(datos.id_insumo)) errores["ins-id"] = "Usa letras, números y guiones, máximo 30. Ej: INS-001";
    if (datos.nombre.length < 2) errores["ins-nombre"] = "Escribe el nombre del insumo.";
    if (datos.cantidad === null) errores["ins-cantidad"] = "Escribe una cantidad válida (0 o más).";
    if (datos.stock_minimo === null) errores["ins-stock"] = "Escribe el stock mínimo (0 o más).";
    return errores;
  }

  function mostrarErrores(errores) {
    Object.entries(errores).forEach(([id, mensaje]) => {
      if (id === "ins-precios") precios.mostrarError(mensaje);
      else mostrarError(id, mensaje, id === "ins-foto" ? drop : undefined);
    });
    const primero = Object.keys(errores)[0];
    const foco = { "ins-foto": drop, "ins-precios": precios.primerCampo() }[primero] || $(primero);
    foco?.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    limpiarErrores(form);

    const datos = {
      id_insumo: normalizarCodigo(idInput.value),
      categoria: categoriaElegida(),
      nombre: $("ins-nombre").value.trim(),
      id_vinculado: proveedorSelect.value,
      talla: $("ins-talla-field").hidden ? "" : $("ins-talla").value.trim(),
      cantidad: leerNumero($("ins-cantidad").value),
      stock_minimo: leerNumero($("ins-stock").value),
    };
    const errores = validar(datos);
    const listaPrecios = precios.leer();
    if (listaPrecios.error) errores["ins-precios"] = listaPrecios.error;
    if (Object.keys(errores).length > 0) return mostrarErrores(errores);
    datos.precios = listaPrecios.precios;
    if (fotoNueva) datos.foto_base64 = fotoNueva;
    if (quitarFoto) datos.quitar_foto = true;

    guardarBtn.disabled = true;
    const textoBoton = guardarBtn.textContent;
    guardarBtn.textContent = "Guardando…";
    try {
      const ruta = editando ? `/insumos/${encodeURIComponent(editando.id_insumo)}` : "/insumos";
      const { insumo, alerta } = await api(ruta, { method: editando ? "PUT" : "POST", body: JSON.stringify(datos) });
      drawer.close();
      recordarTalla(insumo.talla);
      if (alerta) avisarAlerta(insumo.nombre);
      else avisar(editando ? `Se guardaron los cambios de ${insumo.nombre}.` : `${insumo.nombre} se agregó al inventario.`);
      await cargar();
    } catch (error) {
      if (error.errores) {
        mostrarErrores(
          Object.fromEntries(
            Object.entries(error.errores).map(([campo, mensaje]) => [
              campo === "categoria" && categoriaSelect.value === NUEVA ? "ins-nueva-categoria" : CAMPOS[campo] || campo,
              mensaje,
            ]),
          ),
        );
      }
      avisar(error.message);
    } finally {
      guardarBtn.disabled = false;
      guardarBtn.textContent = textoBoton;
    }
  });

  prepararDrawer(drawer, () => {
    editando = null;
    fotoNueva = null;
  });

  /* ---------- Eliminar ---------- */

  async function eliminar(insumo) {
    const ok = await confirmar({
      titulo: "¿Eliminar insumo?",
      texto: `Se eliminará ${insumo.nombre} (${insumo.id_insumo}) del inventario. Esta acción no se puede deshacer.`,
      aviso: "También se borran sus precios y alertas de stock. Los eventos del calendario que lo mencionen se conservan.",
    });
    if (!ok) return;
    try {
      await api(`/insumos/${encodeURIComponent(insumo.id_insumo)}`, { method: "DELETE" });
      avisar(`${insumo.nombre} fue eliminado.`);
    } catch (error) {
      avisar(error.message);
    }
    await cargar();
  }

  /* ---------- Exportar ---------- */

  const columnas = [
    ["Código", (i) => i.id_insumo],
    ["Nombre", (i) => i.nombre],
    ["Categoría", (i) => i.categoria],
    ["Talla", (i) => i.talla || ""],
    ["Proveedor", (i) => i.proveedor || ""],
    ["Cantidad", (i) => Number(i.cantidad)],
    ["Precios", (i) => textoPrecios(i.precios)],
    ["Stock mínimo", (i) => Number(i.stock_minimo)],
    ["Estado", (i) => (estaBajo(i.cantidad, i.stock_minimo) ? "Bajo stock" : "Disponible")],
  ];

  return {
    cargar: () => Promise.all([cargar(), cargarProveedores()]),
    estaCargado: () => cargado,
    abrirNuevo,
    exportable: () => ({
      titulo: filtroCategoria ? `Insumos · ${filtroCategoria}` : "Insumos",
      archivo: filtroCategoria ? `insumos-${sinTildes(filtroCategoria).replace(/\s+/g, "-")}` : "insumos",
      filas: visibles(),
      columnas,
    }),
  };
}
