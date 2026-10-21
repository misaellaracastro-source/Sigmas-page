import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { revisarFechas } from '../../services/alertas.js';

// Rutas: /api/alertas
const router = Router();
router.use(exigirSesion);

// GET /api/alertas: las 30 más recientes y cuántas faltan por leer
router.get('/', async (req, res) => {
    try {
        // Las alertas de fechas que ya tocan aparecen sin esperar la revisión periódica
        await revisarFechas(nitEmpresa(req)).catch((error) => console.error('Error al revisar fechas:', error.message));
        const [alertas] = await connection.query(
            `SELECT id_alerta, tipo, mensaje, fecha_generada, leida, correo_enviado, id_insumo, id_materia, id_evento, nombre_factura
             FROM alertas WHERE nit_usuario = ? ORDER BY leida, fecha_generada DESC LIMIT 30`,
            [nitEmpresa(req)],
        );
        const [[{ pendientes }]] = await connection.query(
            'SELECT COUNT(*) AS pendientes FROM alertas WHERE nit_usuario = ? AND leida = 0',
            [nitEmpresa(req)],
        );
        res.json({ pendientes: Number(pendientes), alertas });
    } catch (error) {
        console.error('Error al listar alertas:', error.message);
        res.status(500).json({ message: 'No se pudieron consultar las alertas.' });
    }
});

// PATCH /api/alertas/leidas: marca todas como leídas
router.patch('/leidas', async (req, res) => {
    try {
        await connection.query('UPDATE alertas SET leida = 1 WHERE nit_usuario = ? AND leida = 0', [nitEmpresa(req)]);
        res.json({ message: 'Alertas marcadas como leídas.' });
    } catch (error) {
        console.error('Error al marcar alertas:', error.message);
        res.status(500).json({ message: 'No se pudieron actualizar las alertas.' });
    }
});

// PATCH /api/alertas/:id/leida
router.patch('/:id/leida', async (req, res) => {
    try {
        await connection.query('UPDATE alertas SET leida = 1 WHERE id_alerta = ? AND nit_usuario = ?', [req.params.id, nitEmpresa(req)]);
        res.json({ message: 'Alerta marcada como leída.' });
    } catch (error) {
        console.error('Error al marcar alerta:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar la alerta.' });
    }
});

export default router;
