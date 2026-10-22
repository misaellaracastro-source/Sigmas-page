import { connection } from '../config/mysql/dbmysql.js';
import { enviarCorreo } from './correo.js';

const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
const DIAS_FACTURA_POR_VENCER = 3;
const HORAS_ENTREGA_PROXIMA = 48;

function escapar(texto) {
    return String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// Dirección pública para los enlaces de los correos: APP_URL; en Render, si falta, la que Render pone sola
// (RENDER_EXTERNAL_URL); en el computador, localhost. Sin "/" al final para no duplicarla.
const urlApp = (ruta) =>
    `${(process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 7000}`).replace(/\/+$/, '')}${ruta}`;

// Sin el punto final de "a. m." para que la frase no termine en ".."
function fechaTexto(fecha, conHora = false) {
    return new Date(fecha)
        .toLocaleString('es-CO', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            ...(conHora ? { hour: 'numeric', minute: '2-digit' } : {}),
        })
        .replace(/\.$/, '');
}

/**
 * Guarda la alerta y envía el correo (sin frenar ni romper lo que se estaba haciendo).
 * vinculo: { columna, valor } — la columna de alertas que la relaciona (id_insumo, id_evento, nombre_factura…)
 */
async function crearAlerta({ nit, tipo, mensaje, vinculo, correo }) {
    const [resultado] = await connection.query(`INSERT INTO alertas (nit_usuario, tipo, mensaje, ${vinculo.columna}) VALUES (?, ?, ?, ?)`, [
        nit,
        tipo,
        mensaje.slice(0, 255),
        vinculo.valor,
    ]);
    notificarPorCorreo({ nit, idAlerta: resultado.insertId, mensaje, ...correo }).catch((error) =>
        console.error('Error al notificar alerta por correo:', error.message),
    );
    return resultado.insertId;
}

async function notificarPorCorreo({ nit, idAlerta, mensaje, asunto, etiqueta, enlace, boton, filas = [] }) {
    const [[usuario]] = await connection.query('SELECT correo, nombre_dueno, nombre_empresa FROM usuario WHERE nit = ?', [nit]);
    if (!usuario?.correo) return;

    const tabla = filas.length
        ? `<table style="width:100%;border-collapse:collapse;margin:14px 0">${filas
              .map(
                  ([nombre, valor], i) =>
                      `<tr><td style="padding:8px;${i % 2 ? '' : 'background:#f3f4fa'}">${escapar(nombre)}</td><td style="padding:8px;text-align:right;${i % 2 ? '' : 'background:#f3f4fa'}"><strong>${escapar(valor)}</strong></td></tr>`,
              )
              .join('')}</table>`
        : '';
    const enviado = await enviarCorreo({
        para: usuario.correo,
        asunto,
        texto: `Hola ${usuario.nombre_dueno}. ${mensaje} Revisa: ${enlace}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#0a1123">
            <div style="background:#0a1123;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
              <strong style="font-size:18px">SYSTEX</strong>
              <span style="color:#f0c75e;font-size:12px;letter-spacing:2px;margin-left:6px">${escapar(etiqueta)}</span>
            </div>
            <div style="border:1px solid #dcdeea;border-top:0;padding:22px;border-radius:0 0 12px 12px">
              <p>Hola ${escapar(usuario.nombre_dueno)},</p>
              <p>${escapar(mensaje)}</p>
              <p style="color:#575b80;font-size:13px">${escapar(usuario.nombre_empresa)}</p>
              ${tabla}
              <a href="${enlace}" style="display:inline-block;background:#0a1123;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">${escapar(boton)}</a>
            </div>
          </div>`,
    });
    if (enviado) await connection.query('UPDATE alertas SET correo_enviado = 1 WHERE id_alerta = ?', [idAlerta]);
}

/* ---------- Stock mínimo ---------- */

/**
 * Revisa el stock de un insumo o materia prima después de guardarlo (o de descontarlo en una cotización).
 * - Si llegó al mínimo y no hay una alerta pendiente: crea la alerta y envía el correo.
 * - Si ya está por encima del mínimo: da por leídas sus alertas pendientes.
 * Devuelve true si se creó una alerta nueva.
 */
export async function revisarStock({ nit, tipo, id, nombre, cantidad, minimo, unidad = '' }) {
    const columna = tipo === 'insumo' ? 'id_insumo' : 'id_materia';
    const bajo = Number(minimo) > 0 && Number(cantidad) <= Number(minimo);

    if (!bajo) {
        await connection.query(
            `UPDATE alertas SET leida = 1 WHERE nit_usuario = ? AND ${columna} = ? AND tipo = 'Stock bajo' AND leida = 0`,
            [nit, id],
        );
        return false;
    }

    const [pendientes] = await connection.query(
        `SELECT 1 FROM alertas WHERE nit_usuario = ? AND ${columna} = ? AND tipo = 'Stock bajo' AND leida = 0 LIMIT 1`,
        [nit, id],
    );
    if (pendientes.length > 0) return false;

    const etiqueta = tipo === 'insumo' ? 'insumo' : 'materia prima';
    const cantidadTexto = `${numero.format(cantidad)}${unidad ? ` ${unidad}` : ''}`;
    const minimoTexto = `${numero.format(minimo)}${unidad ? ` ${unidad}` : ''}`;
    await crearAlerta({
        nit,
        tipo: 'Stock bajo',
        mensaje: `${nombre} (${id}) llegó al stock mínimo: quedan ${cantidadTexto} y el mínimo es ${minimoTexto}.`,
        vinculo: { columna, valor: id },
        correo: {
            asunto: `Stock bajo: ${nombre}`,
            etiqueta: 'ALERTA DE STOCK',
            enlace: urlApp(`/sigmas-inventario/inventario.html#${tipo === 'insumo' ? 'insumos' : 'materias'}`),
            boton: 'Revisar inventario',
            filas: [
                [`Cantidad actual (${etiqueta})`, cantidadTexto],
                ['Stock mínimo', minimoTexto],
            ],
        },
    });
    return true;
}

