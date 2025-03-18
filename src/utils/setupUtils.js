import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Configura el directorio temporal para archivos multimedia
 */
export const setupTempDirectory = () => {
  const tempDir = path.join(__dirname, '../../temp');

  if (!fs.existsSync(tempDir)) {
    console.log('Creando directorio temporal para archivos multimedia');
    fs.mkdirSync(tempDir, { recursive: true });
  }
};