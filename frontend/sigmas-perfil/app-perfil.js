// Mi perfil: datos de la empresa y del dueño (los de Google llegan ya llenos) y contraseña
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const $ = (id) => document.getElementById(id);
const toast = $("toast");
let toastTimer;
let usuario = SigmaSesion.usuario;
let fotoBase64 = null;
let logoBase64 = null;
let quitarFoto = false;
let quitarLogo = false;

function avisar(mensaje) {
  toast.textContent = mensaje;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3500);
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

function mostrarErrores(errores) {
  Object.entries(errores).forEach(([id, mensaje]) => mostrarError(id, mensaje));
  $(Object.keys(errores)[0])?.focus();
}

async function enviar(ruta, metodo, datos) {
  let res;
  try {
    res = await SigmaSesion.fetch(`/api/auth${ruta}`, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
  } catch {
    throw new Error("No hay conexión con el servidor. Verifica que el backend esté encendido.");
  }
  const respuesta = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(respuesta.message || "No se pudo guardar."), { errores: respuesta.errores });
  return respuesta;
}

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

$("nit").addEventListener("input", () => {
  $("nit").value = $("nit").value.replace(/[^\d.-]/g, "");
  mostrarError("nit", "");
});
$("nit").addEventListener("blur", () => {
  if ($("nit").readOnly || !$("nit").value.trim()) return;
  const nit = normalizarNit($("nit").value);
  if (nit.error) mostrarError("nit", nit.error);
  else $("nit").value = nit.valor;
});

/* ---------- Pintar el perfil ---------- */

const CAMPOS = ["nombre_empresa", "direccion_empresa", "red_social", "nombre_dueno", "correo", "telefono_contacto"];

function iniciales(nombre) {
  return String(nombre || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

function mostrarImagen(nombre, src) {
  $(`${nombre}-preview`).src = src || "";
  $(`${nombre}-preview`).hidden = !src;
  $(`${nombre}-empty`).hidden = Boolean(src);
  $(`${nombre}-btn`).classList.toggle("has-image", Boolean(src));
  $(`${nombre}-quitar`).hidden = !src;
  $(`${nombre}-elegir`).textContent = src ? `Cambiar ${nombre}` : `Elegir ${nombre}`;
}

// Porcentaje de datos llenos (cuenta el NIT real, no la llave temporal de Google)
function actualizarProgreso() {
  const llenos = [
    !usuario.nit_temporal,
    ...CAMPOS.map((c) => Boolean(usuario[c])),
    Boolean(usuario.foto),
    Boolean(usuario.logo_empresa),
  ];
  const porcentaje = Math.round((llenos.filter(Boolean).length / llenos.length) * 100);
  $("progreso-texto").textContent = `${porcentaje}%`;
  $("progreso-barra").style.width = `${porcentaje}%`;
  $("progreso").setAttribute("aria-valuenow", porcentaje);
}

function pintarPerfil() {
  const foto = SigmaSesion.archivo(usuario.foto);
  $("hero-foto").innerHTML = foto ? `<img src="${foto}" alt="" referrerpolicy="no-referrer" />` : iniciales(usuario.nombre_dueno);
  $("hero-nombre").textContent = usuario.nombre_dueno || "Mi perfil";
  $("hero-kicker").textContent = usuario.nombre_empresa || "Empresa sin nombre";
  $("hero-correo").textContent = usuario.correo || "";
  $("hero-google").hidden = !usuario.con_google;

  CAMPOS.forEach((campo) => ($(campo).value = usuario[campo] || ""));

  // El NIT solo se escribe una vez (si la cuenta viene de Google)
  $("nit").value = usuario.nit_temporal ? "" : usuario.nit;
  $("nit").readOnly = !usuario.nit_temporal;
  $("nit-hint").textContent = usuario.nit_temporal
    ? "Con guion y dígito de verificación. Después de guardarlo no se puede cambiar."
    : "El NIT identifica a tu empresa y no se puede cambiar.";

  // Con Google el correo es el de la cuenta de Google
  $("correo").readOnly = Boolean(usuario.con_google);
  $("correo-hint").textContent = usuario.con_google
    ? "Es el correo de tu cuenta de Google. Aquí te llegan las alertas de stock."
    : "Aquí te llegan las alertas de stock.";

  // Resalta lo que falta
  ["nit", "nombre_empresa", "direccion_empresa"].forEach((id) => $(id).classList.toggle("is-missing", !$(id).value && !$(id).readOnly));

  fotoBase64 = logoBase64 = null;
  quitarFoto = quitarLogo = false;
  mostrarImagen("foto", foto);
  mostrarImagen("logo", SigmaSesion.archivo(usuario.logo_empresa));

  // Contraseña: crearla (Google) o cambiarla
  $("actual-field").hidden = !usuario.tiene_contrasena;
  $("clave-titulo").textContent = usuario.tiene_contrasena ? "Cambiar contraseña" : "Crear contraseña";
  $("clave-ayuda").textContent = usuario.tiene_contrasena
    ? "Escribe tu contraseña actual y la nueva."
    : "Tu cuenta entra con Google. Si creas una contraseña, también podrás entrar con tu NIT.";
  $("btn-clave").textContent = usuario.tiene_contrasena ? "Cambiar contraseña" : "Crear contraseña";

  actualizarProgreso();
}

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

function prepararSubida(nombre, comoPng) {
  const input = $(nombre);
  [$(`${nombre}-btn`), $(`${nombre}-elegir`)].forEach((boton) => boton.addEventListener("click", () => input.click()));
  input.addEventListener("change", async () => {
    const archivo = input.files[0];
    input.value = "";
    if (!archivo) return;
    mostrarError(nombre, "");
    try {
      const datos = await prepararImagen(archivo, comoPng);
      if (nombre === "foto") [fotoBase64, quitarFoto] = [datos, false];
      else [logoBase64, quitarLogo] = [datos, false];
      mostrarImagen(nombre, datos);
    } catch (error) {
      mostrarError(nombre, error.message);
    }
  });
  $(`${nombre}-quitar`).addEventListener("click", () => {
    if (nombre === "foto") [fotoBase64, quitarFoto] = [null, true];
    else [logoBase64, quitarLogo] = [null, true];
    mostrarImagen(nombre, "");
  });
}

prepararSubida("logo", true);
prepararSubida("foto", false);

/* ---------- Guardar perfil ---------- */

CAMPOS.forEach((campo) =>
  $(campo).addEventListener("input", () => {
    mostrarError(campo, "");
    $(campo).classList.remove("is-missing");
  }),
);

$("form-perfil").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  limpiarErrores(form);

  const datos = Object.fromEntries(CAMPOS.map((c) => [c, $(c).value.trim()]));
  datos.correo = datos.correo.toLowerCase();
  const errores = {};
  if (usuario.nit_temporal) {
    const nit = normalizarNit($("nit").value);
    if (nit.error) errores.nit = nit.error;
    else datos.nit = nit.valor;
  }
  if (datos.nombre_empresa.length < 2) errores.nombre_empresa = "Escribe el nombre de la empresa.";
  if (!datos.direccion_empresa) errores.direccion_empresa = "Escribe la dirección de la empresa.";
  if (datos.nombre_dueno.length < 3) errores.nombre_dueno = "Escribe el nombre completo del dueño.";
  if (!CORREO_RE.test(datos.correo)) errores.correo = "Escribe un correo válido.";
  if (datos.telefono_contacto && !/^[\d\s+()-]{7,20}$/.test(datos.telefono_contacto)) errores.telefono_contacto = "Escribe un teléfono válido.";
  if (Object.keys(errores).length) return mostrarErrores(errores);

  if (fotoBase64) datos.foto_base64 = fotoBase64;
  if (logoBase64) datos.logo_base64 = logoBase64;
  if (quitarFoto) datos.quitar_foto = true;
  if (quitarLogo) datos.quitar_logo = true;

  const boton = $("btn-guardar");
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const respuesta = await enviar("/perfil", "PUT", datos);
    usuario = respuesta.usuario;
    SigmaSesion.guardar(respuesta); // nuevo token si el NIT cambió
    pintarPerfil();
    $("bienvenida").hidden = true;
    avisar(usuario.perfil_completo ? "Perfil guardado. ¡Tu empresa está lista!" : "Perfil guardado.");
  } catch (error) {
    if (error.errores) mostrarErrores(error.errores);
    avisar(error.message);
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar cambios";
  }
});

