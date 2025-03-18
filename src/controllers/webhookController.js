import User from '../models/user.js';
import { transcribeAudio } from '../services/audioTranscriptionService.js';
import { updateUserBusinessCode, updateUserBusinessCodeQR } from '../services/businessCodeService.js';
import sendInteractiveMessage from '../services/interactiveMessageService.js';
import detectLanguage from '../services/languageDetectionService.js';
import processMessage from '../services/messageProcessorService.js';
import sendMessage from '../services/messageService.js';
import redisClient from '../utils/redisClient.js';

/**
 * Maneja la respuesta cuando el usuario pulsa "Entendido" en el mensaje de bienvenida
 * @param {string} from - Número de WhatsApp del usuario
 */
const handleAcknowledgeResponse = async (from) => {
  try {
    // Obtener el idioma del usuario
    const userLanguage = await redisClient.get(`userLanguage:${from}`) || 'es';

    // Preparar mensajes según el idioma
    let encourageMessage;

    switch (userLanguage) {
      case '[en]':
        encourageMessage = "Perfect! 🍽️ You are now ready to start enjoying.";
        break;
      case '[de]':
        encourageMessage = "Perfekt! 🍽️ Jetzt können Sie mit dem Genießen beginnen.";
        break;
      case '[fr]':
        encourageMessage = "Parfait! 🍽️ Vous êtes maintenant prêt à commencer à en profiter.";
        break;
      case '[it]':
        encourageMessage = "Perfetto! 🍽️ Ora sei pronto per iniziare a divertirti.";
        break;
      default:
        encourageMessage = "¡Perfecto! 🍽️ Ya estas listo para comenzar a disfrutar.";
        break;
    }

    // Enviar mensaje de ánimo para pedir
    await sendMessage(from, encourageMessage);
    console.log(`Mensaje de ánimo para pedir enviado a ${from}`);
  } catch (error) {
    console.error(`Error enviando mensaje de ánimo tras "Entendido":`, error);
  }
};