/* ---------- Fechas: pendientes del calendario y facturas ---------- */

const yaAvisada = (columna) => `NOT EXISTS (SELECT 1 FROM alertas a WHERE a.tipo = ? AND a.${columna} = `;

/**
 * Crea las alertas de fechas que ya tocan (una sola vez por pendiente o factura):
 * - Recordatorio: a la hora del recordatorio del pendiente (o un día antes de su inicio si no tiene).
 * - Entrega próxima: cuando faltan 48 horas o menos para la fecha de entrega.
 * - Factura por vencer: cuando faltan 3 días o menos para su vencimiento y no está pagada.
 * - Factura vencida: pasó el vencimiento sin pagarse (también se marca como "Vencida").
 * nit: solo esa empresa; sin nit, todas (revisión periódica del servidor).
 */
export async function revisarFechas(nit = null) {
    const deEmpresa = (alias) => (nit ? ` AND ${alias}.nit_usuario = ?` : '');
    const conNit = (valores) => (nit ? [...valores, nit] : valores);
    let creadas = 0;

    // Recordatorios de pendientes
    const [recordatorios] = await connection.query(
        `SELECT c.id_evento, c.nit_usuario, c.titulo, c.fecha_inicio FROM calendario c
         WHERE c.estado IN ('Pendiente', 'En proceso')
           AND COALESCE(c.recordatorio, c.fecha_inicio - INTERVAL 1 DAY) <= NOW()
           AND c.fecha_inicio >= NOW() - INTERVAL 1 DAY
           AND ${yaAvisada('id_evento')} c.id_evento)${deEmpresa('c')}`,
        conNit(['Recordatorio']),
    );
    for (const e of recordatorios) {
        const cuando = fechaTexto(e.fecha_inicio, true);
        await crearAlerta({
            nit: e.nit_usuario,
            tipo: 'Recordatorio',
            mensaje: `Recordatorio: "${e.titulo}" es el ${cuando}.`,
            vinculo: { columna: 'id_evento', valor: e.id_evento },
            correo: {
                asunto: `Recordatorio: ${e.titulo}`,
                etiqueta: 'RECORDATORIO',
                enlace: urlApp(`/sigmas-calendario/calendario.html#evento-${e.id_evento}`),
                boton: 'Ver en el calendario',
                filas: [['Fecha', cuando]],
            },
        });
        creadas++;
    }

    // Entregas próximas (o que ya pasaron sin completarse, hasta un día después)
    const [entregas] = await connection.query(
        `SELECT c.id_evento, c.nit_usuario, c.titulo, c.fecha_entrega FROM calendario c
         WHERE c.estado IN ('Pendiente', 'En proceso') AND c.fecha_entrega IS NOT NULL
           AND c.fecha_entrega BETWEEN NOW() - INTERVAL 1 DAY AND NOW() + INTERVAL ${HORAS_ENTREGA_PROXIMA} HOUR
           AND ${yaAvisada('id_evento')} c.id_evento)${deEmpresa('c')}`,
        conNit(['Entrega proxima']),
    );
    for (const e of entregas) {
        const cuando = fechaTexto(e.fecha_entrega, true);
        const paso = new Date(e.fecha_entrega) < new Date();
        await crearAlerta({
            nit: e.nit_usuario,
            tipo: 'Entrega proxima',
            mensaje: paso ? `La entrega de "${e.titulo}" era el ${cuando} y no está completada.` : `Se acerca la entrega de "${e.titulo}": ${cuando}.`,
            vinculo: { columna: 'id_evento', valor: e.id_evento },
            correo: {
                asunto: `Entrega próxima: ${e.titulo}`,
                etiqueta: 'ENTREGA PRÓXIMA',
                enlace: urlApp(`/sigmas-calendario/calendario.html#evento-${e.id_evento}`),
                boton: 'Ver en el calendario',
                filas: [['Fecha de entrega', cuando]],
            },
        });
        creadas++;
    }

    // Facturas que vencieron sin pagarse: se marcan como vencidas
    await connection.query(
        `UPDATE factura f SET f.estado = 'Vencida'
         WHERE f.estado = 'En proceso' AND f.fecha_vencimiento IS NOT NULL AND f.fecha_vencimiento < CURDATE()${deEmpresa('f')}`,
        conNit([]),
    );
    const avisosFactura = [
        {
            tipo: 'Factura vencida',
            condicion: 'f.fecha_vencimiento < CURDATE()',
            mensaje: (f, cuando) => `La factura ${f.nombre_factura} de ${f.empresa} venció el ${cuando} y no está pagada.`,
            etiqueta: 'FACTURA VENCIDA',
        },
        {
            tipo: 'Factura por vencer',
            condicion: `f.fecha_vencimiento BETWEEN CURDATE() AND CURDATE() + INTERVAL ${DIAS_FACTURA_POR_VENCER} DAY`,
            mensaje: (f, cuando) => `La factura ${f.nombre_factura} de ${f.empresa} vence el ${cuando}.`,
            etiqueta: 'FACTURA POR VENCER',
        },
    ];
    for (const aviso of avisosFactura) {
        const [facturas] = await connection.query(
            `SELECT f.nombre_factura, f.nit_usuario, f.empresa, f.fecha_vencimiento FROM factura f
             WHERE f.estado <> 'Pagada' AND f.fecha_vencimiento IS NOT NULL AND ${aviso.condicion}
               AND ${yaAvisada('nombre_factura')} f.nombre_factura)${deEmpresa('f')}`,
            conNit([aviso.tipo]),
        );
        for (const f of facturas) {
            const cuando = fechaTexto(f.fecha_vencimiento);
            await crearAlerta({
                nit: f.nit_usuario,
                tipo: aviso.tipo,
                mensaje: aviso.mensaje(f, cuando),
                vinculo: { columna: 'nombre_factura', valor: f.nombre_factura },
                correo: {
                    asunto: `${aviso.tipo}: ${f.nombre_factura}`,
                    etiqueta: aviso.etiqueta,
                    enlace: urlApp('/sigmas-factura/factura.html#lista'),
                    boton: 'Ver facturas',
                    filas: [
                        ['Empresa', f.empresa],
                        ['Vencimiento', cuando],
                    ],
                },
            });
            creadas++;
        }
    }
    return creadas;
}

// Al cambiar las fechas de un pendiente o factura se borran sus alertas de fecha para que se vuelvan a calcular
export async function reiniciarAlertasDe(columna, valor) {
    await connection.query(
        `DELETE FROM alertas WHERE ${columna} = ? AND tipo IN ('Recordatorio', 'Entrega proxima', 'Factura por vencer', 'Factura vencida')`,
        [valor],
    );
}

// Revisión periódica de todas las empresas (cada 10 minutos mientras el servidor esté encendido)
export function iniciarRevisionPeriodica(minutos = 10) {
    const revisar = () => revisarFechas().catch((error) => console.error('Error al revisar fechas para alertas:', error.message));
    revisar();
    return setInterval(revisar, minutos * 60 * 1000);
}
