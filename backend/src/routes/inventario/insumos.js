import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { guardarFoto, borrarFoto } from '../../services/fotos.js';
import { texto, CODIGO_RE, normalizarCodigo, numeroPositivo, sinTildes } from '../../services/validacion.js';
import { validarPrecios, guardarPrecios, adjuntarPrecios, enTransaccion } from '../../services/precios.js';
import { revisarStock } from '../../services/alertas.js';

// Rutas: /api/insumos
const router = Router();
router.use(exigirSesion);

const CATEGORIAS_BASE = ['Cierre', 'Botones', 'Cinta', 'Elástico', 'Cordón', 'Bolsa', 'Sesgo empitado', 'Sesgo planchado', 'Marquilla'];

// Incluye el nombre del proveedor para mostrarlo en el listado
const CONSULTA = `
    SELECT i.id_insumo, i.id_vinculado, v.nombre AS proveedor, i.categoria, i.nombre, i.talla,
           i.cantidad, i.valor_unidad, i.foto, i.stock_minimo
    FROM insumo i
    LEFT JOIN vinculados v ON v.identificacion = i.id_vinculado`;

// La talla solo aplica a las marquillas
function esMarquilla(categoria) {
    return sinTildes(categoria).startsWith('marquilla');
}

function validarInsumo(body) {
    const errores = {};
    const categoria = texto(body.categoria);
    const datos = {
        categoria: categoria.charAt(0).toUpperCase() + categoria.slice(1),
        nombre: texto(body.nombre),
        id_vinculado: texto(body.id_vinculado) || null,
        talla: texto(body.talla) || null,
        cantidad: numeroPositivo(body.cantidad),
        stock_minimo: numeroPositivo(body.stock_minimo),
    };

    if (datos.categoria.length < 2 || datos.categoria.length > 60) errores.categoria = 'Elige o escribe una categoría (máximo 60 caracteres).';
    if (datos.nombre.length < 2 || datos.nombre.length > 100) errores.nombre = 'Escribe un nombre de 2 a 100 caracteres.';
    if (datos.cantidad === null) errores.cantidad = 'Escribe una cantidad válida (0 o más).';
    if (datos.stock_minimo === null) errores.stock_minimo = 'Escribe el stock mínimo (0 o más).';

    const { precios, error } = validarPrecios(body.precios, 'insumo');
    if (error) errores.precios = error;
    else datos.precios = precios;

    if (!esMarquilla(datos.categoria)) datos.talla = null;
    else if (datos.talla && datos.talla.length > 20) errores.talla = 'La talla admite máximo 20 caracteres.';

    return { datos, errores };
}

// El proveedor debe ser de la empresa y suministrar insumos
async function proveedorValido(req, identificacion) {
    if (!identificacion) return true;
    const [filas] = await connection.query(
        `SELECT 1 FROM vinculados
         WHERE identificacion = ? AND nit_usuario = ? AND tipo = 'Proveedor' AND tipo_inventario = 'Insumo' LIMIT 1`,
        [identificacion, nitEmpresa(req)],
    );
    return filas.length > 0;
}

async function buscarInsumo(req, id) {
    const [filas] = await connection.query(`${CONSULTA} WHERE i.id_insumo = ? AND i.nit_usuario = ? LIMIT 1`, [id, nitEmpresa(req)]);
    return filas[0] ? (await adjuntarPrecios('insumo', filas))[0] : undefined;
}

async function existeCodigo(id) {
    const [filas] = await connection.query('SELECT 1 FROM insumo WHERE id_insumo = ? LIMIT 1', [id]);
    return filas.length > 0;
}

function errorDuplicado(res, id) {
    return res.status(409).json({
        message: 'Ya existe un insumo con ese código.',
        errores: { id_insumo: `El código ${id} ya está registrado. Usa otro.` },
    });
}

const errorProveedor = { id_vinculado: 'Elige un proveedor de insumos registrado en Vinculados.' };

function alertaDe(req, insumo) {
    return revisarStock({
        nit: nitEmpresa(req),
        tipo: 'insumo',
        id: insumo.id_insumo,
        nombre: insumo.nombre,
        cantidad: insumo.cantidad,
        minimo: insumo.stock_minimo,
    });
}

// GET /api/insumos?categoria=Botones&q=texto
router.get('/', async (req, res) => {
    try {
        const condiciones = ['i.nit_usuario = ?'];
        const valores = [nitEmpresa(req)];
        if (texto(req.query.categoria)) {
            condiciones.push('i.categoria = ?');
            valores.push(texto(req.query.categoria));
        }
        if (texto(req.query.q)) {
            condiciones.push('(i.id_insumo LIKE ? OR i.nombre LIKE ? OR i.categoria LIKE ? OR v.nombre LIKE ?)');
            valores.push(...Array(4).fill(`%${texto(req.query.q)}%`));
        }
        const [filas] = await connection.query(`${CONSULTA} WHERE ${condiciones.join(' AND ')} ORDER BY i.categoria, i.nombre`, valores);
        res.json(await adjuntarPrecios('insumo', filas));
    } catch (error) {
        console.error('Error al listar insumos:', error.message);
        res.status(500).json({ message: 'No se pudo consultar el inventario de insumos.' });
    }
});

