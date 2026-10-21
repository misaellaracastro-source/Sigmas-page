import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion } from '../../services/sesion.js';
import { cifrarContrasena, verificarContrasena, contrasenaSegura, crearToken } from '../../services/seguridad.js';
import { normalizarNit } from '../../services/nit.js';
import { guardarFoto, borrarFoto } from '../../services/fotos.js';
import { texto } from '../../services/validacion.js';

// Rutas: /api/auth (no exigen sesión, salvo /yo, /perfil y /contrasena)
const router = Router();

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TELEFONO_RE = /^[\d\s+()-]{7,20}$/;
const CAMPOS_USUARIO = 'nit, nombre_dueno, foto, nombre_empresa, correo, logo_empresa, direccion_empresa, telefono_contacto, red_social';
const SIN_CONTRASENA = '!google'; // cuentas creadas solo con Google

// Las cuentas creadas con Google empiezan con una llave temporal ("G" + id de Google)
// hasta que la empresa escriba su NIT en el perfil. Un NIT real nunca empieza con letra.
const esNitTemporal = (nit) => String(nit).startsWith('G');

async function buscarUsuario(columna, valor) {
    const [filas] = await connection.query(`SELECT ${CAMPOS_USUARIO}, contrasena, google_id FROM usuario WHERE ${columna} = ? LIMIT 1`, [valor]);
    return filas[0];
}

// Datos que puede ver el front (nunca la contraseña)
function publico(usuario) {
    const { contrasena, google_id, ...datos } = usuario;
    return {
        ...datos,
        nit_temporal: esNitTemporal(usuario.nit),
        con_google: Boolean(google_id),
        tiene_contrasena: contrasena !== SIN_CONTRASENA,
        perfil_completo: !esNitTemporal(usuario.nit) && Boolean(usuario.nombre_empresa) && Boolean(usuario.direccion_empresa),
    };
}

function respuestaSesion(usuario) {
    return { token: crearToken(usuario.nit), usuario: publico(usuario) };
}

// Verifica el token de Google con el servicio oficial y que sea para este cliente
async function verificarGoogle(credencial) {
    const clienteId = process.env.GOOGLE_CLIENT_ID;
    if (!clienteId) throw Object.assign(new Error('El inicio con Google no está configurado (falta GOOGLE_CLIENT_ID).'), { status: 503 });
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credencial)}`);
    const datos = await res.json().catch(() => ({}));
    const valido =
        res.ok &&
        datos.aud === clienteId &&
        ['accounts.google.com', 'https://accounts.google.com'].includes(datos.iss) &&
        String(datos.email_verified) === 'true' &&
        Number(datos.exp) * 1000 > Date.now();
    if (!valido) throw Object.assign(new Error('No se pudo verificar tu cuenta de Google. Intenta de nuevo.'), { status: 401 });
    return { googleId: datos.sub, correo: datos.email.toLowerCase(), nombre: datos.name || '', foto: datos.picture || '' };
}

// GET /api/auth/config: lo que el front necesita saber (sin secretos)
router.get('/config', (req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

// POST /api/auth/registro   (registro con el formulario: NIT y contraseña obligatorios)
router.post('/registro', async (req, res) => {
    const body = req.body ?? {};
    const errores = {};
    const datos = {
        nombre_dueno: texto(body.nombre_dueno),
        nombre_empresa: texto(body.nombre_empresa),
        correo: texto(body.correo).toLowerCase(),
        telefono_contacto: texto(body.telefono_contacto) || null,
        direccion_empresa: texto(body.direccion_empresa),
        red_social: texto(body.red_social) || null,
    };

    const nit = normalizarNit(body.nit);
    if (nit.error) errores.nit = nit.error;
    if (datos.nombre_dueno.length < 3 || datos.nombre_dueno.length > 100) errores.nombre_dueno = 'Escribe el nombre completo del dueño.';
    if (datos.nombre_empresa.length < 2 || datos.nombre_empresa.length > 100) errores.nombre_empresa = 'Escribe el nombre de la empresa.';
    if (!CORREO_RE.test(datos.correo) || datos.correo.length > 120) errores.correo = 'Escribe un correo válido.';
    if (datos.telefono_contacto && !TELEFONO_RE.test(datos.telefono_contacto)) errores.telefono_contacto = 'Escribe un teléfono válido.';
    if (!datos.direccion_empresa || datos.direccion_empresa.length > 150) errores.direccion_empresa = 'Escribe la dirección de la empresa.';
    if (datos.red_social && datos.red_social.length > 150) errores.red_social = 'Máximo 150 caracteres.';

    const contrasena = String(body.contrasena ?? '');
    if (!contrasenaSegura(contrasena)) errores.contrasena = 'Mínimo 8 caracteres, con letras, números y un carácter especial.';
    else if (contrasena !== body.confirmacion) errores.confirmacion = 'Las contraseñas no coinciden.';
    if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los campos marcados.', errores });

    let foto = null;
    let logo = null;
    try {
        if (await buscarUsuario('nit', nit.valor)) {
            return res.status(409).json({ message: 'Esa empresa ya tiene cuenta.', errores: { nit: 'Ya existe una cuenta con este NIT. Inicia sesión.' } });
        }
        if (await buscarUsuario('correo', datos.correo)) {
            return res.status(409).json({ message: 'Ese correo ya tiene cuenta.', errores: { correo: 'Este correo ya está registrado.' } });
        }
        const base = nit.valor.replace('-', '');
        if (body.foto_base64) foto = await guardarFoto(body.foto_base64, 'usuarios', `dueno-${base}`);
        if (body.logo_base64) logo = await guardarFoto(body.logo_base64, 'usuarios', `logo-${base}`);

        await connection.query(
            `INSERT INTO usuario (nit, nombre_dueno, foto, nombre_empresa, correo, logo_empresa, contrasena,
                                  direccion_empresa, telefono_contacto, red_social)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nit.valor, datos.nombre_dueno, foto, datos.nombre_empresa, datos.correo, logo, cifrarContrasena(contrasena),
                datos.direccion_empresa, datos.telefono_contacto, datos.red_social,
            ],
        );
        res.status(201).json(respuestaSesion(await buscarUsuario('nit', nit.valor)));
    } catch (error) {
        await borrarFoto(foto);
        await borrarFoto(logo);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe una cuenta con ese NIT o correo.' });
        if (error.message.startsWith('La foto')) return res.status(400).json({ message: error.message });
        console.error('Error al registrar usuario:', error.message);
        res.status(500).json({ message: 'No se pudo crear la cuenta.' });
    }
});

