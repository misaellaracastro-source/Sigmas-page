import { Router } from 'express';
import { connection } from '../../config/mysql/dbmysql.js';
import { exigirSesion, nitEmpresa } from '../../services/sesion.js';
import { guardarFoto, borrarFoto } from '../../services/fotos.js';
import { texto, CODIGO_RE, normalizarCodigo, numeroPositivo } from '../../services/validacion.js';
import { enTransaccion } from '../../services/precios.js';
import { iaConfigurada, construirPrompt, generarImagenIA } from '../../services/ia-imagen.js';

// Rutas: /api/referencias
const router = Router();
router.use(exigirSesion);

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const redondear = (n) => Math.round(n * 100) / 100;

// Las cotizaciones guardan una copia de la foto de su referencia: si alguna la usa, el archivo se conserva
async function borrarFotoSinUso(ruta) {
    if (!ruta) return;
    const [filas] = await connection.query('SELECT 1 FROM cotizacion WHERE ref_foto = ? LIMIT 1', [ruta]);
    if (filas.length === 0) await borrarFoto(ruta);
}

async function existeCodigo(id) {
    const [filas] = await connection.query('SELECT 1 FROM referencia WHERE id_referencia = ? LIMIT 1', [id]);
    return filas.length > 0;
}

// Referencia completa: datos, insumos, materia prima (con tallas) y descripciones
async function detalle(req, id) {
    const [[referencia]] = await connection.query(
        `SELECT id_referencia, tipo, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, valor_prenda, foto
         FROM referencia WHERE id_referencia = ? AND nit_usuario = ?`,
        [id, nitEmpresa(req)],
    );
    if (!referencia) return null;

    const [suministros] = await connection.query(
        `SELECT id_suministro, tipo, id_insumo, id_materia, nombre, categoria, color, unidad, cantidad, valor_unitario, valor_total
         FROM suministro WHERE id_referencia = ? ORDER BY id_suministro`,
        [id],
    );
    const [tallas] = await connection.query(
        `SELECT t.id_suministro, t.talla, t.cantidad
         FROM suministro_talla t JOIN suministro s ON s.id_suministro = t.id_suministro
         WHERE s.id_referencia = ? ORDER BY t.id_talla`,
        [id],
    );
    const [descripciones] = await connection.query(
        'SELECT nombre_descripcion AS nombre, descripcion FROM descripcion WHERE id_referencia = ? ORDER BY id_descripcion',
        [id],
    );

    const numeros = (s) => ({
        ...s,
        cantidad: Number(s.cantidad),
        valor_unitario: Number(s.valor_unitario),
        valor_total: Number(s.valor_total),
    });
    return {
        ...referencia,
        valor_prenda: Number(referencia.valor_prenda),
        insumos: suministros.filter((s) => s.tipo === 'Insumo').map(numeros),
        materias: suministros
            .filter((s) => s.tipo === 'Materia prima')
            .map((s) => ({
                ...numeros(s),
                tallas: tallas
                    .filter((t) => t.id_suministro === s.id_suministro)
                    .map(({ talla, cantidad }) => ({ talla, cantidad: Number(cantidad) })),
            })),
        descripciones,
    };
}

/**
 * Valida lo que envía el formulario y calcula los valores con los precios guardados en la base de datos
 * (no se confía en los valores que calcula el navegador).
 */
