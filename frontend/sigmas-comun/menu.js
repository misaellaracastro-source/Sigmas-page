// Abre y cierra la barra de navegación en pantallas pequeñas
(() => {
  const sidebar = document.querySelector(".sidebar");
  const toggle = document.querySelector(".menu-toggle");
  if (!sidebar || !toggle) return;

  function setOpen(open) {
    sidebar.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  }

  toggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("is-open")));

  sidebar.querySelectorAll(".nav-item").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
})();
