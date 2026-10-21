import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';

// Rutas: /api/dashboard
const router = Router();
router.use(exigirSesion);

const MESES_GRAFICA = 6;
const numero = (n) => Number(n) || 0;

// GET /api/dashboard: el resumen de la empresa con sus datos reales
router.get('/', async (req, res) => {
    const nit = nitEmpresa(req);
    const uno = async (sql, valores = [nit]) => (await connection.query(sql, valores))[0][0];
    const varios = async (sql, valores = [nit]) => (await connection.query(sql, valores))[0];
    try {
        // Inventario: cada material con su valor en la unidad en que se lleva la cantidad
        // (insumo: su primer precio; tela: el precio de su unidad de medida, o su precio principal)
        const materiales = await varios(
            `SELECT 'Insumo' AS tipo, i.id_insumo AS codigo, i.nombre, i.cantidad, i.stock_minimo, i.valor_unidad AS valor,
                    (SELECT p.unidad FROM precio_insumo p WHERE p.id_insumo = i.id_insumo ORDER BY p.id_precio LIMIT 1) AS unidad
             FROM insumo i WHERE i.nit_usuario = ?
             UNION ALL
             SELECT 'Materia prima', m.id_materia, m.nombre, m.cantidad, m.stock_minimo,
                    COALESCE((SELECT p.valor FROM precio_materia p WHERE p.id_materia = m.id_materia AND p.unidad = m.unidad_medida LIMIT 1), m.precio),
                    m.unidad_medida
             FROM materia_prima m WHERE m.nit_usuario = ?`,
            [nit, nit],
        );
        const inventario = materiales.map((m) => ({
            ...m,
            cantidad: numero(m.cantidad),
            stock_minimo: numero(m.stock_minimo),
            valor: numero(m.valor),
            bajo: numero(m.stock_minimo) > 0 && numero(m.cantidad) <= numero(m.stock_minimo),
        }));

        const referencias = await uno(
            `SELECT COUNT(*) AS total,
                    SUM(fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS este_mes,
                    COALESCE(AVG(valor_prenda), 0) AS promedio
             FROM referencia WHERE nit_usuario = ?`,
        );
        const cotizaciones = await uno(
            `SELECT COUNT(*) AS total, COALESCE(SUM(precio_final), 0) AS cobrado, COALESCE(SUM(cantidad), 0) AS prendas,
                    SUM(fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01')) AS este_mes,
                    COALESCE(SUM(IF(fecha >= DATE_FORMAT(CURDATE(), '%Y-%m-01'), precio_final, 0)), 0) AS cobrado_mes
             FROM cotizacion WHERE nit_usuario = ?`,
        );
        const facturas = await uno(
            `SELECT COUNT(*) AS total,
                    SUM(estado = 'Pagada') AS pagadas, SUM(estado = 'En proceso') AS en_proceso, SUM(estado = 'Vencida') AS vencidas,
                    SUM(estado <> 'Pagada' AND fecha_vencimiento BETWEEN CURDATE() AND CURDATE() + INTERVAL 3 DAY) AS por_vencer
             FROM factura WHERE nit_usuario = ?`,
        );
        const fichas = await uno('SELECT COUNT(*) AS total FROM ficha_tecnica WHERE nit_usuario = ?');
        const vinculados = await uno(
            "SELECT SUM(tipo = 'Cliente') AS clientes, SUM(tipo = 'Proveedor') AS proveedores FROM vinculados WHERE nit_usuario = ?",
        );

        // Total a cobrar por mes en los últimos 6 meses (los meses sin cotizaciones van en 0)
        const porMes = await varios(
            `SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes, COUNT(*) AS cotizaciones, SUM(precio_final) AS total
             FROM cotizacion WHERE nit_usuario = ? AND fecha >= DATE_FORMAT(CURDATE() - INTERVAL ${MESES_GRAFICA - 1} MONTH, '%Y-%m-01')
             GROUP BY mes`,
        );
        const hoy = new Date();
        const meses = Array.from({ length: MESES_GRAFICA }, (_, i) => {
            const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - (MESES_GRAFICA - 1 - i), 1);
            const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
            const fila = porMes.find((m) => m.mes === mes);
            return { mes, total: numero(fila?.total), cotizaciones: numero(fila?.cotizaciones) };
        });

        // La referencia con más prendas cotizadas (o la más reciente si aún no hay cotizaciones)
        const destacada = await uno(
            `SELECT r.id_referencia, r.tipo, r.foto, r.valor_prenda, DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha,
                    COALESCE(SUM(c.cantidad), 0) AS prendas, COUNT(c.id_cotizacion) AS cotizaciones,
                    (SELECT COUNT(*) FROM suministro s WHERE s.id_referencia = r.id_referencia) AS materiales
             FROM referencia r LEFT JOIN cotizacion c ON c.id_referencia = r.id_referencia
             WHERE r.nit_usuario = ?
             GROUP BY r.id_referencia ORDER BY prendas DESC, r.fecha DESC LIMIT 1`,
        );
        const ultimasReferencias = await varios(
            `SELECT r.id_referencia, r.tipo, r.foto, r.valor_prenda, DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha,
                    (SELECT COUNT(*) FROM suministro s WHERE s.id_referencia = r.id_referencia) AS materiales,
                    (SELECT COUNT(*) FROM cotizacion c WHERE c.id_referencia = r.id_referencia) AS cotizaciones
             FROM referencia r WHERE r.nit_usuario = ? ORDER BY r.fecha DESC, r.id_referencia DESC LIMIT 5`,
        );
        const proximos = await varios(
            `SELECT id_evento, titulo, tipo, prioridad, DATE_FORMAT(COALESCE(fecha_entrega, fecha_inicio), '%Y-%m-%dT%H:%i') AS fecha,
                    fecha_entrega IS NOT NULL AS es_entrega
             FROM calendario WHERE nit_usuario = ? AND estado IN ('Pendiente', 'En proceso')
               AND COALESCE(fecha_entrega, fecha_inicio) <= NOW() + INTERVAL 7 DAY
             ORDER BY COALESCE(fecha_entrega, fecha_inicio) LIMIT 5`,
        );
        const facturasPendientes = await varios(
            `SELECT nombre_factura, empresa, estado, DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento
             FROM factura WHERE nit_usuario = ? AND estado <> 'Pagada' AND fecha_vencimiento IS NOT NULL
             ORDER BY fecha_vencimiento LIMIT 5`,
        );

        res.json({
            inventario: {
                insumos: inventario.filter((m) => m.tipo === 'Insumo').length,
                telas: inventario.filter((m) => m.tipo === 'Materia prima').length,
                valor: Math.round(inventario.reduce((s, m) => s + Math.max(0, m.cantidad) * m.valor, 0)),
                bajos: inventario.filter((m) => m.bajo).length,
                // Los más cerca de su stock mínimo primero
                materiales: inventario
                    .sort((a, b) => (a.stock_minimo ? a.cantidad / a.stock_minimo : Infinity) - (b.stock_minimo ? b.cantidad / b.stock_minimo : Infinity))
                    .slice(0, 6),
            },
            referencias: { total: numero(referencias.total), este_mes: numero(referencias.este_mes), promedio: numero(referencias.promedio) },
            cotizaciones: {
                total: numero(cotizaciones.total),
                cobrado: numero(cotizaciones.cobrado),
                prendas: numero(cotizaciones.prendas),
                este_mes: numero(cotizaciones.este_mes),
                cobrado_mes: numero(cotizaciones.cobrado_mes),
                meses,
            },
            facturas: {
                total: numero(facturas.total),
                pagadas: numero(facturas.pagadas),
                en_proceso: numero(facturas.en_proceso),
                vencidas: numero(facturas.vencidas),
                por_vencer: numero(facturas.por_vencer),
                pendientes: facturasPendientes,
            },
            fichas: numero(fichas.total),
            vinculados: { clientes: numero(vinculados.clientes), proveedores: numero(vinculados.proveedores) },
            destacada: destacada ? { ...destacada, valor_prenda: numero(destacada.valor_prenda), prendas: numero(destacada.prendas) } : null,
            referencias_recientes: ultimasReferencias.map((r) => ({ ...r, valor_prenda: numero(r.valor_prenda) })),
            proximos,
        });
    } catch (error) {
        console.error('Error al armar el dashboard:', error.message);
        res.status(500).json({ message: 'No se pudo cargar el resumen.' });
    }
});

export default router;
