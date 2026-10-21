import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { texto } from '../../services/validacion.js';

const router = Router();
router.use(exigirSesion);

const TIPOS_ID = ['NIT', 'Cedula'];
const TIPOS = ['Proveedor', 'Cliente', 'Tercero'];
const TIPOS_INVENTARIO = ['Insumo', 'Materia prima'];
const COLUMNAS = 'identificacion, tipo_id, nombre, direccion, contacto, ciudad, correo, tipo, actividad, tipo_inventario';
const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// El NIT se guarda como 900123456-7 y la cédula solo con dígitos
function normalizarIdentificacion(tipoId, valor) {
    const limpio = String(valor ?? '').replace(/[.\s]/g, '');
    // Solo se revisa el formato: número, guion y un dígito al final
    if (tipoId === 'NIT') {
        if (!/^\d{8,10}-\d$/.test(limpio)) return { error: 'Escribe el NIT con guion antes del último dígito. Ej: 900123456-7' };
        return { valor: limpio };
    }
    if (!/^\d{5,10}$/.test(limpio)) {
        return { error: 'La cédula debe tener entre 5 y 10 dígitos, sin puntos ni letras.' };
    }
    return { valor: limpio };
}

function validarVinculado(body) {
    const errores = {};
    const datos = {
        tipo_id: texto(body.tipo_id),
        nombre: texto(body.nombre),
        direccion: texto(body.direccion),
        contacto: texto(body.contacto),
        ciudad: texto(body.ciudad),
        correo: texto(body.correo).toLowerCase(),
        tipo: texto(body.tipo),
        actividad: texto(body.actividad),
        tipo_inventario: texto(body.tipo_inventario),
    };

    if (!TIPOS_ID.includes(datos.tipo_id)) errores.tipo_id = 'Elige NIT o cédula.';
    else {
        const identificacion = normalizarIdentificacion(datos.tipo_id, body.identificacion);
        if (identificacion.error) errores.identificacion = identificacion.error;
        else datos.identificacion = identificacion.valor;
    }

    if (datos.nombre.length < 2 || datos.nombre.length > 100) errores.nombre = 'Escribe un nombre de 2 a 100 caracteres.';
    if (!datos.direccion || datos.direccion.length > 150) errores.direccion = 'Escribe la dirección (máximo 150 caracteres).';
    if (!/^[\d\s+()-]{7,20}$/.test(datos.contacto)) errores.contacto = 'Escribe un teléfono válido (7 a 20 dígitos).';
    if (!CORREO_RE.test(datos.correo) || datos.correo.length > 100) errores.correo = 'Escribe un correo válido, por ejemplo ventas@empresa.com.';
    if (!datos.ciudad || datos.ciudad.length > 60) errores.ciudad = 'Escribe la ciudad (máximo 60 caracteres).';
    if (!TIPOS.includes(datos.tipo)) errores.tipo = 'Elige proveedor, cliente o tercero.';

    // Actividad y tipo de inventario solo aplican a proveedores
    if (datos.tipo === 'Proveedor') {
        if (!datos.actividad || datos.actividad.length > 100) errores.actividad = 'Escribe la actividad del proveedor (máximo 100 caracteres).';
        if (!TIPOS_INVENTARIO.includes(datos.tipo_inventario)) errores.tipo_inventario = 'Elige insumo o materia prima.';
    } else {
        datos.actividad = null;
        datos.tipo_inventario = null;
    }

    return { datos, errores };
}

async function existeIdentificacion(identificacion) {
    const [filas] = await connection.query('SELECT 1 FROM vinculados WHERE identificacion = ? LIMIT 1', [identificacion]);
    return filas.length > 0;
}

// Solo devuelve el vinculado si pertenece a la empresa de la sesión
async function buscarVinculado(req, identificacion) {
    const [filas] = await connection.query(
        `SELECT ${COLUMNAS} FROM vinculados WHERE identificacion = ? AND nit_usuario = ? LIMIT 1`,
        [identificacion, nitEmpresa(req)],
    );
    return filas[0];
}

// Registros que quedan sin vinculado si se elimina (las llaves foráneas usan ON DELETE SET NULL)
async function contarUsos(identificacion) {
    const [[uso]] = await connection.query(
        `SELECT
            (SELECT COUNT(*) FROM insumo WHERE id_vinculado = ?) AS insumos,
            (SELECT COUNT(*) FROM materia_prima WHERE id_vinculado = ?) AS materias_primas,
            (SELECT COUNT(*) FROM referencia WHERE id_vinculado = ?) AS referencias,
            (SELECT COUNT(*) FROM calendario WHERE id_vinculado = ?) AS eventos`,
        [identificacion, identificacion, identificacion, identificacion],
    );
    return { insumos: Number(uso.insumos), materias_primas: Number(uso.materias_primas), referencias: Number(uso.referencias), eventos: Number(uso.eventos) };
}

