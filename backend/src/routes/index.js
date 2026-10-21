import { Router } from 'express';//utilizar las rutas donde se comunica con el sistema
import fs from 'node:fs'; // Importación de fs para leer archivos y directorios
import path from 'node:path'; // Importación de path para construir rutas de archivos
import { fileURLToPath, pathToFileURL } from 'node:url';

//esto utiliza la ubicacion del archivo actual para obtener la ruta del directorio actual. Esto es útil para construir rutas relativas a partir de la ubicación del archivo actual.
const currentFile = fileURLToPath(import.meta.url);
//obtener la carpeta donde está ubicado el archivo actual, para que luego puedas buscar otras carpetas y archivos dentro de esa ruta.
const currentDir = path.dirname(currentFile);

class RouterLoader {
    constructor() {
        this.router = Router();
        this.routesPath = currentDir;
    }


    removeExtension(fileName) {
        return fileName.replace(/\.[^/.]+$/, ''); // Eliminación de la extensión del archivo
    }

    async loadRouteFile(dirname, file) {
         // Registro del router para el directorio
        const routePath = path.join(this.routesPath, dirname, file); // Construcción de la ruta del archivo
        const routeUrl = pathToFileURL(routePath).href; // Construcción de la URL del archivo
        const routeName = this.removeExtension(file); // Eliminación de la extensión del archivo
        const routeModule = await import(routeUrl); // Importación del módulo del archivo

        if (!routeModule.default) {
            throw new Error(`El archivo ${routePath} no exporta un router por default.`); // Error si el archivo no exporta un router por default
        }

        this.router.use(`/${routeName}`, routeModule.default);
        console.log(`Ruta cargada: /${routeName}`);
    }

    async loadRoutes() {
        const directories = fs
            .readdirSync(this.routesPath)
            .filter((entryName) => {
                const entryPath = path.join(this.routesPath, entryName);
                return fs.statSync(entryPath).isDirectory();
            }); // Filtrado de los directorios
            // ejemplo de directories: ['holi', 'admin', 'api']

        for (const dirname of directories) {
            const directoryPath = path.join(this.routesPath, dirname);
            const routeFiles = fs
                .readdirSync(directoryPath) // Lectura de los archivos del directorio
                .filter((file) => file.endsWith('.js') && file !== 'index.js'); // Filtrado de los archivos
                // ejemplo de routeFiles: ['holi.js', 'admin.js', 'api.js']

            for (const file of routeFiles) {
                await this.loadRouteFile(dirname, file); // Carga de la ruta
            }
        } 

        return this.router;
    }
}

const routerLoader = new RouterLoader();
const router = await routerLoader.loadRoutes();

export default router;