const handleAcceptPolicy = async (from) => {
  // Verificar si el usuario ya había aceptado las políticas antes
  const existingUser = await User.findOne({ whatsappNumber: from });
  const isFirstTimeAccepting = !existingUser || existingUser.acceptPolicy !== true;

  // Actualizar usuario con aceptación de políticas
  await User.findOneAndUpdate(
    { whatsappNumber: from },
    {
      whatsappNumber: from,
      acceptPolicy: true,
      acceptPolicyAt: new Date()
    },
    { upsert: true }
  );

  // Obtener el idioma preferido del usuario desde Redis y limpiarlo
  let userLanguage = await redisClient.get(`userLanguage:${from}`);
  userLanguage = userLanguage ? userLanguage.trim().toLowerCase() : 'es';

  // Si es la primera vez que acepta, enviar el GIF de bienvenida
  if (isFirstTimeAccepting) {
    try {
      console.log(`Enviando GIF de bienvenida a ${from} (primera aceptación de políticas)`);

      // URL del GIF de bienvenida 
      const videoFileName = "welcome-video.mp4";

      let imageCaption = '¡Bienvenido a Whats2Want! 🎉\n\nEstamos encantados de tenerte con nosotros.\n\nGracias por aceptar nuestras políticas de privacidad.';

      switch (userLanguage) {
        case '[en]':
          imageCaption = 'Welcome to Whats2Want! 🎉\n\nWe are delighted to have you with us.\n\nThank you for accepting our privacy policies.';
          break;
        case '[de]':
          imageCaption = 'Willkommen bei Whats2Want! 🎉\n\nWir freuen uns, Sie bei uns zu haben.\n\nVielen Dank, dass Sie unsere Datenschutzrichtlinien akzeptiert haben.';
          break;
        case '[fr]':
          imageCaption = 'Bienvenue à Whats2Want! 🎉\n\nNous sommes ravis de vous avoir parmi nous.\n\nMerci d\'avoir accepté nos politiques de confidentialité.';
          break;
        case '[it]':
          imageCaption = 'Benvenuto a Whats2Want! 🎉\n\nSiamo felici di averti con noi.\n\nGrazie per aver accettato le nostre politiche sulla privacy.';
          break;
      }

      const baseUrl = process.env.BASE_URL;
      const videoUrl = `${baseUrl}/medias/videos/${videoFileName}`;

      await sendInteractiveMessage(
        from,
        imageCaption,
        [],
        true,
        {
          header: {
            type: 'video',
            link: videoUrl
          },
          footer: 'Powered by Whats2Want Global S.L.'
        }
      );

      // Añadir un delay de 2 segundos
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log(`GIF de bienvenida enviado a ${from}. Ya pasamos a preguntar el negocio.................`);

      // Guardar en Redis que el usuario ya recibió el GIF para evitar duplicados
      // await redisClient.set(`welcome_video_sent:${from}`, '1', 'EX', 60 * 60 * 24 * 30);
    } catch (gifError) {
      console.error(`Error enviando GIF de bienvenida a ${from}:`, gifError);
      // Continuar con el flujo aunque falle el GIF
    }
  }

  // Verificar si hay un mensaje QR pendiente
  const qrMessage = await redisClient.get(`qrMessage:${from}`);
  if (qrMessage) {
    const { businessCode, tableNumber } = JSON.parse(qrMessage);
    try {
      await updateUserBusinessCodeQR(from, businessCode);
      await redisClient.set(`tableNumber:${from}`, tableNumber, 'EX', 3600); // Expira en 1 hora

      // Mensaje de confirmación de QR en el idioma correcto
      let qrConfirmMessage = 'Gracias por usar el QR. En breve le atenderá un camarero experto. Mientras puede ir haciendo su pedido.';
      if (userLanguage === 'en') qrConfirmMessage = 'Thanks for using the QR. An expert waiter will assist you shortly. In the meantime, you can start placing your order.';
      if (userLanguage === 'de') qrConfirmMessage = 'Vielen Dank für die Verwendung des QR-Codes. Ein Fachkellner wird Sie in Kürze bedienen. In der Zwischenzeit können Sie Ihre Bestellung aufgeben.';
      if (userLanguage === 'fr') qrConfirmMessage = 'Merci d\'avoir utilisé le QR. Un serveur expert vous assistera sous peu. En attendant, vous pouvez commencer à passer votre commande.';
      if (userLanguage === 'it') qrConfirmMessage = 'Grazie per aver utilizzato il QR. Un cameriere esperto ti assisterà a breve. Nel frattempo, puoi iniziare a effettuare il tuo ordine.';

      await sendMessage(from, qrConfirmMessage);
    } catch (error) {
      await sendMessage(from, 'Codigo de comercio o mesa incorrecto, por favor intente de nuevo.');
      console.error('Error asignando código de comercio y número de mesa:', error.message);
    }
    await redisClient.del(`qrMessage:${from}`);
  } else {
    // Enviar mensaje interactivo para seleccionar el código de negocio
    const user = await User.findOne({ whatsappNumber: from });
    const lastBusinessCodes = user.lastBusinessCode || [];
    const options = lastBusinessCodes.slice(-2).map(code => ({
      id: `business_code_${code}`,
      title: code
    }));

    options.push({ id: 'enter_business_code', title: 'Lo escribiré' });

    // Mensaje de selección de código en el idioma correcto
    let selectCodeMessage = '📁 Seleccione el código de negocio donde se encuentra:';
    if (userLanguage === 'en') selectCodeMessage = '📁 Select the business code where you are located:';
    if (userLanguage === 'de') selectCodeMessage = '📁 Wählen Sie den Geschäftscode aus, wo Sie sich befinden:';
    if (userLanguage === 'fr') selectCodeMessage = '📁 Sélectionnez le code de l\'entreprise où vous vous trouvez:';
    if (userLanguage === 'it') selectCodeMessage = '📁 Seleziona il codice dell\'azienda in cui ti trovi:';

    await sendInteractiveMessage(from, selectCodeMessage, options);
  }
};

