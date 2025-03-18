import mongoose from 'mongoose';
import net from 'net';
import Order from '../models/order.js';
import PrintTicket from '../models/printTicket.js';
import PrinterZone from '../models/printerZone.js';

/**
 * Crea un ticket de impresión para una orden específica
 * @param {string} orderId - ID de la orden
 * @param {string} printerZoneId - ID de la zona de impresión
 * @param {Buffer} content - Contenido ESC/POS del ticket
 * @returns {Promise<Object>} - Ticket creado
 */
export const createPrintTicket = async (orderId, printerZoneId, content) => {
  try {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error(`Orden no encontrada: ${orderId}`);
    }

    const printerZone = await PrinterZone.findById(printerZoneId);
    if (!printerZone) {
      throw new Error(`Zona de impresión no encontrada: ${printerZoneId}`);
    }

    if (!printerZone.active) {
      throw new Error(`La zona de impresión ${printerZone.name} no está activa`);
    }

    // Generar un ID único para el ticket (nunca usar null)
    const ticketId = new mongoose.Types.ObjectId().toString();

    // Verificar si ya existe un ticket con este mismo ID para evitar duplicados
    const existingTicket = await PrintTicket.findOne({ ticketId });
    if (existingTicket) {
      // Si ya existe, generar otro ID diferente
      ticketId = new mongoose.Types.ObjectId().toString();
    }

    const ticket = new PrintTicket({
      ticketId, // Usar el ID generado en lugar de null
      businessId: order.businessId,
      orderId: order._id,
      printerZoneId: printerZone._id,
      content: content,
      status: 'PENDING'
    });

    await ticket.save();
    console.log(`Ticket de impresión creado para la orden ${orderId} en la zona ${printerZone.name}`);

    return ticket;
  } catch (error) {
    console.error('Error al crear ticket de impresión:', error);
    throw error;
  }
};

/**
 * Envía un ticket a una impresora
 * @param {string} ticketId - ID del ticket a imprimir
 * @returns {Promise<boolean>} - true si se imprimió correctamente
 */
export const sendTicketToPrinter = async (ticketId) => {
  try {
    const ticket = await PrintTicket.findById(ticketId)
      .populate('printerZoneId')
      .populate('businessId');

    if (!ticket) {
      throw new Error(`Ticket no encontrado: ${ticketId}`);
    }

    if (ticket.status === 'PRINTED') {
      console.log(`El ticket ${ticketId} ya ha sido impreso anteriormente`);
      return true;
    }

    const printerZone = ticket.printerZoneId;

    if (!printerZone || !printerZone.active) {
      throw new Error('Impresora no disponible o inactiva');
    }

    // Conectar con la impresora usando socket
    return new Promise((resolve, reject) => {
      const client = new net.Socket();

      client.setTimeout(10000); // Timeout de 10 segundos

      client.on('error', async (error) => {
        console.error(`Error al conectar con la impresora ${printerZone.printerIp}:${printerZone.printerPort}:`, error);

        // Actualizar el estado del ticket
        ticket.status = 'FAILED';
        ticket.lastError = error.message;
        ticket.retryCount = (ticket.retryCount || 0) + 1;
        ticket.updatedAt = new Date();
        await ticket.save();

        // Actualizar el estado de la impresora como offline
        try {
          await updatePrinterStatus(printerZone.printerIp, false);
          console.log(`Impresora ${printerZone.printerIp} marcada como offline`);
        } catch (updateError) {
          console.error(`Error al actualizar estado de impresora:`, updateError);
        }

        reject(error);
      });

      client.on('timeout', async () => {
        console.error(`Timeout al conectar con la impresora ${printerZone.printerIp}:${printerZone.printerPort}`);
        client.destroy();

        // Actualizar el estado del ticket
        ticket.status = 'FAILED';
        ticket.lastError = 'Connection timeout';
        ticket.retryCount += 1;
        ticket.updatedAt = new Date();
        await ticket.save();

        // Actualizar el estado de la impresora como offline
        try {
          await updatePrinterStatus(printerZone.printerIp, false);
          console.log(`Impresora ${printerZone.printerIp} marcada como offline por timeout`);
        } catch (updateError) {
          console.error(`Error al actualizar estado de impresora:`, updateError);
        }

        reject(new Error('Connection timeout'));
      });

      client.connect(printerZone.printerPort, printerZone.printerIp, async () => {
        console.log(`Conectado a la impresora ${printerZone.printerIp}:${printerZone.printerPort}`);
        client.write(ticket.content);
        client.end();

        // Marcar el ticket como impreso
        ticket.status = 'PRINTED';
        ticket.updatedAt = new Date();
        await ticket.save();

        // Actualizar el estado de la impresora como online
        try {
          await updatePrinterStatus(printerZone.printerIp, true);
          console.log(`Impresora ${printerZone.printerIp} marcada como online`);
        } catch (updateError) {
          console.error(`Error al actualizar estado de impresora:`, updateError);
        }

        resolve(true);
      });
    });
  } catch (error) {
    console.error('Error al enviar ticket a la impresora:', error);
    throw error;
  }
};

