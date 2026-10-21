import './src/config/env.js';
import Server from './src/config/server/express.server.js';
import { dbConnectMysql } from './src/config/mysql/dbmysql.js';
import { iniciarRevisionPeriodica } from './src/services/alertas.js';


async function main() {
    try {
        // Conexión a la base de datos
        await dbConnectMysql();

        const server = new Server();
        await server.start();

        // Alertas de fechas: pendientes del calendario y facturas por vencer
        iniciarRevisionPeriodica();
    } catch (error) {
        console.error('Error al iniciar la aplicación:', error.message);
        process.exit(1);
    }
}

// Manejo de errores e inicio del servidor
main().catch(
    (error) => {
        console.error('Error fatal:', error);
        process.exit(1);
    }
);
