import Business from '../models/business.js';
import Product from '../models/product.js';
import PromotionConfig from '../models/promotionConfig.js';

class PromotionController {
  /**
   * Configura la promoción de café gratis para un negocio
   */
  async configureFirstBuyCoffee(req, res) {
    try {
      const {
        businessId,
        enabled,
        eligibleProducts,
        maxPrice,
        requiresMinimumPurchase,
        minimumPurchaseAmount
      } = req.body;

      // Verificar que el negocio existe
      const business = await Business.findById(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Negocio no encontrado' });
      }

      // Verificar que los productos elegibles existen y pertenecen al negocio
      if (eligibleProducts && eligibleProducts.length > 0) {
        const products = await Product.find({
          _id: { $in: eligibleProducts },
          businessId: businessId
        });

        if (products.length !== eligibleProducts.length) {
          return res.status(400).json({
            error: 'Uno o más productos no existen o no pertenecen a este negocio'
          });
        }
      }

      // Buscar configuración existente o crear una nueva
      let config = await PromotionConfig.findOne({ businessId });

      if (!config) {
        config = new PromotionConfig({
          businessId,
          firstBuyCoffee: {
            enabled: enabled !== undefined ? enabled : true,
            eligibleProducts: eligibleProducts || [],
            maxPrice: maxPrice || 3.0,
            requiresMinimumPurchase: requiresMinimumPurchase !== undefined ? requiresMinimumPurchase : true,
            minimumPurchaseAmount: minimumPurchaseAmount || 5.0
          }
        });
      } else {
        // Actualizar configuración existente
        config.firstBuyCoffee = {
          enabled: enabled !== undefined ? enabled : config.firstBuyCoffee.enabled,
          eligibleProducts: eligibleProducts || config.firstBuyCoffee.eligibleProducts,
          maxPrice: maxPrice || config.firstBuyCoffee.maxPrice,
          requiresMinimumPurchase: requiresMinimumPurchase !== undefined ?
            requiresMinimumPurchase : config.firstBuyCoffee.requiresMinimumPurchase,
          minimumPurchaseAmount: minimumPurchaseAmount || config.firstBuyCoffee.minimumPurchaseAmount
        };
      }

      await config.save();

      res.status(200).json({
        message: 'Configuración de promoción guardada correctamente',
        config
      });
    } catch (error) {
      console.error('Error al configurar promoción:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Obtiene la configuración de promociones de un negocio
   */
  async getBusinessPromotions(req, res) {
    try {
      const { businessId } = req.params;

      const config = await PromotionConfig.findOne({ businessId })
        .populate('firstBuyCoffee.eligibleProducts', 'name price');

      if (!config) {
        return res.status(404).json({
          message: 'No hay configuración de promociones para este negocio'
        });
      }

      res.status(200).json(config);
    } catch (error) {
      console.error('Error al obtener promociones:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default PromotionController;