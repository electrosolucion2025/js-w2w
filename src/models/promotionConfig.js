import mongoose from 'mongoose';

const promotionConfigSchema = new mongoose.Schema({
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  },
  firstBuyCoffee: {
    enabled: {
      type: Boolean,
      default: true
    },
    eligibleProducts: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product'
    }],
    maxPrice: {
      type: Number,
      default: 3.0  // Precio máximo del café gratuito
    },
    requiresMinimumPurchase: {
      type: Boolean,
      default: true
    },
    minimumPurchaseAmount: {
      type: Number,
      default: 5.0  // Compra mínima para aplicar la promoción
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

// Índice compuesto para buscar rápido por negocio
promotionConfigSchema.index({ businessId: 1 });

const PromotionConfig = mongoose.model('PromotionConfig', promotionConfigSchema);

export default PromotionConfig;