// POST /api/auth/login   { nit, contrasena }
router.post('/login', async (req, res) => {
    const nit = normalizarNit(req.body?.nit);
    const contrasena = String(req.body?.contrasena ?? '');
    const invalido = () => res.status(401).json({ message: 'NIT o contraseña incorrectos.' });
    if (nit.error || !contrasena) return invalido();
    try {
        const usuario = await buscarUsuario('nit', nit.valor);
        if (!usuario) return invalido();
        if (usuario.contrasena === SIN_CONTRASENA) {
            return res.status(401).json({ message: 'Esta cuenta se creó con Google. Usa “Continuar con Google” o crea una contraseña en tu perfil.' });
        }
        if (!verificarContrasena(contrasena, usuario.contrasena)) return invalido();
        res.json(respuestaSesion(usuario));
    } catch (error) {
        console.error('Error al iniciar sesión:', error.message);
        res.status(500).json({ message: 'No se pudo iniciar sesión.' });
    }
});

// POST /api/auth/google   { credential }
// Si la cuenta de Google es nueva, se crea al instante con su nombre, correo y foto;
// los datos de la empresa se completan después en el perfil.
router.post('/google', async (req, res) => {
    try {
        const google = await verificarGoogle(req.body?.credential);
        let usuario = (await buscarUsuario('google_id', google.googleId)) || (await buscarUsuario('correo', google.correo));

        if (usuario) {
            if (!usuario.google_id) {
                await connection.query('UPDATE usuario SET google_id = ? WHERE nit = ?', [google.googleId, usuario.nit]);
            }
            return res.json({ ...respuestaSesion(usuario), nuevo: false });
        }

        const nitTemporal = `G${google.googleId.slice(-19)}`;
        await connection.query(
            `INSERT INTO usuario (nit, nombre_dueno, foto, nombre_empresa, correo, google_id, contrasena)
             VALUES (?, ?, ?, '', ?, ?, ?)`,
            [nitTemporal, (google.nombre || google.correo.split('@')[0]).slice(0, 100), google.foto || null, google.correo, google.googleId, SIN_CONTRASENA],
        );
        res.status(201).json({ ...respuestaSesion(await buscarUsuario('nit', nitTemporal)), nuevo: true });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        console.error('Error al iniciar con Google:', error.message);
        res.status(500).json({ message: 'No se pudo iniciar sesión con Google.' });
    }
});

// GET /api/auth/yo: datos de la empresa de la sesión
router.get('/yo', exigirSesion, async (req, res) => {
    try {
        const usuario = await buscarUsuario('nit', req.nit);
        if (!usuario) return res.status(401).json({ message: 'La cuenta ya no existe.' });
        res.json(publico(usuario));
    } catch (error) {
        console.error('Error al consultar el usuario:', error.message);
        res.status(500).json({ message: 'No se pudo consultar la cuenta.' });
    }
});

