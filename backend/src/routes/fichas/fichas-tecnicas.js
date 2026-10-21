import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { texto } from '../../services/validacion.js';
import { enTransaccion } from '../../services/precios.js';

// Rutas: /api/fichas-tecnicas
const router = Router();
router.use(exigirSesion);

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PRENDAS = 1000000;

const COLUMNAS = `f.id_ficha, DATE_FORMAT(f.fecha, '%Y-%m-%d') AS fecha, f.id_referencia, f.observaciones, r.tipo, r.foto`;
const DESDE = 'FROM ficha_tecnica f LEFT JOIN referencia r ON r.id_referencia = f.id_referencia';

// Ficha completa: procesos, tallas y las descripciones de la referencia
async function detalle(req, id) {
    const [[ficha]] = await connection.query(`SELECT ${COLUMNAS} ${DESDE} WHERE f.id_ficha = ? AND f.nit_usuario = ?`, [
        id,
        nitEmpresa(req),
    ]);
    if (!ficha) return null;
    const [procesos] = await connection.query(
        'SELECT nombre, descripcion FROM ficha_proceso WHERE id_ficha = ? ORDER BY orden',
        [ficha.id_ficha],
    );
    const [tallas] = await connection.query('SELECT talla, cantidad FROM ficha_talla WHERE id_ficha = ? ORDER BY id_ficha_talla', [
        ficha.id_ficha,
    ]);
    const [descripciones] = ficha.id_referencia
        ? await connection.query(
              'SELECT nombre_descripcion AS nombre, descripcion FROM descripcion WHERE id_referencia = ? ORDER BY id_descripcion',
              [ficha.id_referencia],
          )
        : [[]];
    return { ...ficha, procesos, tallas, descripciones, total_prendas: tallas.reduce((s, t) => s + t.cantidad, 0) };
}

async function validar(req, body) {
    const errores = {};
    const [[referencia]] = await connection.query('SELECT id_referencia FROM referencia WHERE id_referencia = ? AND nit_usuario = ?', [
        texto(body.id_referencia),
        nitEmpresa(req),
    ]);
    if (!referencia) errores.id_referencia = 'Elige una referencia.';

    const procesos = (Array.isArray(body.procesos) ? body.procesos.slice(0, 60) : [])
        .map((p) => ({ nombre: texto(p?.nombre), descripcion: texto(p?.descripcion) }))
        .filter((p) => p.nombre || p.descripcion);
    if (procesos.length === 0) errores.procesos = 'Agrega al menos un proceso.';
    else if (procesos.some((p) => !p.nombre || p.nombre.length > 100 || p.descripcion.length > 1000)) {
        errores.procesos = 'Cada proceso necesita un nombre (máximo 100 caracteres) y una descripción de máximo 1000.';
    }

    const tallas = (Array.isArray(body.tallas) ? body.tallas.slice(0, 40) : []).map((t) => ({
        talla: texto(t?.talla).toUpperCase(),
        cantidad: Number(t?.cantidad),
    }));
    if (tallas.length === 0) errores.tallas = 'Agrega al menos una talla con su cantidad.';
    else if (tallas.some((t) => !t.talla || t.talla.length > 20 || !Number.isInteger(t.cantidad) || t.cantidad < 1 || t.cantidad > MAX_PRENDAS)) {
        errores.tallas = 'Cada talla necesita nombre y una cantidad entera mayor que 0.';
    } else if (new Set(tallas.map((t) => t.talla)).size !== tallas.length) errores.tallas = 'Hay tallas repetidas.';

    const observaciones = texto(body.observaciones);
    if (observaciones.length > 2000) errores.observaciones = 'Las observaciones admiten máximo 2000 caracteres.';

    return { errores, datos: { id_referencia: referencia?.id_referencia, procesos, tallas, observaciones: observaciones || null } };
}

async function guardarDetalle(conexion, idFicha, { procesos, tallas }) {
    await conexion.query('DELETE FROM ficha_proceso WHERE id_ficha = ?', [idFicha]);
    await conexion.query('DELETE FROM ficha_talla WHERE id_ficha = ?', [idFicha]);
    await conexion.query('INSERT INTO ficha_proceso (id_ficha, orden, nombre, descripcion) VALUES ?', [
        procesos.map((p, i) => [idFicha, i + 1, p.nombre, p.descripcion || null]),
    ]);
    await conexion.query('INSERT INTO ficha_talla (id_ficha, talla, cantidad) VALUES ?', [tallas.map((t) => [idFicha, t.talla, t.cantidad])]);
}

