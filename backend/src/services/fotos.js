import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Carpeta backend/uploads, servida en /uploads por el servidor.
// En Render se usa CARPETA_DATOS (el disco persistente) para que las fotos no se borren en cada despliegue.
export const CARPETA_UPLOADS = process.env.CARPETA_DATOS
    ? path.join(process.env.CARPETA_DATOS, 'uploads')
    : fileURLToPath(new URL('../../uploads', import.meta.url));

const TAMANO_MAXIMO = 3 * 1024 * 1024; // 3 MB

// Guarda una imagen que llega en base64 (data:image/...;base64,...) y devuelve su ruta pública
export async function guardarFoto(dataUrl, carpeta, nombreBase) {
    const partes = String(dataUrl).match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!partes) throw new Error('La foto debe ser una imagen JPG, PNG o WEBP.');

    const contenido = Buffer.from(partes[2], 'base64');
    if (contenido.length > TAMANO_MAXIMO) throw new Error('La foto es demasiado grande (máximo 3 MB).');

    const extension = partes[1] === 'jpeg' ? 'jpg' : partes[1];
    const nombre = `${String(nombreBase).toLowerCase().replace(/[^a-z0-9_-]/g, '')}-${Date.now()}.${extension}`;
    const destino = path.join(CARPETA_UPLOADS, carpeta);

    await fs.mkdir(destino, { recursive: true });
    await fs.writeFile(path.join(destino, nombre), contenido);
    return `/uploads/${carpeta}/${nombre}`;
}

// Borra una foto guardada antes; nunca sale de la carpeta uploads
export async function borrarFoto(rutaPublica) {
    if (!rutaPublica || !rutaPublica.startsWith('/uploads/')) return;
    const archivo = path.resolve(CARPETA_UPLOADS, rutaPublica.slice('/uploads/'.length));
    if (!archivo.startsWith(CARPETA_UPLOADS + path.sep)) return;
    await fs.unlink(archivo).catch(() => {});
}
