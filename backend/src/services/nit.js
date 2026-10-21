// Dígito de verificación del NIT según el algoritmo de la DIAN
export function digitoVerificacion(numero) {
    const pesos = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];
    const suma = numero
        .split('')
        .reverse()
        .reduce((total, digito, i) => total + Number(digito) * pesos[i], 0);
    const residuo = suma % 11;
    return residuo > 1 ? 11 - residuo : residuo;
}

// El NIT se guarda como 900123456-7; acepta puntos y el guion opcional
export function normalizarNit(valor) {
    const limpio = String(valor ?? '').replace(/[.\s]/g, '');
    const partes = limpio.match(/^(\d{8,10})-?(\d)$/);
    if (!partes) {
        return { error: 'El NIT debe tener el formato 900123456-7 (número, guion y dígito de verificación).' };
    }
    const [, numero, dv] = partes;
    const esperado = digitoVerificacion(numero);
    if (esperado !== Number(dv)) {
        return { error: `El dígito de verificación no corresponde. Para ${numero} es ${esperado}.` };
    }
    return { valor: `${numero}-${dv}` };
}