/**
 * Actualiza el estado online/offline de una impresora
 * @param {string} printerIp - IP de la impresora
 * @param {boolean} isOnline - Estado a establecer
 */
const updatePrinterStatus = async (printerIp, isOnline) => {
  try {
    console.log(`Actualizando estado de impresora ${printerIp} a ${isOnline ? 'online' : 'offline'}`);

    // Buscar dispositivos de impresora con esta IP
    const PrinterDevice = mongoose.model('PrinterDevice');

    // Buscar todos los dispositivos que usan esta impresora
    const devices = await PrinterDevice.find({ printerIp });

    if (devices.length === 0) {
      console.log(`No se encontraron dispositivos con IP ${printerIp} para actualizar`);

      // Buscar también en el campo ipAddress (que podría estar usando el ESP32)
      const ipAddressDevices = await PrinterDevice.find({ ipAddress: printerIp });

      if (ipAddressDevices.length > 0) {
        console.log(`Se encontraron ${ipAddressDevices.length} dispositivos con ipAddress=${printerIp}`);

        // Actualizar estos dispositivos también
        for (const device of ipAddressDevices) {
          await updateDeviceStatus(device, isOnline);
        }
      } else {
        console.log(`No se encontraron dispositivos para la IP ${printerIp}`);
      }
      return;
    }

    console.log(`Encontrados ${devices.length} dispositivos para actualizar`);

    // Actualizar cada dispositivo
    for (const device of devices) {
      await updateDeviceStatus(device, isOnline);
    }

    console.log(`Finalizada actualización de dispositivos con IP ${printerIp}`);

  } catch (error) {
    console.error(`Error al actualizar estado de los dispositivos:`, error);
    throw error;
  }
};

/**
 * Función auxiliar para actualizar el estado de un dispositivo individual
 * @param {Object} device - Dispositivo a actualizar
 * @param {boolean} isOnline - Estado a establecer
 */
const updateDeviceStatus = async (device, isOnline) => {
  try {
    // Verificar el campo online y el campo isOnline para compatibilidad
    const currentOnline = device.online !== undefined ? device.online : device.isOnline;

    // Solo actualizar si el estado ha cambiado
    if (currentOnline !== isOnline) {
      console.log(`Actualizando dispositivo ${device.deviceId || device._id} de ${currentOnline} a ${isOnline}`);

      // Actualizar ambos campos para mantener compatibilidad
      device.online = isOnline;
      device.isOnline = isOnline;
      device.lastSeen = isOnline ? new Date() : device.lastSeen;

      // Verificar si el método logConnectionStatus existe
      if (typeof device.logConnectionStatus === 'function') {
        console.log(`Registrando cambio de estado en historial`);

        // Registrar en el historial
        await device.logConnectionStatus(
          isOnline ? 'connected' : 'disconnected',
          `Estado cambiado a ${isOnline ? 'online' : 'offline'}`
        );
      } else {
        console.log(`El método logConnectionStatus no existe, registrando manualmente`);

        // Si no existe el método, hacerlo manualmente
        if (!device.connectionHistory) device.connectionHistory = [];

        device.connectionHistory.push({
          timestamp: new Date(),
          status: isOnline ? 'connected' : 'disconnected',
          details: `Estado cambiado a ${isOnline ? 'online' : 'offline'}`
        });

        // Mantener solo los últimos 50 registros
        if (device.connectionHistory.length > 50) {
          device.connectionHistory = device.connectionHistory.slice(-50);
        }

        // Guardar el dispositivo
        await device.save();
      }

      console.log(`Dispositivo ${device.deviceId || device._id} actualizado a ${isOnline ? 'online' : 'offline'}`);
    } else {
      console.log(`Dispositivo ${device.deviceId || device._id} ya está en estado ${isOnline ? 'online' : 'offline'}`);
    }
  } catch (error) {
    console.error(`Error actualizando dispositivo ${device.deviceId || device._id}:`, error);
    throw error;
  }
};

/**
 * Convierte texto UTF-8 (con acentos) a una versión compatible con impresoras térmicas
 * @param {string} text - Texto con posibles acentos o caracteres especiales
 * @returns {Buffer} - Buffer con codificación compatible con impresora
 */
