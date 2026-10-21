// Modo claro / oscuro de SigmaS.
// Se carga en el <head> (antes de pintar) para que la página no parpadee en blanco, y agrega el botón
// de sol/luna en la barra superior. Si la persona nunca elige, se sigue el modo del sistema operativo.
(() => {
  const CLAVE = "sigmas-modo";
  const sistema = window.matchMedia("(prefers-color-scheme: dark)");

  function guardado() {
    try {
      return localStorage.getItem(CLAVE);
    } catch {
      return null;
    }
  }

  const modoActual = () => guardado() || (sistema.matches ? "oscuro" : "claro");

  const ICONOS = {
    // Luna: se muestra en modo claro (pasar a oscuro)
    claro:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" /></svg>',
    // Sol: se muestra en modo oscuro (pasar a claro)
    oscuro:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="1.7" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" /></svg>',
  };

  function pintarBoton(boton) {
    const modo = document.documentElement.dataset.theme;
    const texto = modo === "oscuro" ? "Cambiar a modo claro" : "Cambiar a modo oscuro";
    boton.innerHTML = `${ICONOS[modo]}<span class="sr-only">${texto}</span>`;
    boton.title = texto;
    boton.setAttribute("aria-pressed", String(modo === "oscuro"));
  }

  function aplicar(modo) {
    document.documentElement.dataset.theme = modo;
    document.querySelectorAll(".modo-btn").forEach(pintarBoton);
    // Las gráficas y otras partes pueden volver a dibujarse con los colores nuevos
    window.dispatchEvent(new CustomEvent("sigmas:modo", { detail: modo }));
  }

  aplicar(modoActual());

  // Si no se ha elegido, sigue al sistema; si se cambia en otra pestaña, también aquí
  sistema.addEventListener("change", () => {
    if (!guardado()) aplicar(modoActual());
  });
  window.addEventListener("storage", (event) => {
    if (event.key === CLAVE) aplicar(modoActual());
  });

  function crearBoton() {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "modo-btn";
    boton.addEventListener("click", () => {
      const nuevo = document.documentElement.dataset.theme === "oscuro" ? "claro" : "oscuro";
      try {
        localStorage.setItem(CLAVE, nuevo);
      } catch {
        // sin almacenamiento: el cambio dura mientras la página esté abierta
      }
      aplicar(nuevo);
    });
    pintarBoton(boton);
    // En las páginas internas va en la barra superior; en el inicio de sesión, flotando arriba a la derecha
    const barra = document.querySelector(".topbar-right");
    if (barra) barra.prepend(boton);
    else {
      boton.classList.add("is-flotante");
      document.body.append(boton);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", crearBoton);
  else crearBoton();
})();
