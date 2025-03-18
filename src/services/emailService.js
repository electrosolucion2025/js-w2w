import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Business from '../models/business.js';
import OrderItem from '../models/orderItem.js'; // Importar modelo OrderItem

// Asegurar que las variables de entorno estén cargadas
dotenv.config();

// Configurar API key de SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Envía una notificación por correo electrónico al negocio cuando se recibe un nuevo pedido
 * @param {Object} order - El objeto de pedido completo con todos los detalles
 * @returns {Promise<boolean>} - True si el correo se envió correctamente, False si hubo un error
 */
export const sendOrderConfirmationEmail = async (order) => {
  try {
    console.log(`Preparando envío de correo para pedido ${order._id}`);

    // Verificar que el pedido tenga un businessId
    if (!order.businessId) {
      console.error('No hay businessId en el pedido, no se puede enviar correo');
      return false;
    }

    // Buscar el negocio para obtener su email
    const businessId = typeof order.businessId === 'object' ?
      order.businessId._id || order.businessId : order.businessId;

    const business = await Business.findById(businessId);

    if (!business || !business.email) {
      console.error(`No se encontró negocio o email para businessId ${businessId}`);
      return false;
    }

    // Crear contenido del correo
    const formattedDate = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const formattedTime = new Date().toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    // Obtener los OrderItems asociados a este pedido
    console.log(`Buscando OrderItems para el pedido ${order._id}`);
    const orderItems = await OrderItem.find({ orderId: order._id })
      .populate('productId')
      .populate('categoryId');

    console.log(`Se encontraron ${orderItems.length} items para el pedido ${order._id}`);

    // Generar contenido HTML para los elementos del pedido
    let orderItemsHtml = '';
    let totalItems = 0;

    if (orderItems && orderItems.length > 0) {
      orderItems.forEach(item => {
        const quantity = item.quantity || 1;
        totalItems += quantity;

        // Obtener nombre del producto
        const productName = item.productId && item.productId.name ?
          item.productId.name : (item.name || 'Producto');

        // Procesamiento de extras
        let extrasText = 'Sin extras';
        if (item.extras && Array.isArray(item.extras) && item.extras.length > 0) {
          extrasText = item.extras.map(extra => {
            if (!extra) return '';
            return `${extra.name || 'Extra'} (+${(extra.price || 0).toFixed(2)}€${extra.quantity > 1 ? ' x' + extra.quantity : ''})`;
          }).filter(Boolean).join(', ');
        }

        // Procesamiento de modificaciones
        let modificationsText = 'Sin modificaciones';
        if (item.modifications && Array.isArray(item.modifications) && item.modifications.length > 0) {
          modificationsText = item.modifications.join(', ');
        }

        // Instrucciones especiales (si existen)
        const notes = item.notes || item.notas || '';
        const specialInstructions = notes ?
          `<br><small style='color: #0066cc;'>📝 ${notes}</small>` : '';

        orderItemsHtml += `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">
              <strong>${productName}</strong> ${specialInstructions} <br>
              <small style="color: #888;">➕ ${extrasText} | ❌ ${modificationsText}</small>
            </td>
            <td style="text-align: center; padding: 8px; border-bottom: 1px solid #ddd;">${quantity}</td>
            <td style="text-align: right; padding: 8px; border-bottom: 1px solid #ddd;">${(item.total || 0).toFixed(2)}€</td>
          </tr>
        `;
      });
    } else {
      // Si no hay items, mostrar mensaje
      orderItemsHtml = `
        <tr>
          <td colspan="3" style="text-align: center; padding: 20px;">
            No hay detalles disponibles para este pedido.
          </td>
        </tr>
      `;
    }

    // Obtener información del cliente
    let clienteInfo = 'No disponible';
    if (order.userId) {
      const User = mongoose.model('User');
      try {
        const user = await User.findById(order.userId);
        if (user) {
          clienteInfo = user.whatsappNumber || 'No disponible';
        }
      } catch (userError) {
        console.error('Error obteniendo información del usuario:', userError);
      }
    }

    // Total del pedido (con validación)
    const totalAmount = typeof order.total === 'number' ? order.total.toFixed(2) : '0.00';

    // Nota general del pedido (si existe)
    const orderNotesSection = order.notes ? `
    <tr>
      <td style="padding: 10px 0; background-color: #f9f9f9; border-radius: 5px;">
        <h3 style="color: #555; margin-left: 10px;">📝 Nota general del pedido:</h3>
        <p style="margin-left: 10px; margin-right: 10px; color: #0066cc;">${order.notes}</p>
      </td>
    </tr>` : '';

    // Crear cuerpo del correo
    const bodyHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Confirmación de Pedido</title>
    </head>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px; margin: 0;">
        <table style="max-width: 600px; width: 100%; background-color: #ffffff; padding: 20px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); margin: auto;">
            <tr>
                <td style="text-align: center;">
                    <h2 style="color: #333;">✅ Confirmación de Pedido</h2>
                    <p style="color: #777;">Nuevo pedido en <strong>${business.name || 'tu negocio'}</strong></p>
                </td>
            </tr>

            <tr>
                <td style="padding: 10px 0;">
                    <p><strong>📌 Pedido:</strong> ${order._id}</p>
                    <p><strong>📅 Fecha:</strong> ${formattedDate}</p>
                    <p><strong>🕒 Hora:</strong> ${formattedTime}</p>
                    <p><strong>📍 Mesa:</strong> ${order.tableNumber || 'N/A'}</p>
                    <p><strong>📞 Cliente:</strong> ${clienteInfo}</p>
                </td>
            </tr>

            <tr>
                <td>
                    <h3 style="color: #555;">🛒 Detalle del Pedido</h3>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background-color: #eee;">
                                <th style="text-align: left; padding: 8px;">Producto</th>
                                <th style="text-align: center; padding: 8px;">Cant.</th>
                                <th style="text-align: right; padding: 8px;">Precio</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orderItemsHtml}
                        </tbody>
                    </table>
                </td>
            </tr>

            ${orderNotesSection}

            <tr>
                <td style="padding: 10px 0;">
                    <h3 style="color: #555;">💰 Resumen</h3>
                    <p><strong>Total de items en el pedido:</strong> ${totalItems}</p>
                    <h2 style="color: #333;">Total: ${totalAmount}€</h2>
                </td>
            </tr>

            <tr>
                <td style="text-align: center; padding: 20px 0;">
                    <p style="color: #777;">📦 Este pedido ha sido pagado y está listo para ser preparado.</p>
                </td>
            </tr>
            
            <tr>
                <td style="text-align: center; padding: 20px 0; font-size: 12px; color: #999;">
                    <p>Este correo ha sido enviado automáticamente por Whats2Want.</p>
                    <p>No responda a este mensaje.</p>
                </td>
            </tr>
        </table>
    </body>
    </html>`;

    // Configurar el mensaje
    const msg = {
      to: business.email,
      from: process.env.SENDGRID_FROM_EMAIL || 'notificaciones@whats2want.com',
      subject: `✅ Nuevo pedido #${order._id} - ${business.name}`,
      html: bodyHtml,
    };

    // Modo sandbox para depuración si está habilitado
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    if (isDevelopment && (process.env.SENDGRID_SANDBOX_MODE === 'true')) {
      console.log('Correo enviado en modo sandbox (no se enviará realmente)');
      console.log(`Destinatario: ${business.email}`);
      console.log(`Asunto: ${msg.subject}`);
      return true;
    }

    // Enviar el correo
    const response = await sgMail.send(msg);

    console.log(`Correo enviado a ${business.email}, status: ${response[0].statusCode}`);
    return true;
  } catch (error) {
    console.error('Error enviando correo de confirmación:', error);

    // Información adicional para depuración
    if (error.response) {
      console.error('Error de respuesta de SendGrid:', error.response.body);
    }

    return false;
  }
};