const textToEscPos = (text) => {
  // Mapa de reemplazo para caracteres acentuados comunes en español
  const accentMap = {
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u',
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
    'ñ': 'n', 'Ñ': 'N',
    'ü': 'u', 'Ü': 'U',
    '¿': '?', '¡': '!',
    // Otros caracteres especiales que puedan causar problemas
    '€': 'EUR', '£': 'GBP', '©': '(c)', '®': '(r)', '°': 'o'
  };

  // Reemplazar caracteres acentuados
  let normalizedText = text;
  for (const [accented, normal] of Object.entries(accentMap)) {
    normalizedText = normalizedText.replace(new RegExp(accented, 'g'), normal);
  }

  // Crear buffer con codificación adecuada para la impresora (CP437 o CP850 son comunes)
  // Aquí usamos ASCII que es más básico pero seguro
  return Buffer.from(normalizedText, 'ascii');
};

// Actualizar la función generateTicketContent para usar la nueva función
/**
 * Genera el contenido ESC/POS para un ticket de impresión
 * @param {Object} order - Datos del pedido
 * @param {Object} business - Datos del negocio
 * @param {string} tableNumber - Número de mesa
 * @param {string} zoneName - Nombre de la zona de impresión
 * @param {boolean} hasOtherZoneTickets - Indica si el pedido tiene tickets en otras zonas
 * @returns {Buffer} - Buffer con comandos ESC/POS
 */
