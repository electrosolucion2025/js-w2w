import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: false
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  modifications: [String],
  extras: [{
    extraId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Extra'
    },
    name: String,
    price: Number,
    quantity: Number
  }],
  total: {
    type: Number,
    required: true
  },
  // Añadimos el campo notes para comentarios específicos sobre este ítem
  notes: {
    type: String,
    trim: true
  }
});

export default mongoose.model('OrderItem', orderItemSchema);