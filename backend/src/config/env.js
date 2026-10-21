import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

// Carga backend/.env sin importar desde qué carpeta se ejecute npm
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });
