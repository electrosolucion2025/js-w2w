import mongoose from 'mongoose';
import path from 'path';
import Business from '../models/business.js';
import Order from '../models/order.js';
import Session from '../models/session.js';
import User from '../models/user.js';
import { sendOrderConfirmationEmail } from '../services/emailService.js'; // Importar el nuevo servicio
import sendMessage, { sendDocument } from '../services/messageService.js';
import { generateOrderReceipt } from '../services/pdfService.js';
import { processOrderPrinting } from '../services/printerService.js';
import { getResponseParameters } from '../services/redsysService.js';
import redisClient from '../utils/redisClient.js';

export const notify = async (req, res) => {
  try {
    console.log('=== Recibida notificación de Redsys ===');
    console.log('Body:', req.body);

    // 1. Obtener los parámetros de la notificación
    const { Ds_MerchantParameters, Ds_Signature, Ds_SignatureVersion } = req.body;

    if (!Ds_MerchantParameters) {
      console.error('Parámetros incompletos en la notificación');
      return res.status(200).send('OK'); // Siempre devolver 200 OK a Redsys
    }

    // 2. Decodificar los parámetros (sin verificación de firma por ahora)
    let parameters = getResponseParameters(Ds_MerchantParameters);
    console.log('Parámetros de la notificación:', parameters);

    // 3. Buscar el número de orden de Redsys
    const redsysOrderNumber = parameters.Ds_Order || parameters.DS_ORDER ||
      parameters.order || parameters.orderReference;

    if (!redsysOrderNumber) {
      console.error('Número de pedido no encontrado en la notificación');
      return res.status(200).send('OK');
    }

    console.log(`Número de pedido Redsys: ${redsysOrderNumber}`);

    // 4. Buscar el pedido por redsysOrderId
    let order = await Order.findOne({ redsysOrderId: redsysOrderNumber });

    // Si no se encuentra, buscar en los detalles de pago
    if (!order) {
      order = await Order.findOne({ 'paymentDetails.redsysOrderNumber': redsysOrderNumber });
    }

    // Como último recurso, buscar pedidos recientes y ver si alguno no tiene redsysOrderId
    if (!order) {
      console.log('Buscando pedidos recientes sin redsysOrderId...');
      const recentOrders = await Order.find({
        redsysOrderId: { $exists: false },
        createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // última hora
      }).sort({ createdAt: -1 });

      if (recentOrders.length > 0) {
        order = recentOrders[0];
        console.log(`Asignando redsysOrderId ${redsysOrderNumber} a pedido reciente ${order._id}`);
      }
    }

    if (!order) {
      console.error(`Orden no encontrada para redsysOrderId: ${redsysOrderNumber}`);
      return res.status(200).send('OK');
    }

    console.log(`Orden encontrada: ${order._id}`);

    // 5. Verificar el código de respuesta para determinar si el pago fue exitoso
    const responseCode = parameters.Ds_Response || parameters.DS_RESPONSE || '';
    const responseCodeNum = parseInt(responseCode, 10);

    // Códigos de respuesta: 0-99 son aprobados, otros son rechazados
    const isSuccessful = responseCodeNum >= 0 && responseCodeNum < 100;

    console.log(`Código de respuesta: ${responseCode} (${isSuccessful ? 'Exitoso' : 'Fallido'})`);

    // 6. Actualizar el estado de la orden
    order.status = isSuccessful ? 'paid' : 'payment_failed';
    order.redsysOrderId = redsysOrderNumber;
    order.paymentDetails = {
      responseDate: new Date().toISOString(),
      responseCode: responseCode,
      authorizationCode: parameters.Ds_AuthorisationCode || parameters.Ds_AuthorizationCode || '',
      cardBrand: parameters.Ds_Card_Brand || parameters.Ds_CardBrand || '',
      amount: parameters.Ds_Amount || '',
      currency: parameters.Ds_Currency || '',
      cardCountry: parameters.Ds_Card_Country || '',
      redsysOrderNumber: redsysOrderNumber,
      successful: isSuccessful
    };

    await order.save();
    console.log(`Orden ${order._id} actualizada con estado: ${order.status}`);

    // 7. Enviar notificación al cliente si el pago fue exitoso
    if (isSuccessful) {
      try {
        // Enviar mensaje de WhatsApp al cliente
        console.log(`Enviando notificación de pago exitoso para pedido ${order._id}`);
        await sendPaymentConfirmationWhatsApp(order);

        // Enviar correo electrónico al negocio
        console.log(`Enviando correo de confirmación al negocio para pedido ${order._id}`);
        await sendOrderConfirmationEmail(order).catch(emailError => {
          console.error('Error enviando correo al negocio:', emailError);
        });

        // Generar tickets de impresion
        await processOrderPrinting(order._id).catch(error => {
          console.log('Error generando tickets de impresión:', error);
        });

        // Cierre automático de sesión después del pago exitoso
        await cerrarSesionDespuesDePago(order);
      } catch (notifyError) {
        console.error('Error enviando notificaciones:', notifyError);
      }
    }

    // 8. Responder a Redsys (siempre con OK para confirmar recepción)
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error procesando notificación de Redsys:', error);
    // Siempre devolver OK a Redsys
    res.status(200).send('OK');
  }
};

