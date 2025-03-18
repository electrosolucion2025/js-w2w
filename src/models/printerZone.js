import mongoose from 'mongoose';

const printerZoneSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  printerIp: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        // Validación simple de IP
        return /^(\d{1,3}\.){3}\d{1,3}$/.test(v);
      },
      message: props => `${props.value} no es una dirección IP válida!`
    }
  },
  printerPort: {
    type: Number,
    default: 9100
  },
  active: {
    type: Boolean,
    default: true
  },
  // Categorías de productos que se imprimirán en esta zona (ahora usando ObjectId)
  categoryIds: {
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'Category', // Referencia al modelo de categorías
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Crear índice compound para asegurar que la combinación business+name sea única
printerZoneSchema.index({ businessId: 1, name: 1 }, { unique: true });

const PrinterZone = mongoose.model('PrinterZone', printerZoneSchema);

export default PrinterZone;