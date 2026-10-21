// Utilidades compartidas por las pestañas de Inventario

// Fotos guardadas en el servidor (o en Google)
export function urlArchivo(ruta) {
  return SigmaSesion.archivo(ruta);
}

// Llama al API con el token de la sesión y lanza un error con los mensajes del servidor si algo sale mal
export async function api(ruta, opciones = {}) {
  let res;
  try {
    res = await SigmaSesion.fetch(`/api${ruta}`, {
      ...opciones,
      headers: { "Content-Type": "application/json", ...(opciones.headers || {}) },
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Verifica que el backend esté encendido (npm run dev).");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || "El servidor no pudo completar la acción.");
    error.status = res.status;
    error.errores = data.errores;
    throw error;
  }
  return data;
}

/* ---------- Formatos ---------- */

const pesos = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const numeros = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

export function formatoPesos(valor) {
  return "$" + pesos.format(Math.round(Number(valor) || 0));
}

export function formatoNumero(valor) {
  return numeros.format(Number(valor) || 0);
}

// Acepta coma o punto decimal; devuelve null si no es un número válido
export function leerNumero(texto) {
  const limpio = String(texto ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (limpio === "") return null;
  const numero = Number(limpio);
  return Number.isFinite(numero) && numero >= 0 ? numero : null;
}

export function escapeHtml(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function sinTildes(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export const CODIGO_RE = /^[A-Z0-9][A-Z0-9_-]{0,29}$/;

export function normalizarCodigo(valor) {
  return String(valor ?? "").trim().toUpperCase().replace(/\s+/g, "-");
}

// Bajo stock: la cantidad llegó al mínimo definido
export function estaBajo(cantidad, minimo) {
  return Number(minimo) > 0 && Number(cantidad) <= Number(minimo);
}

/* ---------- Avisos ---------- */

const toast = document.getElementById("toast");
let toastTimer;

export function avisar(mensaje) {
  toast.textContent = mensaje;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3200);
}

// Al guardar algo que llegó al stock mínimo: aviso y actualización de la campana
export function avisarAlerta(nombre) {
  avisar(`⚠ ${nombre} llegó al stock mínimo. Quedó en tus alertas y se envió un aviso a tu correo.`);
  window.dispatchEvent(new Event("sigmas:alertas"));
}

/* ---------- Errores de formulario ---------- */

// Cada campo tiene un <p id="<campo>-error">; el control puede ser otro elemento (por ejemplo el botón de color)
export function mostrarError(id, mensaje, control = document.getElementById(id)) {
  const error = document.getElementById(`${id}-error`);
  if (error) {
    error.textContent = mensaje;
    error.hidden = !mensaje;
  }
  if (control) {
    control.classList.toggle("is-bad", Boolean(mensaje));
    if (mensaje) control.classList.remove("is-ok");
    control.setAttribute("aria-invalid", String(Boolean(mensaje)));
    if (mensaje) control.setAttribute("aria-describedby", `${id}-error`);
    else control.removeAttribute("aria-describedby");
  }
}

export function limpiarErrores(form) {
  form.querySelectorAll(".field-error").forEach((p) => {
    p.textContent = "";
    p.hidden = true;
  });
  form.querySelectorAll(".is-bad").forEach((el) => el.classList.remove("is-bad"));
  form.querySelectorAll("[aria-invalid]").forEach((el) => el.setAttribute("aria-invalid", "false"));
}

/* ---------- Panel lateral ---------- */

export function prepararDrawer(dialog, alCerrar) {
  dialog.querySelectorAll("[data-cerrar]").forEach((boton) => boton.addEventListener("click", () => dialog.close()));
  // Clic en el fondo oscuro cierra el panel
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", alCerrar);
}

/* ---------- Confirmación ---------- */

const confirmDialog = document.getElementById("confirm-dialog");

export async function confirmar({ titulo, texto, aviso = "" }) {
  document.getElementById("confirm-title").textContent = titulo;
  document.getElementById("confirm-text").textContent = texto;
  const avisoEl = document.getElementById("confirm-warning");
  avisoEl.textContent = aviso;
  avisoEl.hidden = !aviso;
  confirmDialog.returnValue = "";
  confirmDialog.showModal();
  await new Promise((resolve) => confirmDialog.addEventListener("close", resolve, { once: true }));
  return confirmDialog.returnValue === "eliminar";
}

/* ---------- Estado vacío ---------- */

export function mostrarVacio(contenedor, titulo, texto, esError = false) {
  contenedor.querySelector(".empty-title").textContent = titulo;
  contenedor.querySelector(".empty-text").textContent = texto;
  contenedor.classList.toggle("is-error", esError);
  contenedor.hidden = false;
}

/* ---------- Proveedores ---------- */

// Llena el <select> de proveedores. Conserva el actual aunque ya no sea de este tipo de inventario.
export function llenarSelectProveedores(select, ayuda, proveedores, tipoTexto, seleccion = "", nombreActual = "") {
  const opciones = proveedores.map((p) => [p.identificacion, `${p.nombre} · ${p.identificacion}`]);
  if (seleccion && !opciones.some(([id]) => id === seleccion)) opciones.push([seleccion, `${nombreActual || seleccion} · ${seleccion}`]);
  select.innerHTML =
    '<option value="">Elige un proveedor (opcional)</option>' +
    opciones.map(([id, texto]) => `<option value="${escapeHtml(id)}">${escapeHtml(texto)}</option>`).join("");
  select.value = seleccion || "";
  ayuda.innerHTML =
    proveedores.length === 0
      ? `Aún no tienes proveedores de ${tipoTexto}. <a class="link-btn" href="../sigmas-vinculados/vinculados.html">Regístralos en Vinculados</a>.`
      : `Proveedores de ${tipoTexto} registrados en Vinculados.`;
}

export function renderProveedores(grid, contador, proveedores, tipoInventario) {
  contador.textContent = proveedores.length;
  if (proveedores.length === 0) {
    grid.innerHTML = `<p class="providers-empty">Aún no tienes proveedores de ${tipoInventario.toLowerCase()}.
      <a href="../sigmas-vinculados/vinculados.html">Regístralos en Vinculados →</a></p>`;
    return;
  }
  grid.innerHTML = proveedores
    .map(
      (p) => `
        <article class="provider-card">
          <p class="provider-name">${escapeHtml(p.nombre)}</p>
          <p class="provider-id">${p.tipo_id === "NIT" ? "NIT" : "C.C."} ${escapeHtml(p.identificacion)}</p>
          ${p.contacto ? `<p class="provider-line">Tel. <a href="tel:${escapeHtml(p.contacto.replace(/[^\d+]/g, ""))}">${escapeHtml(p.contacto)}</a></p>` : ""}
          ${p.correo ? `<p class="provider-line"><a href="mailto:${escapeHtml(p.correo)}">${escapeHtml(p.correo)}</a></p>` : ""}
          ${p.ciudad ? `<p class="provider-line">${escapeHtml(p.ciudad)}${p.direccion ? ` · ${escapeHtml(p.direccion)}` : ""}</p>` : ""}
          ${p.actividad ? `<span class="provider-activity">${escapeHtml(p.actividad)}</span>` : ""}
        </article>`,
    )
    .join("");
}