// GET /api/vinculados?tipo=Proveedor&tipo_inventario=Insumo&q=texto
router.get('/', async (req, res) => {
    try {
        const condiciones = ['nit_usuario = ?'];
        const valores = [nitEmpresa(req)];

        if (TIPOS.includes(req.query.tipo)) {
            condiciones.push('tipo = ?');
            valores.push(req.query.tipo);
        }
        if (TIPOS_INVENTARIO.includes(req.query.tipo_inventario)) {
            condiciones.push('tipo_inventario = ?');
            valores.push(req.query.tipo_inventario);
        }
        const busqueda = texto(req.query.q);
        if (busqueda) {
            condiciones.push('(identificacion LIKE ? OR nombre LIKE ? OR ciudad LIKE ? OR correo LIKE ? OR actividad LIKE ?)');
            valores.push(...Array(5).fill(`%${busqueda}%`));
        }

        const [filas] = await connection.query(
            `SELECT ${COLUMNAS} FROM vinculados WHERE ${condiciones.join(' AND ')} ORDER BY nombre`,
            valores,
        );
        res.json(filas);
    } catch (error) {
        console.error('Error al listar vinculados:', error.message);
        res.status(500).json({ message: 'No se pudo consultar el listado de vinculados.' });
    }
});

// GET /api/vinculados/existe?tipo_id=NIT&identificacion=900123456-7
router.get('/existe', async (req, res) => {
    const identificacion = normalizarIdentificacion(req.query.tipo_id, req.query.identificacion);
    if (identificacion.error) return res.json({ existe: false });
    try {
        res.json({ existe: await existeIdentificacion(identificacion.valor), identificacion: identificacion.valor });
    } catch (error) {
        console.error('Error al validar la identificación:', error.message);
        res.status(500).json({ message: 'No se pudo validar la identificación.' });
    }
});

// POST /api/vinculados
router.post('/', async (req, res) => {
    const { datos, errores } = validarVinculado(req.body ?? {});
    if (Object.keys(errores).length > 0) {
        return res.status(400).json({ message: 'Revisa los campos marcados.', errores });
    }

    try {
        if (await existeIdentificacion(datos.identificacion)) {
            return res.status(409).json({
                message: 'Ya existe un vinculado con esa identificación.',
                errores: { identificacion: `La identificación ${datos.identificacion} ya está registrada.` },
            });
        }

        await connection.query(
            `INSERT INTO vinculados (nit_usuario, ${COLUMNAS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                nitEmpresa(req),
                datos.identificacion,
                datos.tipo_id,
                datos.nombre,
                datos.direccion,
                datos.contacto,
                datos.ciudad,
                datos.correo,
                datos.tipo,
                datos.actividad,
                datos.tipo_inventario,
            ],
        );
        res.status(201).json({ message: 'Vinculado registrado.', vinculado: datos });
    } catch (error) {
        // Dos registros al mismo tiempo con la misma identificación
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                message: 'Ya existe un vinculado con esa identificación.',
                errores: { identificacion: `La identificación ${datos.identificacion} ya está registrada.` },
            });
        }
        if (error.code === 'ER_NO_REFERENCED_ROW_2') {
            return res.status(400).json({ message: 'La empresa de la sesión no está registrada en la base de datos.' });
        }
        console.error('Error al registrar vinculado:', error.message);
        res.status(500).json({ message: 'No se pudo registrar el vinculado.' });
    }
});

// GET /api/vinculados/:identificacion/uso
router.get('/:identificacion/uso', async (req, res) => {
    try {
        if (!(await buscarVinculado(req, req.params.identificacion))) {
            return res.status(404).json({ message: 'El vinculado no existe.' });
        }
        res.json(await contarUsos(req.params.identificacion));
    } catch (error) {
        console.error('Error al consultar el uso del vinculado:', error.message);
        res.status(500).json({ message: 'No se pudo consultar el vinculado.' });
    }
});

// PUT /api/vinculados/:identificacion
// La identificación y su tipo no se editan: son la llave primaria y otras tablas la referencian
router.put('/:identificacion', async (req, res) => {
    try {
        const actual = await buscarVinculado(req, req.params.identificacion);
        if (!actual) return res.status(404).json({ message: 'El vinculado no existe o fue eliminado.' });

        const { datos, errores } = validarVinculado({
            ...req.body,
            tipo_id: actual.tipo_id,
            identificacion: actual.identificacion,
        });
        if (Object.keys(errores).length > 0) {
            return res.status(400).json({ message: 'Revisa los campos marcados.', errores });
        }

        await connection.query(
            `UPDATE vinculados
             SET nombre = ?, direccion = ?, contacto = ?, ciudad = ?, correo = ?, tipo = ?, actividad = ?, tipo_inventario = ?
             WHERE identificacion = ? AND nit_usuario = ?`,
            [
                datos.nombre,
                datos.direccion,
                datos.contacto,
                datos.ciudad,
                datos.correo,
                datos.tipo,
                datos.actividad,
                datos.tipo_inventario,
                actual.identificacion,
                nitEmpresa(req),
            ],
        );
        res.json({ message: 'Vinculado actualizado.', vinculado: datos });
    } catch (error) {
        console.error('Error al actualizar vinculado:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar el vinculado.' });
    }
});

// DELETE /api/vinculados/:identificacion
router.delete('/:identificacion', async (req, res) => {
    try {
        const actual = await buscarVinculado(req, req.params.identificacion);
        if (!actual) return res.status(404).json({ message: 'El vinculado no existe o ya fue eliminado.' });

        await connection.query('DELETE FROM vinculados WHERE identificacion = ? AND nit_usuario = ?', [
            actual.identificacion,
            nitEmpresa(req),
        ]);
        res.json({ message: 'Vinculado eliminado.', vinculado: actual });
    } catch (error) {
        console.error('Error al eliminar vinculado:', error.message);
        res.status(500).json({ message: 'No se pudo eliminar el vinculado.' });
    }
});

export default router;