export const generateTicketContent = (order, business, tableNumber, zoneName, hasOtherZoneTickets = false) => {
  try {
    let commands = [];

    // Anchura máxima del ticket (48 caracteres para impresora de 80mm)
    const TICKET_WIDTH = 48;
    const SEPARATOR = '='.repeat(TICKET_WIDTH);
    const THIN_SEPARATOR = '-'.repeat(TICKET_WIDTH);

    // Inicializar impresora
    commands.push(Buffer.from([0x1B, 0x40]));  // ESC @ - Inicializar impresora

    // Separadores en la parte superior
    commands.push(Buffer.from([0x1B, 0x21, 0x01]));  // Fuente normal
    commands.push(Buffer.from([0x1B, 0x61, 0x01]));  // Centrar
    commands.push(textToEscPos(`${SEPARATOR}\n`));

    // Título WHATS2WANT
    commands.push(Buffer.from([0x1B, 0x21, 0x10]));  // ESC ! 16 - Modo enfatizado/grande
    commands.push(textToEscPos("WHATS2WANT\n"));
    commands.push(Buffer.from([0x1B, 0x21, 0x01]));  // Volver a fuente normal
    commands.push(textToEscPos(`${SEPARATOR}\n`));

    // AÑADIR AQUÍ: Advertencia de pago pendiente si corresponde
    console.log(`Generando ticket para pedido :: ${JSON.stringify(order, null, 2)}`);
    // Check if this is a cash order with pending payment
    if (order.notes.includes('PENDIENTE DE PAGO')) {
      // Texto de advertencia con estilo destacado
      commands.push(Buffer.from([0x1B, 0x61, 0x01]));  // Centrar
      commands.push(Buffer.from([0x1B, 0x45, 0x01]));  // Modo enfatizado
      commands.push(Buffer.from([0x1B, 0x21, 0x10]));  // Texto grande

      commands.push(textToEscPos("--------------------------------\n"));
      commands.push(textToEscPos("⚠️ ATENCIÓN ⚠️\n"));
      commands.push(textToEscPos("PEDIDO PENDIENTE DE PAGO\n"));
      commands.push(textToEscPos("CONTACTAR CON EL CLIENTE\n"));
      commands.push(textToEscPos("--------------------------------\n"));

      // Restaurar estilo normal
      commands.push(Buffer.from([0x1B, 0x21, 0x01]));  // Volver a fuente normal
      commands.push(Buffer.from([0x1B, 0x45, 0x00]));  // Desactivar enfatizado
      commands.push(Buffer.from([0x1B, 0x61, 0x00]));  // Alinear a la izquierda
    }

    // Fuente para encabezado (más grande)
    commands.push(Buffer.from([0x1B, 0x21, 0x10]));  // ESC ! 16 - Modo enfatizado/grande

    // Nombre del restaurante
    commands.push(Buffer.from([0x1B, 0x61, 0x01]));  // ESC a 1 - Centrar
    commands.push(textToEscPos(`${business ? business.name.toUpperCase() : 'RESTAURANT'}\n`));

    // Fuente normal para el resto del ticket
    commands.push(Buffer.from([0x1B, 0x21, 0x01]));  // ESC ! 1 - Fuente B normal

    // Zona de impresión
    if (zoneName) {
      commands.push(textToEscPos(`ZONA: ${zoneName}\n`));
    }

    commands.push(textToEscPos(`${SEPARATOR}\n`));
    commands.push(Buffer.from([0x1B, 0x61, 0x00]));  // ESC a 0 - Alinear a la izquierda

    // Datos del pedido
    const formattedDate = new Date().toLocaleDateString();
    const formattedTime = new Date().toLocaleTimeString();

    // Información del pedido en formato de dos columnas
    const dateStr = `Fecha: ${formattedDate}`;
    const timeStr = `Hora: ${formattedTime}`;
    commands.push(textToEscPos(formatTwoColumns(dateStr, timeStr, TICKET_WIDTH) + '\n'));

    const tableStr = `Mesa: ${tableNumber || 'N/A'}`;
    const orderStr = `Pedido: ${order._id.toString().substring(18)}`;
    commands.push(textToEscPos(formatTwoColumns(tableStr, orderStr, TICKET_WIDTH) + '\n'));

    commands.push(textToEscPos(`${SEPARATOR}\n`));

    // Encabezado de productos - mismo tamaño que el resto del contenido
    commands.push(Buffer.from([0x1B, 0x21, 0x01]));  // ESC ! 1 - Fuente normal con el mismo tamaño
    commands.push(Buffer.from([0x1B, 0x45, 0x01]));  // ESC E 1 - Activar modo enfatizado (negrita)
    commands.push(textToEscPos(formatColumns(['CANT', 'DESCRIPCIÓN', 'PRECIO'], [5, 31, 12], TICKET_WIDTH) + '\n'));
    commands.push(Buffer.from([0x1B, 0x45, 0x00]));  // ESC E 0 - Desactivar modo enfatizado
    commands.push(textToEscPos(`${THIN_SEPARATOR}\n`));

    // Para calcular el total real que incluye extras
    let calculatedTotal = 0;

    // Procesar cada producto - todo con el mismo tamaño
    for (const item of order.items) {
      const quantity = item.quantity || 1;

      // Obtener el nombre del producto
      let productName = "Producto";

      // Diagnóstico detallado
      console.log(`Generando ticket para item: ${JSON.stringify({
        id: item._id,
        name: item.name,
        productId: item.productId
      }, null, 2)}`);

      // Priorizar el nombre explícito si existe
      if (item.name && typeof item.name === 'string' && item.name !== "Producto") {
        productName = item.name;
        console.log(`Usando nombre explícito: ${productName}`);
      }
      // Luego intentar obtenerlo del objeto de producto
      else if (item.productId && item.productId.name) {
        productName = item.productId.name;
        console.log(`Usando nombre desde productId: ${productName}`);
      }
      // También verificar la propiedad productName (si existe)
      else if (item.productName) {
        productName = item.productName;
        console.log(`Usando productName: ${productName}`);
      }

      const price = item.price || 0;
      const total = item.total || (price * quantity);

      // Añadir el producto al ticket con formato de columnas
      commands.push(textToEscPos(formatColumns([
        quantity.toString(),
        productName,
        `${total.toFixed(2)}€`
      ], [5, 31, 12], TICKET_WIDTH) + '\n'));

      // Añadir extras si existen
      if (item.extras && item.extras.length > 0) {
        for (const extra of item.extras) {
          const extraName = extra.name || 'Extra';
          const extraQty = extra.quantity || 1;
          const extraPrice = extra.price || 0;
          const extraTotal = extraPrice * extraQty;

          if (extraQty > 1) {
            commands.push(textToEscPos(formatColumns([
              "",
              `+ ${extraName} x${extraQty}`,
              `${extraTotal.toFixed(2)}€`
            ], [5, 31, 12], TICKET_WIDTH) + '\n'));
          } else {
            commands.push(textToEscPos(formatColumns([
              "",
              `+ ${extraName}`,
              `${extraPrice.toFixed(2)}€`
            ], [5, 31, 12], TICKET_WIDTH) + '\n'));
          }
        }
      }

      // Añadir modificaciones si existen
      if (item.modifications && item.modifications.length > 0) {
        for (const mod of item.modifications) {
          commands.push(textToEscPos(formatColumns([
            "",
            `- ${mod}`,
            ""
          ], [5, 31, 12], TICKET_WIDTH) + '\n'));
        }
      }

      // Añadir notas específicas del ítem si existen
      if (item.notes) {
        commands.push(Buffer.from([0x1B, 0x45, 0x01]));  // ESC E 1 - Activar modo enfatizado
        commands.push(textToEscPos(formatColumns([
          "",
          `NOTA: ${item.notes}`,
          ""
        ], [5, 43, 0], TICKET_WIDTH) + '\n'));
        commands.push(Buffer.from([0x1B, 0x45, 0x00]));  // ESC E 0 - Desactivar modo enfatizado
      }

      calculatedTotal += total;

      // Línea separadora entre productos
      commands.push(textToEscPos(`${THIN_SEPARATOR}\n`));
    }

    // Total - este sí va con tamaño grande
    commands.push(Buffer.from([0x1B, 0x21, 0x10]));  // ESC ! 16 - Modo enfatizado/grande
    const orderTotal = order.total || calculatedTotal;
    commands.push(textToEscPos(formatColumns([
      "",
      "TOTAL:",
      `${orderTotal.toFixed(2)}€`
    ], [5, 27, 16], TICKET_WIDTH) + '\n'));
    commands.push(Buffer.from([0x1B, 0x21, 0x01]));  // Volver a fuente normal

    // Añadir mensaje de ticket complementario si es zona cocina y hay otros tickets
    if (zoneName && zoneName.toLowerCase() === 'cocina' && hasOtherZoneTickets) {
      commands.push(textToEscPos(`${SEPARATOR}\n`));
      commands.push(Buffer.from([0x1B, 0x45, 0x01]));  // ESC E 1 - Activar modo enfatizado
      commands.push(Buffer.from([0x1B, 0x61, 0x01]));  // ESC a 1 - Centrar
      commands.push(textToEscPos("Este ticket va acompañado de otro ticket en barra\n"));
      commands.push(Buffer.from([0x1B, 0x45, 0x00]));  // ESC E 0 - Desactivar modo enfatizado
      commands.push(Buffer.from([0x1B, 0x61, 0x00]));  // ESC a 0 - Alinear a la izquierda
    }

    // Añadir nota general del pedido si existe
    if (order.notes) {
      commands.push(textToEscPos(`${SEPARATOR}\n`));
      commands.push(Buffer.from([0x1B, 0x45, 0x01]));  // ESC E 1 - Activar modo enfatizado
      commands.push(textToEscPos(`NOTA GENERAL:\n`));
      commands.push(Buffer.from([0x1B, 0x45, 0x00]));  // ESC E 0 - Desactivar modo enfatizado
      commands.push(textToEscPos(`${order.notes}\n`));
    }

    commands.push(textToEscPos(`${SEPARATOR}\n`));

    // Pie de ticket
    commands.push(Buffer.from([0x1B, 0x61, 0x01]));  // ESC a 1 - Centrar
    commands.push(textToEscPos('Gracias por su compra\n\n'));

    // Cortar papel
    commands.push(Buffer.from([0x1D, 0x56, 0x41, 0x10]));  // GS V A 16 - Cortar papel dejando margen

    // Concatenar todos los comandos en un solo Buffer
    return Buffer.concat(commands);

  } catch (error) {
    console.error('Error al generar contenido del ticket:', error);
    throw error;
  }
};

