import express from 'express';
import PromotionController from '../controllers/promotionController.js';

const router = express.Router();
const promotionController = new PromotionController();

// Rutas para configurar promociones
router.post('/first-buy-coffee', promotionController.configureFirstBuyCoffee);
router.get('/business/:businessId', promotionController.getBusinessPromotions);

export default router;