// Modificar la función sendPaymentConfirmationWhatsApp
async function sendPaymentConfirmationWhatsApp(order) {
  try {
    // Verificar que el pedido tenga la información necesaria
    if (!order || !order.userId) {
      console.error('Pedido inválido para enviar notificación WhatsApp');
      return;
    }

    // Buscar número de teléfono del usuario
    const User = mongoose.model('User');
    const user = await User.findById(order.userId);

    if (!user || !user.whatsappNumber) {
      console.error('No se encontró usuario o número de WhatsApp para notificación');
      return;
    }

    // Crear mensaje de confirmación con URL al recibo
    const baseUrl = process.env.BASE_URL || 'https://whats2want-assistant.com';
    const receiptUrl = `${baseUrl}/orders/${order._id}/receipt`;

    // const message = `
    // ¡Pago confirmado! 🎉\n\nTu pedido #${order._id} ha sido pagado correctamente.\nEstamos preparándolo y te notificaremos cuando esté listo.\n\nPuedes ver o descargar tu recibo aquí: ${receiptUrl}`;

    // // Enviar mensaje de texto
    // await sendMessage(user.whatsappNumber, message);

    try {
      // Generar el PDF del recibo
      const pdfPath = await generateOrderReceipt(order);

      // Enviar el PDF como documento
      const fileName = path.basename(pdfPath);

      // Enviar el PDF como documento
      await sendDocument(
        user.whatsappNumber,
        pdfPath,
        fileName,
        '🎉 Aquí tienes tu recibo de compra 🎉'
      );

      console.log(`PDF enviado a ${user.whatsappNumber}: ${fileName}`);
    } catch (pdfError) {
      console.error('Error enviando PDF del recibo:', pdfError);
      // Continuar con el flujo aunque falle el envío del PDF
    }

    console.log(`Mensaje de confirmación enviado a ${user.whatsappNumber}`);
  } catch (error) {
    console.error('Error enviando mensaje de WhatsApp:', error);
  }
}

