import mongoose from 'mongoose';
import Order from '../models/order.js';
import { createPaymentData } from '../services/redsysService.js';

export const renderPaymentForm = async (req, res) => {
  try {
    // 1. Obtener parámetros de la solicitud
    const { orderId } = req.params;
    const amount = req.query.amount;

    console.log('=== Procesando solicitud de pago ===');
    console.log(`OrderId: ${orderId}`);
    console.log(`Amount: ${amount}`);
    console.log(`¿Es un ObjectId válido?: ${mongoose.Types.ObjectId.isValid(orderId)}`);

    // 2. Validar los parámetros recibidos
    if (!orderId) {
      return res.status(400).send('ID de pedido requerido');
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.error(`ID de pedido inválido: ${orderId}`);
      return res.status(400).send(`ID de pedido inválido: ${orderId}`);
    }

    if (!amount || isNaN(parseFloat(amount.toString().replace(',', '.'))) || parseFloat(amount) <= 0) {
      console.error(`Importe inválido: ${amount}`);
      return res.status(400).send(`Importe inválido: ${amount}`);
    }

    // 3. Buscar el pedido en la base de datos
    console.log(`Buscando pedido con ID: ${orderId}`);

    try {
      const someOrders = await Order.find().limit(3);
      console.log(`Número de pedidos encontrados en la BD: ${someOrders.length}`);
      if (someOrders.length > 0) {
        console.log(`Ejemplo de pedido en BD: ${someOrders[0]._id}`);
      }
    } catch (dbError) {
      console.error('Error al consultar pedidos de prueba:', dbError);
    }

    const order = await Order.findById(orderId);

    if (!order) {
      console.error('Pedido no encontrado en la BD.');
      return res.status(404).send('Pedido no encontrado');
    }

    // Verificar si el pedido ya está pagado o en proceso de pago
    if (order.status === 'paid' || order.status === 'processing') {
      console.log(`Pedido ${order._id} ya está ${order.status}, redirigiendo a página de estado`);

      // Mostrar página indicando que el pedido ya está pagado
      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Estado del pedido</title>
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
            .icon {
              font-size: 64px;
              margin-bottom: 20px;
            }
            h1 { color: #3498db; }
            .return-link {
              display: inline-block;
              margin-top: 20px;
              background: #3498db;
              color: white;
              padding: 12px 25px;
              text-decoration: none;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">${order.status === 'paid' ? '✅' : '⏳'}</div>
            <h1>${order.status === 'paid' ? 'Pedido ya pagado' : 'Pago en proceso'}</h1>
            <p>
              ${order.status === 'paid'
          ? 'Este pedido ya ha sido pagado correctamente. No es necesario realizar otro pago.'
          : 'El pago para este pedido está siendo procesado. Por favor, espera la confirmación.'}
            </p>
            <a href="${process.env.BASE_URL}" class="return-link">Volver a la tienda</a>
          </div>
        </body>
        </html>
      `);
    }

    // Marcar el pedido como "en proceso de pago" para evitar pagos duplicados
    // order.status = 'processing'; // Modificar para que pablo no se quede pensando
    // await order.save();
    // console.log(`Pedido ${order._id} marcado como 'processing' para iniciar pago`);

    // 4. Crear los datos de pago para Redsys
    // Asegúrate de que esta parte guarda correctamente el redsysOrderId en el pedido
    const paymentData = createPaymentData(orderId, amount);
    console.log('Datos de pago generados:', paymentData);

    // Actualizar el pedido con el número de orden de Redsys
    order.redsysOrderId = paymentData.redsysOrderNumber;
    await order.save();
    console.log(`Pedido actualizado con redsysOrderId: ${paymentData.redsysOrderNumber}`);

    // 6. Renderizar el formulario de pago con auto-submit
    const paymentForm = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Procesando pago</title>
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
          h1 { color: #333; }
          .loader {
            border: 5px solid #f3f3f3;
            border-radius: 50%;
            border-top: 5px solid #3498db;
            width: 50px;
            height: 50px;
            margin: 20px auto;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .info { 
            color: #666; 
            font-size: 14px; 
            margin: 20px 0; 
          }
          #countdown {
            font-weight: bold;
            color: #3498db;
          }
          button { 
            background: #4CAF50; 
            color: white; 
            padding: 12px 25px; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 16px; 
            margin-top: 20px; 
          }
          .payment-data { 
            text-align: left; 
            background: #f9f9f9; 
            padding: 15px; 
            margin-top: 20px; 
            border-radius: 4px;
            font-size: 12px;
            display: none;
          }
          .show-details-btn {
            background: none;
            border: none;
            color: #0066cc;
            cursor: pointer;
            text-decoration: underline;
            font-size: 14px;
            margin-top: 20px;
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Procesando tu pago</h1>
          <div class="loader"></div>
          <p>Serás redirigido a la plataforma de pago en <span id="countdown">1</span> segundo...</p>
          <p class="info">Importe a pagar: ${amount}€</p>
          
          <form id="paymentForm" action="${paymentData.url}" method="POST">
            <input type="hidden" name="Ds_MerchantParameters" value="${paymentData.Ds_MerchantParameters}" />
            <input type="hidden" name="Ds_Signature" value="${paymentData.Ds_Signature}" />
            <input type="hidden" name="Ds_SignatureVersion" value="${paymentData.Ds_SignatureVersion}" />
            <button type="submit">Continuar al pago ahora</button>
          </form>
          
          <button class="show-details-btn" onclick="toggleDetails()">Mostrar detalles técnicos</button>
          
          <div id="paymentData" class="payment-data">
            <h4>Datos de pago</h4>
            <p>OrderId: ${orderId}</p>
            <p>Redsys OrderNumber: ${paymentData.redsysOrderNumber}</p>
            <p>URL: ${paymentData.url}</p>
          </div>
        </div>
        
        <script>
          // Contador para la redirección automática
          let seconds = 1;
          const countdownElem = document.getElementById('countdown');
          
          const countdown = setInterval(() => {
            seconds--;
            countdownElem.innerText = seconds;
            
            if (seconds <= 0) {
              clearInterval(countdown);
              submitForm();
            }
          }, 1000);
          
          // Función para enviar el formulario
          function submitForm() {
            try {
              console.log('Enviando formulario de pago...');
              document.getElementById('paymentForm').submit();
            } catch (error) {
              console.error('Error enviando formulario:', error);
              alert('Error al procesar el pago. Por favor, haz clic en "Continuar al pago ahora".');
            }
          }
          
          // Función para mostrar/ocultar detalles técnicos
          function toggleDetails() {
            const details = document.getElementById('paymentData');
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
          }
        </script>
      </body>
      </html>
    `;

    console.log('Renderizando formulario de pago...');
    res.send(paymentForm);
  } catch (error) {
    console.error('Error al generar formulario de pago:', error);
    res.status(500).send(`
      <html>
      <head>
        <title>Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 20px; }
          .error { color: red; }
          .details { text-align: left; background: #f9f9f9; padding: 15px; margin-top: 20px; font-size: 14px; }
        </style>
      </head>
      <body>
        <h1 class="error">Error al procesar el pago</h1>
        <p>${error.message}</p>
        <div class="details">
          <p><strong>Detalles técnicos:</strong></p>
          <p>${error.stack}</p>
        </div>
      </body>
      </html>
    `);
  }
};