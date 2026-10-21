import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { texto, CODIGO_RE, normalizarCodigo, numeroPositivo } from '../../services/validacion.js';
import { enTransaccion } from '../../services/precios.js';
import { conExistencias, descontar, devolver, revisarAfectados } from '../../services/descuento-inventario.js';

// Rutas: /api/cotizaciones
const router = Router();
router.use(exigirSesion);

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const redondear = (n) => Math.round(n * 100) / 100;
const MAX_PRENDAS = 1000000;

// Si la referencia se eliminó (id_referencia queda en NULL) se usa la copia guardada en la cotización
const COLUMNAS = `c.id_cotizacion, DATE_FORMAT(c.fecha, '%Y-%m-%d') AS fecha, c.id_referencia,
    COALESCE(c.id_referencia, c.ref_codigo) AS codigo_referencia, COALESCE(r.tipo, c.ref_tipo) AS tipo, COALESCE(r.foto, c.ref_foto) AS foto,
    c.id_vinculado, v.nombre AS cliente, c.cantidad, c.valor_prenda, c.valor, c.utilidad, c.subtotal, c.iva, c.precio_final`;
const DESDE = `FROM cotizacion c
    LEFT JOIN referencia r ON r.id_referencia = c.id_referencia
    LEFT JOIN vinculados v ON v.identificacion = c.id_vinculado`;

const numeros = (c) => ({
    ...c,
    valor_prenda: Number(c.valor_prenda),
    valor: Number(c.valor),
    utilidad: Number(c.utilidad),
    subtotal: Number(c.subtotal),
    iva: Number(c.iva),
    precio_final: Number(c.precio_final),
});

/**
 * Cálculo de la cotización:
 *   valor     = valor de la prenda × cantidad
 *   subtotal  = valor + valor × utilidad %      (valor con la utilidad)
 *   total     = subtotal + subtotal × IVA %     (lo que se cobra)
 */
function calcular(valorPrenda, cantidad, utilidad, iva) {
    const valor = redondear(valorPrenda * cantidad);
    const valorUtilidad = redondear((valor * utilidad) / 100);
    const subtotal = redondear(valor + valorUtilidad);
    const valorIva = redondear((subtotal * iva) / 100);
    return { valor, valorUtilidad, subtotal, valorIva, total: redondear(subtotal + valorIva) };
}

// Insumos y telas por prenda de la referencia (como están ahora)
async function suministros(idReferencia) {
    const [filas] = await connection.query(
        `SELECT tipo, COALESCE(id_insumo, id_materia) AS codigo, nombre, categoria, color, unidad, cantidad AS por_prenda, valor_unitario
         FROM suministro WHERE id_referencia = ? ORDER BY tipo DESC, id_suministro`,
        [idReferencia],
    );
    return filas;
}

// Lo que se necesita para la cantidad de prendas
function materiales(filas, cantidad) {
    return filas.map((s) => {
        const porPrenda = Number(s.por_prenda);
        const total = redondear(porPrenda * cantidad);
        return {
            tipo: s.tipo,
            codigo: s.codigo,
            nombre: s.nombre,
            categoria: s.categoria,
            color: s.color,
            unidad: s.unidad,
            por_prenda: porPrenda,
            total,
            valor_unitario: Number(s.valor_unitario),
            costo: redondear(total * Number(s.valor_unitario)),
        };
    });
}

async function detalle(req, id) {
    const [[cotizacion]] = await connection.query(`SELECT ${COLUMNAS} ${DESDE} WHERE c.id_cotizacion = ? AND c.nit_usuario = ?`, [
        id,
        nitEmpresa(req),
    ]);
    if (!cotizacion) return null;
    const c = numeros(cotizacion);
    const { valorUtilidad, valorIva } = calcular(c.valor_prenda, c.cantidad, c.utilidad, c.iva);
    // Materiales guardados con la cotización: no dependen de que la referencia siga existiendo
    const [copia] = await connection.query(
        `SELECT tipo, codigo, nombre, categoria, color, unidad, por_prenda, valor_unitario
         FROM cotizacion_material WHERE id_cotizacion = ? ORDER BY id_material`,
        [c.id_cotizacion],
    );
    return { ...c, valor_utilidad: valorUtilidad, valor_iva: valorIva, materiales: materiales(copia, c.cantidad) };
}

// Guarda la copia de la referencia (número, tipo, foto y materiales) en la cotización y devuelve los materiales
async function copiarReferencia(conexion, idCotizacion, referencia) {
    await conexion.query('UPDATE cotizacion SET ref_codigo = ?, ref_tipo = ?, ref_foto = ? WHERE id_cotizacion = ?', [
        referencia.id_referencia,
        referencia.tipo,
        referencia.foto,
        idCotizacion,
    ]);
    await conexion.query('DELETE FROM cotizacion_material WHERE id_cotizacion = ?', [idCotizacion]);
    const filas = await suministros(referencia.id_referencia);
    if (filas.length === 0) return filas;
    await conexion.query(
        'INSERT INTO cotizacion_material (id_cotizacion, tipo, codigo, nombre, categoria, color, unidad, por_prenda, valor_unitario) VALUES ?',
        [filas.map((s) => [idCotizacion, s.tipo, s.codigo, s.nombre, s.categoria, s.color, s.unidad, s.por_prenda, s.valor_unitario])],
    );
    return filas;
}

