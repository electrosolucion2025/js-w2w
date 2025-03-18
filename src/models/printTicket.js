import mongoose from 'mongoose';

const printTicketSchema = new mongoose.Schema({
  // Añadir el campo ticketId al esquema
  ticketId: {
    type: String,
    unique: true, // Asegurar que sea único
    default: () => new mongoose.Types.ObjectId().toString() // ID automático si no se proporciona
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  printerZoneId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PrinterZone',
    required: true
  },
  // Para almacenar contenido binario (ESC/POS) en MongoDB
  // usamos Buffer en lugar de BinaryField
  content: {
    type: Buffer,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PRINTED', 'FAILED'],
    default: 'PENDING'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  retryCount: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    default: null
  }
});

// Índices para mejorar las consultas
printTicketSchema.index({ status: 1 });
printTicketSchema.index({ businessId: 1, status: 1 });
printTicketSchema.index({ printerZoneId: 1, status: 1 });

const PrintTicket = mongoose.model('PrintTicket', printTicketSchema);

export default PrintTicket;