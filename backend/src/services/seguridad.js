import crypto from 'node:crypto';

// Contraseñas: scrypt con sal aleatoria (formato scrypt$sal$hash). Nunca se guardan en texto plano.
export function cifrarContrasena(contrasena) {
    const sal = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(contrasena, sal, 64).toString('hex');
    return `scrypt$${sal}$${hash}`;
}

export function verificarContrasena(contrasena, guardada) {
    const [tipo, sal, hash] = String(guardada).split('$');
    if (tipo !== 'scrypt' || !sal || !hash) return false;
    const calculado = crypto.scryptSync(contrasena, sal, 64);
    const esperado = Buffer.from(hash, 'hex');
    return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

// Mínimo 8 caracteres, con letra, número y carácter especial
export function contrasenaSegura(contrasena) {
    return (
        typeof contrasena === 'string' &&
        contrasena.length >= 8 &&
        contrasena.length <= 72 &&
        /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(contrasena) &&
        /\d/.test(contrasena) &&
        /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s]/.test(contrasena)
    );
}

/* ---------- Token de sesión firmado (HMAC-SHA256) ---------- */

const DURACION_MS = 1000 * 60 * 60 * 12; // 12 horas

function secreto() {
    const valor = process.env.SESSION_SECRET;
    if (!valor || valor.length < 32) throw new Error('Falta SESSION_SECRET en el .env (mínimo 32 caracteres).');
    return valor;
}

function firmar(datos) {
    return crypto.createHmac('sha256', secreto()).update(datos).digest('base64url');
}

export function crearToken(nit) {
    const datos = Buffer.from(JSON.stringify({ nit, exp: Date.now() + DURACION_MS })).toString('base64url');
    return `${datos}.${firmar(datos)}`;
}

// Devuelve el NIT si el token es válido y no ha vencido; si no, null
export function leerToken(token) {
    const [datos, firma] = String(token ?? '').split('.');
    if (!datos || !firma) return null;
    const esperada = Buffer.from(firmar(datos));
    const recibida = Buffer.from(firma);
    if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null;
    try {
        const { nit, exp } = JSON.parse(Buffer.from(datos, 'base64url').toString());
        return nit && exp > Date.now() ? nit : null;
    } catch {
        return null;
    }
}
