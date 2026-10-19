const toast = document.getElementById("toast");
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 2400);
}

document.getElementById("btn-cotizacion").addEventListener("click", () => {
  showToast("Cotización lista para armar · función de muestra");
});

document.querySelectorAll(".nav-item:not(.is-active)").forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("#")) {
      event.preventDefault();
      const label = link.textContent.trim();
      showToast(`${label}: sección de muestra`);
    }
  });
});

document.querySelectorAll(".panel-link, .feature-link, .help-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("#")) {
      event.preventDefault();
      showToast("Vista de detalle de muestra");
    }
  });
});

document.getElementById("user-menu").addEventListener("click", () => {
  showToast("Menú de cuenta · María Pérez");
});
