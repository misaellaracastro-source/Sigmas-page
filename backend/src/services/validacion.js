// Ayudas de validación compartidas por las rutas

export function texto(valor) {
    return String(valor ?? '').trim();
}

// Códigos como INS-001 o TEL_02: letras, números, guion y guion bajo (máximo 30)
export const CODIGO_RE = /^[A-Z0-9][A-Z0-9_-]{0,29}$/;

export function normalizarCodigo(valor) {
    return texto(valor).toUpperCase().replace(/\s+/g, '-');
}

// Número positivo con máximo dos decimales; devuelve null si no es válido.
// Acepta coma decimal (1,5) porque así se escribe en Colombia.
export function numeroPositivo(valor, maximo = 9999999999.99) {
    if (valor === '' || valor === null || valor === undefined) return null;
    const numero = Number(String(valor).replace(',', '.'));
    if (!Number.isFinite(numero) || numero < 0 || numero > maximo) return null;
    return Math.round(numero * 100) / 100;
}

export function sinTildes(valor) {
    return texto(valor)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}