const handleRejectPolicy = async (from) => {
  await User.findOneAndUpdate(
    { whatsappNumber: from },
    {
      whatsappNumber: from,
      acceptPolicy: false,
      acceptPolicyAt: new Date()
    },
    { upsert: true }
  );

  // Obtener el idioma preferido del usuario desde Redis
  const userLanguage = await redisClient.get(`userLanguage:${from}`) || 'es';

  // Mensaje de rechazo en el idioma apropiado
  let rejectMessage = 'Lamentamos que no aceptes nuestras políticas de privacidad.';
  if (userLanguage === 'en') rejectMessage = 'We regret that you do not accept our privacy policies.';
  if (userLanguage === 'de') rejectMessage = 'Wir bedauern, dass Sie unsere Datenschutzrichtlinien nicht akzeptieren.';
  if (userLanguage === 'fr') rejectMessage = 'Nous regrettons que vous n\'acceptiez pas nos politiques de confidentialité.';
  if (userLanguage === 'it') rejectMessage = 'Ci dispiace che tu non accetti le nostre politiche sulla privacy.';

  await sendMessage(from, rejectMessage);
};

const handleBusinessCodeSelection = async (from, businessCode) => {
  await updateUserBusinessCode(from, businessCode);
};

const handleInteractiveMessage = async (message) => {
  const interactiveResponse = message.interactive.button_reply.id;
  const from = message.from;

  if (interactiveResponse === 'accept_policy_yes') {
    await handleAcceptPolicy(from);
  } else if (interactiveResponse === 'accept_policy_no') {
    await handleRejectPolicy(from);
  } else if (interactiveResponse.startsWith('business_code_')) {
    const businessCode = interactiveResponse.split('_').pop();
    await handleBusinessCodeSelection(from, businessCode);
  } else if (interactiveResponse === 'enter_business_code') {
    await sendMessage(from, 'Por favor, ingrese manualmente el código de negocio donde se encuentra.');
  } else if (interactiveResponse === 'acknowledge') {
    await handleAcknowledgeResponse(from);
  }
};

class WebhookController {
  verifyWebhook = (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token === VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }

