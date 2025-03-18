import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  // Campos existentes...

  // Añadir campo para promociones aplicadas a este item
  promotionApplied: {
    name: String,
    discountAmount: Number,
    originalPrice: Number
  }
});

const orderSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  tableNumber: {
    type: String
  },
  status: {
    type: String,
    enum: [
      'pending',
      'processing', // Agregar este valor para que sea permitido
      'paid',
      'preparing',
      'ready',
      'delivered',
      'cancelled',
      'refunded',
      'payment_failed'
    ],
    default: 'pending'
  },
  total: {
    type: Number,
    required: true
  },
  // Notas generales para todo el pedido
  notes: {
    type: String,
    trim: true
  },
  redsysOrderId: {
    type: String,
    index: true
  },
  paymentDetails: {
    responseDate: String,
    responseCode: String,
    authorizationCode: String,
    cardBrand: String,
    amount: String,
    currency: String,
    cardCountry: String,
    redsysOrderNumber: String,
    successful: Boolean
  },
  // Añadir campo para todas las promociones aplicadas a esta orden
  appliedPromotions: [{
    name: String,
    appliedTo: String,
    discountAmount: Number
  }]
}, {
  timestamps: true
});

const Order = mongoose.model('Order', orderSchema);

export default Order;