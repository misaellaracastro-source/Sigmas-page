// Genera la imagen de la referencia: silueta de la prenda según el tipo, pintada con el color de la tela,
// con los detalles (descripciones) numerados sobre la prenda, los materiales y los datos de la empresa.
import { nombreColor } from "../sigmas-inventario/selector-color.js";

const ANCHO = 1000;
const ALTO = 1250;
const FUENTE = "Segoe UI, Arial, sans-serif";

// Siluetas dibujadas en una caja de 400 x 480. "anclas" son los puntos donde van los números de los detalles.
const SILUETAS = {
  bano: {
    nombre: "Vestido de baño",
    trazos: [
      "M150 40 h18 Q200 140 232 40 h18 L262 170 Q292 232 278 300 L304 362 Q250 362 212 424 h-24 Q150 362 96 362 L122 300 Q108 232 138 170 Z",
    ],
    costuras: ["M168 40 Q200 128 232 40", "M122 300 Q200 330 278 300"],
    anclas: [[200, 110], [150, 190], [250, 190], [200, 250], [200, 380], [130, 330], [270, 330], [200, 160]],
  },
  bikini: {
    nombre: "Bikini",
    trazos: [
      "M120 70 L150 70 L200 150 L120 165 Q105 120 120 70 Z",
      "M280 70 L250 70 L200 150 L280 165 Q295 120 280 70 Z",
      "M110 270 H290 L300 300 Q250 310 215 390 H185 Q150 310 100 300 Z",
    ],
    costuras: ["M120 165 L200 150 L280 165", "M110 270 H290"],
    anclas: [[145, 120], [255, 120], [200, 160], [200, 300], [200, 360], [120, 285], [280, 285], [200, 80]],
  },
  superior: {
    nombre: "Prenda superior",
    trazos: ["M140 60 Q200 92 260 60 L342 104 L314 176 L284 160 L284 424 H116 L116 160 L86 176 L58 104 Z"],
    costuras: ["M140 60 Q200 112 260 60", "M116 160 L116 104", "M284 160 L284 104"],
    anclas: [[200, 100], [80, 130], [320, 130], [200, 220], [200, 320], [150, 400], [250, 400], [200, 160]],
  },
  chaqueta: {
    nombre: "Chaqueta",
    trazos: ["M140 56 Q200 88 260 56 L322 86 L364 330 L322 342 L290 182 L290 428 H110 L110 182 L78 342 L36 330 L78 86 Z"],
    costuras: ["M200 76 V428", "M140 56 Q200 108 260 56"],
    anclas: [[200, 90], [70, 230], [330, 230], [160, 260], [240, 260], [200, 400], [55, 330], [345, 330]],
  },
  pantalon: {
    nombre: "Pantalón",
    trazos: ["M120 50 H280 L302 432 H214 L200 166 L186 432 H98 Z"],
    costuras: ["M120 74 H280", "M200 74 V166"],
    anclas: [[200, 62], [150, 140], [250, 140], [140, 300], [260, 300], [140, 410], [260, 410], [200, 120]],
  },
  short: {
    nombre: "Short",
    trazos: ["M118 90 H282 L308 304 H214 L200 176 L186 304 H92 Z"],
    costuras: ["M118 114 H282", "M200 114 V176"],
    anclas: [[200, 102], [150, 170], [250, 170], [140, 260], [260, 260], [200, 140], [120, 290], [280, 290]],
  },
  falda: {
    nombre: "Falda",
    trazos: ["M140 80 H260 L322 404 H78 Z"],
    costuras: ["M140 104 H260"],
    anclas: [[200, 92], [200, 200], [140, 300], [260, 300], [200, 380], [110, 390], [290, 390], [200, 150]],
  },
  vestido: {
    nombre: "Vestido",
    trazos: ["M160 48 Q200 80 240 48 L266 150 L246 172 L322 434 H78 L154 172 L134 150 Z"],
    costuras: ["M160 48 Q200 96 240 48", "M154 172 H246"],
    anclas: [[200, 90], [200, 172], [140, 140], [260, 140], [200, 300], [130, 410], [270, 410], [200, 230]],
  },
};

