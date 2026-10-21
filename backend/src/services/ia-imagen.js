// Imágenes con IA: Cloudflare Workers AI.
// Modelo principal: FLUX.2 [dev] (más detallado y fiel a la descripción). Si falla, se usa FLUX.1 [schnell].
// Cupo gratuito diario de "neuronas" de Cloudflare. Configurar en el .env:
//   CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN (opcional: CLOUDFLARE_MODELO_IMAGEN para cambiar el modelo)
const MODELO_PRINCIPAL = process.env.CLOUDFLARE_MODELO_IMAGEN || '@cf/black-forest-labs/flux-2-dev';
const MODELO_RESPALDO = '@cf/black-forest-labs/flux-1-schnell';

export function iaConfigurada() {
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
}

/* ---------- Del español a una descripción precisa en inglés (el modelo entiende mejor el inglés) ---------- */

const sinTildes = (t) =>
    String(t || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();

const limpio = (t, max) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, max);

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
    [/top|crop/, 'crop top'],
    [/body/, 'bodysuit'],
    [/enterizo|jumpsuit|overol/, 'jumpsuit'],
];

export function prendaEnIngles(tipo) {
    const t = sinTildes(tipo);
    return PRENDAS.find(([patron]) => patron.test(t))?.[1] || tipo;
}

// Telas y fibras (tipo de tejido y composición)
const TEJIDOS = [
    [/french terry/, 'french terry knit'],
    [/jersey/, 'soft jersey knit'],
    [/interlock/, 'interlock knit'],
    [/rib/, 'ribbed knit'],
    [/punto/, 'knit fabric'],
    [/denim|jean/, 'denim twill'],
    [/drill/, 'drill twill'],
    [/gabardina/, 'gabardine'],
    [/popelina/, 'poplin'],
    [/lino/, 'linen'],
    [/saten|satin/, 'satin with a soft sheen'],
    [/tafetan/, 'taffeta'],
    [/chifon|gasa/, 'sheer chiffon'],
    [/licra|lycra|spandex/, 'stretch lycra'],
    [/plano/, 'woven fabric'],
    [/encaje/, 'lace'],
    [/terciopelo/, 'velvet'],
    [/seda/, 'silk'],
    [/algodon|algoon/, 'cotton'],
    [/poliester/, 'polyester'],
];

const FIBRAS = {
    algodon: 'cotton',
    poliester: 'polyester',
    elastano: 'elastane',
    spandex: 'spandex',
    licra: 'lycra',
    lino: 'linen',
    seda: 'silk',
    lana: 'wool',
    viscosa: 'viscose',
    rayon: 'rayon',
    nylon: 'nylon',
    nailon: 'nylon',
    acrilico: 'acrylic',
};

function tejidoEnIngles(...textos) {
    const t = sinTildes(textos.filter(Boolean).join(' '));
    return TEJIDOS.find(([patron]) => patron.test(t))?.[1] || '';
}

// "95% algodón, 5% elastano" → "95% cotton, 5% elastane"
function composicionEnIngles(composicion) {
    return limpio(sinTildes(composicion).replace(/[a-z]+/g, (palabra) => FIBRAS[palabra] || palabra), 80);
}