async function existeCodigo(id) {
    const [filas] = await connection.query('SELECT 1 FROM cotizacion WHERE id_cotizacion = ? LIMIT 1', [id]);
    return filas.length > 0;
}

// GET /api/cotizaciones?q=&desde=&hasta=&cliente=&referencia=
router.get('/', async (req, res) => {
    try {
        const condiciones = ['c.nit_usuario = ?'];
        const valores = [nitEmpresa(req)];
        const q = texto(req.query.q);
        if (q) {
            condiciones.push('(c.id_cotizacion LIKE ? OR c.id_referencia LIKE ? OR c.ref_codigo LIKE ? OR r.tipo LIKE ? OR c.ref_tipo LIKE ? OR v.nombre LIKE ?)');
            valores.push(...Array(6).fill(`%${q}%`));
        }
        if (FECHA_RE.test(req.query.desde ?? '')) {
            condiciones.push('c.fecha >= ?');
            valores.push(req.query.desde);
        }
        if (FECHA_RE.test(req.query.hasta ?? '')) {
            condiciones.push('c.fecha <= ?');
            valores.push(req.query.hasta);
        }
        if (texto(req.query.cliente)) {
            condiciones.push('c.id_vinculado = ?');
            valores.push(texto(req.query.cliente));
        }
        if (texto(req.query.referencia)) {
            condiciones.push('COALESCE(c.id_referencia, c.ref_codigo) = ?');
            valores.push(texto(req.query.referencia));
        }
        const [filas] = await connection.query(
            `SELECT ${COLUMNAS} ${DESDE} WHERE ${condiciones.join(' AND ')} ORDER BY c.fecha DESC, c.id_cotizacion DESC`,
            valores,
        );
        res.json(filas.map(numeros));
    } catch (error) {
        console.error('Error al listar cotizaciones:', error.message);
        res.status(500).json({ message: 'No se pudo consultar las cotizaciones.' });
    }
});

// GET /api/cotizaciones/existe?id=COT-001
router.get('/existe', async (req, res) => {
    const id = normalizarCodigo(req.query.id);
    if (!CODIGO_RE.test(id)) return res.json({ existe: false });
    try {
        res.json({ existe: await existeCodigo(id), id });
    } catch (error) {
        console.error('Error al validar la cotización:', error.message);
        res.status(500).json({ message: 'No se pudo validar el número de cotización.' });
    }
});

// GET /api/cotizaciones/materiales?referencia=REF-001&cantidad=100[&cotizacion=COT-001 al editar] (antes de guardar)
router.get('/materiales', async (req, res) => {
    const cantidad = Number(req.query.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_PRENDAS) return res.json([]);
    try {
        const [[referencia]] = await connection.query('SELECT id_referencia FROM referencia WHERE id_referencia = ? AND nit_usuario = ?', [
            texto(req.query.referencia),
            nitEmpresa(req),
        ]);
        // Con lo que hay en el inventario, para ver si alcanza antes de guardar
        res.json(
            referencia
                ? await conExistencias(nitEmpresa(req), materiales(await suministros(referencia.id_referencia), cantidad), texto(req.query.cotizacion) || null)
                : [],
        );
    } catch (error) {
        console.error('Error al calcular materiales:', error.message);
        res.status(500).json({ message: 'No se pudo calcular los materiales.' });
    }
});

// GET /api/cotizaciones/:id
router.get('/:id', async (req, res) => {
    try {
        const cotizacion = await detalle(req, req.params.id);
        if (!cotizacion) return res.status(404).json({ message: 'La cotización no existe.' });
        res.json(cotizacion);
    } catch (error) {
        console.error('Error al consultar la cotización:', error.message);
        res.status(500).json({ message: 'No se pudo consultar la cotización.' });
    }
});

/**
 * Valida cliente, referencia, cantidad, utilidad e IVA y calcula los valores.
 * El valor de la prenda se toma de la referencia guardada (no se confía en el navegador).
 */