// Elige la silueta por palabras del tipo ("vestido de baño" antes que "vestido")
export function siluetaPara(tipo) {
  const t = String(tipo || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/bano|banador|enterizo|trikini/.test(t)) return SILUETAS.bano;
  if (/bikini|biquini|ropa interior|panty|brasier|top/.test(t)) return SILUETAS.bikini;
  if (/chaqueta|buzo|hoodie|saco|abrigo|chaleco|blazer/.test(t)) return SILUETAS.chaqueta;
  if (/short|bermuda|pantaloneta/.test(t)) return SILUETAS.short;
  if (/pantalon|jean|sudadera|legging|jogger|pijama/.test(t)) return SILUETAS.pantalon;
  if (/falda/.test(t)) return SILUETAS.falda;
  if (/vestido|enterizo|jumper/.test(t)) return SILUETAS.vestido;
  return SILUETAS.superior;
}

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// Parte un texto en líneas de máximo "largo" caracteres
function envolver(texto, largo, maxLineas = 3) {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    if ((actual + " " + palabra).trim().length > largo) {
      lineas.push(actual);
      actual = palabra;
    } else actual = (actual + " " + palabra).trim();
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maxLineas) {
    lineas.length = maxLineas;
    lineas[maxLineas - 1] = lineas[maxLineas - 1].replace(/.{0,2}$/, "…");
  }
  return lineas;
}