// GET /api/fichas-tecnicas?q=&desde=&hasta=
router.get('/', async (req, res) => {
    try {
        const condiciones = ['f.nit_usuario = ?'];
        const valores = [nitEmpresa(req)];
        if (texto(req.query.q)) {
            condiciones.push('(f.id_referencia LIKE ? OR r.tipo LIKE ?)');
            valores.push(`%${texto(req.query.q)}%`, `%${texto(req.query.q)}%`);
        }
        if (FECHA_RE.test(req.query.desde ?? '')) {
            condiciones.push('f.fecha >= ?');
            valores.push(req.query.desde);
        }
        if (FECHA_RE.test(req.query.hasta ?? '')) {
            condiciones.push('f.fecha <= ?');
            valores.push(req.query.hasta);
        }
        const [filas] = await connection.query(
            `SELECT ${COLUMNAS},
                    (SELECT COUNT(*) FROM ficha_proceso p WHERE p.id_ficha = f.id_ficha) AS procesos,
                    (SELECT COALESCE(SUM(t.cantidad), 0) FROM ficha_talla t WHERE t.id_ficha = f.id_ficha) AS total_prendas,
                    (SELECT GROUP_CONCAT(CONCAT(t.talla, ': ', t.cantidad) ORDER BY t.id_ficha_talla SEPARATOR ' · ')
                       FROM ficha_talla t WHERE t.id_ficha = f.id_ficha) AS tallas
             ${DESDE} WHERE ${condiciones.join(' AND ')}
             ORDER BY f.fecha DESC, f.id_ficha DESC`,
            valores,
        );
        res.json(filas.map((f) => ({ ...f, total_prendas: Number(f.total_prendas) })));
    } catch (error) {
        console.error('Error al listar fichas técnicas:', error.message);
        res.status(500).json({ message: 'No se pudo consultar las fichas técnicas.' });
    }
});

// GET /api/fichas-tecnicas/:id
router.get('/:id', async (req, res) => {
    try {
        const ficha = await detalle(req, req.params.id);
        if (!ficha) return res.status(404).json({ message: 'La ficha técnica no existe.' });
        res.json(ficha);
    } catch (error) {
        console.error('Error al consultar la ficha técnica:', error.message);
        res.status(500).json({ message: 'No se pudo consultar la ficha técnica.' });
    }
});

// POST /api/fichas-tecnicas   (la fecha es la del día)
router.post('/', async (req, res) => {
    try {
        const { errores, datos } = await validar(req, req.body ?? {});
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos de la ficha técnica.', errores });
        const id = await enTransaccion(async (conexion) => {
            const [resultado] = await conexion.query(
                'INSERT INTO ficha_tecnica (nit_usuario, id_referencia, fecha, observaciones) VALUES (?, ?, CURDATE(), ?)',
                [nitEmpresa(req), datos.id_referencia, datos.observaciones],
            );
            await guardarDetalle(conexion, resultado.insertId, datos);
            return resultado.insertId;
        });
        res.status(201).json({ message: 'Ficha técnica guardada.', ficha: await detalle(req, id) });
    } catch (error) {
        console.error('Error al crear la ficha técnica:', error.message);
        res.status(500).json({ message: 'No se pudo guardar la ficha técnica.' });
    }
});

// PUT /api/fichas-tecnicas/:id   (la fecha de creación no cambia)
router.put('/:id', async (req, res) => {
    try {
        const actual = await detalle(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'La ficha técnica no existe.' });
        const { errores, datos } = await validar(req, req.body ?? {});
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos de la ficha técnica.', errores });
        await enTransaccion(async (conexion) => {
            await conexion.query('UPDATE ficha_tecnica SET id_referencia = ?, observaciones = ? WHERE id_ficha = ?', [
                datos.id_referencia,
                datos.observaciones,
                actual.id_ficha,
            ]);
            await guardarDetalle(conexion, actual.id_ficha, datos);
        });
        res.json({ message: 'Ficha técnica actualizada.', ficha: await detalle(req, actual.id_ficha) });
    } catch (error) {
        console.error('Error al actualizar la ficha técnica:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar la ficha técnica.' });
    }
});

// DELETE /api/fichas-tecnicas/:id   (procesos y tallas se borran en cascada)
router.delete('/:id', async (req, res) => {
    try {
        const [resultado] = await connection.query('DELETE FROM ficha_tecnica WHERE id_ficha = ? AND nit_usuario = ?', [
            req.params.id,
            nitEmpresa(req),
        ]);
        if (resultado.affectedRows === 0) return res.status(404).json({ message: 'La ficha técnica no existe o ya fue eliminada.' });
        res.json({ message: 'Ficha técnica eliminada.' });
    } catch (error) {
        console.error('Error al eliminar la ficha técnica:', error.message);
        res.status(500).json({ message: 'No se pudo eliminar la ficha técnica.' });
    }
});

export default router;