async function validar(req, body) {
    const errores = {};
    const cantidad = Number(body.cantidad);
    const utilidad = numeroPositivo(body.utilidad, 999.99);
    const iva = numeroPositivo(body.iva, 100);

    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > MAX_PRENDAS) errores.cantidad = 'Escribe un número entero de prendas mayor que 0.';
    if (utilidad === null) errores.utilidad = 'Escribe el porcentaje de utilidad (0 a 999).';
    if (iva === null) errores.iva = 'Escribe el porcentaje de IVA (0 a 100).';

    const [[referencia]] = await connection.query(
        'SELECT id_referencia, tipo, foto, valor_prenda FROM referencia WHERE id_referencia = ? AND nit_usuario = ?',
        [texto(body.id_referencia), nitEmpresa(req)],
    );
    if (!referencia) errores.id_referencia = 'Elige una referencia.';

    const [[cliente]] = await connection.query(
        "SELECT identificacion FROM vinculados WHERE identificacion = ? AND nit_usuario = ? AND tipo = 'Cliente'",
        [texto(body.id_vinculado), nitEmpresa(req)],
    );
    if (!cliente) errores.id_vinculado = 'Elige el cliente de la cotización.';

    if (Object.keys(errores).length > 0) return { errores };
    const valorPrenda = Number(referencia.valor_prenda);
    const { valor, subtotal, total } = calcular(valorPrenda, cantidad, utilidad, iva);
    return {
        errores,
        referencia,
        // Columnas en el orden de los INSERT y UPDATE
        valores: [referencia.id_referencia, cliente.identificacion, cantidad, valorPrenda, valor, utilidad, subtotal, iva, total],
    };
}

// POST /api/cotizaciones   (la fecha es la del día)
router.post('/', async (req, res) => {
    const id = normalizarCodigo(req.body?.id_cotizacion);
    try {
        const { errores, valores, referencia } = await validar(req, req.body ?? {});
        if (!CODIGO_RE.test(id)) errores.id_cotizacion = 'Usa letras, números y guiones, máximo 30. Ej: COT-001';
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos de la cotización.', errores });
        if (await existeCodigo(id)) {
            return res.status(409).json({
                message: 'Ya existe una cotización con ese número.',
                errores: { id_cotizacion: `La cotización ${id} ya está registrada. Usa otro número.` },
            });
        }
        // Al guardar, los materiales se descuentan del inventario
        const inventario = await enTransaccion(async (conexion) => {
            await conexion.query(
                `INSERT INTO cotizacion (id_cotizacion, nit_usuario, id_referencia, id_vinculado, cantidad, valor_prenda, valor, utilidad, subtotal, iva, precio_final, fecha)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURDATE())`,
                [id, nitEmpresa(req), ...valores],
            );
            const filas = await copiarReferencia(conexion, id, referencia);
            return descontar(conexion, nitEmpresa(req), id, materiales(filas, valores[2]));
        });
        const alertas = await revisarAfectados(nitEmpresa(req), inventario.afectados);
        res.status(201).json({ message: 'Cotización guardada.', cotizacion: await detalle(req, id), inventario: { ...inventario, afectados: undefined, alertas } });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe una cotización con ese número.' });
        console.error('Error al crear la cotización:', error.message);
        res.status(500).json({ message: 'No se pudo guardar la cotización.' });
    }
});

// PUT /api/cotizaciones/:id   (el número y la fecha de creación no cambian)
router.put('/:id', async (req, res) => {
    try {
        const actual = await detalle(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'La cotización no existe.' });
        const { errores, valores, referencia } = await validar(req, req.body ?? {});
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos de la cotización.', errores });
        // Se devuelve lo que se había descontado y se descuenta de nuevo con los datos nuevos
        const inventario = await enTransaccion(async (conexion) => {
            const devueltos = await devolver(conexion, actual.id_cotizacion);
            await conexion.query(
                `UPDATE cotizacion SET id_referencia = ?, id_vinculado = ?, cantidad = ?, valor_prenda = ?, valor = ?, utilidad = ?,
                        subtotal = ?, iva = ?, precio_final = ?
                 WHERE id_cotizacion = ? AND nit_usuario = ?`,
                [...valores, actual.id_cotizacion, nitEmpresa(req)],
            );
            const filas = await copiarReferencia(conexion, actual.id_cotizacion, referencia);
            const resultado = await descontar(conexion, nitEmpresa(req), actual.id_cotizacion, materiales(filas, valores[2]));
            return { ...resultado, afectados: [...devueltos, ...resultado.afectados] };
        });
        const alertas = await revisarAfectados(nitEmpresa(req), inventario.afectados);
        res.json({
            message: 'Cotización actualizada.',
            cotizacion: await detalle(req, actual.id_cotizacion),
            inventario: { ...inventario, afectados: undefined, alertas },
        });
    } catch (error) {
        console.error('Error al actualizar la cotización:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar la cotización.' });
    }
});

// DELETE /api/cotizaciones/:id   (los materiales que había descontado vuelven al inventario)
router.delete('/:id', async (req, res) => {
    try {
        const actual = await detalle(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'La cotización no existe o ya fue eliminada.' });
        const afectados = await enTransaccion(async (conexion) => {
            const devueltos = await devolver(conexion, actual.id_cotizacion);
            await conexion.query('DELETE FROM cotizacion WHERE id_cotizacion = ? AND nit_usuario = ?', [actual.id_cotizacion, nitEmpresa(req)]);
            return devueltos;
        });
        await revisarAfectados(nitEmpresa(req), afectados);
        res.json({ message: 'Cotización eliminada. Sus materiales volvieron al inventario.' });
    } catch (error) {
        console.error('Error al eliminar la cotización:', error.message);
        res.status(500).json({ message: 'No se pudo eliminar la cotización.' });
    }
});

export default router;