export const success = (req, res) => {
  try {
    console.log('=== Redirigido a URL de éxito ===');
    console.log('Query params:', req.query);

    // Extraer orderId de la consulta si está disponible
    const { orderId } = req.query;

    if (orderId) {
      console.log(`Orden ID recibido en URL de éxito: ${orderId}`);

      // Actualizar estado de la orden si es necesario (actualización adicional)
      // Nota: Esta parte es opcional ya que la notificación debería haber actualizado la orden
      setTimeout(async () => {
        try {
          const order = await Order.findById(orderId);
          if (order && order.status !== 'paid') {
            order.status = 'paid';
            await order.save();
            console.log(`Orden ${orderId} marcada como pagada desde URL de éxito`);
          }
        } catch (updateError) {
          console.error('Error actualizando orden desde URL de éxito:', updateError);
        }
      }, 0);
    }

    // Mostrar una página de éxito
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>¡Pago completado!</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 20px; 
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
          .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 { color: #4CAF50; }
          .return-link {
            display: inline-block;
            margin-top: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 25px;
            text-decoration: none;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>¡Pago completado con éxito!</h1>
          <p>Tu pedido ha sido procesado correctamente.</p>
          <p>En breve recibirás una confirmación por WhatsApp.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error en la redirección de éxito:', error);
    res.status(500).send('Error en la redirección de éxito');
  }
};

export const failure = (req, res) => {
  try {
    console.log('=== Redirigido a URL de error ===');

    // Mostrar una página de error
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pago no completado</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 20px; 
            background-color: #f5f5f5;
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: white; 
            padding: 30px; 
            border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); 
          }
          .error-icon {
            color: #F44336;
            font-size: 64px;
            margin-bottom: 20px;
          }
          h1 { color: #F44336; }
          .retry-link {
            display: inline-block;
            margin-top: 20px;
            background: #4CAF50;
            color: white;
            padding: 12px 25px;
            text-decoration: none;
            border-radius: 4px;
          }
          .return-link {
            display: inline-block;
            margin-top: 20px;
            margin-left: 10px;
            background: #607D8B;
            color: white;
            padding: 12px 25px;
            text-decoration: none;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="error-icon">❌</div>
          <h1>Pago no completado</h1>
          <p>Lo sentimos, ha ocurrido un problema al procesar tu pago.</p>
          <p>Por favor, intenta nuevamente o contacta con soporte.</p>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error en la redirección de error:', error);
    res.status(500).send('Error en la redirección de error');
  }
};

/**
 * Cierra la sesión del usuario después de un pago exitoso
 * @param {Object} order - El pedido completado
 */
async function cerrarSesionDespuesDePago(order) {
  try {
    if (!order || !order.userId) {
      console.log('No se puede cerrar sesión: Pedido sin usuario asociado');
      return;
    }

    // Buscar el usuario para obtener su número de WhatsApp
    const usuario = await User.findById(order.userId);
    if (!usuario || !usuario.whatsappNumber) {
      console.log('No se puede cerrar sesión: Usuario no encontrado o sin número de WhatsApp');
      return;
    }

    const numeroWhatsapp = usuario.whatsappNumber;
    console.log(`Cerrando sesión para el usuario ${numeroWhatsapp} después del pago exitoso`);

    // Obtener datos de la sesión actual de Redis
    const datosSession = await redisClient.get(`session:${numeroWhatsapp}`);

    if (!datosSession) {
      console.log(`No hay sesión activa para el usuario ${numeroWhatsapp}`);
      return;
    }

    // Parsear los datos de la sesión
    const session = JSON.parse(datosSession);

    // Guardar la sesión completa en la base de datos antes de cerrarla
    await Session.updateOne(
      { sessionId: session.sessionId },
      {
        $set: {
          userId: session.userId,
          startedAt: session.startedAt,
          lastMessageAt: session.lastMessageAt,
          isActive: false, // Marcar como inactiva
          fullHistory: session.fullHistory || [],
          closedAt: new Date(), // Registrar cuándo se cerró
          closedReason: 'payment_completed' // Motivo del cierre
        },
      },
      { upsert: true }
    );

    // Eliminar la sesión de Redis
    await redisClient.del(`session:${numeroWhatsapp}`);

    // Eliminar el menú en caché si existe
    if (order.businessId) {
      const businessId = typeof order.businessId === 'object' ?
        order.businessId._id || order.businessId : order.businessId;

      console.log(`Eliminando caché del menú para negocio ${businessId}`);
      await redisClient.del(`menu:${businessId}`);
    }

    // Resetear el businessCode del usuario - PUNTO PROBLEMÁTICO
    try {
      // Usando directamente el ID del usuario del pedido para mayor seguridad
      console.log(`Reseteando businessCode para usuario ${order.userId}`);
      const updateResult = await User.updateOne(
        { _id: order.userId },
        { $set: { businessCode: null } }
      );

      console.log(`Resultado de reset businessCode: ${JSON.stringify(updateResult)}`);

      if (updateResult.modifiedCount === 0) {
        console.log(`Advertencia: No se modificó el businessCode del usuario ${order.userId}`);
      }
    } catch (userUpdateError) {
      console.error('Error al resetear el businessCode del usuario:', userUpdateError);
    }

    // Eliminar número de mesa
    await redisClient.del(`tableNumber:${numeroWhatsapp}`);

    // Borrar la preferencia del idioma
    await redisClient.del(`userLanguage:${numeroWhatsapp}`);

    let business = null;
    if (usuario.businessCode) {
      business = await Business.findOne({ code: usuario.businessCode });
    }
    const businessId = business ? business._id.toString() : null;
    if (businessId) {
      await redisClient.del(`menu:${businessId}`);
    }

    console.log(`Sesión para el usuario ${numeroWhatsapp} cerrada correctamente después del pago`);

    // Enviar mensaje final de despedida (opcional)
    await sendMessage(numeroWhatsapp,
      '¡Gracias por tu compra! 🙏\n\n' +
      'Tu sesión ha finalizado.\n\n' +
      'Si deseas realizar un nuevo pedido, simplemente envía un nuevo mensaje. ¡Buen provecho! 🍽️'
    );

    await sendMessage(numeroWhatsapp,
      'Si quieres estar al día de lo ultimo, puedes registrarte en www.whats2want.com.'
    );

  } catch (error) {
    console.error('Error al cerrar la sesión después del pago:', error);
  }
}