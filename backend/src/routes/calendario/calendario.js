import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { texto } from '../../services/validacion.js';
import { revisarFechas, reiniciarAlertasDe } from '../../services/alertas.js';

// Rutas: /api/calendario
const router = Router();
router.use(exigirSesion);

const TIPOS = ['Pendiente', 'Entrega', 'Reunion', 'Pago', 'Compra', 'Produccion', 'Otro'];
const PRIORIDADES = ['Baja', 'Media', 'Alta'];
const ESTADOS = ['Pendiente', 'En proceso', 'Completado', 'Cancelado'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
// Lo que envía un <input type="datetime-local">: 2026-10-21T14:30
const FECHA_HORA_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const FORMATO = "'%Y-%m-%dT%H:%i'";

const COLUMNAS = `c.id_evento, c.titulo, c.descripcion, c.tipo, c.prioridad, c.estado,
    DATE_FORMAT(c.fecha_inicio, ${FORMATO}) AS fecha_inicio, DATE_FORMAT(c.fecha_entrega, ${FORMATO}) AS fecha_entrega,
    DATE_FORMAT(c.recordatorio, ${FORMATO}) AS recordatorio,
    c.id_insumo, c.id_materia, c.id_vinculado, c.id_referencia, c.id_cotizacion, c.nombre_factura,
    i.nombre AS insumo, m.nombre AS materia, v.nombre AS vinculado`;
const DESDE = `FROM calendario c
    LEFT JOIN insumo i ON i.id_insumo = c.id_insumo
    LEFT JOIN materia_prima m ON m.id_materia = c.id_materia
    LEFT JOIN vinculados v ON v.identificacion = c.id_vinculado`;

// Relaciones opcionales: columna → tabla y llave (siempre de la misma empresa)
const VINCULOS = {
    id_insumo: ['insumo', 'id_insumo', 'El insumo'],
    id_materia: ['materia_prima', 'id_materia', 'La materia prima'],
    id_vinculado: ['vinculados', 'identificacion', 'El vinculado'],
    id_referencia: ['referencia', 'id_referencia', 'La referencia'],
    id_cotizacion: ['cotizacion', 'id_cotizacion', 'La cotización'],
    nombre_factura: ['factura', 'nombre_factura', 'La factura'],
};

async function buscar(req, id) {
    const [[evento]] = await connection.query(`SELECT ${COLUMNAS} ${DESDE} WHERE c.id_evento = ? AND c.nit_usuario = ?`, [
        id,
        nitEmpresa(req),
    ]);
    return evento || null;
}

async function validar(req, body) {
    const errores = {};
    const datos = {
        titulo: texto(body.titulo),
        descripcion: texto(body.descripcion) || null,
        tipo: texto(body.tipo),
        prioridad: texto(body.prioridad),
        estado: texto(body.estado),
        fecha_inicio: texto(body.fecha_inicio),
        fecha_entrega: texto(body.fecha_entrega) || null,
        recordatorio: texto(body.recordatorio) || null,
    };
    if (datos.titulo.length < 2 || datos.titulo.length > 120) errores.titulo = 'Escribe un título de 2 a 120 caracteres.';
    if (datos.descripcion && datos.descripcion.length > 2000) errores.descripcion = 'La descripción admite máximo 2000 caracteres.';
    if (!TIPOS.includes(datos.tipo)) errores.tipo = 'Elige el tipo.';
    if (!PRIORIDADES.includes(datos.prioridad)) errores.prioridad = 'Elige la prioridad.';
    if (!ESTADOS.includes(datos.estado)) errores.estado = 'Elige el estado.';
    if (!FECHA_HORA_RE.test(datos.fecha_inicio)) errores.fecha_inicio = 'Elige la fecha y hora de inicio.';
    if (datos.fecha_entrega && !FECHA_HORA_RE.test(datos.fecha_entrega)) errores.fecha_entrega = 'La fecha de entrega no es válida.';
    else if (datos.fecha_entrega && !errores.fecha_inicio && datos.fecha_entrega < datos.fecha_inicio) {
        errores.fecha_entrega = 'La entrega no puede ser antes del inicio.';
    }
    if (datos.recordatorio && !FECHA_HORA_RE.test(datos.recordatorio)) errores.recordatorio = 'El recordatorio no es válido.';
    else if (datos.recordatorio && !errores.fecha_inicio && datos.recordatorio > datos.fecha_inicio) {
        errores.recordatorio = 'El recordatorio debe ser antes del inicio.';
    }

    for (const [columna, [tabla, llave, nombre]] of Object.entries(VINCULOS)) {
        const valor = texto(body[columna]) || null;
        datos[columna] = valor;
        if (!valor) continue;
        const [filas] = await connection.query(`SELECT 1 FROM ${tabla} WHERE ${llave} = ? AND nit_usuario = ? LIMIT 1`, [valor, nitEmpresa(req)]);
        if (filas.length === 0) errores[columna] = `${nombre} que elegiste ya no existe.`;
    }
    return { errores, datos };
}

const COLUMNAS_GUARDAR = ['titulo', 'descripcion', 'tipo', 'prioridad', 'estado', 'fecha_inicio', 'fecha_entrega', 'recordatorio', ...Object.keys(VINCULOS)];

// GET /api/calendario?desde=2026-10-01&hasta=2026-10-31&estado=&tipo=
// Devuelve los pendientes que empiezan o se entregan en el rango y los vencimientos de facturas
router.get('/', async (req, res) => {
    try {
        const desde = FECHA_RE.test(req.query.desde ?? '') ? req.query.desde : null;
        const hasta = FECHA_RE.test(req.query.hasta ?? '') ? req.query.hasta : null;
        const condiciones = ['c.nit_usuario = ?'];
        const valores = [nitEmpresa(req)];
        if (desde && hasta) {
            condiciones.push(
                '((DATE(c.fecha_inicio) BETWEEN ? AND ?) OR (DATE(c.fecha_entrega) BETWEEN ? AND ?) OR (c.fecha_inicio < ? AND c.fecha_entrega > ?))',
            );
            valores.push(desde, hasta, desde, hasta, desde, hasta);
        }
        if (ESTADOS.includes(req.query.estado)) {
            condiciones.push('c.estado = ?');
            valores.push(req.query.estado);
        }
        if (TIPOS.includes(req.query.tipo)) {
            condiciones.push('c.tipo = ?');
            valores.push(req.query.tipo);
        }
        const [eventos] = await connection.query(
            `SELECT ${COLUMNAS} ${DESDE} WHERE ${condiciones.join(' AND ')} ORDER BY c.fecha_inicio`,
            valores,
        );
        const [facturas] = await connection.query(
            `SELECT nombre_factura, empresa, estado, DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento
             FROM factura WHERE nit_usuario = ? AND fecha_vencimiento IS NOT NULL ${desde && hasta ? 'AND fecha_vencimiento BETWEEN ? AND ?' : ''}
             ORDER BY fecha_vencimiento`,
            desde && hasta ? [nitEmpresa(req), desde, hasta] : [nitEmpresa(req)],
        );
        res.json({ eventos, facturas });
    } catch (error) {
        console.error('Error al listar el calendario:', error.message);
        res.status(500).json({ message: 'No se pudo consultar el calendario.' });
    }
});

// GET /api/calendario/proximos: lo que viene en los próximos 14 días (y lo atrasado sin completar)
router.get('/proximos', async (req, res) => {
    try {
        const [eventos] = await connection.query(
            `SELECT ${COLUMNAS} ${DESDE}
             WHERE c.nit_usuario = ? AND c.estado IN ('Pendiente', 'En proceso')
               AND COALESCE(c.fecha_entrega, c.fecha_inicio) <= NOW() + INTERVAL 14 DAY
             ORDER BY COALESCE(c.fecha_entrega, c.fecha_inicio) LIMIT 30`,
            [nitEmpresa(req)],
        );
        res.json(eventos);
    } catch (error) {
        console.error('Error al listar los próximos pendientes:', error.message);
        res.status(500).json({ message: 'No se pudo consultar los próximos pendientes.' });
    }
});

// GET /api/calendario/opciones: lo que se puede relacionar con un pendiente
router.get('/opciones', async (req, res) => {
    const nit = nitEmpresa(req);
    try {
        const consultas = {
            insumos: 'SELECT id_insumo AS valor, nombre AS texto FROM insumo WHERE nit_usuario = ? ORDER BY nombre',
            materias: 'SELECT id_materia AS valor, nombre AS texto FROM materia_prima WHERE nit_usuario = ? ORDER BY nombre',
            vinculados: "SELECT identificacion AS valor, CONCAT(nombre, ' · ', tipo) AS texto FROM vinculados WHERE nit_usuario = ? ORDER BY nombre",
            referencias: "SELECT id_referencia AS valor, CONCAT(id_referencia, ' · ', COALESCE(tipo, '')) AS texto FROM referencia WHERE nit_usuario = ? ORDER BY id_referencia",
            cotizaciones: 'SELECT id_cotizacion AS valor, id_cotizacion AS texto FROM cotizacion WHERE nit_usuario = ? ORDER BY fecha DESC',
            facturas: "SELECT nombre_factura AS valor, CONCAT(nombre_factura, ' · ', empresa) AS texto FROM factura WHERE nit_usuario = ? ORDER BY fecha DESC",
        };
        const resultado = {};
        for (const [clave, sql] of Object.entries(consultas)) [resultado[clave]] = await connection.query(sql, [nit]);
        res.json(resultado);
    } catch (error) {
        console.error('Error al consultar las opciones del calendario:', error.message);
        res.status(500).json({ message: 'No se pudo consultar las opciones.' });
    }
});

// GET /api/calendario/:id
router.get('/:id', async (req, res) => {
    try {
        const evento = await buscar(req, req.params.id);
        if (!evento) return res.status(404).json({ message: 'El pendiente no existe.' });
        res.json(evento);
    } catch (error) {
        console.error('Error al consultar el pendiente:', error.message);
        res.status(500).json({ message: 'No se pudo consultar el pendiente.' });
    }
});

// POST /api/calendario
router.post('/', async (req, res) => {
    try {
        const { errores, datos } = await validar(req, req.body ?? {});
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos del pendiente.', errores });
        const [resultado] = await connection.query(
            `INSERT INTO calendario (nit_usuario, ${COLUMNAS_GUARDAR.join(', ')}) VALUES (?, ${COLUMNAS_GUARDAR.map(() => '?').join(', ')})`,
            [nitEmpresa(req), ...COLUMNAS_GUARDAR.map((c) => datos[c])],
        );
        await revisarFechas(nitEmpresa(req)).catch(() => {});
        res.status(201).json({ message: 'Pendiente guardado.', evento: await buscar(req, resultado.insertId) });
    } catch (error) {
        console.error('Error al crear el pendiente:', error.message);
        res.status(500).json({ message: 'No se pudo guardar el pendiente.' });
    }
});

// PUT /api/calendario/:id
router.put('/:id', async (req, res) => {
    try {
        const actual = await buscar(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'El pendiente no existe.' });
        const { errores, datos } = await validar(req, req.body ?? {});
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos del pendiente.', errores });
        await connection.query(
            `UPDATE calendario SET ${COLUMNAS_GUARDAR.map((c) => `${c} = ?`).join(', ')} WHERE id_evento = ? AND nit_usuario = ?`,
            [...COLUMNAS_GUARDAR.map((c) => datos[c]), actual.id_evento, nitEmpresa(req)],
        );
        // Si cambiaron las fechas, los avisos se vuelven a calcular
        if (['fecha_inicio', 'fecha_entrega', 'recordatorio'].some((c) => datos[c] !== actual[c])) await reiniciarAlertasDe('id_evento', actual.id_evento);
        await revisarFechas(nitEmpresa(req)).catch(() => {});
        res.json({ message: 'Pendiente actualizado.', evento: await buscar(req, actual.id_evento) });
    } catch (error) {
        console.error('Error al actualizar el pendiente:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar el pendiente.' });
    }
});

