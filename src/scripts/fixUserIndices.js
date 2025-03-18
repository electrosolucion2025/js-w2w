import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

// Determinar ruta del directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde el directorio raíz del proyecto
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function fixUserIndices() {
  try {
    // Usar MONGODB_URI si está definida, o construir desde componentes individuales
    const mongoUri = process.env.MONGODB_URI ||
      process.env.MONGO_URI ||
      `mongodb://${process.env.MONGODB_USER || ''}:${process.env.MONGODB_PASSWORD || ''}@${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}/${process.env.MONGODB_DATABASE || 'whats2want'}`;

    console.log('Conectando a MongoDB usando URI:',
      mongoUri.replace(/mongodb:\/\/([^:]+):([^@]+)@/, 'mongodb://****:****@')); // No mostrar credenciales en el log

    await mongoose.connect(mongoUri);
    console.log('Conectado a MongoDB');

    // Obtenemos el modelo User directamente de la conexión
    // Asegurarnos que el modelo User está definido
    let User;
    try {
      User = mongoose.model('User');
    } catch (e) {
      // Si el modelo no está registrado, importarlo
      console.log('Modelo User no encontrado, importando...');

      // Definir esquema manualmente (versión simplificada)
      const userSchema = new mongoose.Schema({
        whatsappNumber: String,
        profileName: String,
        businessCode: String,
        lastBusinessCode: [String],
        acceptPolicy: Boolean,
        acceptPolicyAt: Date,
        createdAt: Date,
        updatedAt: Date
      });

      User = mongoose.model('User', userSchema);
    }

    console.log('Listando todos los índices actuales:');
    const indices = await User.collection.indexes();
    console.log(JSON.stringify(indices, null, 2));

    // Eliminar todos los índices relacionados con whatsapp (excepto _id)
    for (const index of indices) {
      // Skip the _id index which is required
      if (index.name === '_id_') continue;

      // Check if this index involves the whatsapp field in any case variation
      const indexName = index.name.toLowerCase();
      if (indexName.includes('whatsapp')) {
        console.log(`Eliminando índice: ${index.name}`);
        await User.collection.dropIndex(index.name).catch(err => {
          console.error(`Error al eliminar índice ${index.name}:`, err.message);
        });
        console.log(`Índice ${index.name} procesado`);
      }
    }

    // Verificar si hay documentos con whatsappNumber null
    const nullWhatsappCount = await User.countDocuments({ whatsappNumber: null });
    console.log(`Documentos con whatsappNumber null: ${nullWhatsappCount}`);

    // Listar algunos documentos con whatsappNumber null
    if (nullWhatsappCount > 0) {
      const nullWhatsappUsers = await User.find({ whatsappNumber: null }).limit(3);
      console.log('Ejemplos de usuarios con whatsappNumber null:',
        nullWhatsappUsers.map(u => ({ id: u._id, profileName: u.profileName })));
    }

    // Crear nuevo índice con el nombre correcto
    console.log('Creando nuevo índice con el nombre correcto (whatsappNumber)');
    await User.collection.createIndex(
      { whatsappNumber: 1 },
      {
        unique: true,
        sparse: true,
        partialFilterExpression: { whatsappNumber: { $type: "string" } },
        name: "whatsappNumber_1_sparse"  // Especificamos el nombre para evitar confusiones
      }
    ).catch(err => {
      console.error('Error al crear índice:', err.message);
    });

    console.log('Verificando los nuevos índices:');
    const newIndices = await User.collection.indexes();
    console.log(JSON.stringify(newIndices, null, 2));

    // Opcional: reparar documentos existentes
    console.log('Buscando documentos con whatsappnumber en minúscula...');
    const documentsWithLowercase = await User.collection.countDocuments({
      whatsappnumber: { $exists: true }
    });

    console.log(`Encontrados ${documentsWithLowercase} documentos con whatsappnumber en minúscula`);

    if (documentsWithLowercase > 0) {
      console.log('Actualizando documentos para normalizar nombres de campo...');
      const result = await User.collection.updateMany(
        { whatsappnumber: { $exists: true } },
        [{ $set: { whatsappNumber: "$whatsappnumber" } }, { $unset: "whatsappnumber" }]
      );

      console.log('Documentos actualizados para normalizar nombres de campo:', result.modifiedCount);
    }

    console.log('Proceso de corrección completado');

  } catch (error) {
    console.error('Error al corregir índices:', error);
  } finally {
    await mongoose.disconnect().catch(() => { });
    console.log('Desconectado de MongoDB');
  }
}

// Ejecutar directamente
fixUserIndices()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error final:', error);
    process.exit(1);
  });