import express from 'express';
import fs from 'fs-extra';
import { glob } from 'glob'; // Importación correcta
import path from 'path';
import { fileURLToPath } from 'url';
import Order from '../models/order.js';
import OrderItem from '../models/orderItem.js'; // Importación correcta
import { generateOrderReceipt } from '../services/pdfService.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Implementar la ruta para ver detalles del pedido
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar formato válido de ID
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).send('ID de pedido inválido');
    }

    // Buscar el pedido con todos sus datos relacionados
    const order = await Order.findById(id)
      .populate('businessId')
      .populate('userId');

    if (!order) {
      return res.status(404).send('Pedido no encontrado');
    }

    // Obtener los productos del pedido
    const orderItems = await OrderItem.find({ orderId: id })
      .populate('productId')
      .populate('categoryId');

    // Generar una página HTML con los detalles del pedido
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Detalles del Pedido #${id.substring(0, 8)}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            padding: 20px;
          }
          h1 {
            color: #3498db;
            text-align: center;
            margin-bottom: 20px;
          }
          .status {
            text-align: center;
            font-size: 18px;
            margin-bottom: 20px;
            padding: 10px;
            border-radius: 4px;
          }
          .pending { background-color: #ffe082; }
          .processing { background-color: #ffe082; }
          .paid { background-color: #c8e6c9; }
          .preparing { background-color: #bbdefb; }
          .ready { background-color: #b3e5fc; }
          .delivered { background-color: #c8e6c9; }
          .cancelled { background-color: #ffcdd2; }
          .payment_failed { background-color: #ffcdd2; }
          
          .section {
            margin-bottom: 20px;
            border-bottom: 1px solid #eee;
            padding-bottom: 15px;
          }
          .section-title {
            color: #555;
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 10px;
          }
          .product-item {
            padding: 10px 0;
            display: flex;
            justify-content: space-between;
            border-bottom: 1px dashed #eee;
          }
          .product-name {
            flex: 1;
            padding-right: 10px;
          }
          .product-price {
            text-align: right;
            white-space: nowrap;
          }
          .total {
            font-weight: bold;
            font-size: 18px;
            text-align: right;
            margin-top: 20px;
          }
          .promotion {
            color: #e74c3c;
            margin-top: 5px;
            font-style: italic;
          }
          .footer {
            text-align: center;
            margin-top: 30px;
            color: #777;
            font-size: 14px;
          }
          .button {
            display: inline-block;
            background-color: #3498db;
            color: white;
            text-decoration: none;
            padding: 10px 15px;
            border-radius: 4px;
            margin-top: 10px;
          }
          .notes {
            background-color: #f8f9fa;
            padding: 10px;
            border-radius: 4px;
            font-style: italic;
            margin-top: 10px;
            color: #555;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Pedido #${id.substring(0, 8)}</h1>
          
          <div class="status ${order.status}">
            ${getStatusText(order.status)}
          </div>
          
          <div class="section">
            <div class="section-title">📌 Datos del pedido</div>
            <p><strong>Restaurante:</strong> ${order.businessId ? order.businessId.name : 'No disponible'}</p>
            <p><strong>Mesa:</strong> ${order.tableNumber || 'No especificada'}</p>
            <p><strong>Fecha:</strong> ${new Date(order.createdAt).toLocaleString('es-ES')}</p>
          </div>
          
          <div class="section">
            <div class="section-title">🍽️ Artículos</div>
            ${orderItems.map(item => `
              <div class="product-item">
                <div class="product-name">
                  ${item.quantity}x ${item.productId ? item.productId.name : item.name || 'Producto'}
                  ${item.promotionApplied ? `<div class="promotion">🎁 ${item.promotionApplied.name}</div>` : ''}
                  ${item.extras && item.extras.length > 0 ?
        `<div style="font-size: 12px; color: #777; margin-top: 3px;">
                      ${item.extras.map(extra =>
          `+ ${extra.name || 'Extra'} (${extra.price ? extra.price.toFixed(2) + '€' : '0.00€'})${extra.quantity > 1 ? ' x' + extra.quantity : ''}`
        ).join('<br>')}
                    </div>`
        : ''
      }
                  ${item.modifications && item.modifications.length > 0 ?
        `<div style="font-size: 12px; color: #777; margin-top: 3px;">
                      🔄 ${item.modifications.join(', ')}
                    </div>`
        : ''
      }
                  ${item.notes ?
        `<div style="font-size: 12px; color: #0066cc; margin-top: 3px;">
                      📝 ${item.notes}
                    </div>`
        : ''
      }
                </div>
                <div class="product-price">${item.total.toFixed(2)}€</div>
              </div>
            `).join('')}
          </div>
          
          ${order.notes ? `
            <div class="section">
              <div class="section-title">📝 Notas generales</div>
              <div class="notes">${order.notes}</div>
            </div>
          ` : ''}
          
          ${order.appliedPromotions && order.appliedPromotions.length > 0 ? `
            <div class="section">
              <div class="section-title">🎁 Promociones aplicadas</div>
              ${order.appliedPromotions.map(promo =>
        `<div>${promo.name}: -${promo.discountAmount.toFixed(2)}€ en ${promo.appliedTo}</div>`
      ).join('')}
            </div>
          ` : ''}
          
          <div class="total">
            Total: ${order.total.toFixed(2)}€
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="/orders/${order._id}/receipt" class="button">Descargar Recibo</a>
          </div>
          
          <div class="footer">
            <div>Estado del pago: ${order.paymentDetails && order.paymentDetails.successful ? 'PAGADO ✅' : 'PENDIENTE ⏳'}</div>
            <div style="margin-top: 10px;">🔒 Pedido generado por WhatsApp2Want</div>
          </div>
        </div>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error al mostrar detalles del pedido:', error);
    res.status(500).send('Error al cargar los detalles del pedido');
  }
});

// Función auxiliar para obtener texto descriptivo del estado
function getStatusText(status) {
  const statusTexts = {
    'pending': 'Pendiente de pago',
    'processing': 'Procesando pago',
    'paid': 'Pagado',
    'preparing': 'En preparación',
    'ready': 'Listo para recoger',
    'delivered': 'Entregado',
    'cancelled': 'Cancelado',
    'payment_failed': 'Pago fallido',
    'refunded': 'Reembolsado'
  };

  return statusTexts[status] || 'Estado desconocido';
}

// Nueva ruta para ver/descargar el recibo PDF
router.get('/:id/receipt', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar formato válido de ID
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).send('ID de pedido inválido');
    }

    // Buscar el pedido
    const order = await Order.findById(id)
      .populate('businessId')
      .populate('userId');

    if (!order) {
      return res.status(404).send('Pedido no encontrado');
    }

    // Directorio donde se guardan los recibos
    const pdfDir = path.join(__dirname, '../../public/receipts');
    await fs.ensureDir(pdfDir);  // Asegurar que el directorio existe

    // Patrón para buscar archivos de este pedido
    const pdfPattern = `receipt_whats2want_${order._id}_*.pdf`;

    let pdfPath;

    try {
      // Buscar archivos existentes con glob
      const existingFiles = await glob(path.join(pdfDir, pdfPattern));

      if (existingFiles.length > 0) {
        // Usar el recibo existente más reciente
        pdfPath = existingFiles[existingFiles.length - 1];
        console.log(`Usando PDF existente: ${pdfPath}`);
      } else {
        // Generar nuevo recibo
        console.log(`Generando nuevo PDF para pedido: ${order._id}`);
        pdfPath = await generateOrderReceipt(order);
      }
    } catch (globError) {
      console.error('Error buscando archivos existentes:', globError);
      // Si hay error con glob, simplemente generamos un nuevo PDF
      console.log('Generando nuevo PDF debido a error de glob');
      pdfPath = await generateOrderReceipt(order);
    }

    // Verificar que el archivo existe
    if (!await fs.pathExists(pdfPath)) {
      console.error(`El archivo PDF no existe: ${pdfPath}`);
      return res.status(404).send('PDF no encontrado');
    }

    // Enviar el archivo
    res.download(pdfPath, `recibo_${order._id}.pdf`);
  } catch (error) {
    console.error('Error generando o enviando recibo:', error);
    res.status(500).send(`Error generando el recibo: ${error.message}`);
  }
});

export default router;