async function prepararReferencia(req, body) {
    const errores = {};
    const id = normalizarCodigo(body.id_referencia);
    const tipo = texto(body.tipo);
    if (!CODIGO_RE.test(id)) errores.id_referencia = 'Usa letras, números y guiones, máximo 30. Ej: REF-001';
    if (tipo.length < 2 || tipo.length > 60) errores.tipo = 'Escribe el tipo de prenda (máximo 60 caracteres).';

    const listaInsumos = Array.isArray(body.insumos) ? body.insumos.slice(0, 60) : [];
    const listaMaterias = Array.isArray(body.materias) ? body.materias.slice(0, 20) : [];
    if (listaInsumos.length === 0 && listaMaterias.length === 0) errores.suministros = 'Agrega al menos un insumo o una materia prima.';

    const insumos = [];
    for (const item of listaInsumos) {
        const cantidad = numeroPositivo(item?.cantidad);
        const [[fila]] = await connection.query(
            `SELECT i.id_insumo, i.nombre, i.categoria, p.unidad, p.valor
             FROM insumo i JOIN precio_insumo p ON p.id_insumo = i.id_insumo AND p.unidad = ?
             WHERE i.id_insumo = ? AND i.nit_usuario = ?`,
            [texto(item?.unidad), texto(item?.id_insumo), nitEmpresa(req)],
        );
        if (!fila) {
            errores.insumos = 'Uno de los insumos ya no existe o cambió de precio. Quítalo y agrégalo de nuevo.';
            break;
        }
        if (!cantidad) {
            errores.insumos = `Escribe una cantidad mayor que 0 para ${fila.nombre}.`;
            break;
        }
        if (insumos.some((i) => i.id_insumo === fila.id_insumo && i.unidad === fila.unidad)) {
            errores.insumos = `${fila.nombre} (por ${fila.unidad}) está repetido.`;
            break;
        }
        const valor = Number(fila.valor);
        insumos.push({ ...fila, cantidad, valor_unitario: valor, total: redondear(cantidad * valor) });
    }

    const materias = [];
    for (const item of listaMaterias) {
        const [[fila]] = await connection.query(
            `SELECT m.id_materia, m.nombre, m.color, m.tipo_tejido, p.unidad, p.valor
             FROM materia_prima m JOIN precio_materia p ON p.id_materia = m.id_materia AND p.unidad = ?
             WHERE m.id_materia = ? AND m.nit_usuario = ?`,
            [texto(item?.unidad), texto(item?.id_materia), nitEmpresa(req)],
        );
        if (!fila) {
            errores.materias = 'Una de las telas ya no existe o cambió de precio. Quítala y agrégala de nuevo.';
            break;
        }
        const tallas = (Array.isArray(item?.tallas) ? item.tallas.slice(0, 30) : [])
            .map((t) => ({ talla: texto(t?.talla).toUpperCase(), cantidad: numeroPositivo(t?.cantidad) }));
        if (tallas.length === 0 || tallas.some((t) => !t.talla || t.talla.length > 20 || !t.cantidad)) {
            errores.materias = `Revisa las tallas de ${fila.nombre}: cada talla necesita nombre y una cantidad mayor que 0.`;
            break;
        }
        if (new Set(tallas.map((t) => t.talla)).size !== tallas.length) {
            errores.materias = `Hay tallas repetidas en ${fila.nombre}.`;
            break;
        }
        // El consumo de la tela es el promedio de las cantidades por talla
        const promedio = redondear(tallas.reduce((suma, t) => suma + t.cantidad, 0) / tallas.length);
        const valor = Number(fila.valor);
        materias.push({ ...fila, tallas, promedio, valor_unitario: valor, total: redondear(promedio * valor) });
    }

    const descripciones = (Array.isArray(body.descripciones) ? body.descripciones.slice(0, 80) : [])
        .map((d) => ({ nombre: texto(d?.nombre), descripcion: texto(d?.descripcion) }))
        .filter((d) => d.nombre || d.descripcion);
    if (descripciones.some((d) => !d.nombre || d.nombre.length > 100 || d.descripcion.length > 1000)) {
        errores.descripciones = 'Cada descripción necesita un nombre (máximo 100 caracteres) y un texto de máximo 1000.';
    }

    const valorPrenda = redondear([...insumos, ...materias].reduce((suma, s) => suma + s.total, 0));
    return { errores, id, tipo, insumos, materias, descripciones, valorPrenda };
}

