// Lista editable de precios: cada fila es una unidad (metro, rollo, docena…) con su valor
import { escapeHtml, formatoPesos, leerNumero } from "./util-inventario.js";

export const UNIDADES_PRECIO = {
  insumo: [
    ["unidad", "Unidad"],
    ["metro", "Metro"],
    ["centímetro", "Centímetro"],
    ["yarda", "Yarda"],
    ["docena", "Docena"],
    ["gruesa", "Gruesa (144 und)"],
    ["paquete", "Paquete"],
    ["rollo", "Rollo"],
    ["cono", "Cono"],
    ["kilogramo", "Kilogramo"],
    ["libra", "Libra"],
    ["caja", "Caja"],
  ],
  materia: [
    ["metro", "Metro"],
    ["metro cuadrado", "Metro cuadrado"],
    ["kilogramo", "Kilogramo"],
    ["rollo", "Rollo"],
    ["pieza", "Pieza"],
    ["yarda", "Yarda"],
  ],
};

// "$1.200 / metro · $45.000 / rollo"
export function textoPrecios(precios = []) {
  return precios.map((p) => `${formatoPesos(p.valor)} / ${p.unidad}`).join(" · ");
}

export function crearEditorPrecios({ prefijo, tipo }) {
  const lista = document.getElementById(`${prefijo}-precios`);
  const agregarBtn = document.getElementById(`${prefijo}-precio-agregar`);
  const error = document.getElementById(`${prefijo}-precios-error`);
  const unidades = UNIDADES_PRECIO[tipo];
  let siguienteId = 0;

  function filas() {
    return [...lista.querySelectorAll(".price-row")];
  }

  function limpiarError() {
    error.textContent = "";
    error.hidden = true;
    lista.querySelectorAll(".is-bad").forEach((el) => el.classList.remove("is-bad"));
  }

  // Una unidad ya usada en otra fila no se puede repetir
  function actualizar() {
    const usadas = filas().map((f) => f.querySelector("select").value);
    filas().forEach((fila) => {
      const select = fila.querySelector("select");
      [...select.options].forEach((opcion) => {
        opcion.disabled = opcion.value !== select.value && usadas.includes(opcion.value);
      });
      fila.querySelector(".price-remove").hidden = filas().length === 1;
    });
    agregarBtn.hidden = filas().length >= unidades.length;
  }

  function agregar(unidad, valor = "") {
    const usadas = filas().map((f) => f.querySelector("select").value);
    const elegida = unidad || unidades.find(([u]) => !usadas.includes(u))?.[0];
    if (!elegida) return;
    const id = `${prefijo}-precio-${siguienteId++}`;
    const fila = document.createElement("div");
    fila.className = "price-row";
    fila.innerHTML = `
      <div class="money-input">
        <span aria-hidden="true">$</span>
        <label class="sr-only" for="${id}-valor">Valor</label>
        <input id="${id}-valor" class="form-control" inputmode="decimal" placeholder="0" value="${escapeHtml(valor)}" />
      </div>
      <span class="price-per" aria-hidden="true">por</span>
      <div class="select-wrap">
        <label class="sr-only" for="${id}-unidad">Unidad del precio</label>
        <select id="${id}-unidad" class="form-control">
          ${unidades.map(([u, etiqueta]) => `<option value="${escapeHtml(u)}">${escapeHtml(etiqueta)}</option>`).join("")}
        </select>
      </div>
      <button type="button" class="icon-btn price-remove" aria-label="Quitar este precio">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
      </button>`;
    fila.querySelector("select").value = elegida;
    lista.append(fila);
    actualizar();
    return fila;
  }

  lista.addEventListener("change", () => {
    limpiarError();
    actualizar();
  });
  lista.addEventListener("input", limpiarError);
  lista.addEventListener("click", (event) => {
    const quitar = event.target.closest(".price-remove");
    if (!quitar) return;
    quitar.closest(".price-row").remove();
    actualizar();
    filas()[0]?.querySelector("input").focus();
  });
  agregarBtn.addEventListener("click", () => agregar()?.querySelector("input").focus());

  return {
    // Deja la lista con los precios dados (o una fila vacía)
    fijar(precios = []) {
      lista.innerHTML = "";
      limpiarError();
      if (precios.length === 0) agregar(unidades[0][0]);
      else precios.forEach((p) => agregar(p.unidad, String(Number(p.valor))));
    },
    // Devuelve { precios } o { error }
    leer() {
      const precios = [];
      for (const fila of filas()) {
        const input = fila.querySelector("input");
        const valor = leerNumero(input.value);
        if (valor === null) {
          input.classList.add("is-bad");
          return { error: "Escribe el valor de cada precio (0 o más).", foco: input };
        }
        precios.push({ unidad: fila.querySelector("select").value, valor });
      }
      return { precios };
    },
    mostrarError(mensaje) {
      error.textContent = mensaje;
      error.hidden = !mensaje;
    },
    primerCampo: () => filas()[0]?.querySelector("input"),
  };
}