// Texto claro u oscuro según el color de fondo
function esOscuro(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt((hex || "#cccccc").slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

const pesos = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
const numeros = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

function fechaLarga(fecha) {
  const [a, m, d] = String(fecha).split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

// Junta las descripciones por título: [{ nombre, items: ["...", "..."] }] en el orden en que aparecen
export function agruparDescripciones(descripciones = []) {
  const grupos = [];
  for (const d of descripciones) {
    let grupo = grupos.find((g) => g.nombre === d.nombre);
    if (!grupo) grupos.push((grupo = { nombre: d.nombre, items: [] }));
    if (d.descripcion) grupo.items.push(d.descripcion);
  }
  return grupos;
}

// foto: imagen creada con IA o subida por el usuario (data URL). Si no hay, se dibuja la silueta.
export function construirSvg({ id, tipo, fecha, insumos, materias, descripciones, valor, empresa, logo, foto, fotoSubida = false }) {
  const silueta = siluetaPara(tipo);
  const grupos = agruparDescripciones(descripciones);
  const partes = [];

  // Encabezado con la empresa
  partes.push(`<rect width="${ANCHO}" height="150" fill="#0A1123"/>`);
  let xNombre = 48;
  if (logo) {
    partes.push(`<rect x="44" y="33" width="84" height="84" rx="18" fill="#FFFFFF"/>`);
    partes.push(`<image href="${logo}" x="50" y="39" width="72" height="72" preserveAspectRatio="xMidYMid meet"/>`);
    xNombre = 150;
  }
  partes.push(`<text x="${xNombre}" y="70" font-family="${FUENTE}" font-size="30" font-weight="700" fill="#FFFFFF">${esc(empresa.nombre_empresa || "Mi empresa")}</text>`);
  const datosEmpresa = [empresa.nit_temporal ? "" : `NIT ${empresa.nit}`, empresa.direccion_empresa, empresa.telefono_contacto, empresa.red_social]
    .filter(Boolean)
    .join("  ·  ");
  partes.push(`<text x="${xNombre}" y="104" font-family="${FUENTE}" font-size="17" fill="#C3C6E4">${esc(datosEmpresa)}</text>`);
  partes.push(`<text x="952" y="70" text-anchor="end" font-family="${FUENTE}" font-size="15" font-weight="700" letter-spacing="3" fill="#F0C75E">FICHA DE REFERENCIA</text>`);
  partes.push(`<text x="952" y="104" text-anchor="end" font-family="${FUENTE}" font-size="15" fill="#C3C6E4">${esc(fechaLarga(fecha))}</text>`);

  // Zona de la prenda
  partes.push(`<rect x="32" y="182" width="560" height="900" rx="28" fill="#F3F4FA"/>`);
  if (foto) {
    // La foto se muestra completa, sin recortar la prenda
    partes.push(`<defs><clipPath id="marco"><rect x="52" y="292" width="520" height="680" rx="20"/></clipPath></defs>`);
    partes.push(`<rect x="52" y="292" width="520" height="680" rx="20" fill="#E9EAEE"/>`);
    partes.push(`<image href="${foto}" x="52" y="292" width="520" height="680" preserveAspectRatio="xMidYMid meet" clip-path="url(#marco)"/>`);
    partes.push(`<text x="64" y="236" font-family="${FUENTE}" font-size="16" font-weight="700" letter-spacing="2" fill="#575B80">${esc(String(tipo).toUpperCase())}</text>`);
    partes.push(`<text x="64" y="262" font-family="${FUENTE}" font-size="13" fill="#8A8CAC">${fotoSubida ? "Foto de la prenda" : "Foto de referencia creada con IA"}</text>`);
  } else {
    partes.push(...siluetaSvg(silueta, materias, grupos.length));
  }

  partes.push(...columnaDerecha({ id, tipo, insumos, materias, grupos, numerados: foto ? 99 : silueta.anclas.length }));

  // Pie con el valor de la prenda
  const detalles = grupos.reduce((n, g) => n + Math.max(1, g.items.length), 0);
  partes.push(`<rect x="32" y="1110" width="936" height="110" rx="24" fill="#0A1123"/>`);
  partes.push(`<text x="72" y="1158" font-family="${FUENTE}" font-size="16" font-weight="700" letter-spacing="2" fill="#C3C6E4">VALOR DE LA PRENDA (MATERIALES)</text>`);
  partes.push(`<text x="72" y="1196" font-family="${FUENTE}" font-size="15" fill="#8A8CAC">${insumos.length} insumos · ${materias.length} telas · ${detalles} detalles</text>`);
  partes.push(`<text x="928" y="1186" text-anchor="end" font-family="${FUENTE}" font-size="46" font-weight="800" fill="#F0C75E">$${pesos.format(Math.round(valor))}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ANCHO}" height="${ALTO}" viewBox="0 0 ${ANCHO} ${ALTO}">
    <rect width="${ANCHO}" height="${ALTO}" fill="#FFFFFF"/>${partes.join("")}</svg>`;
}

// Silueta pintada con el color de la tela y los números de los detalles encima
function siluetaSvg(silueta, materias, cantidadDetalles) {
  const colorPrincipal = materias[0]?.color || "#C9CCE6";
  const colorSecundario = materias[1]?.color;
  const partes = [];
  partes.push(`<text x="64" y="236" font-family="${FUENTE}" font-size="16" font-weight="700" letter-spacing="2" fill="#575B80">${esc(silueta.nombre.toUpperCase())}</text>`);
  const escala = 1.4;
  const dx = 32 + (560 - 400 * escala) / 2;
  const dy = 290;
  partes.push(`<g transform="translate(${dx} ${dy}) scale(${escala})">`);
  partes.push(`<defs>
      <linearGradient id="luz" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.35"/>
        <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0"/>
        <stop offset="1" stop-color="#000000" stop-opacity="0.18"/>
      </linearGradient>
      ${colorSecundario ? `<pattern id="rayas" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="18" height="18" fill="${colorPrincipal}"/><rect width="7" height="18" fill="${colorSecundario}"/></pattern>` : ""}
    </defs>`);
  silueta.trazos.forEach((d, i) => {
    const relleno = colorSecundario && i === silueta.trazos.length - 1 && silueta.trazos.length > 1 ? "url(#rayas)" : colorPrincipal;
    partes.push(`<path d="${d}" fill="${relleno}" stroke="#0A1123" stroke-width="3" stroke-linejoin="round"/>`);
    partes.push(`<path d="${d}" fill="url(#luz)"/>`);
  });
  silueta.costuras.forEach((d) =>
    partes.push(`<path d="${d}" fill="none" stroke="${esOscuro(colorPrincipal) ? "#FFFFFF" : "#0A1123"}" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="7 6"/>`),
  );
  // Números de los detalles sobre la prenda
  for (let i = 0; i < Math.min(cantidadDetalles, silueta.anclas.length); i++) {
    const [x, y] = silueta.anclas[i];
    partes.push(`<circle cx="${x}" cy="${y}" r="15" fill="#F0C75E" stroke="#0A1123" stroke-width="2.5"/>`);
    partes.push(`<text x="${x}" y="${y + 6}" text-anchor="middle" font-family="${FUENTE}" font-size="16" font-weight="800" fill="#0A1123">${i + 1}</text>`);
  }
  partes.push(`</g>`);
  if (!materias.length) {
    partes.push(`<text x="312" y="1050" text-anchor="middle" font-family="${FUENTE}" font-size="15" fill="#575B80">Sin materia prima: color de muestra</text>`);
  }
  return partes;
}

// Referencia, materia prima, insumos y detalles (agrupados por título)
function columnaDerecha({ id, tipo, insumos, materias, grupos, numerados }) {
  const partes = [];
  let y = 222;
  const col = 624;
  partes.push(`<text x="${col}" y="${y}" font-family="${FUENTE}" font-size="15" font-weight="700" letter-spacing="2" fill="#575B80">REFERENCIA</text>`);
  y += 46;
  partes.push(`<text x="${col}" y="${y}" font-family="${FUENTE}" font-size="40" font-weight="800" fill="#0A1123">${esc(id)}</text>`);
  y += 36;
  envolver(tipo, 26, 2).forEach((linea) => {
    partes.push(`<text x="${col}" y="${y}" font-family="${FUENTE}" font-size="22" fill="#3A3E6C">${esc(linea)}</text>`);
    y += 28;
  });

  const titulo = (texto) => {
    y += 30;
    partes.push(`<text x="${col}" y="${y}" font-family="${FUENTE}" font-size="15" font-weight="700" letter-spacing="2" fill="#575B80">${texto}</text>`);
    partes.push(`<rect x="${col}" y="${y + 10}" width="336" height="2" fill="#DCDEEA"/>`);
    y += 38;
  };

  if (materias.length) {
    titulo("MATERIA PRIMA");
    materias.slice(0, 4).forEach((m) => {
      partes.push(`<rect x="${col}" y="${y - 20}" width="28" height="28" rx="7" fill="${m.color || "#C9CCE6"}" stroke="#0A1123" stroke-opacity="0.25"/>`);
      partes.push(`<text x="${col + 40}" y="${y - 2}" font-family="${FUENTE}" font-size="18" font-weight="700" fill="#0A1123">${esc(envolver(m.nombre, 24, 1)[0])}</text>`);
      partes.push(`<text x="${col + 40}" y="${y + 20}" font-family="${FUENTE}" font-size="14" fill="#575B80">${esc(`${nombreColor(m.color)} · ${numeros.format(m.promedio)} ${m.unidad} promedio`)}</text>`);
      y += 52;
    });
    if (materias.length > 4) {
      partes.push(`<text x="${col}" y="${y}" font-family="${FUENTE}" font-size="14" fill="#575B80">+ ${materias.length - 4} más</text>`);
      y += 24;
    }
  }

  if (insumos.length) {
    titulo("INSUMOS");
    insumos.slice(0, 7).forEach((i) => {
      partes.push(`<circle cx="${col + 6}" cy="${y - 6}" r="5" fill="#8387C3"/>`);
      partes.push(`<text x="${col + 22}" y="${y}" font-family="${FUENTE}" font-size="17" fill="#0A1123">${esc(envolver(i.nombre, 22, 1)[0])}</text>`);
      partes.push(`<text x="960" y="${y}" text-anchor="end" font-family="${FUENTE}" font-size="16" fill="#575B80">× ${esc(numeros.format(i.cantidad))}</text>`);
      y += 30;
    });
    if (insumos.length > 7) {
      partes.push(`<text x="${col}" y="${y}" font-family="${FUENTE}" font-size="14" fill="#575B80">+ ${insumos.length - 7} más</text>`);
      y += 24;
    }
  }

  if (grupos.length) {
    titulo("DETALLES");
    for (const [i, g] of grupos.entries()) {
      if (y > 1050) {
        partes.push(`<text x="${col}" y="${y}" font-family="${FUENTE}" font-size="14" fill="#575B80">+ ${grupos.length - i} títulos más</text>`);
        break;
      }
      const numero = i < numerados ? i + 1 : "•";
      partes.push(`<circle cx="${col + 12}" cy="${y - 6}" r="12" fill="#F0C75E"/>`);
      partes.push(`<text x="${col + 12}" y="${y - 1}" text-anchor="middle" font-family="${FUENTE}" font-size="13" font-weight="800" fill="#0A1123">${numero}</text>`);
      partes.push(`<text x="${col + 32}" y="${y}" font-family="${FUENTE}" font-size="17" font-weight="700" fill="#0A1123">${esc(envolver(g.nombre, 26, 1)[0])}</text>`);
      y += 22;
      // Cada descripción del título va como viñeta
      for (const item of g.items) {
        if (y > 1072) break;
        envolver(item, 34, 2).forEach((linea, n) => {
          if (n === 0) partes.push(`<circle cx="${col + 38}" cy="${y - 5}" r="3" fill="#8387C3"/>`);
          partes.push(`<text x="${col + 48}" y="${y}" font-family="${FUENTE}" font-size="15" fill="#464A70">${esc(linea)}</text>`);
          y += 20;
        });
      }
      y += 12;
    }
  }
  return partes;
}

// Convierte el SVG en una imagen JPEG (data URL) lista para guardar
export async function generarImagenReferencia(datos) {
  const svg = construirSvg(datos);
  const img = new Image();
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = ANCHO;
  canvas.height = ALTO;
  canvas.getContext("2d").drawImage(img, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
}

// Descarga una imagen del servidor como data URL (para el logo y para los PDF)
export async function imagenComoDataUrl(url) {
  if (!url) return "";
  try {
    const res = await fetch(url);
    if (!res.ok) return "";
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const lector = new FileReader();
      lector.onload = () => resolve(lector.result);
      lector.onerror = () => resolve("");
      lector.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}
