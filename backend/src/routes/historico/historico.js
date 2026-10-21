import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { texto } from '../../services/validacion.js';

// Rutas: /api/historico
const router = Router();
router.use(exigirSesion);

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Cada sección del histórico: de dónde sale, con qué fecha y qué se muestra.
 * Todas devuelven las mismas columnas para poder unirlas en una sola lista.
 */
const SECCIONES = {
    referencia: {
        fecha: 'r.fecha',
        sql: `SELECT 'referencia' AS seccion, DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha, r.id_referencia AS codigo,
                     COALESCE(r.tipo, '') AS titulo,
                     (SELECT IF(COUNT(*) = 1, '1 material', CONCAT(COUNT(*), ' materiales')) FROM suministro s WHERE s.id_referencia = r.id_referencia) AS detalle,
                     r.valor_prenda AS valor, NULL AS estado
              FROM referencia r WHERE r.nit_usuario = ?`,
        buscar: ['r.id_referencia', 'r.tipo'],
    },
    cotizacion: {
        fecha: 'c.fecha',
        sql: `SELECT 'cotizacion' AS seccion, DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha, c.id_cotizacion AS codigo,
                     COALESCE(v.nombre, 'Sin cliente') AS titulo,
                     CONCAT(COALESCE(c.id_referencia, c.ref_codigo, 'Sin referencia'), ' · ', c.cantidad, ' prendas') AS detalle,
                     c.precio_final AS valor, NULL AS estado
              FROM cotizacion c LEFT JOIN vinculados v ON v.identificacion = c.id_vinculado WHERE c.nit_usuario = ?`,
        buscar: ['c.id_cotizacion', 'v.nombre', 'c.id_referencia', 'c.ref_codigo'],
    },
    ficha: {
        fecha: 'f.fecha',
        sql: `SELECT 'ficha' AS seccion, DATE_FORMAT(f.fecha, '%Y-%m-%d') AS fecha, CONCAT('FT-', LPAD(f.id_ficha, 4, '0')) AS codigo,
                     COALESCE(CONCAT(f.id_referencia, ' · ', r.tipo), 'Referencia eliminada') AS titulo,
                     CONCAT((SELECT COALESCE(SUM(t.cantidad), 0) FROM ficha_talla t WHERE t.id_ficha = f.id_ficha), ' prendas · ',
                            (SELECT IF(COUNT(*) = 1, '1 proceso', CONCAT(COUNT(*), ' procesos')) FROM ficha_proceso p WHERE p.id_ficha = f.id_ficha)) AS detalle,
                     NULL AS valor, NULL AS estado
              FROM ficha_tecnica f LEFT JOIN referencia r ON r.id_referencia = f.id_referencia WHERE f.nit_usuario = ?`,
        buscar: ['f.id_referencia', 'r.tipo'],
    },
    factura: {
        fecha: 'fa.fecha',
        sql: `SELECT 'factura' AS seccion, DATE_FORMAT(fa.fecha, '%Y-%m-%d') AS fecha, fa.nombre_factura AS codigo,
                     fa.empresa AS titulo,
                     COALESCE(CONCAT('Vence ', DATE_FORMAT(fa.fecha_vencimiento, '%d/%m/%Y')), 'Sin vencimiento') AS detalle,
                     NULL AS valor, fa.estado AS estado
              FROM factura fa WHERE fa.nit_usuario = ?`,
        buscar: ['fa.nombre_factura', 'fa.empresa'],
    },
    pendiente: {
        fecha: 'DATE(ca.fecha_inicio)',
        sql: `SELECT 'pendiente' AS seccion, DATE_FORMAT(ca.fecha_inicio, '%Y-%m-%d') AS fecha, CONCAT('#', ca.id_evento) AS codigo,
                     ca.titulo AS titulo,
                     CONCAT(ca.tipo, ' · prioridad ', LOWER(ca.prioridad),
                            COALESCE(CONCAT(' · entrega ', DATE_FORMAT(ca.fecha_entrega, '%d/%m/%Y')), '')) AS detalle,
                     NULL AS valor, ca.estado AS estado
              FROM calendario ca WHERE ca.nit_usuario = ?`,
        buscar: ['ca.titulo', 'ca.descripcion'],
    },
};

// GET /api/historico?desde=&hasta=&secciones=cotizacion,factura&q=
router.get('/', async (req, res) => {
    try {
        const pedidas = texto(req.query.secciones).split(',').filter((s) => SECCIONES[s]);
        const secciones = pedidas.length ? pedidas : Object.keys(SECCIONES);
        const desde = FECHA_RE.test(req.query.desde ?? '') ? req.query.desde : null;
        const hasta = FECHA_RE.test(req.query.hasta ?? '') ? req.query.hasta : null;
        const q = texto(req.query.q);

        const partes = [];
        const valores = [];
        for (const clave of secciones) {
            const { sql, fecha, buscar } = SECCIONES[clave];
            let parte = sql;
            valores.push(nitEmpresa(req));
            if (desde) {
                parte += ` AND ${fecha} >= ?`;
                valores.push(desde);
            }
            if (hasta) {
                parte += ` AND ${fecha} <= ?`;
                valores.push(hasta);
            }
            if (q) {
                parte += ` AND (${buscar.map((c) => `${c} LIKE ?`).join(' OR ')})`;
                valores.push(...buscar.map(() => `%${q}%`));
            }
            partes.push(`(${parte})`);
        }
        const [filas] = await connection.query(`${partes.join(' UNION ALL ')} ORDER BY fecha DESC, seccion, codigo`, valores);
        res.json(filas.map((f) => ({ ...f, valor: f.valor === null ? null : Number(f.valor) })));
    } catch (error) {
        console.error('Error al consultar el histórico:', error.message);
        res.status(500).json({ message: 'No se pudo consultar el histórico.' });
    }
});

export default router;