/**
 * Formatea texto en columnas con anchos específicos
 * @param {Array} columnsContent - Contenido para cada columna
 * @param {Array} columnsWidth - Ancho de cada columna
 * @param {number} totalWidth - Ancho total disponible
 * @returns {string} - Texto formateado en columnas
 */
function formatColumns(columnsContent, columnsWidth, totalWidth) {
  let result = '';
  for (let i = 0; i < columnsContent.length; i++) {
    let content = columnsContent[i] || '';
    let width = columnsWidth[i] || 0;

    // Truncar si es demasiado largo
    if (content.length > width) {
      content = content.substring(0, width - 3) + '...';
    }
    // Rellenar con espacios si es necesario
    else if (content.length < width) {
      content = content.padEnd(width);
    }

    result += content;
  }
  return result;
}

/**
 * Formatea dos columnas con alineación izquierda y derecha
 * @param {string} leftContent - Contenido para la columna izquierda
 * @param {string} rightContent - Contenido para la columna derecha
 * @param {number} totalWidth - Ancho total disponible
 * @returns {string} - Texto formateado en dos columnas
 */
function formatTwoColumns(leftContent, rightContent, totalWidth) {
  const leftWidth = Math.floor(totalWidth / 2);
  const rightWidth = totalWidth - leftWidth;

  let left = leftContent || '';
  let right = rightContent || '';

  if (left.length > leftWidth) {
    left = left.substring(0, leftWidth - 3) + '...';
  }

  if (right.length > rightWidth) {
    right = right.substring(0, rightWidth - 3) + '...';
  }

  return left.padEnd(leftWidth) + right;
}

