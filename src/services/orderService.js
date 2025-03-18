import Order from '../models/order.js';
import OrderItem from '../models/orderItem.js'; // Importamos el modelo OrderItem

export const createOrder = async (orderData, userId, businessId, tableNumber) => {
  try {
    console.log('=== Creando pedido ===');
    console.log('Datos del pedido:::::::::::::>', orderData);
    console.log(`Usuario: ${userId}`);
    console.log(`Negocio: ${businessId}`);
    console.log(`Mesa: ${tableNumber}`);
    console.log(`Items: ${orderData.items ? orderData.items.length : 'No items detected'}`);
    console.log(`Total: ${orderData.total}`);

    // Crear la orden (sin items, los crearemos por separado)
    const order = new Order({
      userId,
      businessId,
      tableNumber,
      total: orderData.total,
      status: 'pending',
      createdAt: new Date(),
      // Capturar notas generales del pedido si existen
      notes: orderData.notes || '',

      // Añadir campos para promociones aplicadas
      appliedPromotions: orderData.appliedPromotions || [],

      // Añadir los campos para pedidos en efectivo
      paymentMethod: orderData.paymentMethod || 'card',
      paymentStatus: orderData.paymentStatus || 'pending',
      cashWarning: !!orderData.cashWarning // Convertir a booleano explícitamente
    });

    // Guardar la orden
    const savedOrder = await order.save();

    if (!savedOrder || !savedOrder._id) {
      throw new Error('No se pudo guardar el pedido correctamente');
    }

    console.log(`Pedido creado correctamente: ${savedOrder._id}`);

    // Verificar que items existe y es un array
    if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
      console.warn('No se encontraron items en el pedido o el formato no es correcto');
      return savedOrder;
    }

    // Sanitizar y validar cada item antes de crearlo
    const sanitizedItems = orderData.items.map(item => ({
      ...item,
      // Asegurar que productId siempre tenga un valor
      productId: item.productId || 'unknown_id',
      // Asegurar que quantity siempre tenga un valor numérico
      quantity: item.quantity || 1,
      // Asegurar que price siempre tenga un valor numérico
      price: item.price || 0,
      // Asegurar que notes sea siempre un string
      notes: typeof item.notes === 'string' ? item.notes :
        Array.isArray(item.notes) ? item.notes.join(", ") :
          item.notes ? String(item.notes) : "",
      // Asegurar que total siempre tenga un valor calculado correctamente
      total: item.total || item.totalProduct || (item.price * (item.quantity || 1)),
      // Asegurar que modifications siempre sea un array
      modifications: item.modifications || [],
      // Asegurar que extras siempre sea un array
      extras: item.extras || [],
      // Manejar promociones aplicadas al producto
      promotionApplied: item.promotionApplied || null
    }));

    // Ahora creamos los OrderItem para cada producto
    const orderItems = [];
    for (const item of sanitizedItems) {
      const orderItem = new OrderItem({
        orderId: savedOrder._id,
        productId: item.productId,
        // categoryId: item.categoryId, // Esto podría ser undefined en el nuevo formato
        quantity: item.quantity,
        price: item.price,
        name: item.name, // Asegurar que eal nombre del producto se guarda
        modifications: item.modifications || [],
        extras: item.extras || [],
        total: item.total,
        // Guardar información sobre promociones
        promotionApplied: item.promotionApplied,
        // Capturar notas específicas del item
        notes: item.notes || ''
      });

      // Guardamos cada OrderItem
      const savedOrderItem = await orderItem.save();
      orderItems.push(savedOrderItem);
    }

    console.log(`Creados ${orderItems.length} items para el pedido ${savedOrder._id}`);

    // Verificar que podemos recuperar el pedido recién creado
    const verifyOrder = await Order.findById(savedOrder._id);
    if (!verifyOrder) {
      console.error(`ADVERTENCIA: No se puede recuperar el pedido recién creado con ID ${savedOrder._id}`);
    } else {
      console.log(`Verificación: pedido recuperado correctamente con ID ${verifyOrder._id}`);

      // Verificamos también que se crearon los items
      const itemCount = await OrderItem.countDocuments({ orderId: savedOrder._id });
      console.log(`Verificación: el pedido tiene ${itemCount} items asociados`);
    }

    return savedOrder;
  } catch (error) {
    console.error('Error al crear pedido:', error);
    throw new Error(`Error al crear el pedido: ${error.message}`);
  }
};