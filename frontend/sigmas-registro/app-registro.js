// Inicio de sesión, registro de la empresa y acceso con Google
const CLAVE_SESION = "sigmas-sesion";
const DASHBOARD = "../sigmas-dashboard/dashboard.html";
// La página y el API están en el mismo servidor (localhost:7000 o Render): se usa la misma dirección.
// Solo al abrir el front con Live Server (localhost en otro puerto) se apunta al backend local.
const enOtroPuertoLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port !== "7000";
const ORIGEN = window.location.protocol === "file:" || enOtroPuertoLocal ? "http://localhost:7000" : "";
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const $ = (id) => document.getElementById(id);
const toast = $("toast");
const notice = $("notice");
let toastTimer;

let fotoBase64 = null;
let logoBase64 = null;

/* ---------- Utilidades ---------- */

function avisar(mensaje) {
  toast.textContent = mensaje;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3500);
}

function mostrarAviso(mensaje, esError = false) {
  notice.textContent = mensaje;
  notice.classList.toggle("is-error", esError);
  notice.hidden = !mensaje;
}

function mostrarError(id, mensaje) {
  const error = $(`${id}-error`);
  const control = $(id);
  if (error) {
    error.textContent = mensaje;
    error.hidden = !mensaje;
  }
  if (control?.matches("input")) {
    control.classList.toggle("is-bad", Boolean(mensaje));
    control.setAttribute("aria-invalid", String(Boolean(mensaje)));
    if (mensaje) control.setAttribute("aria-describedby", `${id}-error`);
  }
}

function limpiarErrores(form) {
  form.querySelectorAll(".field-error").forEach((p) => {
    p.textContent = "";
    p.hidden = true;
  });
  form.querySelectorAll(".is-bad").forEach((el) => el.classList.remove("is-bad"));
}

function mostrarErrores(errores, mapa = {}) {
  const ids = Object.entries(errores).map(([campo, mensaje]) => {
    const id = mapa[campo] || campo;
    mostrarError(id, mensaje);
    return id;
  });
  $(ids[0])?.focus();
}

async function api(ruta, datos) {
  let res;
  try {
    res = await fetch(`${ORIGEN}/api/auth${ruta}`, {
      method: datos ? "POST" : "GET",
      headers: { "Content-Type": "application/json" },
      body: datos && JSON.stringify(datos),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Revisa tu internet o espera unos segundos e intenta de nuevo (el servidor puede estar despertando).");
  }
  const respuesta = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(respuesta.message || "No se pudo completar la acción."), { status: res.status, datos: respuesta });
  return respuesta;
}

// Guarda la sesión y abre el dashboard. Si faltan datos de la empresa (cuenta nueva con Google),
// el dashboard muestra el aviso "Completa el perfil de tu empresa"; no se obliga a llenarlo.
function entrar({ token, usuario }) {
  localStorage.setItem(CLAVE_SESION, JSON.stringify({ token, usuario }));
  window.location.replace(DASHBOARD);
}

async function conBoton(boton, texto, tarea) {
  const anterior = boton.textContent;
  boton.disabled = true;
  boton.textContent = texto;
  try {
    await tarea();
  } finally {
    boton.disabled = false;
    boton.textContent = anterior;
  }
}

/* ---------- Pestañas ---------- */

const tabs = { login: $("tab-login"), registro: $("tab-registro") };

function mostrarPestana(nombre, { enfocar = true } = {}) {
  Object.entries(tabs).forEach(([clave, tab]) => {
    const activa = clave === nombre;
    tab.classList.toggle("is-active", activa);
    tab.setAttribute("aria-selected", String(activa));
    tab.tabIndex = activa ? 0 : -1;
    $(tab.getAttribute("aria-controls")).hidden = !activa;
  });
  $("divider-text").textContent = nombre === "login" ? "o con el NIT de tu empresa" : "o completa los datos de tu empresa";
  history.replaceState(null, "", nombre === "registro" ? "#registro" : "#login");
  if (enfocar) $(nombre === "login" ? "login-nit" : "reg-nit").focus();
}

Object.entries(tabs).forEach(([clave, tab]) => {
  tab.addEventListener("click", () => mostrarPestana(clave));
  tab.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const otra = clave === "login" ? "registro" : "login";
      mostrarPestana(otra, { enfocar: false });
      tabs[otra].focus();
    }
  });
});
document.querySelectorAll("[data-ir]").forEach((boton) => boton.addEventListener("click", () => mostrarPestana(boton.dataset.ir)));

// Ver / ocultar contraseña
document.querySelectorAll("[data-ver]").forEach((boton) => {
  boton.addEventListener("click", () => {
    const input = $(boton.dataset.ver);
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    boton.textContent = visible ? "Ver" : "Ocultar";
    boton.setAttribute("aria-pressed", String(!visible));
    boton.setAttribute("aria-label", visible ? "Mostrar contraseña" : "Ocultar contraseña");
  });
});

