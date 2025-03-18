import Business from '../models/business.js';
import Session from '../models/session.js';
import User from '../models/user.js';
import { generateMenuJSON } from '../utils/menuUtils.js';
import redisClient from '../utils/redisClient.js';
import { handleBusinessCode, handleTableNumber, updateUserBusinessCodeQR } from './businessCodeService.js';
import sendInteractiveMessage from './interactiveMessageService.js';
import { handleMenuResponse } from './menuResponseService.js';
import { storeBotMessageInQueue, storeMessageInQueue } from './messageQueueService.js';
import sendMessage from './messageService.js';
import { createNewSession, getSessionData, updateSessionHistory } from './sessionService.js';

const updateUserProfile = async (from, profileName) => {
  try {
    const user = await User.findOneAndUpdate(
      { whatsappNumber: from },
      {
        whatsappNumber: from,
        profileName: profileName,
        updatedAt: new Date(),
      },
      {
        new: true, // Return the updated document
        upsert: true, // Create a new document if one doesn't match the filter
      }
    );
    console.log(`User ${profileName} registered/updated with number ${from}`);
    return user;
  } catch (error) {
    console.error('Error registrando/actualizando usuario:', error.message);
    throw error;
  }
};

const sendPrivacyPolicyMessage = async (from) => {
  const messageContent = '¿Aceptas nuestras políticas de privacidad?';
  try {
    await sendInteractiveMessage(
      from,
      'Whats2Want Global S.L., como responsable, trata tus datos para prestar los servicios solicitados (art. 6.1.b GDPR) y enviar comunicaciones con tu consentimiento (art. 6.1.a GDPR).\n\n Se conservarán el tiempo necesario y no se cederán salvo obligación legal. Más info en el enlace:\n\nhttps://www.whats2want.com/politica-de-privacidad\n\n ¿Aceptas las poíticas?',
      [
        { id: 'accept_policy_yes', title: 'Sí' },
        { id: 'accept_policy_no', title: 'No' }
      ],
      true,
      {
        header: {
          type: 'text',
          text: 'Políticas de privacidad'
        },
        footer: 'Powered by Whats2Want Global S.L.'
      }
    )

  } catch (error) {
    console.error('Error enviando mensaje de políticas de privacidad:', error.message);
    throw error;
  }
};

const sendBusinessCodeOptions = async (from, user) => {
  try {
    const lastBusinessCodes = user.lastBusinessCode || [];
    const businesses = await Business.find({ code: { $in: lastBusinessCodes } });

    const options = businesses.slice(-2).map((business) => {
      const title = `${business.code} - ${business.shortName}`;
      return {
        id: `business_code_${business.code}`,
        title: title.length > 20 ? `${title.slice(0, 17)}...` : title,
      };
    });

    options.push({ id: 'enter_business_code', title: 'Lo escribiré' });

    const messageContent = '📁 Seleccione el código de negocio donde se encuentra:';
    await sendInteractiveMessage(from, messageContent, options);

  } catch (error) {
    console.error('Error enviando opciones de código de negocio:', error.message);
    throw error;
  }
};