  webhook = async (req, res) => {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      body.entry.forEach(entry => {
        const changes = entry.changes;
        changes.forEach(change => {
          const value = change.value;
          const messages = value.messages;
          const contacts = value.contacts;
          if (messages && contacts) {
            messages.forEach(async (message) => {
              const messageId = message.id;
              const isDuplicate = await redisClient.get(`messageId:${messageId}`);

              if (isDuplicate) {
                console.log(`Duplicate message received: ${messageId}`);
                return;
              }

              // Guardar el ID del mensaje en Redis
              await redisClient.set(`messageId:${messageId}`, 'true', 'EX', 900);

              try {
                // Verificar si ya existe una preferencia de idioma guardada
                let detectedLanguage = await redisClient.get(`userLanguage:${message.from}`);
                let isNewLanguageDetection = false;

                // Si no hay idioma establecido, detectamos uno nuevo
                if (!detectedLanguage) {
                  console.log(`No idioma previo para ${message.from}, detectando nuevo...`);
                  detectedLanguage = 'es'; // Valor predeterminado
                  isNewLanguageDetection = true;

                  let messageText = '';
                  if (message.type === 'text') {
                    messageText = message.text.body;

                    // Solo intentar detectar el idioma si el mensaje no es demasiado corto ni solo números
                    const isNumber = /^\d+$/.test(messageText.trim());

                    if (!isNumber) {
                      const newDetectedLanguage = await detectLanguage(messageText);

                      // Solo actualizar el idioma detectado si es uno de los idiomas soportados
                      if (['es', 'en', 'de', 'fr', 'it'].includes(newDetectedLanguage.trim().toLowerCase())) {
                        detectedLanguage = newDetectedLanguage.trim().toLowerCase();
                        console.log(`Primer idioma detectado para ${message.from}: [${detectedLanguage}]`);
                      } else {
                        console.log(`Idioma no soportado detectado (${newDetectedLanguage}), usando idioma predeterminado: [${detectedLanguage}]`);
                      }
                    } else {
                      console.log(`Primer mensaje demasiado corto o numérico: "${messageText}". Usando idioma predeterminado: [${detectedLanguage}]`);
                    }
                  }

                  // Guardar el idioma detectado en Redis SOLO la primera vez
                  await redisClient.set(`userLanguage:${message.from}`, detectedLanguage, 'EX', 3600); // Expira en 1 hora
                  console.log(`Idioma establecido para ${message.from}: [${detectedLanguage}]`);
                } else {
                  console.log(`Usando idioma previamente detectado para ${message.from}: [${detectedLanguage}]`);
                }

                // Continuar con el flujo normal
                if (message.type === 'interactive') {
                  await handleInteractiveMessage(message);
                }
                // Nueva condición para mensajes de audio
                else if (message.type === 'audio') {
                  console.log('Audio message received, processing...');

                  // Obtener el ID del audio
                  const audioId = message.audio.id;
                  const from = message.from;

                  // Obtener el idioma preferido del usuario (si existe)
                  const preferredLanguage = await redisClient.get(`userLanguage:${from}`);

                  let listeningMessage = '🎧 Estoy escuchando tu mensaje de voz...';
                  if (preferredLanguage === 'en') listeningMessage = '🎧 I\'m listening to your voice message...';
                  if (preferredLanguage === 'de') listeningMessage = '🎧 Ich höre mir deine Sprachnachricht an...';
                  if (preferredLanguage === 'fr') listeningMessage = '🎧 J\'écoute votre message vocal...';
                  if (preferredLanguage === 'it') listeningMessage = '🎧 Sto ascoltando il tuo messaggio vocale...';

                  await sendMessage(from, listeningMessage);

                  try {
                    // Transcribir el audio a texto con soporte para idioma detectado
                    const { text: transcription, detectedLanguage, wasTranslated, originalLanguage } =
                      await transcribeAudio(audioId, preferredLanguage);

                    console.log(`Audio transcribed: ${transcription}`);

                    // Si el audio fue traducido porque estaba en un idioma no soportado,
                    // informamos al usuario y seguimos en inglés
                    if (wasTranslated) {
                      const translationNotice = `🔄 Tu mensaje estaba en un idioma que no soportamos (${originalLanguage}). He traducido tu mensaje a inglés para poder ayudarte mejor.`;
                      await sendMessage(from, translationNotice);
                      await redisClient.set(`userLanguage:${from}`, 'en', 'EX', 3600); // Cambiar preferencia a inglés
                      detectedLanguage = 'en';
                    } else if (!preferredLanguage) {
                      // Actualizar el idioma detectado en Redis solo si no había uno antes
                      await redisClient.set(`userLanguage:${from}`, detectedLanguage, 'EX', 3600);
                    }

                    // Crear mensaje "text" simulado con la transcripción
                    const textMessage = {
                      ...message,
                      type: 'text',
                      text: { body: transcription },
                      audio: undefined // Eliminar el objeto audio
                    };

                    // Procesar el mensaje como si fuera texto
                    await processMessage(textMessage, contacts, detectedLanguage);
                  } catch (transcriptionError) {
                    console.error('Error processing audio:', transcriptionError);

                    let errorMessage = 'Lo siento, no pude entender tu mensaje de voz. ¿Podrías intentar enviar un mensaje de texto?';
                    if (preferredLanguage === 'en') errorMessage = 'Sorry, I couldn\'t understand your voice message. Could you try sending a text message?';
                    if (preferredLanguage === 'de') errorMessage = 'Entschuldigung, ich konnte deine Sprachnachricht nicht verstehen. Könntest du versuchen, eine Textnachricht zu senden?';
                    if (preferredLanguage === 'fr') errorMessage = 'Désolé, je n\'ai pas pu comprendre votre message vocal. Pourriez-vous essayer d\'envoyer un message texte?';
                    if (preferredLanguage === 'it') errorMessage = 'Mi dispiace, non ho potuto capire il tuo messaggio vocale. Potresti provare a inviare un messaggio di testo?';

                    await sendMessage(from, errorMessage);
                  }
                }
                else {
                  await processMessage(message, contacts, detectedLanguage);
                }
              } catch (error) {
                console.error('Error processing message:', error);
                const from = message.from;
                await sendMessage(from, 'Lo siento, ocurrió un error al procesar tu mensaje. Por favor, inténtalo de nuevo.');
              }
            });
          }
        });
      });
      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.sendStatus(404);
    }
  }
}

export default WebhookController;