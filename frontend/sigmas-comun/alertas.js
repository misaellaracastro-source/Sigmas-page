// Campana de alertas en la barra superior de todas las páginas (stock bajo, pendientes y facturas)
(() => {
  if (!window.SigmaSesion) return;
  const zona = document.querySelector(".topbar-right");
  if (!zona) return;

  const contenedor = document.createElement("div");
  contenedor.className = "alerts";
  contenedor.innerHTML = `
    <button type="button" class="alerts-btn" aria-haspopup="dialog" aria-expanded="false" aria-controls="alerts-panel">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
        <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
      </svg>
      <span class="alerts-count" hidden>0</span>
      <span class="sr-only alerts-label">Alertas</span>
    </button>
    <div class="alerts-panel" id="alerts-panel" role="dialog" aria-label="Alertas" hidden>
      <div class="alerts-head">
        <strong>Alertas</strong>
        <button type="button" class="alerts-read-all">Marcar todas como leídas</button>
      </div>
      <ul class="alerts-list"></ul>
    </div>`;
  zona.prepend(contenedor);

  const boton = contenedor.querySelector(".alerts-btn");
  const panel = contenedor.querySelector(".alerts-panel");
  const contador = contenedor.querySelector(".alerts-count");
  const lista = contenedor.querySelector(".alerts-list");
  let pendientesAntes = null;

  function escapar(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function hace(fecha) {
    const minutos = Math.round((Date.now() - new Date(fecha)) / 60000);
    if (minutos < 1) return "ahora";
    if (minutos < 60) return `hace ${minutos} min`;
    if (minutos < 1440) return `hace ${Math.round(minutos / 60)} h`;
    return new Date(fecha).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
  }

  // El tipo se guarda sin tildes en la base de datos
  const NOMBRES = { "Entrega proxima": "Entrega próxima" };

  function destino(alerta) {
    if (alerta.id_materia) return "../sigmas-inventario/inventario.html#materias";
    if (alerta.id_insumo) return "../sigmas-inventario/inventario.html#insumos";
    if (alerta.id_evento) return `../sigmas-calendario/calendario.html#evento-${alerta.id_evento}`;
    if (alerta.nombre_factura) return "../sigmas-factura/factura.html#lista";
    return "";
  }

  async function cargar() {
    try {
      const res = await SigmaSesion.fetch("/api/alertas");
      if (!res.ok) return;
      const { pendientes, alertas } = await res.json();
      contador.textContent = pendientes > 9 ? "9+" : pendientes;
      contador.hidden = pendientes === 0;
      boton.querySelector(".alerts-label").textContent = pendientes ? `Alertas: ${pendientes} sin leer` : "Alertas";
      // Llamar la atención cuando llega una alerta nueva
      if (pendientesAntes !== null && pendientes > pendientesAntes) boton.classList.add("is-ringing");
      pendientesAntes = pendientes;

      lista.innerHTML = alertas.length
        ? alertas
            .map(
              (a) => `
          <li class="alert-item${a.leida ? "" : " is-unread"}">
            <a href="${destino(a) || "#"}" data-id="${a.id_alerta}">
              <span class="alert-type">${escapar(NOMBRES[a.tipo] || a.tipo)}</span>
              <span class="alert-msg">${escapar(a.mensaje)}</span>
              <span class="alert-meta">${hace(a.fecha_generada)}${a.correo_enviado ? " · enviada a tu correo" : ""}</span>
            </a>
          </li>`,
            )
            .join("")
        : '<li class="alerts-empty">No tienes alertas. Te avisaremos cuando un insumo o tela llegue a su stock mínimo, se acerque un pendiente o una factura esté por vencer.</li>';
    } catch {
      // sin conexión: se intenta en el próximo ciclo
    }
  }

  function abrir(abrirPanel) {
    panel.hidden = !abrirPanel;
    boton.setAttribute("aria-expanded", String(abrirPanel));
    boton.classList.remove("is-ringing");
    if (abrirPanel) cargar();
  }

  boton.addEventListener("click", () => abrir(panel.hidden));
  document.addEventListener("click", (event) => {
    if (!panel.hidden && !contenedor.contains(event.target)) abrir(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      abrir(false);
      boton.focus();
    }
  });

  lista.addEventListener("click", async (event) => {
    const enlace = event.target.closest("a[data-id]");
    if (!enlace) return;
    if (enlace.getAttribute("href") === "#") event.preventDefault();
    await SigmaSesion.fetch(`/api/alertas/${enlace.dataset.id}/leida`, { method: "PATCH" }).catch(() => {});
    cargar();
  });

  contenedor.querySelector(".alerts-read-all").addEventListener("click", async () => {
    await SigmaSesion.fetch("/api/alertas/leidas", { method: "PATCH" }).catch(() => {});
    cargar();
  });

  // Otras partes de la página pueden pedir actualizar la campana (por ejemplo, al guardar un insumo)
  window.addEventListener("sigmas:alertas", cargar);

  cargar();
  setInterval(cargar, 60000);
})();