// Suministros (con tallas) y descripciones de la referencia; al editar se reemplazan los anteriores
async function guardarContenido(conexion, id, { insumos, materias, descripciones }) {
    await conexion.query('DELETE FROM suministro WHERE id_referencia = ?', [id]);
    await conexion.query('DELETE FROM descripcion WHERE id_referencia = ?', [id]);
    for (const i of insumos) {
        await conexion.query(
            `INSERT INTO suministro (id_referencia, tipo, id_insumo, nombre, categoria, cantidad, valor_unitario, unidad)
             VALUES (?, 'Insumo', ?, ?, ?, ?, ?, ?)`,
            [id, i.id_insumo, i.nombre, i.categoria, i.cantidad, i.valor_unitario, i.unidad],
        );
    }
    for (const m of materias) {
        const [resultado] = await conexion.query(
            `INSERT INTO suministro (id_referencia, tipo, id_materia, nombre, categoria, color, cantidad, valor_unitario, unidad)
             VALUES (?, 'Materia prima', ?, ?, ?, ?, ?, ?, ?)`,
            [id, m.id_materia, m.nombre, m.tipo_tejido || 'Tela', m.color, m.promedio, m.valor_unitario, m.unidad],
        );
        await conexion.query('INSERT INTO suministro_talla (id_suministro, talla, cantidad) VALUES ?', [
            m.tallas.map((t) => [resultado.insertId, t.talla, t.cantidad]),
        ]);
    }
    if (descripciones.length > 0) {
        await conexion.query('INSERT INTO descripcion (id_referencia, nombre_descripcion, descripcion) VALUES ?', [
            descripciones.map((d) => [id, d.nombre, d.descripcion || null]),
        ]);
    }
}

// GET /api/referencias?q=REF&desde=2026-10-01&hasta=2026-10-31
router.get('/', async (req, res) => {
    try {
        const condiciones = ['r.nit_usuario = ?'];
        const valores = [nitEmpresa(req)];
        if (texto(req.query.q)) {
            condiciones.push('(r.id_referencia LIKE ? OR r.tipo LIKE ?)');
            valores.push(`%${texto(req.query.q)}%`, `%${texto(req.query.q)}%`);
        }
        if (FECHA_RE.test(req.query.desde ?? '')) {
            condiciones.push('r.fecha >= ?');
            valores.push(req.query.desde);
        }
        if (FECHA_RE.test(req.query.hasta ?? '')) {
            condiciones.push('r.fecha <= ?');
            valores.push(req.query.hasta);
        }
        const [filas] = await connection.query(
            `SELECT r.id_referencia, r.tipo, DATE_FORMAT(r.fecha, '%Y-%m-%d') AS fecha, r.valor_prenda, r.foto,
                    (SELECT COUNT(*) FROM suministro s WHERE s.id_referencia = r.id_referencia AND s.tipo = 'Insumo') AS insumos,
                    (SELECT COUNT(*) FROM suministro s WHERE s.id_referencia = r.id_referencia AND s.tipo = 'Materia prima') AS materias,
                    (SELECT COUNT(*) FROM descripcion d WHERE d.id_referencia = r.id_referencia) AS descripciones
             FROM referencia r WHERE ${condiciones.join(' AND ')}
             ORDER BY r.fecha DESC, r.id_referencia`,
            valores,
        );
        res.json(filas.map((f) => ({ ...f, valor_prenda: Number(f.valor_prenda) })));
    } catch (error) {
        console.error('Error al listar referencias:', error.message);
        res.status(500).json({ message: 'No se pudo consultar las referencias.' });
    }
});

// GET /api/referencias/existe?id=REF-001
router.get('/existe', async (req, res) => {
    const id = normalizarCodigo(req.query.id);
    if (!CODIGO_RE.test(id)) return res.json({ existe: false });
    try {
        res.json({ existe: await existeCodigo(id), id });
    } catch (error) {
        console.error('Error al validar la referencia:', error.message);
        res.status(500).json({ message: 'No se pudo validar el número de referencia.' });
    }
});

