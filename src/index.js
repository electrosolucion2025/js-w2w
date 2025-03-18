import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs-extra';
import Redis from 'ioredis';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import { messageQueue } from './queues/messageQueue.js'; // Importar la cola de Bull y el volcado de mensajes
import setRoutes from './routes/index.js';
import { checkAllPrinters, retryFailedTickets } from './services/printerService.js';
import { setupTempDirectory } from './utils/setupUtils.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

setupTempDirectory();

// Increase JSON request size limit
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Obtener __dirname equivalente en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurar rutas estáticas
app.use('/receipts', express.static(path.join(__dirname, '../public/receipts')));

// Configurar carpetas públicas para archivos estáticos
const publicPath = path.join(__dirname, '../public');
const uploadsPath = path.join(__dirname, '../uploads');
const mediasPath = path.join(__dirname, '../medias');

// Servir archivos estáticos desde estas carpetas
app.use('/public', express.static(publicPath));
app.use('/uploads', express.static(uploadsPath));
app.use('/medias', express.static(mediasPath));

setRoutes(app);

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  })
  .catch(err => {
    console.error('Database connection error:', err);
  });

const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis error:', err);
});

// Iniciar la cola de trabajos
if (messageQueue) {
  messageQueue.on('completed', (job) => {
    console.log(`Job completed with result ${job.returnvalue}`);
  });

  messageQueue.on('failed', (job, err) => {
    console.error(`Job failed with error ${err.message}`);
  });
}

// Intervalo de verificación de impresoras (5 minutos)
const PRINTER_CHECK_INTERVAL = 5 * 60 * 1000;

// Intervalo de reintento de tickets (2 minutos)
const TICKET_RETRY_INTERVAL = 2 * 60 * 1000;

// Verificación periódica de impresoras
setInterval(async () => {
  try {
    console.log('Verificando estado de todas las impresoras...');
    await checkAllPrinters();
  } catch (error) {
    console.error('Error en verificación programada de impresoras:', error);
  }
}, PRINTER_CHECK_INTERVAL);

// Reintento periódico de tickets fallidos
setInterval(async () => {
  try {
    console.log('Reintentando tickets fallidos...');
    const results = await retryFailedTickets();

    if (results.length > 0) {
      const successful = results.filter(r => r.success).length;
      console.log(`Reintentados ${results.length} tickets, ${successful} exitosos`);
    }
  } catch (error) {
    console.error('Error en reintento de tickets:', error);
  }
}, TICKET_RETRY_INTERVAL);

// Primera verificación al iniciar
setTimeout(async () => {
  try {
    await checkAllPrinters();
  } catch (error) {
    console.error('Error en verificación inicial de impresoras:', error);
  }
}, 10000); // Esperar 10 segundos después de iniciar para que todo esté cargado

// Antes de iniciar el servidor
const publicDir = path.join(__dirname, '../public');
const receiptsDir = path.join(publicDir, 'receipts');

// Asegurar que existen los directorios necesarios
(async () => {
  try {
    await fs.ensureDir(publicDir);
    console.log('Directorio public creado o verificado');

    await fs.ensureDir(receiptsDir);
    console.log('Directorio receipts creado o verificado');
  } catch (error) {
    console.error('Error creando directorios:', error);
  }
})();