// Detalles de diseño frecuentes en las descripciones y en los insumos (frases primero, luego palabras)
const FRASES = [
    [/escote en v profundo|en v profundo|v profundo/g, 'deep plunging V-neckline'],
    [/escote en v|cuello en v|cuello v|en v\b/g, 'V-neckline'],
    [/a los lados|en los lados|a cada lado/g, 'on both sides'],
    [/al frente|en el frente/g, 'at the front'],
    [/en la espalda/g, 'at the back'],
    [/tiras cruzadas|tirantes cruzados/g, 'crisscross straps'],
    [/escote redondo|cuello redondo/g, 'crew neckline'],
    [/escote cuadrado/g, 'square neckline'],
    [/escote corazon/g, 'sweetheart neckline'],
    [/escote halter|halter/g, 'halter neckline'],
    [/escote en la espalda|espalda descubierta|espalda abierta/g, 'open back'],
    [/hombros descubiertos|off shoulder/g, 'off-the-shoulder'],
    [/cuello alto|cuello tortuga/g, 'high turtleneck collar'],
    [/cuello camisero|cuello de camisa/g, 'shirt collar'],
    [/manga larga/g, 'long sleeves'],
    [/manga corta/g, 'short sleeves'],
    [/manga tres cuartos|manga 3\/4/g, 'three-quarter sleeves'],
    [/sin mangas|manga sisa/g, 'sleeveless'],
    [/manga bombacha|manga globo|manga abullonada/g, 'puff sleeves'],
    [/manga campana/g, 'bell sleeves'],
    [/tiras ajustables/g, 'adjustable straps'],
    [/tiras delgadas|tirantes delgados/g, 'thin spaghetti straps'],
    [/cintura alta|tiro alto/g, 'high waist'],
    [/cintura baja|tiro bajo/g, 'low rise'],
    [/pretina elastica|cintura elastica/g, 'elastic waistband'],
    [/bolsillo trasero|bolsillos traseros/g, 'back pockets'],
    [/bolsillo delantero|bolsillos delanteros/g, 'front pockets'],
    [/bolsillo de parche|bolsillos de parche/g, 'patch pockets'],
    [/con capota|capucha/g, 'hood'],
    [/boton de presion|broche de presion/g, 'snap button'],
    [/cierre invisible|cremallera invisible/g, 'invisible zipper'],
    [/cordon ajustable|cordon/g, 'drawstring'],
    [/doble costura/g, 'double stitching'],
    [/costura francesa/g, 'french seams'],
    [/estampado floral/g, 'floral print'],
    [/estampado animal/g, 'animal print'],
    [/rayas|a rayas/g, 'stripes'],
    [/cuadros|a cuadros/g, 'plaid checks'],
    [/lunares/g, 'polka dots'],
    [/ajustado|ajustada|entallado|entallada/g, 'fitted'],
    [/holgado|holgada|oversize/g, 'loose oversized fit'],
    [/largo a la rodilla|hasta la rodilla/g, 'knee-length'],
    [/largo midi|midi/g, 'midi length'],
    [/largo maxi|maxi/g, 'maxi length'],
    [/corto|corta/g, 'short'],
    [/acolchado|acolchada|relleno/g, 'padded'],
    [/forrado|forrada|con forro/g, 'lined'],
];

const PALABRAS = {
    boton: 'button', botones: 'buttons', cremallera: 'zipper', cierre: 'zipper', elastico: 'elastic band', elasticos: 'elastic bands',
    marquilla: 'woven label', etiqueta: 'label', hilo: 'thread', encaje: 'lace trim', cinta: 'ribbon tape', sesgo: 'bias binding',
    argolla: 'metal ring', argollas: 'metal rings', hebilla: 'buckle', hebillas: 'buckles', remache: 'rivet', remaches: 'rivets',
    ojalete: 'eyelet', ojaletes: 'eyelets', copa: 'molded cup', copas: 'molded cups', varilla: 'underwire', aro: 'underwire',
    taches: 'studs', lentejuelas: 'sequins', bordado: 'embroidery', estampado: 'print', apliques: 'appliques', flecos: 'fringe',
    volante: 'ruffle', volantes: 'ruffles', boleros: 'ruffles', pliegues: 'pleats', prenses: 'pleats', fruncido: 'gathered',
    tiras: 'straps', tira: 'strap', bolsillo: 'pocket', bolsillos: 'pockets', puno: 'cuff', punos: 'cuffs', cuello: 'collar',
    escote: 'neckline', espalda: 'back', manga: 'sleeve', mangas: 'sleeves', cintura: 'waist', pretina: 'waistband', ruedo: 'hem',
    dobladillo: 'hem', abertura: 'slit', aberturas: 'slits', lazo: 'bow', mono: 'bow', nudo: 'knot', cruzado: 'crossover',
    pasador: 'belt loop', pasadores: 'belt loops', correa: 'belt', cinturon: 'belt', delantero: 'front', trasero: 'back', lateral: 'side',
    blanco: 'white', blanca: 'white', blancos: 'white', negro: 'black', negra: 'black', negros: 'black', rojo: 'red', roja: 'red',
    azul: 'blue', verde: 'green', amarillo: 'yellow', amarilla: 'yellow', rosado: 'pink', rosada: 'pink', rosa: 'pink',
    morado: 'purple', morada: 'purple', gris: 'grey', beige: 'beige', cafe: 'brown', marron: 'brown', dorado: 'gold', dorada: 'gold',
    plateado: 'silver', plateada: 'silver', naranja: 'orange', fucsia: 'fuchsia', vinotinto: 'burgundy', turquesa: 'turquoise',
    metal: 'metal', metalico: 'metallic', plastico: 'plastic', madera: 'wooden', nacar: 'mother-of-pearl', pasta: 'resin',
    profundo: 'deep', profunda: 'deep', cruzado: 'crossed', cruzada: 'crossed', cruzados: 'crossed', cruzadas: 'crossed',
    removible: 'removable', removibles: 'removable', ajustable: 'adjustable', ajustables: 'adjustable', grande: 'large', grandes: 'large',
    pequeno: 'small', pequena: 'small', pequenos: 'small', pequenas: 'small', delgado: 'thin', delgada: 'thin', ancho: 'wide', ancha: 'wide',
    redondo: 'round', redonda: 'round', cuadrado: 'square', cuadrada: 'square', doble: 'double', lado: 'side', lados: 'sides', frente: 'front',
    doradas: 'gold', dorados: 'gold', plateadas: 'silver', plateados: 'silver', blancas: 'white', negras: 'black', rojos: 'red', rojas: 'red',
    azules: 'blue', verdes: 'green', grises: 'grey', rosadas: 'pink', rosados: 'pink',
    comun: '', de: '', del: '', la: '', el: '', los: '', las: '', con: 'with', y: 'and', en: 'in', sin: 'without', para: 'for', a: '',
};