// Modificar processOrderPrinting para usar la relación Order-OrderItem
export const processOrderPrinting = async (orderId) => {
  try {
    // Cargar la orden con sus datos básicos - ASEGURARNOS DE TRAER TODOS LOS CAMPOS
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error(`Orden no encontrada: ${orderId}`);
    }

    // Añadir logging para diagnóstico del objeto order
    console.log('Datos de orden recuperados para impresión:', {
      id: order._id,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      cashWarning: order.cashWarning,
      notes: order.notes
    });

    // Cargar el negocio asociado 
    const business = await mongoose.model('Business').findById(order.businessId);
    if (!business) {
      throw new Error(`Negocio no encontrado para la orden: ${orderId}`);
    }

    // Cargar los items de la orden con sus categorías
    const orderItems = await mongoose.model('OrderItem').find({
      orderId: order._id
    }).populate('categoryId').populate('productId');

    // Mejor diagnóstico de los OrderItems
    console.log(`Análisis detallado del pedido ${orderId}:`);
    console.log(`Total de items: ${orderItems.length}`);

    // Revisar cada item para detectar problemas
    for (const item of orderItems) {
      console.log(`\nItem ID: ${item._id}`);
      console.log(`- Producto ID: ${item.productId ? item.productId._id : 'No definido'}`);
      console.log(`- Producto nombre: ${item.productId && item.productId.name ? item.productId.name : (item.name || 'Sin nombre')}`);
      console.log(`- Categoría ID: ${item.categoryId ? item.categoryId._id : 'No definida'}`);
      console.log(`- Categoría nombre: ${item.categoryId ? item.categoryId.name : 'Sin categoría'}`);
      console.log(`- Cantidad: ${item.quantity}`);
      console.log(`- Total: ${item.total}`);
    }

    if (!orderItems || orderItems.length === 0) {
      console.log(`No hay items en la orden ${orderId}`);
      return;
    }

    // Obtener todas las zonas de impresión activas para este negocio
    const printerZones = await PrinterZone.find({
      businessId: business._id,
      active: true
    });

    // Diagnóstico de zonas de impresión
    console.log(`\nZonas de impresión para el negocio ${business.name}:`);
    for (const zone of printerZones) {
      console.log(`- Zona: ${zone.name}`);
      console.log(`  Categorías: ${zone.categoryIds.length ? zone.categoryIds.map(id => id.toString()).join(', ') : 'Ninguna (zona general)'}`);
    }

    if (!printerZones || printerZones.length === 0) {
      console.log(`No hay zonas de impresión configuradas para el negocio ${business.name}`);
      return;
    }

    // Obtener el número de mesa desde la orden
    const tableNumber = order.tableNumber || 'N/A';

    // Para rastrear productos ya impresos y errores
    const itemZoneAssignments = {};
    const zoneHasItems = {}; // Para seguir qué zonas tienen ítems
    const printErrors = [];

    // 1. Procesar zonas con categorías específicas
    for (const zone of printerZones) {
      try {
        // Saltar zonas sin categorías (las procesaremos al final)
        if (!zone.categoryIds || zone.categoryIds.length === 0) {
          continue;
        }

        // Convertir los ObjectId a strings para comparación
        const zoneCategoryIds = zone.categoryIds.map(id => id.toString());

        // Filtrar productos que pertenecen a las categorías de esta zona
        const zoneItems = orderItems.filter(item =>
          item.categoryId &&
          zoneCategoryIds.includes(item.categoryId._id.toString())
        );

        // Si hay productos para esta zona, marcarla
        if (zoneItems.length > 0) {
          zoneHasItems[zone.name] = true;

          // Resto del código para procesar los ítems de zona...
          console.log(`Generando ticket para zona ${zone.name} con ${zoneItems.length} productos`);

          // Registrar la asignación de estos productos a esta zona
          zoneItems.forEach(item => {
            const itemId = item._id.toString();
            if (!itemZoneAssignments[itemId]) {
              itemZoneAssignments[itemId] = [];
            }
            itemZoneAssignments[itemId].push(zone.name);
          });

          // Crear objeto de orden parcial para esta zona
          const zoneOrder = {
            _id: order._id,
            tableNumber: order.tableNumber,
            createdAt: order.createdAt,
            // AÑADIR DATOS DE PAGO
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            cashWarning: order.cashWarning,
            notes: order.notes,
            items: zoneItems.map(item => {
              const productName = item.productId && item.productId.name
                ? item.productId.name
                : (item.name || "Producto");

              return {
                ...item.toObject(),
                name: productName
              };
            }),
            total: zoneItems.reduce((sum, item) => sum + (item.total || 0), 0)
          };

          // Determinar si este pedido tiene tickets en múltiples zonas
          const hasMultipleZones = Object.keys(zoneHasItems).length > 1;
          const isKitchen = zone.name.toLowerCase() === 'cocina';
          const hasBarTicket = zoneHasItems['Barra']; // Verificar si hay ticket en barra

          // Parámetro adicional para indicar si mostrar el mensaje de ticket complementario
          const shouldShowCompanionMessage = isKitchen && hasBarTicket;

          // Generar y enviar ticket con la nueva información
          const ticketContent = generateTicketContent(
            zoneOrder,
            business,
            tableNumber,
            zone.name,
            shouldShowCompanionMessage
          );

          const ticket = await createPrintTicket(
            order._id,
            zone._id,
            ticketContent
          );

          // Resto del código para enviar el ticket...
          try {
            await sendTicketToPrinter(ticket._id);
            console.log(`Ticket enviado correctamente a impresora ${zone.name}`);
          } catch (printerError) {
            // Registrar el error pero seguir con otras zonas
            console.error(`Error enviando ticket a impresora ${zone.name}:`, printerError);
            printErrors.push({
              zone: zone.name,
              error: printerError.message
            });
          }
        }
      } catch (zoneError) {
        // Si hay un error procesando una zona, registrarlo pero continuar con las demás
        console.error(`Error procesando zona ${zone.name}:`, zoneError);
        printErrors.push({
          zone: zone.name,
          error: zoneError.message
        });
      }
    }

    // 2. Procesar productos no asignados a ninguna impresora
    const unprintedItems = orderItems.filter(item =>
      !itemZoneAssignments[item._id.toString()] ||
      itemZoneAssignments[item._id.toString()].length === 0
    );

    if (unprintedItems.length > 0) {
      console.log(`Hay ${unprintedItems.length} productos sin zona de impresión asignada:`);

      // Mostrar detalles de los productos sin zona
      for (const item of unprintedItems) {
        console.log(`- Producto: ${item.productId && item.productId.name ? item.productId.name : 'Sin nombre'}`);
        console.log(`  Categoría: ${item.categoryId ? item.categoryId.name : 'Sin categoría'}`);
      }

      // Buscar una zona de impresión genérica (sin categorías)
      const defaultZone = printerZones.find(zone =>
        !zone.categoryIds || zone.categoryIds.length === 0
      );

      if (defaultZone) {
        console.log(`Usando zona ${defaultZone.name} como impresora predeterminada`);

        const defaultOrder = {
          _id: order._id,
          tableNumber: order.tableNumber,
          createdAt: order.createdAt,
          // AÑADIR DATOS DE PAGO
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          cashWarning: order.cashWarning,
          notes: order.notes,
          items: unprintedItems.map(item => {
            // Asegurarnos de que la información del producto esté completa
            const productName = item.productId && item.productId.name
              ? item.productId.name
              : (item.name || "Producto");

            return {
              ...item.toObject(),
              name: productName
            };
          }),
          total: unprintedItems.reduce((sum, item) => sum + (item.total || 0), 0)
        };

        // Generar ticket para productos sin zona específica - PASAR EL NOMBRE DE LA ZONA
        const ticketContent = generateTicketContent(defaultOrder, business, tableNumber, defaultZone.name);

        const ticket = await createPrintTicket(
          order._id,
          defaultZone._id,
          ticketContent
        );

        await sendTicketToPrinter(ticket._id).catch(error => {
          console.error(`Error enviando ticket a impresora predeterminada:`, error);
        });
      } else {
        // Si no hay zona predeterminada, usar la primera zona disponible como fallback
        console.log(`No hay zona predeterminada configurada, usaremos la primera zona como fallback`);

        if (printerZones.length > 0) {
          const fallbackZone = printerZones[0];
          console.log(`Usando zona ${fallbackZone.name} como fallback para productos sin zona asignada`);

          const defaultOrder = {
            _id: order._id,
            tableNumber: order.tableNumber,
            createdAt: order.createdAt,
            // AÑADIR DATOS DE PAGO
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            cashWarning: order.cashWarning,
            notes: order.notes,
            items: unprintedItems.map(item => {
              // Asegurarnos de que la información del producto esté completa
              const productName = item.productId && item.productId.name
                ? item.productId.name
                : (item.name || "Producto");

              return {
                ...item.toObject(),
                name: productName  // Añadir explícitamente el nombre
              };
            }),
            total: unprintedItems.reduce((sum, item) => sum + (item.total || 0), 0)
          };

          const ticketContent = generateTicketContent(defaultOrder, business, tableNumber, fallbackZone.name);

          const ticket = await createPrintTicket(
            order._id,
            fallbackZone._id,
            ticketContent
          );

          await sendTicketToPrinter(ticket._id).catch(error => {
            console.error(`Error enviando ticket a impresora fallback:`, error);
          });
        } else {
          console.log(`ADVERTENCIA: Hay productos sin zona de impresión y no hay zonas disponibles`);
        }
      }
    }

    // Registrar resumen de errores si hubo alguno
    if (printErrors.length > 0) {
      console.warn(`Se encontraron ${printErrors.length} errores de impresión:`,
        printErrors.map(e => `${e.zone}: ${e.error}`).join('; '));
    }

    console.log(`Procesamiento de impresión completado para la orden ${orderId}`);
    return { success: true, errors: printErrors };

  } catch (error) {
    console.error('Error en processOrderPrinting:', error);
    throw error;
  }
};

