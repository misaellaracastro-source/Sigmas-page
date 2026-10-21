import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { texto, CODIGO_RE, normalizarCodigo, numeroPositivo } from '../../services/validacion.js';
import { validarPrecios, guardarPrecios, adjuntarPrecios, enTransaccion } from '../../services/precios.js';
import { revisarStock } from '../../services/alertas.js';

// Rutas: /api/materias-primas
const router = Router();
router.use(exigirSesion);

const UNIDADES = ['metro', 'metro cuadrado', 'kilogramo', 'rollo', 'pieza'];
const UNIDAD_CORTA = { metro: 'm', 'metro cuadrado': 'm²', kilogramo: 'kg', rollo: 'rollos', pieza: 'piezas', centimetro: 'cm' };
const COLOR_RE = /^#[0-9A-F]{6}$/;

// Incluye el nombre del proveedor para mostrarlo en el listado
const CONSULTA = `
    SELECT m.id_materia, m.id_vinculado, v.nombre AS proveedor, m.nombre, m.cantidad, m.descripcion,
           m.composicion, m.tipo_tejido, m.color, m.precio, m.unidad_medida, m.stock_minimo
    FROM materia_prima m
    LEFT JOIN vinculados v ON v.identificacion = m.id_vinculado`;

function validarMateria(body) {
    const errores = {};
    const datos = {
        nombre: texto(body.nombre),
        id_vinculado: texto(body.id_vinculado) || null,
        cantidad: numeroPositivo(body.cantidad),
        descripcion: texto(body.descripcion) || null,
        composicion: texto(body.composicion) || null,
        tipo_tejido: texto(body.tipo_tejido) || null,
        color: texto(body.color).toUpperCase(),
        unidad_medida: texto(body.unidad_medida),
        stock_minimo: numeroPositivo(body.stock_minimo),
    };

    if (datos.nombre.length < 2 || datos.nombre.length > 100) errores.nombre = 'Escribe un nombre de 2 a 100 caracteres.';
    if (datos.cantidad === null) errores.cantidad = 'Escribe una cantidad válida (0 o más).';
    if (!UNIDADES.includes(datos.unidad_medida)) errores.unidad_medida = 'Elige la unidad de medida.';
    if (datos.stock_minimo === null) errores.stock_minimo = 'Escribe el stock mínimo (0 o más).';
    if (!COLOR_RE.test(datos.color)) errores.color = 'Elige un color de la paleta.';
    if (datos.composicion && datos.composicion.length > 150) errores.composicion = 'Máximo 150 caracteres.';
    if (datos.tipo_tejido && datos.tipo_tejido.length > 60) errores.tipo_tejido = 'Máximo 60 caracteres.';
    if (datos.descripcion && datos.descripcion.length > 1000) errores.descripcion = 'Máximo 1000 caracteres.';

    const { precios, error } = validarPrecios(body.precios, 'materia');
    if (error) errores.precios = error;
    else datos.precios = precios;

    return { datos, errores };
}

// El proveedor debe ser de la empresa y suministrar materia prima
async function proveedorValido(req, identificacion) {
    if (!identificacion) return true;
    const [filas] = await connection.query(
        `SELECT 1 FROM vinculados
         WHERE identificacion = ? AND nit_usuario = ? AND tipo = 'Proveedor' AND tipo_inventario = 'Materia prima' LIMIT 1`,
        [identificacion, nitEmpresa(req)],
    );
    return filas.length > 0;
}

async function buscarMateria(req, id) {
    const [filas] = await connection.query(`${CONSULTA} WHERE m.id_materia = ? AND m.nit_usuario = ? LIMIT 1`, [id, nitEmpresa(req)]);
    return filas[0] ? (await adjuntarPrecios('materia', filas))[0] : undefined;
}

async function existeCodigo(id) {
    const [filas] = await connection.query('SELECT 1 FROM materia_prima WHERE id_materia = ? LIMIT 1', [id]);
    return filas.length > 0;
}

function errorDuplicado(res, id) {
    return res.status(409).json({
        message: 'Ya existe una materia prima con ese código.',
        errores: { id_materia: `El código ${id} ya está registrado. Usa otro.` },
    });
}

const errorProveedor = { id_vinculado: 'Elige un proveedor de materia prima registrado en Vinculados.' };

function alertaDe(req, materia) {
    return revisarStock({
        nit: nitEmpresa(req),
        tipo: 'materia',
        id: materia.id_materia,
        nombre: materia.nombre,
        cantidad: materia.cantidad,
        minimo: materia.stock_minimo,
        unidad: UNIDAD_CORTA[materia.unidad_medida] || materia.unidad_medida,
    });
}

