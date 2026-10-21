import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';

// Rutas: /api/tallas
const router = Router();
router.use(exigirSesion);

// GET /api/tallas: tallas que la empresa ya usó en marquillas y en las telas de sus referencias
router.get('/', async (req, res) => {
    try {
        const [filas] = await connection.query(
            `SELECT talla FROM insumo WHERE nit_usuario = ? AND talla IS NOT NULL AND talla <> ''
             UNION
             SELECT t.talla FROM suministro_talla t
               JOIN suministro s ON s.id_suministro = t.id_suministro
               JOIN referencia r ON r.id_referencia = s.id_referencia
             WHERE r.nit_usuario = ?
             ORDER BY talla`,
            [nitEmpresa(req), nitEmpresa(req)],
        );
        res.json(filas.map((f) => f.talla));
    } catch (error) {
        console.error('Error al listar las tallas:', error.message);
        res.status(500).json({ message: 'No se pudo consultar las tallas.' });
    }
});

export default router;