// Adjetivos que en español van después del sustantivo y en inglés antes
const ADJETIVOS = new Set([
    'white', 'black', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'grey', 'beige', 'brown', 'gold', 'silver', 'orange',
    'fuchsia', 'burgundy', 'turquoise', 'metallic', 'removable', 'adjustable', 'large', 'small', 'thin', 'wide', 'round',
    'square', 'double', 'deep', 'crossed', 'wooden', 'plastic', 'mother-of-pearl', 'resin',
]);
const CONECTORES = /\b(?:with|on|at|in|and|for|without)\b/;

// Traduce lo que reconoce y deja el resto igual (los nombres propios siguen ayudando al modelo)
function traducir(texto, max = 140) {
    let t = sinTildes(texto);
    for (const [patron, ingles] of FRASES) t = t.replace(patron, ingles);
    t = t.replace(/[a-zñ]+/g, (palabra) => (palabra in PALABRAS ? PALABRAS[palabra] : palabra));
    // "metal rings gold on both sides" → "gold metal rings on both sides": en cada tramo (entre comas y conectores)
    // los adjetivos del final pasan al principio
    t = t
        .split(new RegExp(`([,;]|${CONECTORES.source})`))
        .map((tramo) => {
            const palabras = tramo.trim().split(/\s+/).filter(Boolean);
            const finales = [];
            while (palabras.length > 1 && ADJETIVOS.has(palabras.at(-1))) finales.unshift(palabras.pop());
            return [...finales, ...palabras].join(' ');
        })
        .filter(Boolean)
        .join(' ');
    return limpio(t.replace(/\s+([,.;])/g, '$1'), max);
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

/**
 * Descripción de la prenda para la IA, en este orden (lo primero pesa más):
 * prenda y color → tela → detalles de diseño → insumos visibles → estilo de la foto.
 * materias: [{ nombre, color, composicion, tipo_tejido }]
 * insumos:  [{ nombre, categoria, cantidad, unidad }]
 * descripciones: [{ nombre, descripcion }]
 */
export function construirPrompt({ tipo, materias = [], insumos = [], descripciones = [] }) {
    const prenda = prendaEnIngles(tipo);
    const principal = materias[0];
    const colorPrincipal = principal ? colorEnIngles(principal.color) : '';

    const telas = materias.slice(0, 3).map((m, i) => {
        const tejido = tejidoEnIngles(m.tipo_tejido, m.nombre, m.composicion) || 'fabric';
        const composicion = m.composicion ? ` (${composicionEnIngles(m.composicion)})` : '';
        const papel = i === 0 ? 'main fabric' : 'contrast fabric';
        return `${papel}: ${colorEnIngles(m.color)} ${tejido}${composicion}`.replace(/\s+/g, ' ');
    });

    // "Escote: en V; con ribete" → "neckline: V-neckline; with trim"
    const grupos = new Map();
    descripciones.slice(0, 20).forEach((d) => {
        const titulo = traducir(d.nombre, 40);
        grupos.set(titulo, [...(grupos.get(titulo) || []), traducir(d.descripcion, 140)].filter(Boolean));
    });
    const detalles = [...grupos].map(([titulo, textos]) => (textos.length ? `${titulo}: ${textos.join('; ')}` : titulo));

    // Insumos que se ven en la prenda, con cantidad cuando es por unidad ("3 white buttons")
    const NO_VISIBLES = /hilo|thread|marquilla|etiqueta|label|empaque|bolsa|entretela/;
    const avios = insumos
        .filter((i) => !NO_VISIBLES.test(sinTildes(`${i.nombre} ${i.categoria || ''}`)))
        .slice(0, 8)
        .map((i) => {
            const cantidad = Number(i.cantidad);
            const contable = /unidad/.test(sinTildes(i.unidad)) && Number.isInteger(cantidad) && cantidad > 0 && cantidad <= 20;
            const nombre = traducir(i.nombre, 50);
            // "2 gold metal ring" → "2 gold metal rings"
            const plural = contable && cantidad > 1 && !/s$/.test(nombre) ? `${nombre}s` : nombre;
            return `${contable ? `${cantidad} ` : ''}${plural}`;
        });

    const partes = [
        `Professional e-commerce product photograph of a single ${colorPrincipal ? `${colorPrincipal} ` : ''}${prenda}`,
        telas.length ? telas.join('; ') : '',
        detalles.length ? `design details: ${detalles.join('; ')}` : '',
        avios.length ? `visible trims and hardware: ${avios.join(', ')}` : '',
        `garment type in Spanish: ${limpio(tipo, 60)}`,
        'displayed on an invisible ghost mannequin, front view, the whole garment centered and fully visible, plain light grey seamless studio background, soft diffused lighting, accurate true-to-life colors, sharp focus on fabric texture, stitching and seams, photorealistic, high detail',
        'no person, no face, no text, no logo, no watermark, no extra garments',
    ];
    return partes.filter(Boolean).join('. ').slice(0, 2000);
}

/* ---------- Llamada al servicio ---------- */

function errorCloudflare(res, datos) {
    const detalle = datos?.errors?.[0]?.message || `HTTP ${res.status}`;
    if (res.status === 401 || res.status === 403) {
        return Object.assign(new Error('La llave de Cloudflare no es válida o no tiene permiso de Workers AI.'), { status: 502, detalle, definitivo: true });
    }
    if (res.status === 429) {
        return Object.assign(new Error('Se alcanzó el límite gratuito de imágenes de hoy. Intenta mañana.'), { status: 429, detalle, definitivo: true });
    }
    return Object.assign(new Error('El servicio de IA no pudo crear la imagen. Intenta de nuevo.'), { status: 502, detalle });
}

async function llamarModelo(modelo, prompt) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${modelo}`;
    const cabeceras = { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` };
    let cuerpo;
    if (modelo.includes('flux-2')) {
        // FLUX.2 recibe un formulario (multipart); vertical para que quepa la prenda completa
        cuerpo = new FormData();
        cuerpo.append('prompt', prompt);
        cuerpo.append('width', '768');
        cuerpo.append('height', '1024');
    } else {
        // FLUX.1 [schnell]: 8 pasos, la mayor calidad que permite el modelo
        cuerpo = JSON.stringify({ prompt, steps: 8, seed: Math.floor(Math.random() * 1e9) });
        cabeceras['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, { method: 'POST', headers: cabeceras, body: cuerpo, signal: AbortSignal.timeout(90000) });
    const datos = await res.json().catch(() => ({}));
    const imagen = datos?.result?.image || datos?.image;
    if (!res.ok || !imagen) throw errorCloudflare(res, datos);
    // FLUX.2 entrega PNG y FLUX.1 JPEG; se detecta por los primeros bytes
    const tipo = imagen.startsWith('iVBOR') ? 'png' : 'jpeg';
    return `data:image/${tipo};base64,${imagen}`;
}

export async function generarImagenIA(prompt) {
    if (!iaConfigurada()) {
        throw Object.assign(new Error('La IA de imágenes no está configurada (faltan CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN en el .env).'), { status: 503 });
    }
    try {
        return await llamarModelo(MODELO_PRINCIPAL, prompt);
    } catch (error) {
        // Llave inválida o cupo agotado: el otro modelo tampoco funcionaría
        if (error.definitivo || MODELO_PRINCIPAL === MODELO_RESPALDO) throw error;
        console.warn(`La IA ${MODELO_PRINCIPAL} falló (${error.detalle || error.message}); se usa ${MODELO_RESPALDO}.`);
        return llamarModelo(MODELO_RESPALDO, prompt);
    }
}