// GET /api/insumos/categorias: las de siempre más las que la empresa haya creado
router.get('/categorias', async (req, res) => {
    try {
        const [filas] = await connection.query('SELECT DISTINCT categoria FROM insumo WHERE nit_usuario = ?', [nitEmpresa(req)]);
        const propias = filas.map((f) => f.categoria).filter((c) => !CATEGORIAS_BASE.some((b) => sinTildes(b) === sinTildes(c)));
        res.json([...CATEGORIAS_BASE, ...propias.sort((a, b) => a.localeCompare(b, 'es'))]);
    } catch (error) {
        console.error('Error al listar categorías:', error.message);
        res.status(500).json({ message: 'No se pudieron consultar las categorías.' });
    }
});

// GET /api/insumos/existe?id=INS-001
router.get('/existe', async (req, res) => {
    const id = normalizarCodigo(req.query.id);
    if (!CODIGO_RE.test(id)) return res.json({ existe: false });
    try {
        res.json({ existe: await existeCodigo(id), id });
    } catch (error) {
        console.error('Error al validar el código del insumo:', error.message);
        res.status(500).json({ message: 'No se pudo validar el código.' });
    }
});

// POST /api/insumos   (la foto llega en base64 en foto_base64; los precios en precios: [{ unidad, valor }])
router.post('/', async (req, res) => {
    const body = req.body ?? {};
    const { datos, errores } = validarInsumo(body);
    const id = normalizarCodigo(body.id_insumo);
    if (!CODIGO_RE.test(id)) errores.id_insumo = 'Usa letras, números y guiones, máximo 30. Ej: INS-001';
    if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los campos marcados.', errores });

    let foto = null;
    try {
        if (await existeCodigo(id)) return errorDuplicado(res, id);
        if (!(await proveedorValido(req, datos.id_vinculado))) return res.status(400).json({ message: 'Revisa el proveedor.', errores: errorProveedor });
        if (body.foto_base64) foto = await guardarFoto(body.foto_base64, 'insumos', id);

        await enTransaccion(async (conexion) => {
            await conexion.query(
                `INSERT INTO insumo (id_insumo, nit_usuario, id_vinculado, categoria, nombre, talla, cantidad, valor_unidad, foto, stock_minimo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, nitEmpresa(req), datos.id_vinculado, datos.categoria, datos.nombre, datos.talla, datos.cantidad,
                 datos.precios[0].valor, foto, datos.stock_minimo],
            );
            await guardarPrecios(conexion, 'insumo', id, datos.precios);
        });
        const insumo = await buscarInsumo(req, id);
        res.status(201).json({ message: 'Insumo registrado.', insumo, alerta: await alertaDe(req, insumo) });
    } catch (error) {
        await borrarFoto(foto);
        if (error.code === 'ER_DUP_ENTRY') return errorDuplicado(res, id);
        if (error.message.startsWith('La foto')) return res.status(400).json({ message: error.message, errores: { foto: error.message } });
        console.error('Error al registrar insumo:', error.message);
        res.status(500).json({ message: 'No se pudo registrar el insumo.' });
    }
});

// PUT /api/insumos/:id   (el código no se edita: es la llave primaria)
router.put('/:id', async (req, res) => {
    const body = req.body ?? {};
    const { datos, errores } = validarInsumo(body);
    if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los campos marcados.', errores });

    let fotoNueva = null;
    try {
        const actual = await buscarInsumo(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'El insumo no existe o fue eliminado.' });
        // Se permite conservar el proveedor que ya tenía aunque haya cambiado su tipo de inventario
        if (datos.id_vinculado !== actual.id_vinculado && !(await proveedorValido(req, datos.id_vinculado))) {
            return res.status(400).json({ message: 'Revisa el proveedor.', errores: errorProveedor });
        }

        let foto = actual.foto;
        if (body.foto_base64) foto = fotoNueva = await guardarFoto(body.foto_base64, 'insumos', actual.id_insumo);
        else if (body.quitar_foto) foto = null;

        await enTransaccion(async (conexion) => {
            await conexion.query(
                `UPDATE insumo SET id_vinculado = ?, categoria = ?, nombre = ?, talla = ?, cantidad = ?, valor_unidad = ?, foto = ?, stock_minimo = ?
                 WHERE id_insumo = ? AND nit_usuario = ?`,
                [datos.id_vinculado, datos.categoria, datos.nombre, datos.talla, datos.cantidad, datos.precios[0].valor, foto,
                 datos.stock_minimo, actual.id_insumo, nitEmpresa(req)],
            );
            await guardarPrecios(conexion, 'insumo', actual.id_insumo, datos.precios);
        });
        if (foto !== actual.foto) await borrarFoto(actual.foto);
        const insumo = await buscarInsumo(req, actual.id_insumo);
        res.json({ message: 'Insumo actualizado.', insumo, alerta: await alertaDe(req, insumo) });
    } catch (error) {
        await borrarFoto(fotoNueva);
        if (error.message.startsWith('La foto')) return res.status(400).json({ message: error.message, errores: { foto: error.message } });
        console.error('Error al actualizar insumo:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar el insumo.' });
    }
});

// DELETE /api/insumos/:id   (sus precios y alertas se borran en cascada; el calendario queda sin el insumo)
router.delete('/:id', async (req, res) => {
    try {
        const actual = await buscarInsumo(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'El insumo no existe o ya fue eliminado.' });

        await connection.query('DELETE FROM insumo WHERE id_insumo = ? AND nit_usuario = ?', [actual.id_insumo, nitEmpresa(req)]);
        await borrarFoto(actual.foto);
        res.json({ message: 'Insumo eliminado.', insumo: actual });
    } catch (error) {
        console.error('Error al eliminar insumo:', error.message);
        res.status(500).json({ message: 'No se pudo eliminar el insumo.' });
    }
});

export default router;