/* ---------- Contraseña ---------- */

const REGLAS = {
  largo: (c) => c.length >= 8,
  letra: (c) => /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(c),
  numero: (c) => /\d/.test(c),
  especial: (c) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s]/.test(c),
};

function revisarClave() {
  const clave = $("nueva").value;
  return Object.entries(REGLAS).every(([nombre, regla]) => {
    const ok = regla(clave);
    document.querySelector(`[data-regla="${nombre}"]`).classList.toggle("is-ok", ok);
    return ok;
  }, true);
}

$("nueva").addEventListener("input", () => {
  Object.entries(REGLAS).forEach(([nombre, regla]) =>
    document.querySelector(`[data-regla="${nombre}"]`).classList.toggle("is-ok", regla($("nueva").value)),
  );
  mostrarError("nueva", "");
});
["actual", "confirmacion"].forEach((id) => $(id).addEventListener("input", () => mostrarError(id, "")));

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

$("form-clave").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  limpiarErrores(form);
  const datos = { actual: $("actual").value, nueva: $("nueva").value, confirmacion: $("confirmacion").value };
  const errores = {};
  if (usuario.tiene_contrasena && !datos.actual) errores.actual = "Escribe tu contraseña actual.";
  if (!revisarClave()) errores.nueva = "Mínimo 8 caracteres, con letras, números y un carácter especial.";
  else if (datos.nueva !== datos.confirmacion) errores.confirmacion = "Las contraseñas no coinciden.";
  if (Object.keys(errores).length) return mostrarErrores(errores);

  const boton = $("btn-clave");
  const texto = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Guardando…";
  try {
    const { message } = await enviar("/contrasena", "PUT", datos);
    form.reset();
    document.querySelectorAll("[data-regla]").forEach((li) => li.classList.remove("is-ok"));
    usuario = { ...usuario, tiene_contrasena: true };
    SigmaSesion.guardar({ usuario });
    pintarPerfil();
    avisar(message);
  } catch (error) {
    if (error.errores) mostrarErrores(error.errores);
    avisar(error.message);
  } finally {
    boton.disabled = false;
    if (boton.textContent === "Guardando…") boton.textContent = texto;
  }
});

/* ---------- Inicio ---------- */

if (new URLSearchParams(location.search).get("nuevo") === "1") $("bienvenida").hidden = false;
pintarPerfil();

// Trae los datos más recientes del servidor
SigmaSesion.fetch("/api/auth/yo")
  .then((res) => (res.ok ? res.json() : null))
  .then((datos) => {
    if (!datos) return;
    usuario = datos;
    pintarPerfil();
    if (!usuario.perfil_completo) $(usuario.nit_temporal ? "nit" : "nombre_empresa").focus();
  })
  .catch(() => {});
