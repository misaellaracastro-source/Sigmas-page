import { connection } from '../config/mysql/dbmysql.js';
import { leerToken } from './seguridad.js';

// Middleware: exige "Authorization: Bearer <token>" y deja el NIT de la empresa en req.nit.
// También confirma que la cuenta exista (el NIT pudo cambiar al completar el perfil).
export async function exigirSesion(req, res, next) {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const nit = leerToken(token);
    const terminada = () => res.status(401).json({ message: 'Tu sesión terminó. Inicia sesión de nuevo.' });
    if (!nit) return terminada();
    try {
        const [filas] = await connection.query('SELECT 1 FROM usuario WHERE nit = ? LIMIT 1', [nit]);
        if (filas.length === 0) return terminada();
    } catch (error) {
        console.error('Error al validar la sesión:', error.message);
        return res.status(500).json({ message: 'No se pudo validar la sesión.' });
    }
    req.nit = nit;
    next();
}

// Empresa de la sesión (siempre después de exigirSesion)
export function nitEmpresa(req) {
    return req.nit;
}
