import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from 'axios';
import redisClient from '../utils/redisClient.js';

// Inicializar el cliente de Google Gemini para traducción
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash", // Modelo más rápido para traducciones simples
  generationConfig: { temperature: 0.2 }
});

// Cache en memoria para traducciones frecuentes
const translationCache = new Map();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 horas
const CACHE_SIZE_LIMIT = 500; // Máximo de entradas en caché

/**
 * Envía un mensaje interactivo con o sin botones, con traducción automática si es necesario
 * @param {string} to - Número de teléfono del destinatario
 * @param {string} text - Texto del mensaje (en español por defecto)
 * @param {Array} buttons - Array de objetos botón con id y title (opcional)
 * @param {boolean} autoTranslate - Si se debe traducir automáticamente según el idioma del usuario
 * @param {Object} options - Opciones adicionales para el mensaje
 * @param {Object} options.header - Configuración del encabezado (opcional)
 * @param {string} options.header.type - Tipo de encabezado: 'text', 'image', 'document' o 'video'
 * @param {string} options.header.text - Texto del encabezado (si type es 'text')
 * @param {string} options.header.link - URL de la imagen, documento o video (si type no es 'text')
 * @param {string} options.footer - Texto del pie de página (opcional)
 * @returns {Promise<void>}
 */
const sendInteractiveMessage = async (to, text, buttons = [], autoTranslate = true, options = {}) => {
  try {
    let finalText = text;
    let finalButtons = buttons && buttons.length ? [...buttons] : []; // Si no hay botones, array vacío
    let finalHeader = options.header ? { ...options.header } : null;
    let finalFooter = options.footer;
    let cleanLanguage = 'es';

    // Verificar si se requiere traducción automática
    if (autoTranslate) {
      const userLanguage = await redisClient.get(`userLanguage:${to}`);
      cleanLanguage = userLanguage ? userLanguage.trim().toLowerCase() : 'es';

      if (cleanLanguage !== 'es' && ['en', 'de', 'fr', 'it'].includes(cleanLanguage)) {
        // Traducir el texto principal
        finalText = await translateText(text, cleanLanguage);

        // Traducir botones si existen
        if (finalButtons.length) {
          const buttonTitles = finalButtons.map(button => button.title);
          const translatedTitles = await translateBatchTexts(buttonTitles, cleanLanguage);

          finalButtons = finalButtons.map((button, index) => {
            let translatedTitle = translatedTitles[index] || button.title;
            if (translatedTitle.length > 20) {
              translatedTitle = translatedTitle.substring(0, 17) + '...';
            }
            return { id: button.id, title: translatedTitle };
          });
        }

        // Traducir encabezado de texto si existe
        if (finalHeader && finalHeader.type === 'text' && finalHeader.text) {
          finalHeader.text = await translateText(finalHeader.text, cleanLanguage);
        }

        // Traducir pie de página si existe
        if (finalFooter) {
          finalFooter = await translateText(finalFooter, cleanLanguage);
        }
      }
    }

    // Validar y limitar botones si existen
    if (finalButtons.length) {
      finalButtons = finalButtons.map(button => {
        let safeTitle = button.title;
        if (safeTitle.length > 20) {
          safeTitle = safeTitle.substring(0, 17) + '...';
        }
        return { id: button.id, title: safeTitle };
      });
    }

    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
    };

    // Si hay botones, construir mensaje interactivo con botones
    if (finalButtons.length) {
      const interactive = {
        type: 'button',
        body: { text: finalText },
        action: {
          buttons: finalButtons.map(button => ({
            type: 'reply',
            reply: { id: button.id, title: button.title }
          }))
        }
      };

      // Añadir encabezado si existe
      if (finalHeader) {
        if (finalHeader.type === 'text') {
          interactive.header = { type: 'text', text: finalHeader.text };
        } else if (['image', 'document', 'video'].includes(finalHeader.type)) {
          interactive.header = {
            type: finalHeader.type,
            [finalHeader.type]: { link: finalHeader.link }
          };
        }
      }

      // Añadir pie de página si existe
      if (finalFooter) {
        interactive.footer = { text: finalFooter };
      }

      const data = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to,
        type: 'interactive',
        interactive: interactive
      };

      const response = await axios.post(url, data, { headers });
      console.log(`Interactive message with buttons sent to ${to}${autoTranslate ? ` (${cleanLanguage})` : ''}: ${finalText}`);
      return response.data;
    } else {
      // Si no hay botones y hay encabezado multimedia, enviar como mensaje de tipo multimedia
      if (finalHeader && ['image', 'video', 'document'].includes(finalHeader.type)) {
        const data = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: finalHeader.type,
          [finalHeader.type]: {
            link: finalHeader.link,
            caption: finalText // Usar el texto como caption del medio
          }
        };

        const response = await axios.post(url, data, { headers });
        console.log(`${finalHeader.type.charAt(0).toUpperCase() + finalHeader.type.slice(1)} message sent to ${to}${autoTranslate ? ` (${cleanLanguage})` : ''}`);
        return response.data;
      }
      // Si hay encabezado de texto o no hay encabezado, enviar como mensaje de texto regular
      else {
        let messageBody = finalText;

        // Si hay encabezado de texto, combinarlo con el texto principal
        if (finalHeader && finalHeader.type === 'text') {
          messageBody = `*${finalHeader.text}*\n\n${finalText}`;
        }

        // Si hay pie de página, añadirlo al final
        if (finalFooter) {
          messageBody = `${messageBody}\n\n_${finalFooter}_`;
        }

        const data = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: { body: messageBody }
        };

        const response = await axios.post(url, data, { headers });
        console.log(`Text message sent to ${to}${autoTranslate ? ` (${cleanLanguage})` : ''}: ${messageBody.substring(0, 50)}...`);
        return response.data;
      }
    }
  } catch (error) {
    console.error('Error sending message:', error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
    throw error;
  }
};