/* ---------- NIT ---------- */

function digitoVerificacion(numero) {
  const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
  const suma = numero
    .split("")
    .reverse()
    .reduce((total, digito, i) => total + Number(digito) * pesos[i], 0);
  const residuo = suma % 11;
  return residuo > 1 ? 11 - residuo : residuo;
}

function normalizarNit(valor) {
  const partes = valor.replace(/[.\s]/g, "").match(/^(\d{8,10})-?(\d)$/);
  if (!partes) return { error: "Escribe el NIT con su dígito de verificación. Ej: 900123456-7" };
  const esperado = digitoVerificacion(partes[1]);
  if (esperado !== Number(partes[2])) return { error: `El dígito de verificación no corresponde. Para ${partes[1]} es ${esperado}.` };
  return { valor: `${partes[1]}-${partes[2]}` };
}

["login-nit", "reg-nit"].forEach((id) => {
  const input = $(id);
  input.addEventListener("input", () => {
    input.value = input.value.replace(/[^\d.-]/g, "");
    mostrarError(id, "");
  });
  input.addEventListener("blur", () => {
    if (!input.value.trim()) return;
    const nit = normalizarNit(input.value);
    if (nit.error) mostrarError(id, nit.error);
    else input.value = nit.valor;
  });
});

/* ---------- Iniciar sesión ---------- */

$("panel-login").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  limpiarErrores(form);
  mostrarAviso("");
  const nit = normalizarNit($("login-nit").value);
  const contrasena = $("login-clave").value;
  const errores = {};
  if (nit.error) errores["login-nit"] = nit.error;
  if (!contrasena) errores["login-clave"] = "Escribe tu contraseña.";
  if (Object.keys(errores).length) return mostrarErrores(errores);

  conBoton($("btn-login"), "Ingresando…", async () => {
    try {
      entrar(await api("/login", { nit: nit.valor, contrasena }));
    } catch (error) {
      mostrarAviso(error.message, true);
      $("login-clave").select();
    }
  });
});

/* ---------- Contraseña segura ---------- */

const REGLAS = {
  largo: (c) => c.length >= 8,
  letra: (c) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c),
  numero: (c) => /\d/.test(c),
  especial: (c) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s]/.test(c),
};

function revisarClave() {
  const clave = $("reg-clave").value;
  let cumplidas = 0;
  Object.entries(REGLAS).forEach(([nombre, regla]) => {
    const ok = regla(clave);
    if (ok) cumplidas++;
    document.querySelector(`[data-regla="${nombre}"]`).classList.toggle("is-ok", ok);
  });
  const barra = $("strength-bar");
  barra.style.width = `${(cumplidas / 4) * 100}%`;
  barra.style.background = cumplidas === 4 ? "var(--sig-success)" : cumplidas >= 2 ? "var(--sig-highlight)" : "var(--sig-danger)";
  return cumplidas === 4;
}

$("reg-clave").addEventListener("input", () => {
  revisarClave();
  mostrarError("reg-clave", "");
});
$("reg-confirmacion").addEventListener("input", () => mostrarError("reg-confirmacion", ""));
["reg-empresa", "reg-direccion", "reg-red", "reg-dueno", "reg-correo", "reg-telefono"].forEach((id) =>
  $(id).addEventListener("input", () => mostrarError(id, "")),
);

/* ---------- Logo y foto ---------- */

// Reduce la imagen a máximo 600 px; el logo conserva la transparencia (PNG)
function prepararImagen(archivo, comoPng) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return reject(new Error("La imagen debe ser JPG, PNG o WEBP."));
    if (archivo.size > 15 * 1024 * 1024) return reject(new Error("La imagen es demasiado grande (máximo 15 MB)."));
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 600 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext("2d");
      if (!comoPng) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(comoPng ? "image/png" : "image/jpeg", 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen."));
    };
    img.src = url;
  });
}

function prepararSubida(nombre, { comoPng, alCambiar }) {
  const boton = $(`${nombre}-btn`);
  const input = $(nombre);
  boton.addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const archivo = input.files[0];
    input.value = "";
    if (!archivo) return;
    mostrarError(nombre, "");
    try {
      const datos = await prepararImagen(archivo, comoPng);
      alCambiar(datos);
      mostrarImagen(nombre, datos);
    } catch (error) {
      mostrarError(nombre, error.message);
    }
  });
}

function mostrarImagen(nombre, src) {
  $(`${nombre}-preview`).src = src || "";
  $(`${nombre}-preview`).hidden = !src;
  $(`${nombre}-empty`).hidden = Boolean(src);
  $(`${nombre}-btn`).classList.toggle("has-image", Boolean(src));
}

prepararSubida("logo", { comoPng: true, alCambiar: (datos) => (logoBase64 = datos) });
prepararSubida("foto", { comoPng: false, alCambiar: (datos) => (fotoBase64 = datos) });

