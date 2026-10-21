import { Router } from 'express';
import path from 'node:path';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { texto } from '../../services/validacion.js';
import { guardarArchivo, rutaArchivo, borrarArchivo, TIPO_POR_EXTENSION } from '../../services/archivos.js';
import { revisarFechas, reiniciarAlertasDe } from '../../services/alertas.js';

// Rutas: /api/facturas
const router = Router();
router.use(exigirSesion);

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS = ['Pagada', 'En proceso', 'Vencida'];
const COLUMNAS = `nombre_factura, empresa, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha,
    DATE_FORMAT(fecha_vencimiento, '%Y-%m-%d') AS fecha_vencimiento, archivo, archivo_nombre, estado,
    DATE_FORMAT(fecha_pago, '%Y-%m-%d') AS fecha_pago`;

async function buscar(req, nombre) {
    const [[factura]] = await connection.query(`SELECT ${COLUMNAS} FROM factura WHERE nombre_factura = ? AND nit_usuario = ?`, [
        nombre,
        nitEmpresa(req),
    ]);
    return factura || null;
}

// Lo que ve el navegador: no se envía la ruta interna del archivo
const publica = (f) => ({ ...f, archivo: undefined, tiene_archivo: Boolean(f.archivo) });

function validar(body, { nueva }) {
    const errores = {};
    const datos = {
        nombre_factura: texto(body.nombre_factura),
        empresa: texto(body.empresa),
        fecha: texto(body.fecha),
        fecha_vencimiento: texto(body.fecha_vencimiento) || null,
        estado: texto(body.estado),
        archivo_nombre: texto(body.archivo_nombre).slice(0, 255),
    };
    if (nueva && (datos.nombre_factura.length < 1 || datos.nombre_factura.length > 50)) {
        errores.nombre_factura = 'Escribe el nombre de la factura (máximo 50 caracteres).';
    }
    if (datos.empresa.length < 2 || datos.empresa.length > 100) errores.empresa = 'Escribe la empresa (2 a 100 caracteres).';
    if (!FECHA_RE.test(datos.fecha) || Number.isNaN(Date.parse(datos.fecha))) errores.fecha = 'Elige la fecha de la factura.';
    if (datos.fecha_vencimiento && (!FECHA_RE.test(datos.fecha_vencimiento) || Number.isNaN(Date.parse(datos.fecha_vencimiento)))) {
        errores.fecha_vencimiento = 'La fecha de vencimiento no es válida.';
    } else if (datos.fecha_vencimiento && !errores.fecha && datos.fecha_vencimiento < datos.fecha) {
        errores.fecha_vencimiento = 'El vencimiento no puede ser antes de la fecha de la factura.';
    }
    if (!ESTADOS.includes(datos.estado)) errores.estado = 'Elige el estado: pagada, en proceso o vencida.';
    return { errores, datos };
}

// GET /api/facturas?q=&desde=&hasta=&estado=
router.get('/', async (req, res) => {
    try {
        const condiciones = ['nit_usuario = ?'];
        const valores = [nitEmpresa(req)];
        const q = texto(req.query.q);
        if (q) {
            condiciones.push('(nombre_factura LIKE ? OR empresa LIKE ? OR archivo_nombre LIKE ?)');
            valores.push(`%${q}%`, `%${q}%`, `%${q}%`);
        }
        if (FECHA_RE.test(req.query.desde ?? '')) {
            condiciones.push('fecha >= ?');
            valores.push(req.query.desde);
        }
        if (FECHA_RE.test(req.query.hasta ?? '')) {
            condiciones.push('fecha <= ?');
            valores.push(req.query.hasta);
        }
        if (ESTADOS.includes(req.query.estado)) {
            condiciones.push('estado = ?');
            valores.push(req.query.estado);
        }
        const [filas] = await connection.query(
            `SELECT ${COLUMNAS} FROM factura WHERE ${condiciones.join(' AND ')} ORDER BY fecha DESC, nombre_factura`,
            valores,
        );
        res.json(filas.map(publica));
    } catch (error) {
        console.error('Error al listar facturas:', error.message);
        res.status(500).json({ message: 'No se pudo consultar las facturas.' });
    }
});

// GET /api/facturas/existe?nombre=FAC-001
router.get('/existe', async (req, res) => {
    const nombre = texto(req.query.nombre);
    if (!nombre) return res.json({ existe: false });
    try {
        const [filas] = await connection.query('SELECT 1 FROM factura WHERE nombre_factura = ? LIMIT 1', [nombre]);
        res.json({ existe: filas.length > 0 });
    } catch (error) {
        console.error('Error al validar la factura:', error.message);
        res.status(500).json({ message: 'No se pudo validar el nombre de la factura.' });
    }
});

// GET /api/facturas/:nombre/archivo   (el archivo solo se entrega a la empresa dueña)
router.get('/:nombre/archivo', async (req, res) => {
    try {
        const factura = await buscar(req, req.params.nombre);
        const archivo = rutaArchivo(factura?.archivo);
        if (!archivo) return res.status(404).json({ message: 'La factura no tiene archivo.' });
        const extension = path.extname(archivo).slice(1);
        res.type(TIPO_POR_EXTENSION[extension] || 'application/octet-stream');
        res.set('Content-Disposition', `inline; filename="${encodeURIComponent(factura.archivo_nombre || path.basename(archivo))}"`);
        res.sendFile(archivo, (error) => {
            if (error && !res.headersSent) res.status(404).json({ message: 'No se encontró el archivo de la factura.' });
        });
    } catch (error) {
        console.error('Error al entregar el archivo de la factura:', error.message);
        res.status(500).json({ message: 'No se pudo abrir el archivo.' });
    }
});

