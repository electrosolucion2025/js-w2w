import mongoose from 'mongoose';

const printerDeviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  name: {
    type: String
  },
  ipAddress: {
    type: String
  },
  printerIp: {  // IP de la impresora conectada
    type: String
  },
  macAddress: {
    type: String
  },
  firmwareVersion: {
    type: String
  },
  // Campo existente en DB - mantenemos por compatibilidad
  isOnline: {
    type: Boolean,
    default: false
  },
  // Nuevo campo - renombramos para evitar conflictos
  online: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  connectionHistory: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['connected', 'disconnected', 'error'],
      required: true
    },
    details: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Middleware para actualizar la fecha de modificación y sincronizar isOnline y online
printerDeviceSchema.pre('save', function (next) {
  this.updatedAt = new Date();

  // Sincronizar los dos campos de estado online
  if (this.isModified('online')) {
    this.isOnline = this.online;
  } else if (this.isModified('isOnline')) {
    this.online = this.isOnline;
  }

  next();
});

// Método para registrar cambios de estado en el historial
printerDeviceSchema.methods.logConnectionStatus = async function (status, details = '') {
  console.log(`[PrinterDevice ${this.deviceId || this._id}] Registrando estado: ${status} - ${details}`);

  // Asegurarse de que existe el array
  if (!this.connectionHistory) this.connectionHistory = [];

  this.connectionHistory.push({
    timestamp: new Date(),
    status,
    details
  });

  // Mantener solo los últimos 50 registros
  if (this.connectionHistory.length > 50) {
    this.connectionHistory = this.connectionHistory.slice(-50);
  }

  // Actualizar los campos de estado
  this.online = status === 'connected';
  this.isOnline = this.online;

  console.log(`[PrinterDevice ${this.deviceId || this._id}] Guardando cambios...`);
  return this.save();
};

const PrinterDevice = mongoose.model('PrinterDevice', printerDeviceSchema);

export default PrinterDevice;