// GET /api/referencias/:id
router.get('/:id', async (req, res) => {
    try {
        const referencia = await detalle(req, req.params.id);
        if (!referencia) return res.status(404).json({ message: 'La referencia no existe.' });
        res.json(referencia);
    } catch (error) {
        console.error('Error al consultar la referencia:', error.message);
        res.status(500).json({ message: 'No se pudo consultar la referencia.' });
    }
});

// POST /api/referencias/imagen-ia: foto de la prenda creada con IA a partir del tipo, las telas, los insumos y las descripciones
router.post('/imagen-ia', async (req, res) => {
    const body = req.body ?? {};
    const tipo = texto(body.tipo);
    if (tipo.length < 2) return res.status(400).json({ message: 'Falta el tipo de prenda.' });
    if (!iaConfigurada()) {
        return res.status(503).json({ message: 'La IA de imágenes no está configurada. Se usará la ilustración.', configurada: false });
    }
    try {
        // Los colores y composiciones se toman del inventario de la empresa
        const ids = (Array.isArray(body.materias) ? body.materias : []).map((m) => texto(m?.id_materia)).filter(Boolean).slice(0, 3);
        let materias = [];
        if (ids.length) {
            const [filas] = await connection.query(
                'SELECT id_materia, nombre, color, composicion, tipo_tejido FROM materia_prima WHERE nit_usuario = ? AND id_materia IN (?)',
                [nitEmpresa(req), ids],
            );
            materias = ids.map((id) => filas.find((f) => f.id_materia === id)).filter(Boolean);
        }
        // Insumos con su cantidad por prenda; la categoría se toma del inventario ("Botones", "Cremalleras"…)
        const listaInsumos = (Array.isArray(body.insumos) ? body.insumos : []).slice(0, 12);
        const idsInsumos = listaInsumos.map((i) => texto(i?.id_insumo)).filter(Boolean);
        const [categorias] = idsInsumos.length
            ? await connection.query('SELECT id_insumo, categoria FROM insumo WHERE nit_usuario = ? AND id_insumo IN (?)', [nitEmpresa(req), idsInsumos])
            : [[]];
        const insumos = listaInsumos
            .map((i) => ({
                nombre: texto(i?.nombre),
                categoria: categorias.find((c) => c.id_insumo === texto(i?.id_insumo))?.categoria || '',
                cantidad: Number(i?.cantidad) || 0,
                unidad: texto(i?.unidad),
            }))
            .filter((i) => i.nombre);
        const descripciones = (Array.isArray(body.descripciones) ? body.descripciones : [])
            .map((d) => ({ nombre: texto(d?.nombre), descripcion: texto(d?.descripcion) }))
            .filter((d) => d.nombre || d.descripcion);

        const prompt = construirPrompt({ tipo, materias, insumos, descripciones });
        res.json({ imagen: await generarImagenIA(prompt), prompt });
    } catch (error) {
        console.error('Error al generar la imagen con IA:', error.message, error.detalle || '');
        res.status(error.status || 500).json({ message: error.message || 'No se pudo generar la imagen con IA.' });
    }
});

// POST /api/referencias/calcular: valor de la prenda con los precios actuales (sin guardar)
router.post('/calcular', async (req, res) => {
    try {
        const { errores, insumos, materias, valorPrenda } = await prepararReferencia(req, { ...req.body, id_referencia: 'X', tipo: 'XX' });
        delete errores.id_referencia;
        delete errores.tipo;
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los suministros.', errores });
        res.json({ insumos, materias, valor_prenda: valorPrenda });
    } catch (error) {
        console.error('Error al calcular la referencia:', error.message);
        res.status(500).json({ message: 'No se pudo calcular el valor de la prenda.' });
    }
});

