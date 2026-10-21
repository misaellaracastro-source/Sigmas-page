// Imágenes con IA: Cloudflare Workers AI, modelo FLUX.1 [schnell].
// Plan gratuito: 10.000 "neuronas" al día (cientos de imágenes). Configurar en el .env:
//   CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN
const MODELO = '@cf/black-forest-labs/flux-1-schnell';

export function iaConfigurada() {
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

/* ---------- Del español a una descripción precisa en inglés (el modelo entiende mejor el inglés) ---------- */

const sinTildes = (t) =>
    String(t || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

// "vestido de baño" se revisa antes que "vestido"
const PRENDAS = [
    [/bano|banador|enterizo de bano|trikini/, "women's one-piece swimsuit"],
    [/bikini|biquini/, 'two-piece bikini set'],
    [/ropa interior|panty|brasier|bralette/, 'lingerie set'],
    [/camiseta|t-shirt|polo/, 't-shirt'],
    [/blusa/, "women's blouse"],
    [/camisa/, 'button-up shirt'],
    [/jean/, 'denim jeans'],
    [/legging/, 'leggings'],
    [/sudadera|jogger/, 'jogger sweatpants'],
    [/pijama/, 'pajama set'],
    [/pantalon/, 'trousers'],
    [/short|bermuda|pantaloneta/, 'shorts'],
    [/falda/, 'skirt'],
    [/vestido/, 'dress'],
    [/chaqueta|blazer|saco/, 'jacket'],
    [/buzo|hoodie/, 'hoodie'],
    [/chaleco/, 'vest'],
];

export function prendaEnIngles(tipo) {
    const t = sinTildes(tipo);
    return PRENDAS.find(([patron]) => patron.test(t))?.[1] || tipo;
}

// Nombre de color en inglés a partir del código (#RRGGBB)
export function colorEnIngles(hex) {
    const valor = String(hex || '').replace('#', '');
    if (!/^[0-9a-f]{6}$/i.test(valor)) return '';
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(valor.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (d) {
        if (max === r) h = ((g - b) / d) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h = (h * 60 + 360) % 360;
    }
    if (l > 0.93) return 'white';
    if (l < 0.1) return 'black';
    if (s < 0.12) return l > 0.7 ? 'light grey' : l > 0.4 ? 'grey' : 'charcoal grey';
    const tono =
        h < 12 ? 'red' : h < 35 ? 'orange' : h < 50 ? 'mustard yellow' : h < 68 ? 'yellow' : h < 90 ? 'olive green' : h < 168 ? 'green'
        : h < 190 ? 'teal' : h < 215 ? 'sky blue' : h < 245 ? 'blue' : h < 275 ? 'indigo violet' : h < 315 ? 'purple' : h < 345 ? 'pink' : 'red';
    const claridad = l > 0.75 ? 'pastel ' : l > 0.6 ? 'light ' : l < 0.25 ? 'deep dark ' : l < 0.38 ? 'dark ' : '';
    const viveza = s > 0.6 && l > 0.3 && l < 0.7 ? 'vivid ' : '';
    if (tono === 'orange' && l < 0.45) return `${claridad}brown`.trim();
    if (tono === 'red' && l > 0.7) return `${claridad}pink`.trim();
    return `${claridad}${viveza}${tono}`.trim();
}

const limpio = (t, max) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, max);

export function construirPrompt({ tipo, materias = [], insumos = [], descripciones = [] }) {
    const prenda = prendaEnIngles(tipo);
    const telas = materias
        .slice(0, 3)
        .map((m) => `${colorEnIngles(m.color)} ${limpio(m.nombre, 60)}${m.composicion ? ` (${limpio(m.composicion, 60)})` : ''}`.trim());
    const avios = insumos.slice(0, 8).map((i) => limpio(i.nombre, 50));
    // Las descripciones con el mismo título se juntan: "Escote: en V; con ribete"
    const grupos = new Map();
    descripciones.slice(0, 20).forEach((d) => {
        const titulo = limpio(d.nombre, 40);
        grupos.set(titulo, [...(grupos.get(titulo) || []), limpio(d.descripcion, 140)].filter(Boolean));
    });
    const detalles = [...grupos].map(([titulo, textos]) => (textos.length ? `${titulo}: ${textos.join("; ")}` : titulo));

    const partes = [
        `Professional e-commerce fashion product photo of a ${prenda} (${limpio(tipo, 60)})`,
        telas.length ? `made of ${telas.join(' combined with ')} fabric` : '',
        telas.length ? `main color ${colorEnIngles(materias[0].color)}` : '',
        avios.length ? `with these trims and hardware: ${avios.join(', ')}` : '',
        detalles.length ? `design details (in Spanish): ${detalles.join('; ')}` : '',
        'shown on an invisible ghost mannequin, front view, full garment centered, plain light grey studio background, soft even lighting, sharp focus on fabric texture and seams, realistic, high detail, no text, no logo, no watermark, no person',
    ];
    return partes.filter(Boolean).join(', ').slice(0, 2000);
}

/* ---------- Llamada al servicio ---------- */

export async function generarImagenIA(prompt) {
    if (!iaConfigurada()) {
        throw Object.assign(new Error('La IA de imágenes no está configurada (faltan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN en el .env).'), { status: 503 });
    }
    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${MODELO}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
        // 8 pasos: la mayor calidad que permite el modelo
        body: JSON.stringify({ prompt, steps: 8, seed: Math.floor(Math.random() * 1e9) }),
        signal: AbortSignal.timeout(60000),
    });
    const datos = await res.json().catch(() => ({}));
    const imagen = datos?.result?.image || datos?.image;
    if (!res.ok || !imagen) {
        const detalle = datos?.errors?.[0]?.message || `HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) throw Object.assign(new Error('La llave de Cloudflare no es válida o no tiene permiso de Workers AI.'), { status: 502, detalle });
        if (res.status === 429) throw Object.assign(new Error('Se alcanzó el límite gratuito de imágenes de hoy. Intenta mañana.'), { status: 429, detalle });
        throw Object.assign(new Error('El servicio de IA no pudo crear la imagen. Intenta de nuevo.'), { status: 502, detalle });
    }
    return `data:image/jpeg;base64,${imagen}`;
}
