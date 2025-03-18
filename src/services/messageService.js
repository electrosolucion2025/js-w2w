import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from 'axios';
import fs from 'fs-extra';
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
 * Envía un mensaje de WhatsApp con traducción automática si es necesario
 * @param {string} to - Número de teléfono del destinatario
 * @param {string} text - Texto del mensaje (en español por defecto)
 * @param {boolean} autoTranslate - Si se debe traducir automáticamente según el idioma del usuario
 * @returns {Promise<void>}
 */
const sendMessage = async (to, text, autoTranslate = true) => {
  try {
    let finalText = text;

    // Verificar si se requiere traducción automática
    if (autoTranslate) {
      // Obtener el idioma preferido del usuario
      const userLanguage = await redisClient.get(`userLanguage:${to}`);

      // Solo traducir si no es español y es un idioma soportado
      if (userLanguage && userLanguage !== 'es' && ['en', 'de', 'fr', 'it'].includes(userLanguage)) {
        finalText = await translateText(text, userLanguage);
      }
    }

    // Enviar el mensaje (original o traducido)
    const url = `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_ID}/messages`;
    const data = {
      messaging_product: 'whatsapp',
      to: to,
      text: { body: finalText }
    };
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
    };

    await axios.post(url, data, { headers });
    console.log(`Message sent to ${to}${autoTranslate ? ` (${await redisClient.get(`userLanguage:${to}`) || 'es'})` : ''}: ${finalText}`);
  } catch (error) {
    console.error('Error sending message:', error.response ? error.response.data : error.message);
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
 * Envía un mensaje sin traducción automática
 * @param {string} to - Número de teléfono del destinatario
 * @param {string} text - Texto del mensaje
 * @returns {Promise<void>}
 */
export const sendRawMessage = async (to, text) => {
  return sendMessage(to, text, false);
};

// Exporta la función para enviar documentos
/**
 * Envía un documento a través de WhatsApp usando URL pública
 */
export const sendDocument = async (to, documentPath, filename, caption) => {
  try {
    // Verificar que el documento existe
    if (!await fs.pathExists(documentPath)) {
      console.error(`El documento no existe: ${documentPath}`);
      return { error: true, message: "Documento no encontrado" };
    }

    // Obtener credenciales
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID;
    const token = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !token) {
      console.error("Faltan credenciales de WhatsApp");
      return { error: true, message: "Credenciales incompletas" };
    }

    // Generar URL pública
    const baseUrl = process.env.BASE_URL || 'https://whats2want-assistant.com';
    const relativePath = documentPath.replace(/.*\/public\//, ''); // Extraer ruta relativa a /public
    const documentUrl = `${baseUrl}/${relativePath}`;

    console.log(`URL generada para el documento: ${documentUrl}`);

    // Construir payload específico de la API de WhatsApp
    const requestData = {
      messaging_product: "whatsapp",
      to: to,
      type: "document",
      document: {
        link: documentUrl,
        filename: filename || path.basename(documentPath),
        caption: caption || undefined
      }
    };

    console.log("Enviando solicitud a WhatsApp API:", {
      url: `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      token: `${token.substring(0, 10)}...`,
      payload: requestData
    });

    // Enviar solicitud
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: requestData
    });

    console.log('Documento enviado con éxito:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error enviando documento por WhatsApp:', error);
    if (error.response) {
      console.error('Detalles del error:', JSON.stringify(error.response.data, null, 2));
    }
    return { error: true, message: error.message };
  }
};

export default sendMessage;