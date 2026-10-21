import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Carpeta backend/archivos: NO se sirve en público. Los archivos solo se entregan por rutas con sesión.
// En Render se usa CARPETA_DATOS (el disco persistente) para que las facturas no se borren en cada despliegue.
export const CARPETA_ARCHIVOS = process.env.CARPETA_DATOS
    ? path.join(process.env.CARPETA_DATOS, 'archivos')
    : fileURLToPath(new URL('../../archivos', import.meta.url));

const TAMANO_MAXIMO = 5 * 1024 * 1024; // 5 MB
const TIPOS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
export const TIPO_POR_EXTENSION = Object.fromEntries(Object.entries(TIPOS).map(([tipo, ext]) => [ext, tipo]));

// Guarda un archivo que llega en base64 (data:<tipo>;base64,...) y devuelve su ruta relativa (carpeta/nombre)
export async function guardarArchivo(dataUrl, carpeta, nombreBase) {
    const partes = String(dataUrl).match(/^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/);
    const extension = partes && TIPOS[partes[1]];
    if (!extension) throw new Error('El archivo debe ser PDF, JPG, PNG o WEBP.');

    const contenido = Buffer.from(partes[2], 'base64');
    if (contenido.length > TAMANO_MAXIMO) throw new Error('El archivo es demasiado grande (máximo 5 MB).');

    const nombre = `${String(nombreBase).toLowerCase().replace(/[^a-z0-9_-]/g, '')}-${Date.now()}.${extension}`;
    await fs.mkdir(path.join(CARPETA_ARCHIVOS, carpeta), { recursive: true });
    await fs.writeFile(path.join(CARPETA_ARCHIVOS, carpeta, nombre), contenido);
    return `${carpeta}/${nombre}`;
}

// Ruta absoluta de un archivo guardado; null si intenta salir de la carpeta
export function rutaArchivo(relativa) {
    if (!relativa) return null;
    const archivo = path.resolve(CARPETA_ARCHIVOS, relativa);
    return archivo.startsWith(CARPETA_ARCHIVOS + path.sep) ? archivo : null;
}

export async function borrarArchivo(relativa) {
    const archivo = rutaArchivo(relativa);
    if (archivo) await fs.unlink(archivo).catch(() => {});
}