/**
 * Verifica el estado de todas las impresoras activas
 */
export const checkAllPrinters = async () => {
  try {
    // Obtener todas las zonas de impresoras configuradas (activas o no)
    const PrinterZone = mongoose.model('PrinterZone');
    const printerZones = await PrinterZone.find({});

    console.log(`Verificando estado de ${printerZones.length} impresoras configuradas`);

    const promises = printerZones.map(async (zone) => {
      try {
        // Verificar si la impresora responde, independientemente de si la zona está activa
        const isOnline = await checkPrinterConnection(zone.printerIp, zone.printerPort);

        // Actualizar solo el estado online de los dispositivos asociados a esta IP
        await updatePrinterStatus(zone.printerIp, isOnline);

        // No modificar PrinterZone.active, que es una configuración administrativa

        return {
          zone: zone.name,
          ip: zone.printerIp,
          online: isOnline,
          active: zone.active // Solo para mostrar en logs
        };
      } catch (error) {
        console.error(`Error verificando impresora ${zone.name} (${zone.printerIp}):`, error);
        await updatePrinterStatus(zone.printerIp, false);
        return {
          zone: zone.name,
          ip: zone.printerIp,
          online: false,
          active: zone.active,
          error: error.message
        };
      }
    });

    const results = await Promise.all(promises);
    console.log('Resultados de verificación de impresoras:',
      results.map(r => `${r.zone}: ${r.online ? 'ONLINE' : 'OFFLINE'} (active: ${r.active})`).join(', '));

    return results;
  } catch (error) {
    console.error('Error en verificación de impresoras:', error);
    throw error;
  }
};

