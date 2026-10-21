// Botón desplegable con lista de opciones (categorías, insumos con foto, telas con color).
// Se maneja con mouse o teclado (flechas, Enter, Esc) y permite buscar escribiendo.
export function crearDesplegable({ contenedor, textoVacio, alElegir }) {
  const boton = contenedor.querySelector(".pick-btn");
  const lista = contenedor.querySelector(".pick-list");
  const etiqueta = contenedor.querySelector(".pick-value");
  let opciones = [];
  let valor = "";

  function pintarLista() {
    lista.innerHTML = opciones.length
      ? opciones
          .map(
            (o, i) => `<li role="option" id="${lista.id}-${i}" data-valor="${o.valor.replace(/"/g, "&quot;")}" aria-selected="${o.valor === valor}">${o.html}</li>`,
          )
          .join("")
      : `<li class="pick-empty">${textoVacio}</li>`;
  }

  function enfocar(opcion) {
    lista.querySelectorAll(".is-focused").forEach((o) => o.classList.remove("is-focused"));
    if (!opcion) return;
    opcion.classList.add("is-focused");
    lista.setAttribute("aria-activedescendant", opcion.id);
    opcion.scrollIntoView({ block: "nearest" });
  }

  function abrir(abrirLista) {
    if (abrirLista && boton.disabled) return;
    lista.hidden = !abrirLista;
    boton.setAttribute("aria-expanded", String(abrirLista));
    if (abrirLista) {
      pintarLista();
      enfocar(lista.querySelector('[aria-selected="true"]') || lista.querySelector("[role=option]"));
      lista.focus();
    }
  }

  function elegir(nuevo, avisar = true) {
    valor = nuevo;
    const opcion = opciones.find((o) => o.valor === valor);
    etiqueta.innerHTML = opcion ? opcion.resumen || opcion.html : `<span class="pick-placeholder">${boton.dataset.placeholder || "Elige una opción"}</span>`;
    if (avisar) alElegir?.(valor, opcion);
  }

  boton.addEventListener("click", () => abrir(lista.hidden));
  lista.addEventListener("click", (event) => {
    const opcion = event.target.closest("[role=option]");
    if (!opcion) return;
    elegir(opcion.dataset.valor);
    abrir(false);
    boton.focus();
  });

  let busqueda = "";
  let tiempoBusqueda;
  lista.addEventListener("keydown", (event) => {
    const items = [...lista.querySelectorAll("[role=option]")];
    const i = items.findIndex((o) => o.classList.contains("is-focused"));
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      enfocar(items[Math.min(items.length - 1, Math.max(0, i + (event.key === "ArrowDown" ? 1 : -1)))]);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (items[i]) {
        elegir(items[i].dataset.valor);
        abrir(false);
        boton.focus();
      }
    } else if (event.key === "Escape" || event.key === "Tab") {
      if (event.key === "Escape") event.stopPropagation();
      abrir(false);
      if (event.key === "Escape") boton.focus();
    } else if (event.key.length === 1) {
      // Escribir salta a la primera opción que empiece así
      busqueda += event.key.toLowerCase();
      clearTimeout(tiempoBusqueda);
      tiempoBusqueda = setTimeout(() => (busqueda = ""), 700);
      enfocar(items.find((o) => o.textContent.trim().toLowerCase().startsWith(busqueda)));
    }
  });

  document.addEventListener("click", (event) => {
    if (!lista.hidden && !contenedor.contains(event.target)) abrir(false);
  });

  return {
    // opciones: [{ valor, html, resumen? }]
    fijarOpciones(nuevas) {
      opciones = nuevas;
      if (!opciones.some((o) => o.valor === valor)) valor = "";
      elegir(valor, false);
    },
    elegir,
    valor: () => valor,
    habilitar(si) {
      boton.disabled = !si;
    },
    enfocar: () => boton.focus(),
  };
}
