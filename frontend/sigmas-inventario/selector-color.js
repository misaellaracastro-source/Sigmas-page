// Paleta de colores: área de saturación/brillo + barra de tono + colores frecuentes en textiles

export const COLORES_TEXTILES = [
  ["Blanco", "#FFFFFF"],
  ["Crudo", "#F3EAD7"],
  ["Beige", "#D9C7A7"],
  ["Arena", "#C9B28A"],
  ["Camel", "#B5835A"],
  ["Café", "#6B4A2F"],
  ["Gris claro", "#C8CACF"],
  ["Gris", "#8A8D93"],
  ["Negro", "#111111"],
  ["Azul marino", "#1F2A44"],
  ["Índigo", "#2E3A87"],
  ["Azul cielo", "#9EC5E8"],
  ["Verde oliva", "#6B6B3A"],
  ["Esmeralda", "#1F7A5C"],
  ["Mostaza", "#D4A017"],
  ["Naranja", "#E07B39"],
  ["Rojo", "#B3261E"],
  ["Vino", "#6D1A2A"],
  ["Rosa palo", "#E8C4C4"],
  ["Lila", "#B9A6D6"],
];

// Nombre del color si es uno de los frecuentes; si no, su código
export function nombreColor(hex) {
  if (!hex) return "";
  const encontrado = COLORES_TEXTILES.find(([, valor]) => valor === hex.toUpperCase());
  return encontrado ? encontrado[0] : hex.toUpperCase();
}

function hsvAHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return "#" + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function hexAHsv(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

const limitar = (n) => Math.min(1, Math.max(0, n));

export function crearSelectorColor({ prefijo, alCambiar }) {
  const $ = (sufijo) => document.getElementById(`${prefijo}-${sufijo}`);
  const trigger = $("color-btn");
  const popover = $("color-popover");
  const area = $("sv");
  const areaHandle = $("sv-handle");
  const barra = $("hue");
  const barraHandle = $("hue-handle");
  const hexInput = $("color-hex");
  const preview = $("color-preview");
  const dot = $("color-dot");
  const textoColor = $("color-text");
  const oculto = $("color");
  const swatches = $("swatches");

  let hsv = { h: 230, s: 0.4, v: 0.45 };

  swatches.innerHTML = COLORES_TEXTILES.map(
    ([nombre, hex]) =>
      `<button type="button" class="swatch" style="background:${hex}" data-hex="${hex}" title="${nombre}" aria-label="${nombre}"></button>`,
  ).join("");

  function pintar() {
    const hex = oculto.value;
    area.style.setProperty("--hue", hsv.h);
    areaHandle.style.left = `${hsv.s * 100}%`;
    areaHandle.style.top = `${(1 - hsv.v) * 100}%`;
    barraHandle.style.left = `${(hsv.h / 360) * 100}%`;
    barraHandle.style.background = `hsl(${hsv.h} 100% 50%)`;
    preview.style.background = hex || "transparent";
    if (document.activeElement !== hexInput) hexInput.value = hex;
    dot.style.background = hex || "";
    dot.classList.toggle("has-color", Boolean(hex));
    textoColor.textContent = hex ? `${nombreColor(hex)}${nombreColor(hex) !== hex ? ` · ${hex}` : ""}` : "Elegir color";
    swatches.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("is-selected", s.dataset.hex === hex));
  }

  function fijarHsv(nuevo) {
    hsv = { ...hsv, ...nuevo };
    oculto.value = hsvAHex(hsv.h, hsv.s, hsv.v);
    pintar();
    alCambiar?.(oculto.value);
  }

  function fijarHex(hex) {
    oculto.value = hex ? hex.toUpperCase() : "";
    if (hex) hsv = hexAHsv(oculto.value);
    pintar();
    alCambiar?.(oculto.value);
  }

  // Arrastrar con el mouse (o el dedo) dentro del área y la barra
  function arrastrar(elemento, mover) {
    elemento.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      elemento.setPointerCapture(event.pointerId);
      elemento.focus();
      mover(event);
      const alMover = (e) => mover(e);
      elemento.addEventListener("pointermove", alMover);
      elemento.addEventListener("pointerup", () => elemento.removeEventListener("pointermove", alMover), { once: true });
    });
  }

  arrastrar(area, (event) => {
    const r = area.getBoundingClientRect();
    fijarHsv({ s: limitar((event.clientX - r.left) / r.width), v: 1 - limitar((event.clientY - r.top) / r.height) });
  });

  arrastrar(barra, (event) => {
    const r = barra.getBoundingClientRect();
    fijarHsv({ h: limitar((event.clientX - r.left) / r.width) * 359 });
  });

  // Flechas del teclado
  area.addEventListener("keydown", (event) => {
    const paso = event.shiftKey ? 0.1 : 0.02;
    const cambios = {
      ArrowRight: { s: limitar(hsv.s + paso) },
      ArrowLeft: { s: limitar(hsv.s - paso) },
      ArrowUp: { v: limitar(hsv.v + paso) },
      ArrowDown: { v: limitar(hsv.v - paso) },
    }[event.key];
    if (cambios) {
      event.preventDefault();
      fijarHsv(cambios);
    }
  });

  barra.addEventListener("keydown", (event) => {
    const paso = event.shiftKey ? 20 : 4;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      fijarHsv({ h: Math.min(359, Math.max(0, hsv.h + (event.key === "ArrowRight" ? paso : -paso))) });
    }
  });

  swatches.addEventListener("click", (event) => {
    const swatch = event.target.closest(".swatch");
    if (swatch) fijarHex(swatch.dataset.hex);
  });

  hexInput.addEventListener("input", () => {
    let valor = hexInput.value.trim().toUpperCase();
    if (valor && !valor.startsWith("#")) valor = "#" + valor;
    if (/^#[0-9A-F]{6}$/.test(valor)) fijarHex(valor);
  });

  hexInput.addEventListener("blur", pintar);

  function abrir() {
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    if (!oculto.value) fijarHsv({}); // propone un color inicial para que se vea el selector
    area.focus({ preventScroll: true });
    // Desplaza el panel para que la paleta se vea completa
    popover.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function cerrar(devolverFoco = true) {
    if (popover.hidden) return;
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (devolverFoco) trigger.focus();
  }

  trigger.addEventListener("click", () => (popover.hidden ? abrir() : cerrar()));
  $("color-ok").addEventListener("click", () => cerrar());

  // Clic fuera de la paleta la cierra
  document.addEventListener("pointerdown", (event) => {
    if (!popover.hidden && !popover.contains(event.target) && !trigger.contains(event.target)) cerrar(false);
  });

  return {
    valor: () => oculto.value,
    fijar: (hex) => fijarHex(hex || ""),
    estaAbierto: () => !popover.hidden,
    cerrar,
  };
}