// PATCH /api/calendario/:id/estado   (marcar completado, en proceso…)
router.patch('/:id/estado', async (req, res) => {
    const estado = texto(req.body?.estado);
    if (!ESTADOS.includes(estado)) return res.status(400).json({ message: 'Elige un estado válido.' });
    try {
        const [resultado] = await connection.query('UPDATE calendario SET estado = ? WHERE id_evento = ? AND nit_usuario = ?', [
            estado,
            req.params.id,
            nitEmpresa(req),
        ]);
        if (resultado.affectedRows === 0) return res.status(404).json({ message: 'El pendiente no existe.' });
        // Terminado o cancelado: sus avisos quedan leídos
        if (estado === 'Completado' || estado === 'Cancelado') {
            await connection.query('UPDATE alertas SET leida = 1 WHERE id_evento = ?', [req.params.id]);
        }
        res.json({ message: 'Estado actualizado.', evento: await buscar(req, req.params.id) });
    } catch (error) {
        console.error('Error al cambiar el estado del pendiente:', error.message);
        res.status(500).json({ message: 'No se pudo cambiar el estado.' });
    }
});

// DELETE /api/calendario/:id   (sus alertas se borran en cascada)
router.delete('/:id', async (req, res) => {
    try {
        const [resultado] = await connection.query('DELETE FROM calendario WHERE id_evento = ? AND nit_usuario = ?', [
            req.params.id,
            nitEmpresa(req),
        ]);
        if (resultado.affectedRows === 0) return res.status(404).json({ message: 'El pendiente no existe o ya fue eliminado.' });
        res.json({ message: 'Pendiente eliminado.' });
    } catch (error) {
        console.error('Error al eliminar el pendiente:', error.message);
        res.status(500).json({ message: 'No se pudo eliminar el pendiente.' });
    }
});

export default router;