// Actualizar la firma de la función para incluir el idioma detectado
const processMessage = async (message, contacts, detectedLanguage = 'es') => {
  const from = message.from; // Phone number of the sender
  const waId = message.id; // WhatsApp message ID
  const contact = contacts.find((contact) => contact.wa_id === from);
  const profileName = contact ? contact.profile.name : 'User'; // Name of the sender
  const text = message.text.body; // Text message

  console.log(`Received message from ${from}: ${text}`);

  let user;
  user = await updateUserProfile(from, profileName);

  // Manejar el comando !cerrar_sesion
  if (text.trim() === '!cerrar_sesion') {
    try {
      // Obtener la sesión de Redis
      let sessionData = await redisClient.get(`session:${from}`);
      if (sessionData) {
        sessionData = JSON.parse(sessionData);

        // Volcar la sesión a la base de datos
        await Session.updateOne(
          { sessionId: sessionData.sessionId },
          {
            $set: {
              userId: sessionData.userId,
              startedAt: sessionData.startedAt,
              lastMessageAt: sessionData.lastMessageAt,
              isActive: false,
              fullHistory: sessionData.fullHistory,
            },
          },
          { upsert: true }
        );

        // Borrar la sesión de Redis
        await redisClient.del(`session:${from}`);

        // Establecer el businessCode del usuario a null
        await User.updateOne({ _id: user._id }, { $set: { businessCode: null } });

        // Borrar el número de mesa de la sesión
        await redisClient.del(`tableNumber:${from}`);

        // Borrar la preferencia de idioma
        await redisClient.del(`userLanguage:${from}`);

        // Borrar menu
        // Delete menu from Redis if exists
        // Get the business ID from the user's business code
        let business = null;
        if (user.businessCode) {
          business = await Business.findOne({ code: user.businessCode });
        }
        const businessId = business ? business._id.toString() : null;
        if (businessId) {
          await redisClient.del(`menu:${businessId}`);
        }

        console.log(`Session for user ${from} closed and saved to DB.`);
        await sendMessage(from, 'Tu sesión ha sido cerrada y guardada.');
      } else {
        await sendMessage(from, 'No hay sesión activa para cerrar.');
      }
    } catch (error) {
      console.error('Error cerrando la sesión:', error.message);
      await sendMessage(from, 'Hubo un error al cerrar tu sesión.');
    }
    return;
  }

  // Generar un nuevo ID de sesión si no existe
  let sessionData = await getSessionData(from);
  if (!sessionData) {
    sessionData = await createNewSession(from, user._id);
  }

  // Actualizar la última actividad de la sesión en Redis
  await redisClient.set(`session:${from}`, JSON.stringify(sessionData), 'EX', 1800); // Expira en 1 hora

  // Actualizar el historial completo en Redis
  await updateSessionHistory(from, sessionData, 'user', text);

  // Detectar mensaje QR
  const qrMatch = text.match(/\[(\d+)\].*\[(\d+)\]/);
  if (qrMatch) {
    const businessCode = qrMatch[1];
    const tableNumber = qrMatch[2];

    // Verificar si el usuario ha aceptado las políticas
    if (!user.acceptPolicy) {
      await redisClient.set(`qrMessage:${from}`, JSON.stringify({ businessCode, tableNumber }), 'EX', 120); // Expira en 2 minutos
      await sendPrivacyPolicyMessage(from);
      return;
    }

    // Asignar código de comercio y número de mesa
    try {
      await updateUserBusinessCodeQR(from, businessCode);
      await redisClient.set(`tableNumber:${from}`, tableNumber, 'EX', 1800); // Expira en 1 hora
      await sendMessage(from, 'Genial muchisimas gracias por tu mensaje. Enseguida te atiende nuestro mejor camarero, puede ir realizando su pedido.');
    } catch (error) {
      await sendMessage(from, 'Codigo de comercio o mesa incorrecto, por favor intente de nuevo.');
      console.error('Error asignando código de comercio y número de mesa:', error.message);
    }
    return;
  }

  if (!user.acceptPolicy) {
    await sendPrivacyPolicyMessage(from);
    return;
  }

  if (!user.businessCode) {
    const numberMatch = text.match(/\d+/);
    if (numberMatch && (await handleBusinessCode(from, numberMatch[0]))) {
      return;
    }
    await sendBusinessCodeOptions(from, user);
    return;
  }

  try {
    const tableNumber = await redisClient.get(`tableNumber:${from}`);
    if (!tableNumber) {
      if (await handleTableNumber(from, text)) {
        return;
      }
    } else {
      // Obtener el prompt del negocio
      let business;
      try {
        business = await Business.findOne({ code: user.businessCode });
      } catch (error) {
        console.error('Error obteniendo el negocio:', error.message);
      }

      // Almacenar mensaje del usuario en la cola
      storeMessageInQueue({
        waId,
        from,
        to: 'bot',
        content: text,
        role: 'user',
        businessCode: user.businessCode,
        sessionId: sessionData.sessionId,
      });

      if (business && business.defaultPrompt) {
        // Generar respuesta con OpenAI usando el prompt del negocio y el historial de mensajes
        try {
          // Recuperar el historial completo desde Redis
          let fullHistory = sessionData.fullHistory;

          // Llamar a la función generateMenuJSON e imprimir el JSON
          const menuJSON = await generateMenuJSON(business._id);

          // Usar el idioma detectado al llamar a handleMenuResponse:
          const openAIResponse = await handleMenuResponse(
            text,
            menuJSON,
            business.defaultPrompt,
            fullHistory,
            user._id,
            business._id,
            tableNumber,
            detectedLanguage // Nuevo parámetro
          )
          await sendMessage(from, openAIResponse);

          // Almacenar mensaje del bot en la cola
          await storeBotMessageInQueue(from, openAIResponse, user, sessionData);

          // Actualizar el historial completo en Redis
          await updateSessionHistory(from, sessionData, 'assistant', openAIResponse);
        } catch (error) {
          console.error('Error generando respuesta con OpenAI:', error.message);
        }
      } else {
        const responseMessage = 'Gracias por tu mensaje. Estamos procesando tu pedido.';
        await sendMessage(from, responseMessage);

        // Almacenar mensaje del bot en la cola
        await storeBotMessageInQueue(from, responseMessage, user, sessionData);

        // Actualizar el historial completo en Redis
        await updateSessionHistory(from, sessionData, 'assistant', responseMessage);
      }
    }
  } catch (error) {
    console.error('Error manejando el número de mesa:', error.message);
  }
};

export default processMessage;