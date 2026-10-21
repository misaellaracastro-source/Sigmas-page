import { connection } from '../config/mysql/dbmysql.js';
import { revisarStock } from './alertas.js';

// Las cotizaciones descuentan del inventario los materiales que necesitan.
// El inventario lleva la cantidad en una sola unidad: la de la tela (unidad_medida) o el primer precio del insumo.
// Si la cotización usa otra unidad de la misma familia (docena → unidad, centímetro → metro) se convierte.
const FACTORES = {
    unidad: ['conteo', 1],
    docena: ['conteo', 12],
    gruesa: ['conteo', 144],
    metro: ['largo', 1],
    centímetro: ['largo', 0.01],
    centimetro: ['largo', 0.01],
    yarda: ['largo', 0.9144],
    kilogramo: ['peso', 1],
    libra: ['peso', 0.453592],
};

const redondear = (n) => Math.round(n * 100) / 100;
const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

// Convierte una cantidad de una unidad a otra; null si no se puede (ej: rollo → metro)
export function convertir(cantidad, de, a) {
    if (de === a) return cantidad;
    const origen = FACTORES[de];
    const destino = FACTORES[a];
    if (!origen || !destino || origen[0] !== destino[0]) return null;
    return (cantidad * origen[1]) / destino[1];
}

// Elemento del inventario con su unidad de inventario
async function buscar(conexion, nit, tipo, codigo, bloquear = false) {
    if (!codigo) return null;
    const bloqueo = bloquear ? ' FOR UPDATE' : '';
    if (tipo === 'Insumo') {
        const [[fila]] = await conexion.query(
            `SELECT i.id_insumo AS codigo, i.nombre, i.cantidad, i.stock_minimo,
                    (SELECT p.unidad FROM precio_insumo p WHERE p.id_insumo = i.id_insumo ORDER BY p.id_precio LIMIT 1) AS unidad
             FROM insumo i WHERE i.id_insumo = ? AND i.nit_usuario = ?${bloqueo}`,
            [codigo, nit],
        );
        return fila || null;
    }
    const [[fila]] = await conexion.query(
        `SELECT id_materia AS codigo, nombre, cantidad, stock_minimo, unidad_medida AS unidad
         FROM materia_prima WHERE id_materia = ? AND nit_usuario = ?${bloqueo}`,
        [codigo, nit],
    );
    return fila || null;
}

/**
 * Para la vista previa: agrega a cada material cuánto hay en el inventario (en la unidad del material)
 * y si alcanza para la cantidad de prendas.
 * Al editar una cotización (idCotizacion) se suma lo que ella misma ya había descontado.
 */
export async function conExistencias(nit, materiales, idCotizacion = null) {
    const [yaDescontado] = idCotizacion
        ? await connection.query(
              'SELECT COALESCE(id_insumo, id_materia) AS codigo, SUM(cantidad) AS cantidad FROM cotizacion_descuento WHERE id_cotizacion = ? GROUP BY codigo',
              [idCotizacion],
          )
        : [[]];
    return Promise.all(
        materiales.map(async (m) => {
            const item = await buscar(connection, nit, m.tipo, m.codigo);
            if (!item) return { ...m, disponible: null, alcanza: null };
            const devuelto = Number(yaDescontado.find((d) => d.codigo === item.codigo)?.cantidad || 0);
            const disponible = convertir(Number(item.cantidad) + devuelto, item.unidad, m.unidad);
            return {
                ...m,
                disponible: disponible === null ? null : redondear(disponible),
                unidad_inventario: item.unidad,
                cantidad_inventario: Number(item.cantidad),
                alcanza: disponible === null ? null : disponible >= m.total,
            };
        }),
    );
}

/**
 * Descuenta del inventario los materiales de la cotización (dentro de la transacción).
 * materiales: [{ tipo, codigo, nombre, unidad, total }]
 * Devuelve { descontados, avisos, afectados } — afectados se revisan con revisarStock después del commit.
 */
export async function descontar(conexion, nit, idCotizacion, materiales) {
    const descontados = [];
    const avisos = [];
    const afectados = [];
    for (const m of materiales) {
        const item = await buscar(conexion, nit, m.tipo, m.codigo, true);
        if (!item) {
            avisos.push(`${m.nombre} ya no está en el inventario: no se descontó.`);
            continue;
        }
        const cantidad = convertir(m.total, m.unidad, item.unidad);
        if (cantidad === null) {
            avisos.push(`${m.nombre}: la referencia lo usa por ${m.unidad} y el inventario lo lleva por ${item.unidad}; no se descontó.`);
            continue;
        }
        const descuento = redondear(cantidad);
        const tabla = m.tipo === 'Insumo' ? 'insumo' : 'materia_prima';
        const columna = m.tipo === 'Insumo' ? 'id_insumo' : 'id_materia';
        await conexion.query(`UPDATE ${tabla} SET cantidad = cantidad - ? WHERE ${columna} = ?`, [descuento, item.codigo]);
        await conexion.query(
            `INSERT INTO cotizacion_descuento (id_cotizacion, tipo, ${columna}, nombre, cantidad, unidad) VALUES (?, ?, ?, ?, ?, ?)`,
            [idCotizacion, m.tipo, item.codigo, item.nombre, descuento, item.unidad],
        );
        const queda = redondear(Number(item.cantidad) - descuento);
        descontados.push({ nombre: item.nombre, cantidad: descuento, unidad: item.unidad, queda });
        if (queda < 0) {
            avisos.push(`No alcanzó ${item.nombre}: faltan ${numero.format(-queda)} ${item.unidad} (el inventario quedó en ${numero.format(queda)}).`);
        }
        afectados.push({ tipo: m.tipo, codigo: item.codigo });
    }
    return { descontados, avisos, afectados };
}

// Devuelve al inventario lo que la cotización había descontado (al editarla o eliminarla)
export async function devolver(conexion, idCotizacion) {
    const [filas] = await conexion.query('SELECT tipo, id_insumo, id_materia, cantidad FROM cotizacion_descuento WHERE id_cotizacion = ?', [
        idCotizacion,
    ]);
    const afectados = [];
    for (const f of filas) {
        if (f.id_insumo) await conexion.query('UPDATE insumo SET cantidad = cantidad + ? WHERE id_insumo = ?', [f.cantidad, f.id_insumo]);
        if (f.id_materia) await conexion.query('UPDATE materia_prima SET cantidad = cantidad + ? WHERE id_materia = ?', [f.cantidad, f.id_materia]);
        if (f.id_insumo || f.id_materia) afectados.push({ tipo: f.tipo, codigo: f.id_insumo || f.id_materia });
    }
    await conexion.query('DELETE FROM cotizacion_descuento WHERE id_cotizacion = ?', [idCotizacion]);
    return afectados;
}

// Después de guardar: alerta de stock bajo para lo que quedó en el mínimo (o la quita si se recuperó)
export async function revisarAfectados(nit, afectados) {
    const vistos = new Set();
    let alertas = 0;
    for (const a of afectados) {
        const clave = `${a.tipo}:${a.codigo}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        const item = await buscar(connection, nit, a.tipo, a.codigo);
        if (!item) continue;
        const nueva = await revisarStock({
            nit,
            tipo: a.tipo === 'Insumo' ? 'insumo' : 'materia',
            id: item.codigo,
            nombre: item.nombre,
            cantidad: Number(item.cantidad),
            minimo: Number(item.stock_minimo),
            unidad: item.unidad || '',
        });
        if (nueva) alertas++;
    }
    return alertas;
}
