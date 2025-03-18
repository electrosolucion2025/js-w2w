import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  whatsappNumber: {
    type: String,
    required: true,
    unique: true
  },
  profileName: {
    type: String,
    required: true,
    default: 'User'
  },
  businessCode: {
    type: String,
  },
  lastBusinessCode: {
    type: [String],
  },
  acceptPolicy: {
    type: Boolean,
    default: false
  },
  acceptPolicyAt: {
    type: Date
  },
  // Nuevos campos para la promoción de café gratis
  firstBuyPromotion: {
    active: {
      type: Boolean,
      default: true  // Activa por defecto para nuevos usuarios
    },
    used: {
      type: Boolean,
      default: false  // Se marca como true cuando se usa
    },
    usedAt: {
      type: Date,
      default: null
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null
    }
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

const User = mongoose.model('User', userSchema);

export default User;