// POST /api/referencias   (la imagen generada llega en imagen_base64; la fecha es la del día)
router.post('/', async (req, res) => {
    let foto = null;
    try {
        const { errores, id, tipo, insumos, materias, descripciones, valorPrenda } = await prepararReferencia(req, req.body ?? {});
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos de la referencia.', errores });
        if (await existeCodigo(id)) {
            return res.status(409).json({
                message: 'Ya existe una referencia con ese número.',
                errores: { id_referencia: `La referencia ${id} ya está registrada. Usa otro número.` },
            });
        }
        if (req.body.imagen_base64) foto = await guardarFoto(req.body.imagen_base64, 'referencias', id);

        await enTransaccion(async (conexion) => {
            await conexion.query(
                'INSERT INTO referencia (id_referencia, nit_usuario, tipo, fecha, valor_prenda, foto) VALUES (?, ?, ?, CURDATE(), ?, ?)',
                [id, nitEmpresa(req), tipo, valorPrenda, foto],
            );
            await guardarContenido(conexion, id, { insumos, materias, descripciones });
        });
        res.status(201).json({ message: 'Referencia creada.', referencia: await detalle(req, id) });
    } catch (error) {
        await borrarFoto(foto);
        if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Ya existe una referencia con ese número.' });
        if (error.message.startsWith('La foto')) return res.status(400).json({ message: error.message });
        console.error('Error al crear la referencia:', error.message);
        res.status(500).json({ message: 'No se pudo crear la referencia.' });
    }
});

// PUT /api/referencias/:id   (el número y la fecha de creación no cambian; sin imagen nueva se conserva la actual)
router.put('/:id', async (req, res) => {
    let foto = null;
    try {
        const actual = await detalle(req, req.params.id);
        if (!actual) return res.status(404).json({ message: 'La referencia no existe.' });
        const { errores, tipo, insumos, materias, descripciones, valorPrenda } = await prepararReferencia(req, {
            ...req.body,
            id_referencia: actual.id_referencia,
        });
        if (Object.keys(errores).length > 0) return res.status(400).json({ message: 'Revisa los datos de la referencia.', errores });
        if (req.body.imagen_base64) foto = await guardarFoto(req.body.imagen_base64, 'referencias', actual.id_referencia);

        await enTransaccion(async (conexion) => {
            await conexion.query('UPDATE referencia SET tipo = ?, valor_prenda = ?, foto = ? WHERE id_referencia = ? AND nit_usuario = ?', [
                tipo,
                valorPrenda,
                foto || actual.foto,
                actual.id_referencia,
                nitEmpresa(req),
            ]);
            await guardarContenido(conexion, actual.id_referencia, { insumos, materias, descripciones });
        });
        if (foto) await borrarFotoSinUso(actual.foto);
        res.json({ message: 'Referencia actualizada.', referencia: await detalle(req, actual.id_referencia) });
    } catch (error) {
        await borrarFoto(foto);
        if (error.message.startsWith('La foto')) return res.status(400).json({ message: error.message });
        console.error('Error al actualizar la referencia:', error.message);
        res.status(500).json({ message: 'No se pudo actualizar la referencia.' });
    }
});

// DELETE /api/referencias/:id   (sus suministros, tallas y descripciones se borran en cascada)
router.delete('/:id', async (req, res) => {
    try {
        const referencia = await detalle(req, req.params.id);
        if (!referencia) return res.status(404).json({ message: 'La referencia no existe o ya fue eliminada.' });
        await connection.query('DELETE FROM referencia WHERE id_referencia = ? AND nit_usuario = ?', [referencia.id_referencia, nitEmpresa(req)]);
        await borrarFotoSinUso(referencia.foto);
        res.json({ message: 'Referencia eliminada.' });
    } catch (error) {
        console.error('Error al eliminar la referencia:', error.message);
        res.status(500).json({ message: 'No se pudo eliminar la referencia.' });
    }
});

export default router;
