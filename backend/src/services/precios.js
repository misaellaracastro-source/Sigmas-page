import { connection } from '../config/mysql/dbmysql.js';
import { numeroPositivo, texto } from './validacion.js';

// Unidades en las que se puede poner precio a cada tipo de inventario
export const UNIDADES_PRECIO = {
    insumo: ['unidad', 'metro', 'centímetro', 'yarda', 'docena', 'gruesa', 'paquete', 'rollo', 'cono', 'kilogramo', 'libra', 'caja'],
    materia: ['metro', 'metro cuadrado', 'kilogramo', 'rollo', 'pieza', 'yarda'],
};

const TABLAS = {
    insumo: { tabla: 'precio_insumo', columna: 'id_insumo' },
    materia: { tabla: 'precio_materia', columna: 'id_materia' },
};

// Valida [{ unidad, valor }]: al menos uno, sin unidades repetidas
export function validarPrecios(lista, tipo) {
    if (!Array.isArray(lista) || lista.length === 0) return { error: 'Agrega al menos un precio.' };
    if (lista.length > UNIDADES_PRECIO[tipo].length) return { error: 'Hay demasiados precios.' };

    const precios = [];
    for (const item of lista) {
        const unidad = texto(item?.unidad).toLowerCase();
        const valor = numeroPositivo(item?.valor);
        if (!UNIDADES_PRECIO[tipo].includes(unidad)) return { error: 'Elige la unidad de cada precio.' };
        if (valor === null) return { error: `Escribe un valor válido para el precio por ${unidad}.` };
        if (precios.some((p) => p.unidad === unidad)) return { error: `El precio por ${unidad} está repetido.` };
        precios.push({ unidad, valor });
    }
    return { precios };
}

// Reemplaza los precios de un elemento (dentro de la transacción recibida)
export async function guardarPrecios(conexion, tipo, id, precios) {
    const { tabla, columna } = TABLAS[tipo];
    await conexion.query(`DELETE FROM ${tabla} WHERE ${columna} = ?`, [id]);
    await conexion.query(
        `INSERT INTO ${tabla} (${columna}, unidad, valor) VALUES ?`,
        [precios.map((p) => [id, p.unidad, p.valor])],
    );
}

// Agrega a cada fila su lista de precios (en el orden en que se registraron)
export async function adjuntarPrecios(tipo, filas) {
    if (filas.length === 0) return filas;
    const { tabla, columna } = TABLAS[tipo];
    const [precios] = await connection.query(
        `SELECT ${columna} AS id, unidad, valor FROM ${tabla} WHERE ${columna} IN (?) ORDER BY id_precio`,
        [filas.map((f) => f[columna])],
    );
    return filas.map((fila) => ({
        ...fila,
        precios: precios.filter((p) => p.id === fila[columna]).map(({ unidad, valor }) => ({ unidad, valor: Number(valor) })),
    }));
}

// Ejecuta varias consultas como una sola: si algo falla, no queda nada a medias
export async function enTransaccion(trabajo) {
    const conexion = await connection.getConnection();
    try {
        await conexion.beginTransaction();
        const resultado = await trabajo(conexion);
        await conexion.commit();
        return resultado;
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }
}