/**
 * Verifica si una impresora está online
 * @param {string} ip - Dirección IP de la impresora
 * @param {number} port - Puerto de la impresora
 * @returns {Promise<boolean>} - true si está online
 */
const checkPrinterConnection = (ip, port = 9100) => {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let resolved = false;

    client.setTimeout(3000); // timeout más corto para verificación

    client.on('connect', () => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        resolve(true);
      }
    });

    client.on('error', () => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        resolve(false);
      }
    });

    client.on('timeout', () => {
      if (!resolved) {
        resolved = true;
        client.destroy();
        resolve(false);
      }
    });

    client.connect(port, ip);
  });
};

/**
 * Intenta reimprimir tickets fallidos
 * @returns {Promise<Array>} - Resultados de los reintentos
 */
export const retryFailedTickets = async () => {
  try {
    const PrintTicket = mongoose.model('PrintTicket');

    // Buscar tickets fallidos con menos de MAX_RETRY_COUNT intentos
    const MAX_RETRY_COUNT = 5;
    const RETRY_WINDOW_MINUTES = 60; // Reintentar tickets de hasta 1 hora

    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - RETRY_WINDOW_MINUTES);

    const failedTickets = await PrintTicket.find({
      status: 'FAILED',
      retryCount: { $lt: MAX_RETRY_COUNT },
      updatedAt: { $gte: cutoffTime }
    }).populate('printerZoneId');

    console.log(`Encontrados ${failedTickets.length} tickets fallidos para reintentar`);

    if (failedTickets.length === 0) {
      return [];
    }

    // Verificar el estado de las impresoras antes de reintentar
    const results = [];

    for (const ticket of failedTickets) {
      try {
        const printerZone = ticket.printerZoneId;

        if (!printerZone) {
          console.log(`Ticket ${ticket._id} no tiene zona de impresión asociada`);
          results.push({ ticketId: ticket._id, success: false, error: 'No printer zone' });
          continue;
        }

        // Verificar si la impresora está online
        const isOnline = await checkPrinterConnection(printerZone.printerIp, printerZone.printerPort);

        if (!isOnline) {
          console.log(`La impresora ${printerZone.printerIp} sigue offline, no se reintenta ticket ${ticket._id}`);
          results.push({ ticketId: ticket._id, success: false, error: 'Printer offline' });
          continue;
        }

        // La impresora está online, reintentar impresión
        console.log(`Reintentando impresión del ticket ${ticket._id} en ${printerZone.name}`);

        await sendTicketToPrinter(ticket._id);

        results.push({ ticketId: ticket._id, success: true });

      } catch (error) {
        console.error(`Error al reintentar ticket ${ticket._id}:`, error);
        results.push({ ticketId: ticket._id, success: false, error: error.message });
      }
    }

    return results;

  } catch (error) {
    console.error('Error al reintentar tickets fallidos:', error);
    throw error;
  }
};