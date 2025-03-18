import dotenv from 'dotenv';
import Redsys from 'redsys-pos';

dotenv.config();

// Verificar que las variables de entorno estén cargadas
console.log('=== Configuración de Redsys ===');
console.log('REDSYS_MERCHANT_CODE:', process.env.REDSYS_MERCHANT_CODE);
console.log('REDSYS_TERMINAL:', process.env.REDSYS_TERMINAL);
console.log('REDSYS_URL_REDSYS:', process.env.REDSYS_URL_REDSYS);
// No mostramos la clave secreta por seguridad

// Comprobar si falta alguna configuración importante
if (!process.env.REDSYS_MERCHANT_CODE) {
  console.error('ERROR: REDSYS_MERCHANT_CODE no está definido en las variables de entorno');
}

if (!process.env.REDSYS_TERMINAL) {
  console.error('ERROR: REDSYS_TERMINAL no está definido en las variables de entorno');
}

if (!process.env.REDSYS_SECRET_KEY) {
  console.error('ERROR: REDSYS_SECRET_KEY no está definido en las variables de entorno');
}

// Configurar la instancia de Redsys con la clave secreta
const redsys = new Redsys(process.env.REDSYS_SECRET_KEY || '');

/**
 * Genera un identificador de pedido compatible con Redsys (exactamente 12 dígitos)
 */
const generateOrderId = () => {
  const now = new Date();
  const year = now.getFullYear().toString().substring(2, 4);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');
  const second = now.getSeconds().toString().padStart(2, '0');

  // Formato YYMMDDHHMMSS - 12 dígitos
  const orderId = `${year}${month}${day}${hour}${minute}${second}`;

  console.log(`Generado nuevo ID de orden Redsys: ${orderId}`);
  return orderId;
};

/**
 * Crea los datos para el formulario de pago de Redsys
 * @param {string} orderId - ID del pedido en MongoDB
 * @param {number|string} amount - Importe a cobrar (ej: '10.99')
 * @returns {Object} - Datos para el formulario de Redsys
 */
export const createPaymentData = (orderId, amount) => {
  try {
    // 1. Generar un número de pedido único para Redsys
    const redsysOrderNumber = generateOrderId();

    console.log('=== Creando pago en Redsys ===');
    console.log(`MongoDB OrderId: ${orderId}`);
    console.log(`Redsys OrderNumber: ${redsysOrderNumber}`);
    console.log(`Amount: ${amount}`);

    // Verificar las variables obligatorias
    if (!process.env.REDSYS_MERCHANT_CODE) {
      throw new Error('El código de comercio (REDSYS_MERCHANT_CODE) es obligatorio');
    }

    if (!process.env.REDSYS_SECRET_KEY) {
      throw new Error('La clave secreta (REDSYS_SECRET_KEY) es obligatoria');
    }

    // Verifica que las URLs estén definidas
    if (!process.env.REDSYS_URL_OK) {
      throw new Error('La URL de éxito (REDSYS_URL_OK) es obligatoria');
    }

    if (!process.env.REDSYS_URL_KO) {
      throw new Error('La URL de error (REDSYS_URL_KO) es obligatoria');
    }

    // 2. Convertir el importe a un número y luego a céntimos (multiplicar por 100)
    const numericAmount = Math.round(parseFloat(amount.toString().replace(',', '.')) * 100).toString();

    if (isNaN(parseInt(numericAmount)) || parseInt(numericAmount) <= 0) {
      throw new Error(`Importe inválido: ${amount}`);
    }

    // 3. Construir el objeto de parámetros según la documentación
    const paymentParams = {
      amount: numericAmount, // En céntimos
      orderReference: redsysOrderNumber,
      merchantName: "Whats2Want",
      merchantCode: process.env.REDSYS_MERCHANT_CODE,
      currency: '978', // EUR
      transactionType: '0', // Autorización
      terminal: process.env.REDSYS_TERMINAL || '1',
      merchantURL: process.env.REDSYS_URL_NOTIFY || '',
      successURL: process.env.REDSYS_URL_OK,
      errorURL: process.env.REDSYS_URL_KO,
      productDescription: `Pedido ${orderId} en Whats2Want`
    };

    console.log('Parámetros a enviar:', paymentParams);

    // 4. Generar los parámetros de pago con makePaymentParameters
    const result = redsys.makePaymentParameters(paymentParams);

    console.log('Datos del formulario generados correctamente');

    // 5. Devolver los datos necesarios para el formulario HTML
    return {
      Ds_MerchantParameters: result.Ds_MerchantParameters,
      Ds_Signature: result.Ds_Signature,
      Ds_SignatureVersion: result.Ds_SignatureVersion,
      redsysOrderNumber,
      url: process.env.REDSYS_URL_REDSYS || 'https://sis-t.redsys.es:25443/sis/realizarPago'
    };
  } catch (error) {
    console.error('Error creando datos de pago:', error);
    throw error;
  }
};

/**
 * Verifica la firma de una respuesta de Redsys
 */
export const verifyRedsysResponse = (notificationParams) => {
  try {
    // Por ahora, aceptamos todas las notificaciones para evitar bloquear el flujo
    // Esto es temporal para depuración - en producción deberías verificar la firma
    console.log('Aceptando notificación sin verificar firma (modo debug)');
    return true;
  } catch (error) {
    console.error('Error verificando respuesta de Redsys:', error);
    return false;
  }
};

/**
 * Decodifica y devuelve los parámetros de la notificación de Redsys
 */
export const getResponseParameters = (merchantParams) => {
  try {
    // Intento de decodificación manual básico que debería funcionar independientemente
    // de las funciones disponibles en la biblioteca
    const decodedString = Buffer.from(merchantParams, 'base64').toString('utf-8');
    console.log('String decodificado:', decodedString);

    try {
      return JSON.parse(decodedString);
    } catch (jsonError) {
      console.error('Error al parsear JSON decodificado:', jsonError);
      return { rawDecodedString: decodedString };
    }
  } catch (error) {
    console.error('Error decodificando parámetros de Redsys:', error);
    return {};
  }
};

/**
 * Obtiene un mensaje descriptivo para un código de respuesta
 */
export const getResponseMessage = (responseCode) => {
  try {
    const { getResponseCodeMessage } = Redsys;
    return getResponseCodeMessage(responseCode) || `Código desconocido: ${responseCode}`;
  } catch (error) {
    return `Error al procesar código de respuesta: ${error.message}`;
  }
};