// PUT /api/auth/perfil: actualiza los datos de la empresa y del dueño.
// El NIT solo se puede escribir si la cuenta aún tiene la llave temporal de Google;
// al cambiarlo, la base de datos lo actualiza en todas las tablas (ON UPDATE CASCADE).
router.put('/perfil', exigirSesion, async (req, res) => {
    const body = req.body ?? {};
    const errores = {};
    let fotoNueva = null;
    let logoNuevo = null;
    try {
        const actual = await buscarUsuario('nit', req.nit);
        if (!actual) return res.status(401).json({ message: 'La cuenta ya no existe.' });

        const datos = {
            nombre_dueno: texto(body.nombre_dueno),
            nombre_empresa: texto(body.nombre_empresa),
            direccion_empresa: texto(body.direccion_empresa),
            telefono_contacto: texto(body.telefono_contacto) || null,
            red_social: texto(body.red_social) || null,
            // Con Google el correo es el de la cuenta de Google
            correo: actual.google_id ? actual.correo : texto(body.correo).toLowerCase(),
        };

        let nit = actual.nit;
        if (esNitTemporal(actual.nit)) {
            const nuevo = normalizarNit(body.nit);
            if (nuevo.error) errores.nit = nuevo.error;
            else nit = nuevo.valor;
        }
        if (datos.nombre_dueno.length < 3 || datos.nombre_dueno.length > 100) errores.nombre_dueno = 'Escribe el nombre completo del dueño.';
        if (datos.nombre_empresa.length < 2 || datos.nombre_empresa.length > 100) errores.nombre_empresa = 'Escribe el nombre de la empresa.';
        if (!datos.direccion_empresa || datos.direccion_empresa.length > 150) errores.direccion_empresa = 'Escribe la dirección de la empresa.';
        if (!CORREO_RE.test(datos.correo) || datos.correo.length > 120) errores.correo = 'Escribe un correo válido.';
        if (datos.telefono_contacto && !TELEFONO_RE.test(datos.telefono_contacto)) errores.telefono_contacto = 'Escribe un teléfono válido.';
        if (datos.red_social && datos.red_social.length > 150) errores.red_social = 'Máximo 150 caracteres.';
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los campos marcados.', errores });

        if (nit !== actual.nit && (await buscarUsuario('nit', nit))) {
            return res.status(409).json({ message: 'Ese NIT ya tiene cuenta.', errores: { nit: 'Ya existe una cuenta con este NIT.' } });
        }
        if (datos.correo !== actual.correo && (await buscarUsuario('correo', datos.correo))) {
            return res.status(409).json({ message: 'Ese correo ya tiene cuenta.', errores: { correo: 'Este correo ya está registrado en otra cuenta.' } });
        }

        const base = nit.replace(/[^0-9A-Za-z]/g, '');
        let foto = actual.foto;
        if (body.foto_base64) foto = fotoNueva = await guardarFoto(body.foto_base64, 'usuarios', `dueno-${base}`);
        else if (body.quitar_foto) foto = null;
        let logo = actual.logo_empresa;
        if (body.logo_base64) logo = logoNuevo = await guardarFoto(body.logo_base64, 'usuarios', `logo-${base}`);
        else if (body.quitar_logo) logo = null;

        await connection.query(
            `UPDATE usuario SET nit = ?, nombre_dueno = ?, foto = ?, nombre_empresa = ?, correo = ?, logo_empresa = ?,
                                direccion_empresa = ?, telefono_contacto = ?, red_social = ?
             WHERE nit = ?`,
            [nit, datos.nombre_dueno, foto, datos.nombre_empresa, datos.correo, logo, datos.direccion_empresa,
             datos.telefono_contacto, datos.red_social, actual.nit],
        );
        if (foto !== actual.foto) await borrarFoto(actual.foto);
        if (logo !== actual.logo_empresa) await borrarFoto(actual.logo_empresa);

        // El token lleva el NIT: si cambió, se entrega uno nuevo
        res.json({ message: 'Perfil actualizado.', ...respuestaSesion(await buscarUsuario('nit', nit)) });
    } catch (error) {
        await borrarFoto(fotoNueva);
        await borrarFoto(logoNuevo);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe una cuenta con ese NIT o correo.' });
        if (error.message.startsWith('La foto')) return res.status(400).json({ message: error.message });
        console.error('Error al actualizar el perfil:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar el perfil.' });
    }
});

// PUT /api/auth/contrasena   { actual, nueva, confirmacion }
// Las cuentas de Google pueden crear su primera contraseña sin escribir la actual
router.put('/contrasena', exigirSesion, async (req, res) => {
    const { actual = '', nueva = '', confirmacion = '' } = req.body ?? {};
    try {
        const usuario = await buscarUsuario('nit', req.nit);
        if (!usuario) return res.status(401).json({ message: 'La cuenta ya no existe.' });

        const errores = {};
        const tiene = usuario.contrasena !== SIN_CONTRASENA;
        if (tiene && !verificarContrasena(String(actual), usuario.contrasena)) errores.actual = 'La contraseña actual no es correcta.';
        if (!contrasenaSegura(String(nueva))) errores.nueva = 'Mínimo 8 caracteres, con letras, números y un carácter especial.';
        else if (nueva !== confirmacion) errores.confirmacion = 'Las contraseñas no coinciden.';
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los campos marcados.', errores });

        await connection.query('UPDATE usuario SET contrasena = ? WHERE nit = ?', [cifrarContrasena(String(nueva)), usuario.nit]);
        res.json({ message: tiene ? 'Contraseña actualizada.' : 'Contraseña creada. Ya puedes entrar también con tu NIT.' });
    } catch (error) {
        console.error('Error al cambiar la contraseña:', error.message);
        res.status(500).json({ message: 'No se pudo cambiar la contraseña.' });
    }
});

export default router;
