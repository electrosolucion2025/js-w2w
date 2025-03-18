import Business from '../models/business.js';
import User from '../models/user.js';
import redisClient from '../utils/redisClient.js';
import sendMessage from './messageService.js';

const updateUserBusinessCode = async (from, businessCode) => {
  const user = await User.findOne({ whatsappNumber: from });
  const business = await Business.findOne({ code: businessCode });

  if (!user.lastBusinessCode.includes(businessCode)) {
    await User.findOneAndUpdate(
      { whatsappNumber: from },
      {
        businessCode: businessCode,
        $push: { lastBusinessCode: { $each: [businessCode], $slice: -2 } }
      }
    );
  } else {
    await User.findOneAndUpdate(
      { whatsappNumber: from },
      {
        businessCode: businessCode
      }
    );
  }

  // Eliminar la clave tableNumber en Redis si existe
  await redisClient.del(`tableNumber:${from}`);

  await sendMessage(from, `Has seleccionado el código de negocio: *${businessCode}* que pertenece a *${business.name}*`);
  await sendMessage(from, 'Por favor, ingrese el número de mesa');
};

const updateUserBusinessCodeQR = async (from, businessCode) => {
  const user = await User.findOne({ whatsappNumber: from });
  const business = await Business.findOne({ code: businessCode });

  if (!user.lastBusinessCode.includes(businessCode)) {
    await User.findOneAndUpdate(
      { whatsappNumber: from },
      {
        businessCode: businessCode,
        $push: { lastBusinessCode: { $each: [businessCode], $slice: -2 } }
      }
    );
  } else {
    await User.findOneAndUpdate(
      { whatsappNumber: from },
      {
        businessCode: businessCode
      }
    );
  }

  await sendMessage(from, `Has seleccionado el código de negocio: *${businessCode}* que pertenece a *${business.name}*`);
};

const handleBusinessCode = async (from, text) => {
  // Extraer el primer valor numérico del mensaje del usuario
  const match = text.match(/\d+/);
  if (match) {
    const businessCode = parseInt(match[0], 10);
    const business = await Business.findOne({ code: businessCode });
    if (business) {
      await updateUserBusinessCode(from, businessCode);
    } else {
      await sendMessage(from, 'El código de negocio ingresado no es válido. Por favor, inténtelo de nuevo.');
    }
    return true;
  }
  await sendMessage(from, 'Por favor, ingrese un código de negocio válido.');
  return false;
};

const handleTableNumber = async (from, text) => {
  // Extraer el primer valor numérico del mensaje del usuario
  const match = text.match(/\d+/);
  if (match) {
    const tableNumber = parseInt(match[0], 10);
    try {
      await redisClient.set(`tableNumber:${from}`, tableNumber, 'EX', 3600); // Expira en 1 hora
      await sendMessage(from, `Has seleccionado la mesa número: ${tableNumber}, ¿En que te puedo ayudar?`);
    } catch (error) {
      console.error('Error guardando el número de mesa en Redis:', error.message);
    }
    return true;
  }
  await sendMessage(from, 'Por favor, ingrese un número de mesa válido.');
  return false;
};

export { handleBusinessCode, handleTableNumber, updateUserBusinessCode, updateUserBusinessCodeQR };

