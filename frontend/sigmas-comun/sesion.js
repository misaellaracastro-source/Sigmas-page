// Sesión de SigmaS: protege las páginas internas y pone los datos de la empresa en la barra y el encabezado.
// Se carga en el <head>, antes que los demás scripts, para que ninguna página se vea sin sesión.
(() => {
  const CLAVE = "sigmas-sesion";
  const LOGIN = "../sigmas-registro/registro.html";
  const PERFIL = "../sigmas-perfil/perfil.html";
  // Si la página se abre desde el backend usa la misma dirección; si no (Live Server), apunta al puerto 7000
  const ORIGEN = window.location.port === "7000" ? "" : "http://localhost:7000";

  let sesion = null;
  try {
    sesion = JSON.parse(localStorage.getItem(CLAVE) || "null");
  } catch {
    sesion = null;
  }

  function salir(motivo = "") {
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      // sin acceso al almacenamiento: igual se va al inicio de sesión
    }
    window.location.replace(LOGIN + (motivo ? `?motivo=${motivo}` : ""));
  }

  if (!sesion?.token) {
    salir();
    return;
  }

  function archivo(ruta) {
    if (!ruta) return "";
    return /^https?:\/\//.test(ruta) ? ruta : ORIGEN + ruta;
  }

  // fetch con el token; si la sesión venció, vuelve al inicio de sesión
  async function pedir(ruta, opciones = {}) {
    const res = await fetch(ORIGEN + ruta, {
      ...opciones,
      headers: { ...(opciones.headers || {}), Authorization: `Bearer ${sesion.token}` },
    });
    if (res.status === 401) salir("expirada");
    return res;
  }

  function iniciales(nombre) {
    return String(nombre || "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");
  }

  function pintar() {
    const u = sesion.usuario || {};
    const texto = (selector, valor) => document.querySelectorAll(selector).forEach((el) => (el.textContent = valor));

    texto(".company-name", u.nombre_empresa || "Tu empresa");
    const meta = document.querySelectorAll(".company-card .company-meta");
    if (meta[0]) meta[0].textContent = u.nit_temporal ? "NIT pendiente" : `NIT ${u.nit || ""}`;
    if (meta[1]) meta[1].textContent = u.direccion_empresa || "";

    const card = document.querySelector(".company-card");
    card?.querySelector(".company-logo")?.remove();
    if (card && u.logo_empresa) {
      const logo = document.createElement("img");
      logo.className = "company-logo";
      logo.src = archivo(u.logo_empresa);
      logo.alt = `Logo de ${u.nombre_empresa}`;
      card.prepend(logo);
    }

    texto(".user-name", u.nombre_dueno || "");
    texto(".user-role", "Dueño de la empresa");
    document.querySelectorAll(".avatar").forEach((avatar) => {
      if (u.foto) {
        avatar.innerHTML = "";
        const img = document.createElement("img");
        img.src = archivo(u.foto);
        img.alt = "";
        img.referrerPolicy = "no-referrer";
        avatar.append(img);
      } else {
        avatar.textContent = iniciales(u.nombre_dueno);
      }
    });

    const pie = document.querySelector(".page-foot p");
    if (pie) pie.textContent = u.nombre_empresa || "";
    document.querySelectorAll("[data-sesion]").forEach((el) => {
      const valor = { dueno: (u.nombre_dueno || "").split(" ")[0], empresa: u.nombre_empresa || "tu empresa" }[el.dataset.sesion];
      if (valor) el.textContent = valor;
    });

    avisoPerfil(u);
  }

  // Cerrar sesión y el acceso al perfil (desde el botón del usuario en la barra superior)
  function prepararEnlaces() {
    document.querySelectorAll(".logout-link").forEach((enlace) => {
      enlace.addEventListener("click", (event) => {
        event.preventDefault();
        salir();
      });
    });
    // El botón del usuario en la barra superior abre el perfil
    document.querySelectorAll(".user-chip").forEach((chip) => {
      chip.title = "Mi perfil";
      chip.addEventListener("click", () => (window.location.href = PERFIL));
    });
  }

  // Mientras falten NIT, empresa o dirección, se recuerda completar el perfil
  function avisoPerfil(u) {
    const existente = document.querySelector(".profile-banner");
    if (u.perfil_completo !== false || window.location.pathname.includes("/sigmas-perfil/")) {
      existente?.remove();
      return;
    }
    if (existente) return;
    const contenido = document.querySelector(".content");
    if (!contenido) return;
    const aviso = document.createElement("div");
    aviso.className = "profile-banner";
    aviso.setAttribute("role", "status");
    aviso.innerHTML = `
      <div>
        <strong>Completa el perfil de tu empresa</strong>
        <span>Falta el NIT, el nombre o la dirección. Los necesitas para tus cotizaciones y facturas.</span>
      </div>
      <a class="btn-primary" href="${PERFIL}">Completar perfil</a>`;
    contenido.prepend(aviso);
  }

  // Guarda la sesión actualizada (por ejemplo, después de editar el perfil)
  function guardar({ token, usuario }) {
    if (token) sesion.token = token;
    if (usuario) sesion.usuario = window.SigmaSesion.usuario = usuario;
    localStorage.setItem(CLAVE, JSON.stringify(sesion));
    pintar();
  }

  window.SigmaSesion = {
    usuario: sesion.usuario,
    origen: ORIGEN,
    archivo,
    fetch: pedir,
    salir,
    guardar,
  };

  function iniciar() {
    prepararEnlaces();
    pintar();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();

  // Trae los datos más recientes de la empresa (y confirma que la sesión sigue vigente)
  pedir("/api/auth/yo")
    .then((res) => (res.ok ? res.json() : null))
    .then((usuario) => {
      if (!usuario) return;
      sesion.usuario = window.SigmaSesion.usuario = usuario;
      localStorage.setItem(CLAVE, JSON.stringify(sesion));
      if (document.readyState !== "loading") pintar();
    })
    .catch(() => {});
})();