// GET /api/materias-primas?q=texto
router.get('/', async (req, res) => {
    try {
        const condiciones = ['m.nit_usuario = ?'];
        const valores = [nitEmpresa(req)];
        if (texto(req.query.q)) {
            condiciones.push('(m.id_materia LIKE ? OR m.nombre LIKE ? OR m.composicion LIKE ? OR m.tipo_tejido LIKE ? OR v.nombre LIKE ?)');
            valores.push(...Array(5).fill(`%${texto(req.query.q)}%`));
        }
        const [filas] = await connection.query(`${CONSULTA} WHERE ${condiciones.join(' AND ')} ORDER BY m.nombre`, valores);
        res.json(await adjuntarPrecios('materia', filas));
    } catch (error) {
        console.error('Error al listar materias primas:', error.message);
        res.status(500).json({ message: 'No se pudo consultar el inventario de materia prima.' });
    }
});

// GET /api/materias-primas/existe?id=TEL-001
router.get('/existe', async (req, res) => {
    const id = normalizarCodigo(req.query.id);
    if (!CODIGO_RE.test(id)) return res.json({ existe: false });
    try {
        res.json({ existe: await existeCodigo(id), id });
    } catch (error) {
        console.error('Error al validar el código de la materia prima:', error.message);
        res.status(500).json({ message: 'No se pudo validar el código.' });
    }
});

// POST /api/materias-primas   (los precios llegan en precios: [{ unidad, valor }])
router.post('/', async (req, res) => {
    const body = req.body ?? {};
    const { datos, errores } = validarMateria(body);
    const id = normalizarCodigo(body.id_materia);
    if (!CODIGO_RE.test(id)) errores.id_materia = 'Usa letras, números y guiones, máximo 30. Ej: TEL-001';
    if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los campos marcados.', errores });

    try {
        if (await existeCodigo(id)) return errorDuplicado(res, id);
        if (!(await proveedorValido(req, datos.id_vinculado))) return res.status(400).json({ message: 'Revisa el proveedor.', errores: errorProveedor });

        await enTransaccion(async (conexion) => {
            await conexion.query(
                `INSERT INTO materia_prima
                   (id_materia, nit_usuario, id_vinculado, nombre, cantidad, descripcion, composicion, tipo_tejido, color, precio, unidad_medida, stock_minimo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, nitEmpresa(req), datos.id_vinculado, datos.nombre, datos.cantidad, datos.descripcion, datos.composicion,
                    datos.tipo_tejido, datos.color, datos.precios[0].valor, datos.unidad_medida, datos.stock_minimo,
                ],
            );
            await guardarPrecios(conexion, 'materia', id, datos.precios);
        });
        const materia = await buscarMateria(req, id);
        res.status(201).json({ message: 'Materia prima registrada.', materia, alerta: await alertaDe(req, materia) });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') return errorDuplicado(res, id);
        console.error('Error al registrar materia prima:', error.message);
        res.status(500).json({ message: 'No se pudo registrar la materia prima.' });
    }
});

// PUT /api/materias-primas/:id   (el código no se edita: es la llave primaria)
router.put('/:id', async (req, res) => {
    const { datos, errores } = validarMateria(req.body ?? {});
    if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los campos marcados.', errores });

    try {
        const actual = await buscarMateria(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'La materia prima no existe o fue eliminada.' });
        // Se permite conservar el proveedor que ya tenía aunque haya cambiado su tipo de inventario
        if (datos.id_vinculado !== actual.id_vinculado && !(await proveedorValido(req, datos.id_vinculado))) {
            return res.status(400).json({ message: 'Revisa el proveedor.', errores: errorProveedor });
        }
        await enTransaccion(async (conexion) => {
            await conexion.query(
                `UPDATE materia_prima
                 SET id_vinculado = ?, nombre = ?, cantidad = ?, descripcion = ?, composicion = ?, tipo_tejido = ?,
                     color = ?, precio = ?, unidad_medida = ?, stock_minimo = ?
                 WHERE id_materia = ? AND nit_usuario = ?`,
                [
                    datos.id_vinculado, datos.nombre, datos.cantidad, datos.descripcion, datos.composicion, datos.tipo_tejido,
                    datos.color, datos.precios[0].valor, datos.unidad_medida, datos.stock_minimo, actual.id_materia, nitEmpresa(req),
                ],
            );
            await guardarPrecios(conexion, 'materia', actual.id_materia, datos.precios);
        });
        const materia = await buscarMateria(req, actual.id_materia);
        res.json({ message: 'Materia prima actualizada.', materia, alerta: await alertaDe(req, materia) });
    } catch (error) {
        console.error('Error al actualizar materia prima:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar la materia prima.' });
    }
});

// DELETE /api/materias-primas/:id   (sus precios y alertas se borran en cascada; el calendario queda sin la materia)
router.delete('/:id', async (req, res) => {
    try {
        const actual = await buscarMateria(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'La materia prima no existe o ya fue eliminada.' });
        await connection.query('DELETE FROM materia_prima WHERE id_materia = ? AND nit_usuario = ?', [actual.id_materia, nitEmpresa(req)]);
        res.json({ message: 'Materia prima eliminada.', materia: actual });
    } catch (error) {
        console.error('Error al eliminar materia prima:', error.message);
        res.status(500).json({ message: 'No se pudo eliminar la materia prima.' });
    }
});

export default router;