// POST /api/facturas   (el archivo llega en archivo_base64)
router.post('/', async (req, res) => {
    let archivo = null;
    try {
        const { errores, datos } = validar(req.body ?? {}, { nueva: true });
        if (!req.body?.archivo_base64) errores.archivo = 'Sube el archivo de la factura.';
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos de la factura.', errores });
        const [existe] = await connection.query('SELECT 1 FROM factura WHERE nombre_factura = ? LIMIT 1', [datos.nombre_factura]);
        if (existe.length > 0) {
            return res.status(409).json({
                message: 'Ya existe una factura con ese nombre.',
                errores: { nombre_factura: `La factura ${datos.nombre_factura} ya está registrada. Usa otro nombre.` },
            });
        }
        archivo = await guardarArchivo(req.body.archivo_base64, `facturas/${nitEmpresa(req).replace(/[^0-9-]/g, '')}`, datos.nombre_factura);
        await connection.query(
            `INSERT INTO factura (nombre_factura, nit_usuario, empresa, fecha, fecha_vencimiento, archivo, archivo_nombre, estado, fecha_pago)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${datos.estado === 'Pagada' ? 'CURDATE()' : 'NULL'})`,
            [datos.nombre_factura, nitEmpresa(req), datos.empresa, datos.fecha, datos.fecha_vencimiento, archivo, datos.archivo_nombre || null, datos.estado],
        );
        await revisarFechas(nitEmpresa(req)).catch(() => {});
        res.status(201).json({ message: 'Factura guardada.', factura: publica(await buscar(req, datos.nombre_factura)) });
    } catch (error) {
        await borrarArchivo(archivo);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe una factura con ese nombre.' });
        if (error.message.startsWith('El archivo')) return res.status(400).json({ message: error.message, errores: { archivo: error.message } });
        console.error('Error al crear la factura:', error.message);
        res.status(500).json({ message: 'No se pudo guardar la factura.' });
    }
});

// PUT /api/facturas/:nombre   (el nombre no cambia; sin archivo nuevo se conserva el actual)
router.put('/:nombre', async (req, res) => {
    let archivo = null;
    try {
        const actual = await buscar(req, req.params.nombre);
        if (!actual) return res.status(404).json({ message: 'La factura no existe.' });
        const { errores, datos } = validar(req.body ?? {}, { nueva: false });
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos de la factura.', errores });
        if (req.body.archivo_base64) {
            archivo = await guardarArchivo(req.body.archivo_base64, `facturas/${nitEmpresa(req).replace(/[^0-9-]/g, '')}`, actual.nombre_factura);
        }
        // La fecha de pago se marca al pasar a "Pagada" y se quita si deja de estarlo
        const fechaPago = datos.estado !== 'Pagada' ? 'NULL' : actual.estado === 'Pagada' ? 'fecha_pago' : 'CURDATE()';
        await connection.query(
            `UPDATE factura SET empresa = ?, fecha = ?, fecha_vencimiento = ?, estado = ?, archivo = ?, archivo_nombre = ?, fecha_pago = ${fechaPago}
             WHERE nombre_factura = ? AND nit_usuario = ?`,
            [
                datos.empresa,
                datos.fecha,
                datos.fecha_vencimiento,
                datos.estado,
                archivo || actual.archivo,
                archivo ? datos.archivo_nombre || null : actual.archivo_nombre,
                actual.nombre_factura,
                nitEmpresa(req),
            ],
        );
        if (archivo) await borrarArchivo(actual.archivo);
        // Pagada: sus avisos de vencimiento ya no aplican. Otro vencimiento: los avisos se vuelven a calcular.
        if (datos.estado === 'Pagada') {
            await connection.query("UPDATE alertas SET leida = 1 WHERE nombre_factura = ? AND tipo IN ('Factura por vencer', 'Factura vencida')", [actual.nombre_factura]);
        } else if (datos.fecha_vencimiento !== actual.fecha_vencimiento) {
            await reiniciarAlertasDe('nombre_factura', actual.nombre_factura);
        }
        await revisarFechas(nitEmpresa(req)).catch(() => {});
        res.json({ message: 'Factura actualizada.', factura: publica(await buscar(req, actual.nombre_factura)) });
    } catch (error) {
        await borrarArchivo(archivo);
        if (error.message.startsWith('El archivo')) return res.status(400).json({ message: error.message, errores: { archivo: error.message } });
        console.error('Error al actualizar la factura:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar la factura.' });
    }
});

// DELETE /api/facturas/:nombre
router.delete('/:nombre', async (req, res) => {
    try {
        const factura = await buscar(req, req.params.nombre);
        if (!factura) return res.status(404).json({ message: 'La factura no existe o ya fue eliminada.' });
        await connection.query('DELETE FROM factura WHERE nombre_factura = ? AND nit_usuario = ?', [factura.nombre_factura, nitEmpresa(req)]);
        await borrarArchivo(factura.archivo);
        res.json({ message: 'Factura eliminada.' });
    } catch (error) {
        console.error('Error al eliminar la factura:', error.message);
        res.status(500).json({ message: 'No se pudo eliminar la factura.' });
    }
});

export default router;
