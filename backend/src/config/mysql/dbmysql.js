import mysql from 'mysql2/promise';
import '../env.js';

const database = process.env.MYSQL_DATABASE;
const username = process.env.MYSQL_USER;
const password = process.env.MYSQL_PASSWORD;
const host = process.env.MYSQL_HOST;
const port = process.env.MYSQL_PORT;

// Las bases de datos en internet (por ejemplo Aiven) piden conexión segura:
// MYSQL_SSL = true, y si dan un certificado, su contenido en MYSQL_SSL_CA
const ssl = process.env.MYSQL_SSL === 'true'
    ? (process.env.MYSQL_SSL_CA
        ? { ca: process.env.MYSQL_SSL_CA.replace(/\\n/g, '\n') }
        : { rejectUnauthorized: false })
    : undefined;

// Pool de conexiones: reutiliza conexiones para cada consulta
const connection = mysql.createPool(
    {
        host: host,
        user: username,
        password: password,
        database: database,
        port: Number(port),
        ssl,
        // La misma intercalación de las tablas (en MySQL 8 la de fábrica es otra)
        charset: 'UTF8MB4_UNICODE_CI',
        waitForConnections: true,
        connectionLimit: 10,
    }
);

// Hora de Colombia en la base de datos (NOW(), CURDATE()...),
// aunque el servidor en internet esté en otra zona horaria
connection.pool.on('connection', (conexion) => {
    conexion.query(`SET time_zone = '${process.env.MYSQL_ZONA_HORARIA || '-05:00'}'`);
});


const dbConnectMysql = async () => {
    try {
        // Consulta de prueba para verificar que la conexión funciona
        await connection.query('SELECT 1');
        console.log(`Conectado a la base de datos mysql: ${database}`);
    } catch (error) {
        console.error('No se pudo conectar a MySQL:', error.message);
        throw error;
    }
}

export { connection, dbConnectMysql };
