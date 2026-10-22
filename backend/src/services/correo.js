import nodemailer from 'nodemailer';

let transporte;
let avisado = false;

// Usa los datos SMTP_* del .env. Si no están, no envía y lo informa una sola vez en la consola.
function obtenerTransporte() {
    if (transporte) return transporte;
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        if (!avisado) console.warn('Correo desactivado: faltan SMTP_HOST, SMTP_USER o SMTP_PASS en el .env');
        avisado = true;
        return null;
    }
    const puerto = Number(SMTP_PORT) || 465;
    transporte = nodemailer.createTransport({
        host: SMTP_HOST,
        port: puerto,
        secure: puerto === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    return transporte;
}

// Devuelve true si el correo salió
export async function enviarCorreo({ para, asunto, html, texto }) {
    const smtp = obtenerTransporte();
    if (!smtp || !para) return false;
    try {
        await smtp.sendMail({
            from: process.env.SMTP_FROM || `SYSTEX <${process.env.SMTP_USER}>`,
            to: para,
            subject: asunto,
            text: texto,
            html,
        });
        return true;
    } catch (error) {
        console.error('No se pudo enviar el correo:', error.message);
        return false;
    }
}
