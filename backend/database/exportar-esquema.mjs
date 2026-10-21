// Genera database/esquema.sql con la estructura de todas las tablas (sin datos), en el orden correcto
// para crearlas en una base de datos nueva (por ejemplo, la de producción para Render).
// Uso: npm run esquema
import fs from 'node:fs';
import { connection } from '../src/config/mysql/dbmysql.js';

const [tablas] = await connection.query(
    'SELECT TABLE_NAME AS nombre FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = "BASE TABLE"',
);
const [llaves] = await connection.query(
    `SELECT TABLE_NAME AS tabla, REFERENCED_TABLE_NAME AS referencia FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`,
);

// Cada tabla va después de las tablas a las que apunta
const pendientes = new Set(tablas.map((t) => t.nombre));
const orden = [];
while (pendientes.size) {
    const lista = [...pendientes].filter((t) => llaves.every((l) => l.tabla !== t || l.referencia === t || !pendientes.has(l.referencia)));
    if (lista.length === 0) throw new Error(`Dependencia circular entre: ${[...pendientes].join(', ')}`);
    lista.sort().forEach((t) => {
        orden.push(t);
        pendientes.delete(t);
    });
}

const partes = [
    '-- Estructura de la base de datos de SigmaS (sin datos).',
    '-- Generado con: npm run esquema',
    '-- Para una base nueva: ejecutar este archivo completo una sola vez.',
    '',
    'SET NAMES utf8mb4;',
    '',
];
for (const nombre of orden) {
    const [[fila]] = await connection.query(`SHOW CREATE TABLE \`${nombre}\``);
    const sql = fila['Create Table'].replace(/^CREATE TABLE/, 'CREATE TABLE IF NOT EXISTS').replace(/ AUTO_INCREMENT=\d+/, '');
    partes.push(`${sql};`, '');
}
const destino = new URL('./esquema.sql', import.meta.url);
fs.writeFileSync(destino, partes.join('\n'));
console.log(`Esquema guardado en database/esquema.sql (${orden.length} tablas): ${orden.join(', ')}`);
await connection.end();