/* ---------- Crear cuenta ---------- */

const CAMPOS_REGISTRO = {
  nit: "reg-nit",
  nombre_empresa: "reg-empresa",
  direccion_empresa: "reg-direccion",
  red_social: "reg-red",
  nombre_dueno: "reg-dueno",
  correo: "reg-correo",
  telefono_contacto: "reg-telefono",
  contrasena: "reg-clave",
  confirmacion: "reg-confirmacion",
};

$("panel-registro").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  limpiarErrores(form);
  mostrarAviso("");

  const valor = (id) => $(id).value.trim();
  const datos = {
    nit: valor("reg-nit"),
    nombre_empresa: valor("reg-empresa"),
    direccion_empresa: valor("reg-direccion"),
    red_social: valor("reg-red"),
    nombre_dueno: valor("reg-dueno"),
    correo: valor("reg-correo").toLowerCase(),
    telefono_contacto: valor("reg-telefono"),
    contrasena: $("reg-clave").value,
    confirmacion: $("reg-confirmacion").value,
  };

  const errores = {};
  const nit = normalizarNit(datos.nit);
  if (nit.error) errores["reg-nit"] = nit.error;
  else datos.nit = nit.valor;
  if (datos.nombre_empresa.length < 2) errores["reg-empresa"] = "Escribe el nombre de la empresa.";
  if (!datos.direccion_empresa) errores["reg-direccion"] = "Escribe la dirección de la empresa.";
  if (datos.nombre_dueno.length < 3) errores["reg-dueno"] = "Escribe el nombre completo del dueño.";
  if (!CORREO_RE.test(datos.correo)) errores["reg-correo"] = "Escribe un correo válido.";
  if (datos.telefono_contacto && !/^[\d\s+()-]{7,20}$/.test(datos.telefono_contacto)) errores["reg-telefono"] = "Escribe un teléfono válido.";
  if (!revisarClave()) errores["reg-clave"] = "La contraseña debe tener mínimo 8 caracteres, letras, números y un carácter especial.";
  else if (datos.contrasena !== datos.confirmacion) errores["reg-confirmacion"] = "Las contraseñas no coinciden.";
  if (Object.keys(errores).length) return mostrarErrores(errores);

  if (fotoBase64) datos.foto_base64 = fotoBase64;
  if (logoBase64) datos.logo_base64 = logoBase64;

  conBoton($("btn-registro"), "Creando tu cuenta…", async () => {
    try {
      entrar(await api("/registro", datos));
    } catch (error) {
      if (error.datos?.errores) mostrarErrores(error.datos.errores, CAMPOS_REGISTRO);
      mostrarAviso(error.message, true);
    }
  });
});

/* ---------- Google ---------- */

// Con Google la cuenta se crea al instante (nombre, correo y foto de Google);
// si faltan los datos de la empresa, se abre el perfil para completarlos
async function alResponderGoogle({ credential }) {
  mostrarAviso("");
  try {
    entrar(await api("/google", { credential }));
  } catch (error) {
    mostrarAviso(error.message, true);
  }
}

async function iniciarGoogle() {
  let clienteId = "";
  try {
    ({ googleClientId: clienteId } = await api("/config"));
  } catch {
    // sin backend no hay Google
  }
  const sinGoogle = (mensaje) => {
    $("google-btn").hidden = true;
    $("google-fallback").hidden = false;
    $("google-fallback").disabled = true;
    $("google-hint").hidden = false;
    $("google-hint").textContent = mensaje;
  };
  if (!clienteId) return sinGoogle("El acceso con Google se activa cuando el administrador configure GOOGLE_CLIENT_ID.");

  // Espera a que cargue la librería de Google (se carga en paralelo)
  for (let i = 0; i < 50 && !window.google?.accounts?.id; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.google?.accounts?.id) return sinGoogle("No se pudo cargar el acceso con Google. Revisa tu conexión.");

  google.accounts.id.initialize({ client_id: clienteId, callback: alResponderGoogle, ux_mode: "popup" });
  google.accounts.id.renderButton($("google-btn"), {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    locale: "es",
    width: Math.min(400, $("google-btn").parentElement.clientWidth || 320),
  });
}

/* ---------- Inicio ---------- */

// Si ya hay sesión, va directo al dashboard
try {
  if (JSON.parse(localStorage.getItem(CLAVE_SESION) || "null")?.token) window.location.replace(DASHBOARD);
} catch {
  localStorage.removeItem(CLAVE_SESION);
}

if (new URLSearchParams(location.search).get("motivo") === "expirada") {
  mostrarAviso("Tu sesión terminó. Inicia sesión de nuevo.");
}
mostrarPestana(location.hash === "#registro" ? "registro" : "login", { enfocar: false });
iniciarGoogle();
