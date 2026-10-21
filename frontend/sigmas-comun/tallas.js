// Tallas: lista con las tallas comunes y las que la empresa ya usó,
// más "Otra talla…" para escribir una que no esté en la lista.
// La usan la talla de la marquilla (Inventario) y las tallas de la tela (Referencias).
// Letras (adulto), números de pantalón/jean (28 a 48) y números de niño (6 a 22), en ese orden
const TALLAS_BASE = [
  "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL",
  "28", "30", "32", "34", "36", "38", "40", "42", "44", "46", "48",
  "6", "8", "10", "12", "14", "16", "18", "20", "22",
];
const OTRA = "__otra__";

let usadas = [];

const escapar = (valor) =>
  String(valor ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Sin repetir: "Única" y "ÚNICA" son la misma talla
function lista() {
  const vistas = new Set();
  return [...TALLAS_BASE, ...usadas].filter((t) => {
    const clave = t.toUpperCase();
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

// Trae las tallas que la empresa ya guardó (las nuevas quedan disponibles para la próxima vez)
export async function cargarTallasUsadas(api) {
  try {
    usadas = await api("/tallas");
  } catch {
    usadas = [];
  }
}

export function recordarTalla(talla) {
  const t = String(talla ?? "").trim();
  if (t && !lista().some((u) => u.toUpperCase() === t.toUpperCase())) usadas.push(t);
}

/**
 * Pone una lista de tallas antes del <input> de talla. El <input> sigue guardando el valor
 * (así sus errores y su lectura no cambian) y solo se muestra al elegir "Otra talla…".
 */
export function conectarTalla(input) {
  const select = document.createElement("select");
  select.className = "form-control talla-select";
  if (input.id) select.id = `${input.id}-lista`;
  else select.setAttribute("aria-label", input.getAttribute("aria-label") || "Talla");
  input.before(select);
  input.placeholder = "Escribe la talla nueva";
  input.setAttribute("aria-label", "Talla nueva");
  input.removeAttribute("list");

  function pintar() {
    const valor = input.value.trim();
    const tallas = lista();
    const enLista = tallas.find((t) => t.toUpperCase() === valor.toUpperCase());
    select.innerHTML =
      '<option value="">Elige la talla</option>' +
      tallas.map((t) => `<option value="${escapar(t)}">${escapar(t)}</option>`).join("") +
      `<option value="${OTRA}">＋ Otra talla…</option>`;
    select.value = !valor ? "" : (enLista ?? OTRA);
    input.hidden = select.value !== OTRA;
  }

  select.addEventListener("change", () => {
    const otra = select.value === OTRA;
    input.value = otra ? "" : select.value;
    input.hidden = !otra;
    if (otra) input.focus();
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  pintar();
  return {
    fijar(valor) {
      input.value = valor || "";
      pintar();
    },
    refrescar: pintar,
    // El control visible (para enfocarlo cuando hay un error)
    control: () => (input.hidden ? select : input),
  };
}
