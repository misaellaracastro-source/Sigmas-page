import './src/config/env.js';
import Server from './src/config/server/express.server.js';
import { dbConnectMysql } from './src/config/mysql/dbmysql.js';
import { iniciarRevisionPeriodica } from './src/services/alertas.js';

const ESPERA_REINTENTO_MS = 30000;

// Se intenta conectar a la base de datos hasta lograrlo. Mientras tanto la página sigue en línea
// (el servidor no se cierra) y el API responde con un error que el usuario puede leer.
async function conectarBaseDeDatos() {
    for (let intento = 1; ; intento++) {
        try {
            await dbConnectMysql();
            return;
        } catch {
            console.error(`Base de datos no disponible (intento ${intento}). Se reintenta en ${ESPERA_REINTENTO_MS / 1000} s.`);
            await new Promise((resolver) => setTimeout(resolver, ESPERA_REINTENTO_MS));
        }
    }
}

async function main() {
    const server = new Server();
    await server.start();

    await conectarBaseDeDatos();

    // Alertas de fechas: pendientes del calendario y facturas por vencer
    iniciarRevisionPeriodica();
}

// Manejo de errores e inicio del servidor
main().catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
});