/**
 * Traduce un texto del español al idioma especificado
 * @param {string} text - Texto en español a traducir
 * @param {string} targetLanguage - Código del idioma destino ('en', 'de', 'fr', 'it')
 * @returns {Promise<string>} - Texto traducido
 */
async function translateText(text, targetLanguage) {
  // Si el texto es muy corto o solo emojis, no traducir
  if (text.length < 3 || /^[\p{Emoji}\s]+$/u.test(text)) {
    return text;
  }

  // Crear clave para caché
  const cacheKey = `${text}_${targetLanguage}`;

  // Verificar si la traducción ya está en caché
  if (translationCache.has(cacheKey)) {
    const cachedData = translationCache.get(cacheKey);
    if (Date.now() - cachedData.timestamp < CACHE_TTL) {
      return cachedData.translation;
    } else {
      // Eliminar entradas caducadas
      translationCache.delete(cacheKey);
    }
  }

  // Si el caché está lleno, eliminar la entrada más antigua
  if (translationCache.size >= CACHE_SIZE_LIMIT) {
    const oldestKey = [...translationCache.keys()][0];
    translationCache.delete(oldestKey);
  }

  try {
    // Obtener el nombre del idioma para el prompt
    const languageNames = {
      'en': 'inglés',
      'de': 'alemán',
      'fr': 'francés',
      'it': 'italiano'
    };

    const languageName = languageNames[targetLanguage] || targetLanguage;

    // Prompt específico para traducciones concisas
    const prompt = `Traduce el siguiente texto del español al ${languageName}. Responde SOLO con la traducción exacta, sin explicaciones ni texto adicional:

Texto: ${text}

Traducción:`;

    const result = await model.generateContent(prompt);
    const translation = result.response.text().trim();

    // Guardar en caché
    translationCache.set(cacheKey, {
      translation,
      timestamp: Date.now()
    });

    return translation;
  } catch (error) {
    console.error('Error en traducción:', error);
    return text; // Devolver texto original en caso de error
  }
}

/**
 * Traduce un lote de textos cortos (optimiza llamadas a la API)
 * @param {Array<string>} texts - Array de textos a traducir
 * @param {string} targetLanguage - Código del idioma destino
 * @returns {Promise<Array<string>>} - Array de textos traducidos
 */
async function translateBatchTexts(texts, targetLanguage) {
  // Si no hay textos, devolver array vacío
  if (!texts || texts.length === 0) {
    return [];
  }

  // Si solo hay un texto, usar la función normal
  if (texts.length === 1) {
    const result = await translateText(texts[0], targetLanguage);
    return [result];
  }

  // Crear clave única para el batch
  const batchKey = texts.join('||') + `_${targetLanguage}`;

  // Verificar caché para el batch completo
  if (translationCache.has(batchKey)) {
    const cachedData = translationCache.get(batchKey);
    if (Date.now() - cachedData.timestamp < CACHE_TTL) {
      return cachedData.translations;
    } else {
      translationCache.delete(batchKey);
    }
  }

  try {
    // Obtener el nombre del idioma
    const languageNames = {
      'en': 'inglés',
      'de': 'alemán',
      'fr': 'francés',
      'it': 'italiano'
    };

    const languageName = languageNames[targetLanguage] || targetLanguage;

    // Prompt para traducir varios textos a la vez
    const prompt = `Traduce los siguientes textos cortos del español al ${languageName}. 
    Responde únicamente con las traducciones separadas por "|". No añadas ningún otro texto.
    
    Textos:
    ${texts.map((text, i) => `${i + 1}. "${text}"`).join('\n')}
    
    Traducciones (separadas por "|"):`;

    const result = await model.generateContent(prompt);
    let response = result.response.text().trim();

    // Extraer las traducciones
    const translations = response.split('|').map(t => t.trim());

    // Verificar que tenemos el mismo número de traducciones
    if (translations.length !== texts.length) {
      // Si fallan las separaciones, intentar otra estrategia para textos muy cortos
      return await Promise.all(texts.map(text => translateText(text, targetLanguage)));
    }

    // Guardar en caché
    translationCache.set(batchKey, {
      translations,
      timestamp: Date.now()
    });

    return translations;
  } catch (error) {
    console.error('Error en traducción por lotes:', error);
    // Si falla, traducir uno por uno
    return await Promise.all(texts.map(text => translateText(text, targetLanguage)));
  }
}

/**
 * Envía un mensaje interactivo sin traducción automática
 * @param {string} to - Número de teléfono del destinatario
 * @param {string} text - Texto del mensaje
 * @param {Array} buttons - Array de objetos botón con id y title
 * @returns {Promise<void>}
 */
export const sendRawInteractiveMessage = async (to, text, buttons) => {
  return sendInteractiveMessage(to, text, buttons, false);
};

export default sendInteractiveMessage;