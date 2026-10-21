import express from 'express';
import cors from 'cors';
import router from '../../routes/index.js';
import { fileURLToPath } from 'node:url';
import { CARPETA_UPLOADS } from '../../services/fotos.js';

// Carpeta del front (HTML, CSS, JS e imágenes)
const carpetaFrontend = fileURLToPath(new URL('../../../../frontend', import.meta.url));

class Server {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.middleware();
        this.routes();
        this.handleErrors();
    }

    middleware() {
        this.app.use(cors());
        this.app.use(express.json({ limit: '8mb' })); // las fotos viajan en base64
        this.app.use(express.urlencoded({ extended: true }));

        // Fotos subidas (insumos)
        this.app.use('/uploads', express.static(CARPETA_UPLOADS, { maxAge: '1d' }));

        // El front se sirve desde el mismo servidor (nunca se publica backend/, ahí está el .env)
        this.app.use(express.static(carpetaFrontend));
        // Los navegadores piden /favicon.ico por su cuenta
        this.app.get('/favicon.ico', (req, res) => res.sendFile(carpetaFrontend + '/img/favicon-32.png'));
        this.app.get('/', (req, res) => res.redirect('/sigmas-registro/registro.html'));
    }

    routes() {
        // Carga automática de src/routes/<carpeta>/<archivo>.js como /api/<archivo>
        this.app.use('/api', router);
    }

    start() {
        this.app.listen(this.port, () => {
            console.log(`Conectado al puerto ${this.port}`);
            console.log(`Abre http://localhost:${this.port}`);
        });
    }

    handleErrors() {
        this.app.use((err, req, res, next) => {
            if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
                console.error("JSON inválido en la petición:", err.message);
                return res.status(400).json({ message: "JSON inválido en la petición" });
            }
            if (err.type === 'entity.too.large') return res.status(413).json({ message: 'El archivo es demasiado grande (máximo 4 MB).' });
            next(err);
        });
    }
}

export default Server;
