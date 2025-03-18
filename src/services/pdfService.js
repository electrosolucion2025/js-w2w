import fs from 'fs-extra';
import path from 'path';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { fileURLToPath } from 'url';
import Business from '../models/business.js';
import OrderItem from '../models/orderItem.js';
import User from '../models/user.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Genera un archivo PDF como recibo de compra
 * @param {Object} order - Objeto de pedido con todos los detalles
 * @returns {Promise<string>} - Ruta del archivo PDF generado
 */
export const generateOrderReceipt = async (order) => {
  console.log(`Generando recibo PDF para pedido:::::::::::::::> ${order._id}`);
  try {
    console.log(`Generando recibo PDF para pedido ${order._id}`);

    // Crear directorio para almacenar PDFs si no existe
    const pdfDir = path.join(__dirname, '../../public/receipts');
    await fs.ensureDir(pdfDir);

    // Nombre del archivo basado en ID de pedido y timestamp
    const fileName = `receipt_whats2want_${order._id}_${Date.now()}.pdf`;
    const filePath = path.join(pdfDir, fileName);

    // Buscar items del pedido
    const orderItems = await OrderItem.find({ orderId: order._id })
      .populate('productId')
      .populate('categoryId');

    // Buscar información del negocio
    const business = await Business.findById(order.businessId);

    // Buscar información del usuario
    const user = await User.findById(order.userId);

    // Crear un nuevo documento PDF
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Recibo Pedido #${order._id}`,
        Author: business ? business.name : 'Whats2Want',
        Subject: 'Recibo de Compra',
      }
    });

    // Stream para escribir el PDF
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Añadir logo de Whats2Want
    const logoPath = path.join(__dirname, '../../public/images/logo.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, {
        fit: [150, 150],
        align: 'center',
      });
    }

    // Título del recibo
    doc.fontSize(20)
      .font('Helvetica-Bold')
      .text('RECIBO DE COMPRA', { align: 'center' })
      .moveDown(1);

    // Información del negocio
    doc.fontSize(12)
      .font('Helvetica-Bold')
      .text(business ? business.name.toUpperCase() : 'ESTABLECIMIENTO', { align: 'center' })
      .font('Helvetica')
      .fontSize(10)
      .text(business ? business.address || 'Dirección no disponible' : 'Dirección no disponible', { align: 'center' })
      .moveDown(2);

    // NUEVA SECCIÓN: Encabezado con dos columnas (datos del pedido y datos de Whats2Want)
    // Definir el ancho de la página y las posiciones
    const pageWidth = doc.page.width - 100; // Ancho total disponible (menos márgenes)
    const leftColumnX = 50;
    const rightColumnX = 50 + (pageWidth / 2) + 10;
    const startY = doc.y; // Posición vertical actual

    // Columna izquierda: Información del pedido
    doc.font('Helvetica-Bold')
      .fontSize(11)
      .text('DATOS DEL PEDIDO', leftColumnX, startY)
      .moveDown(0.2);

    const formattedDate = new Date(order.createdAt).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

    const formattedTime = new Date(order.createdAt).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Datos del pedido
    doc.font('Helvetica')
      .fontSize(10);

    // Crear tabla de datos generales del pedido
    const generalData = [
      [`Pedido: #${order._id.toString()}`, ''],
      ['Fecha: ', formattedDate],
      ['Hora: ', formattedTime],
      ['Mesa: ', order.tableNumber || 'N/A'],
      ['Cliente: ', user ? user.whatsappNumber : 'No registrado'],
    ];

    // Posición inicial para la tabla de pedido
    let yPos = doc.y;
    generalData.forEach((row, i) => {
      doc.text(row[0], leftColumnX, yPos, { continued: true, width: (pageWidth / 2) - 10 })
        .text(row[1], { align: 'left' });
      yPos += 20;
    });

    // Columna derecha: Información de Whats2Want
    doc.font('Helvetica-Bold')
      .fontSize(11)
      .text('DATOS DE FACTURACIÓN', rightColumnX, startY)
      .moveDown(0.2);

    // Datos de la empresa
    doc.font('Helvetica')
      .fontSize(10);

    // Crear tabla de datos de la empresa
    const companyData = [
      ['Empresa: ', 'Whats2Want Global S.L.'],
      ['NIF: ', 'B-XXXXXXXX - Tramitando'],
      ['Dirección: ', 'C/ Princesa Guacimara 20, 1A'],
      ['Localidad: ', '38611 - San Isidro, Tenerife'],
      ['Teléfono: ', '600 778 577'],
    ];

    // Posición inicial para la tabla de empresa
    yPos = startY + 20; // Alinear con la primera línea de datos del pedido
    companyData.forEach((row, i) => {
      doc.text(row[0], rightColumnX, yPos, { continued: true, width: (pageWidth / 2) - 10 })
        .text(row[1], { align: 'left' });
      yPos += 20;
    });

    // Nota legal a pie del encabezado
    const legalNoteY = Math.max(doc.y, yPos + 10); // Usar la posición más baja + espacio
    doc.font('Helvetica')
      .fontSize(8)
      .fillColor('#555555')
      .text('Este documento es emitido por Whats2Want Global S.L. como intermediario tecnológico. La facturación oficial del servicio corre a cargo de Whats2Want Global S.L. y la calidad del producto adquirido es responsabilidad del establecimiento.', 50, legalNoteY, {
        width: pageWidth,
        align: 'justify'
      })
      .fillColor('black')
      .moveDown(1);

    // Verificar si el pago fue procesado
    if (order.paymentDetails && order.paymentDetails.successful) {
      doc.font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('green')
        .text('PAGO CONFIRMADO', { align: 'center' })
        .moveDown(0.5)
        .fillColor('black');

      // Añadir sello visual de pagado
      doc.save();
      doc.rotate(-30, { origin: [doc.page.width / 2 - 50, doc.y - 30] });
      doc.fontSize(50)
        .fillColor('green')
        .fillOpacity(0.3)
        .text('PAGADO', doc.page.width / 2 - 100, doc.y - 50)
        .fillOpacity(1)
        .fillColor('black');
      doc.restore();
    }

    // Detalles del pedido
    doc.font('Helvetica-Bold')
      .fontSize(11)
      .text('ARTÍCULOS DEL PEDIDO')
      .moveDown(0.2);

    // Encabezados de tabla
    const tableTop = doc.y;
    const tableHeaders = ['Producto', 'Cant.', 'Precio', 'Total'];
    const columnWidths = [250, 40, 70, 70];

    // Dibujar cabecera de la tabla
    doc.font('Helvetica-Bold')
      .fontSize(9);
    tableHeaders.forEach((header, i) => {
      let xPos = 50;
      for (let j = 0; j < i; j++) {
        xPos += columnWidths[j];
      }
      doc.text(header, xPos, tableTop, { width: columnWidths[i], align: i > 0 ? 'right' : 'left' });
    });

    // Línea debajo de los encabezados
    doc.moveTo(50, tableTop + 15)
      .lineTo(50 + columnWidths.reduce((a, b) => a + b, 0), tableTop + 15)
      .stroke();

    // Contenido de la tabla
    doc.font('Helvetica')
      .fontSize(8);

    let tableY = tableTop + 20;
    let totalItems = 0;

    if (orderItems && orderItems.length > 0) {
      orderItems.forEach((item) => {
        const quantity = item.quantity || 1;
        totalItems += quantity;

        // Producto base
        const productName = item.productId && item.productId.name ?
          item.productId.name : (item.name || 'Producto');

        // Precio unitario
        const unitPrice = (item.price || 0).toFixed(2);

        // Total del item
        const itemTotal = (item.total || 0).toFixed(2);

        // Aplicar promoción si existe
        let promotionText = '';
        if (item.promotionApplied) {
          promotionText = ` (${item.promotionApplied.name})`;
        }

        // Datos del producto
        doc.font('Helvetica')
          .text(productName + promotionText, 50, tableY, { width: columnWidths[0] });

        doc.font('Helvetica')
          .text(quantity.toString(), 50 + columnWidths[0], tableY, { width: columnWidths[1], align: 'right' });

        doc.font('Helvetica')
          .text(`${unitPrice}€`, 50 + columnWidths[0] + columnWidths[1], tableY, { width: columnWidths[2], align: 'right' });

        doc.font('Helvetica')
          .text(`${itemTotal}€`, 50 + columnWidths[0] + columnWidths[1] + columnWidths[2], tableY, { width: columnWidths[3], align: 'right' });

        tableY += 15;

        // Mostrar extras si existen
        if (item.extras && Array.isArray(item.extras) && item.extras.length > 0) {
          item.extras.forEach(extra => {
            if (!extra) return;

            const extraName = extra.name || 'Extra';
            const extraQuantity = extra.quantity || 1;
            const extraPrice = extra.price || 0;
            const extraTotal = extraPrice * extraQuantity;

            doc.font('Helvetica')
              .fontSize(7)
              .text(`+ ${extraName}${extraQuantity > 1 ? ` x${extraQuantity}` : ''}`, 60, tableY, { width: columnWidths[0] - 10 });

            doc.text('', 50 + columnWidths[0], tableY, { width: columnWidths[1], align: 'right' });

            doc.text(`${extraPrice.toFixed(2)}€`, 50 + columnWidths[0] + columnWidths[1], tableY, { width: columnWidths[2], align: 'right' });

            doc.text(`${extraTotal.toFixed(2)}€`, 50 + columnWidths[0] + columnWidths[1] + columnWidths[2], tableY, { width: columnWidths[3], align: 'right' });

            tableY += 12;
          });
        }

        // Mostrar modificaciones si existen
        if (item.modifications && Array.isArray(item.modifications) && item.modifications.length > 0) {
          doc.font('Helvetica')
            .fontSize(7)
            .text(`Modificaciones: ${item.modifications.join(', ')}`, 60, tableY, { width: columnWidths[0] + columnWidths[1] + columnWidths[2] });

          tableY += 12;
        }

        // Mostrar notas si existen
        if (item.notes && typeof item.notes === 'string' && item.notes.trim() !== '') {
          doc.font('Helvetica')
            .fontSize(7)
            .fillColor('blue')
            .text(`Nota: ${item.notes}`, 60, tableY, { width: columnWidths[0] + columnWidths[1] + columnWidths[2] });

          doc.fillColor('black');
          tableY += 12;
        } else if (item.notes && typeof item.notes !== 'string') {
          // Log del error para debugging
          console.log(`Tipo incorrecto de notas para item ${item._id}:`, typeof item.notes, item.notes);

          // Intenta convertir a string si es posible
          const notesStr = String(item.notes);
          if (notesStr.trim() !== '') {
            doc.font('Helvetica')
              .fontSize(7)
              .fillColor('blue')
              .text(`Nota: ${notesStr}`, 60, tableY, { width: columnWidths[0] + columnWidths[1] + columnWidths[2] });

            doc.fillColor('black');
            tableY += 12;
          }
        }

        // Separador entre productos
        doc.moveTo(50, tableY)
          .lineTo(50 + columnWidths.reduce((a, b) => a + b, 0), tableY)
          .opacity(0.2)
          .stroke()
          .opacity(1);

        tableY += 8;
      });
    } else {
      doc.text('No hay artículos en este pedido', 50, tableY, { width: columnWidths.reduce((a, b) => a + b, 0), align: 'center' });
      tableY += 20;
    }

    // Agregar espacio después de la tabla
    doc.moveDown(3);

    // Verificar si queda suficiente espacio para el resumen, info de pago y footer
    const remainingSpace = doc.page.height - doc.y;
    const estimatedNeededSpace = 400; // Espacio estimado necesario para resumen, pago y footer

    // Si no hay suficiente espacio, añadir una nueva página
    if (remainingSpace < estimatedNeededSpace) {
      doc.addPage();
    }

    // Mostar el resumen del pedido
    doc.font('Helvetica-Bold')
      .fontSize(11)
      .text('RESUMEN', { underline: true })
      .moveDown(0.2);

    doc.font('Helvetica')
      .fontSize(10)
      .text(`Total de artículos: ${totalItems}`);

    // Mostrar descuentos si hay promociones aplicadas
    if (order.appliedPromotions && Array.isArray(order.appliedPromotions) && order.appliedPromotions.length > 0) {
      doc.moveDown(0.3);
      doc.font('Helvetica-Bold')
        .text('Promociones aplicadas:');

      order.appliedPromotions.forEach(promo => {
        doc.font('Helvetica')
          .text(`- ${promo.name}: -${promo.discountAmount.toFixed(2)}€ en ${promo.appliedTo}`);
      });
    }

    // Total final
    doc.moveDown(1);
    doc.font('Helvetica-Bold')
      .fontSize(14)
      .text(`TOTAL: ${order.total.toFixed(2)}€`, { align: 'right' });

    // Si tiene notas generales, mostrarlas
    if (order.notes) {
      // Convertir a string si no lo es
      const notesText = typeof order.notes === 'string' ? order.notes : String(order.notes);

      if (notesText.trim() !== '') {
        doc.moveDown(1);
        doc.fontSize(11)
          .font('Helvetica-Bold')
          .text('NOTAS GENERALES:')
          .font('Helvetica')
          .fontSize(10)
          .fillColor('blue')
          .text(notesText)
          .fillColor('black');
      }
    }

    // Información de pago
    if (order.paymentDetails) {
      doc.moveDown(1);
      doc.fontSize(11)
        .font('Helvetica-Bold')
        .text('INFORMACIÓN DE PAGO:', { align: 'left' })
        .fontSize(9)
        .font('Helvetica');

      const paymentData = [
        ['Método de pago: ', 'Tarjeta'],
        ['Estado: ', order.paymentDetails.successful ? 'PAGADO' : 'PENDIENTE'],
        ['Total pagado: ', `${(parseFloat(order.paymentDetails.amount || 0) / 100).toFixed(2)}€`],
        ['Referencia de pago: ', order.paymentDetails.redsysOrderNumber || 'N/A'],
      ];

      // Mostrar datos de pago
      yPos = doc.y;
      paymentData.forEach((row) => {
        doc.text(row[0], 50, yPos, { continued: true, width: 150 })
          .text(row[1], { align: 'left' });
        yPos += 18;
      });
    }

    // Generar QR con el ID del pedido y la URL
    try {
      const baseUrl = process.env.BASE_URL || 'https://whats2want-assistant.com';
      const qrData = `${baseUrl}/orders/${order._id}`;
      const qrImagePath = path.join(pdfDir, `qr_${order._id}.png`);

      // Generar el QR y guardarlo como imagen
      await QRCode.toFile(qrImagePath, qrData, {
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        width: 150,
        margin: 1
      });

      // Verificar si queda suficiente espacio para el footer completo
      const footerHeight = 180; // Altura aproximada del footer completo
      const availableSpace = doc.page.height - doc.y;

      // Si no hay suficiente espacio para el footer, añadir nueva página
      if (availableSpace < footerHeight) {
        doc.addPage();
      }

      // Añadir footer con QR y agradecimiento
      // Posicionar el footer a una distancia fija desde el final de la página actual
      const footerY = doc.page.height - 180;

      // Línea divisoria para el footer
      doc.moveTo(50, footerY - 10)
        .lineTo(doc.page.width - 50, footerY - 10)
        .lineWidth(0.5)
        .stroke();

      // QR a la derecha
      doc.image(qrImagePath, doc.page.width - 170, footerY, {
        fit: [100, 100],
        align: 'right'
      });

      // Contenido del footer a la izquierda
      doc.fontSize(10)
        .font('Helvetica-Bold')
        .text('¡Gracias por tu compra!', 50, footerY + 10)
        .moveDown(0.5);

      doc.fontSize(9)
        .font('Helvetica')
        .text('Escanea el código QR para ver el estado de tu pedido', 50, null, { width: 250 })
        .moveDown(0.5);

      doc.fontSize(8)
        .font('Helvetica')
        .fillColor('#555555')
        .text('Whats2Want Global S.L. • B-76817063 • www.whats2want.com • info@whats2want.com', 50, null, { width: 250 })
        .text('Documento generado electrónicamente • No requiere firma', 50, null, { width: 250 });

      doc.fillColor('black');

      // Eliminar la imagen temporal del QR
      await fs.remove(qrImagePath);
    } catch (qrError) {
      console.error('Error generando QR:', qrError);
    }

    // Finalizando el documento
    doc.end();

    // Esperamos a que se termine de escribir el archivo
    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        console.log(`PDF generado correctamente: ${filePath}`);
        resolve(filePath);
      });
      stream.on('error', (err) => {
        console.error('Error al escribir el PDF:', err);
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error generando PDF de recibo:', error);
    throw error;
  }
};

/**
 * Busca archivos PDF existentes para un pedido
 * @param {string} orderId - ID del pedido
 * @returns {Promise<string[]>} - Array de rutas a archivos PDF
 */
export const findExistingReceipts = async (orderId) => {
  try {
    const pdfDir = path.join(__dirname, '../../public/receipts');
    await fs.ensureDir(pdfDir);

    const files = await fs.readdir(pdfDir);
    const pattern = `receipt_whats2want_${orderId}_`;

    // Filtrar archivos que coinciden con el patrón
    const matchingFiles = files
      .filter(file => file.startsWith(pattern) && file.endsWith('.pdf'))
      .map(file => path.join(pdfDir, file));

    console.log(`Encontrados ${matchingFiles.length} recibos existentes para pedido ${orderId}`);
    return matchingFiles;
  } catch (error) {
    console.error(`Error buscando recibos existentes para ${orderId}:`, error);
    return [];
  }
};