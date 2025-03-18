import Product from '../models/product.js';
import PromotionConfig from '../models/promotionConfig.js';
import User from '../models/user.js';

/**
 * Verifica si el usuario tiene la promoción de café gratis disponible
 * @param {String} userId - ID del usuario 
 * @param {String} businessId - ID del negocio
 * @returns {Promise<Object>} - Información sobre la promoción
 */
export const checkFirstBuyCoffeePromotion = async (userId, businessId) => {
  try {
    // Verificar si el usuario existe y tiene la promoción activa
    const user = await User.findById(userId);

    if (!user || !user.firstBuyPromotion || !user.firstBuyPromotion.active || user.firstBuyPromotion.used) {
      return {
        available: false,
        reason: 'El usuario no tiene la promoción disponible o ya la ha utilizado'
      };
    }

    // Verificar si el negocio tiene la promoción configurada
    const promotionConfig = await PromotionConfig.findOne({
      businessId: businessId,
      'firstBuyCoffee.enabled': true
    });

    if (!promotionConfig || !promotionConfig.firstBuyCoffee.enabled) {
      return {
        available: false,
        reason: 'El negocio no tiene la promoción configurada'
      };
    }

    // Obtener los productos elegibles para la promoción
    const eligibleProducts = await Product.find({
      _id: { $in: promotionConfig.firstBuyCoffee.eligibleProducts },
      businessId: businessId,
      available: true
    });

    if (!eligibleProducts || eligibleProducts.length === 0) {
      return {
        available: false,
        reason: 'No hay productos elegibles disponibles'
      };
    }

    return {
      available: true,
      promotion: 'firstBuyCoffee',
      config: promotionConfig.firstBuyCoffee,
      eligibleProducts: eligibleProducts.map(p => ({
        id: p._id,
        name: p.name,
        price: p.price,
        categoryId: p.categoryId
      }))
    };
  } catch (error) {
    console.error('Error al verificar promoción de café gratis:', error);
    return {
      available: false,
      reason: 'Error al verificar disponibilidad de promoción'
    };
  }
};

/**
 * Marca la promoción de café gratis como utilizada
 * @param {String} userId - ID del usuario
 * @param {String} orderId - ID del pedido donde se usó la promoción
 */
export const useFirstBuyCoffeePromotion = async (userId, orderId) => {
  try {
    await User.findByIdAndUpdate(userId, {
      'firstBuyPromotion.used': true,
      'firstBuyPromotion.active': false,
      'firstBuyPromotion.usedAt': new Date(),
      'firstBuyPromotion.orderId': orderId
    });

    console.log(`Promoción de café gratis utilizada por usuario ${userId} en pedido ${orderId}`);
    return true;
  } catch (error) {
    console.error('Error al marcar promoción como utilizada:', error);
    return false;
  }
};

/**
 * Aplica la promoción al objeto de pedido antes de procesarlo
 * @param {Object} orderData - Datos del pedido
 * @param {Object} promotionInfo - Información de la promoción
 * @returns {Object} - Pedido con la promoción aplicada
 */
export const applyFirstBuyCoffeePromotion = (orderData, promotionInfo) => {
  try {
    if (!orderData || !orderData.products || !promotionInfo || !promotionInfo.available) {
      return orderData;
    }

    // Identificar si el usuario ya añadió un café elegible para la promoción
    const eligibleIds = promotionInfo.eligibleProducts.map(p => p.id.toString());

    // Encontrar el primer café elegible en el pedido
    const coffeeIndex = orderData.products.findIndex(product =>
      eligibleIds.includes(product.productId.toString()) && product.quantity > 0
    );

    // Si no hay café elegible en el pedido, no aplicar nada
    if (coffeeIndex === -1) {
      return orderData;
    }

    // Obtener el producto de café seleccionado
    const selectedCoffee = orderData.products[coffeeIndex];

    // Verificamos si cumple con el requisito de compra mínima
    if (promotionInfo.config.requiresMinimumPurchase) {
      // Calculamos el total sin contar el café que será gratuito
      const otherItemsTotal = orderData.products.reduce((sum, product, index) => {
        if (index === coffeeIndex) return sum; // Excluimos el café
        return sum + (product.totalProduct || product.price * product.quantity);
      }, 0);

      // Si no cumple el mínimo, no aplicamos la promoción
      if (otherItemsTotal < promotionInfo.config.minimumPurchaseAmount) {
        console.log(`No se aplica promoción: compra (${otherItemsTotal}) inferior al mínimo requerido (${promotionInfo.config.minimumPurchaseAmount})`);
        return orderData;
      }
    }

    // Backup del precio original para mostrar el descuento
    const originalPrice = selectedCoffee.price;

    // Aplicar la promoción (hacer el café gratis)
    // Si hay más de un café del mismo tipo, solo uno será gratis
    if (selectedCoffee.quantity > 1) {
      // Ajustar el total del producto restandole el precio de un café
      selectedCoffee.totalProduct = parseFloat((selectedCoffee.price * (selectedCoffee.quantity - 1)).toFixed(2));
    } else {
      // Si solo hay uno, hacerlo totalmente gratis
      selectedCoffee.totalProduct = 0;
    }

    // Añadir notas y marcar como promoción aplicada
    if (!selectedCoffee.notas) {
      selectedCoffee.notas = 'Gratis por promoción "Café Gratis en Primera Compra"';
    } else if (Array.isArray(selectedCoffee.notas)) {
      // Si es un array, convertirlo a string y añadir la nota
      selectedCoffee.notas = selectedCoffee.notas.length > 0
        ? selectedCoffee.notas.join(", ") + ' Gratis por promoción "Café Gratis en Primera Compra"'
        : 'Gratis por promoción "Café Gratis en Primera Compra"';
    } else if (typeof selectedCoffee.notas === 'string' && !selectedCoffee.notas.includes('Gratis')) {
      selectedCoffee.notas += (selectedCoffee.notas ? ' ' : '') + 'Gratis por promoción "Café Gratis en Primera Compra"';
    }

    selectedCoffee.promotionApplied = {
      name: "Café Gratis - Primera Compra",
      discountAmount: originalPrice,
      originalPrice: originalPrice
    };

    // Recalcular el total de la orden con el nuevo total
    orderData.totalOrder = orderData.products.reduce((sum, product) =>
      sum + (product.totalProduct || 0), 0);

    // Añadir info de la promoción a la orden completa
    if (!orderData.appliedPromotions) {
      orderData.appliedPromotions = [];
    }

    // Verificar si ya existe esta promoción para no duplicarla
    const existingPromoIndex = orderData.appliedPromotions.findIndex(p =>
      p.name === "Café Gratis - Primera Compra" && p.appliedTo === selectedCoffee.name);

    if (existingPromoIndex === -1) {
      orderData.appliedPromotions.push({
        name: "Café Gratis - Primera Compra",
        appliedTo: selectedCoffee.name,
        discountAmount: originalPrice
      });
    }

    console.log(`Promoción aplicada: Café gratis (${originalPrice}€) para ${selectedCoffee.name}`);

    return orderData;
  } catch (error) {
    console.error('Error al aplicar promoción de café gratis:', error);
    return orderData; // Devolver el pedido sin modificar en caso de error
  }
};