import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { getMediaContent } from './mediaService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const writeFileAsync = promisify(fs.writeFile);
const unlinkAsync = promisify(fs.unlink);

// Inicializar el cliente de Google Gemini para posible traducción
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash", // Modelo más rápido para esta tarea simple
  generationConfig: { temperature: 0.2 }
});

/**
 * Transcribe un audio de WhatsApp usando OpenAI Whisper API
 * @param {string} audioId - ID del archivo de audio en WhatsApp
 * @param {string} preferredLanguage - Idioma preferido para la respuesta ('es', 'en', 'de', 'fr', 'it')
 * @returns {Promise<{text: string, detectedLanguage: string}>} - Texto transcrito y el idioma detectado
 */
export const transcribeAudio = async (audioId, preferredLanguage = 'es') => {
  try {
    console.log(`Transcribiendo audio con ID: ${audioId}`);

    // 1. Descargar el archivo de audio de la API de WhatsApp
    const audioBuffer = await getMediaContent(audioId);

    // 2. Guardar el archivo temporalmente
    const tempAudioPath = path.join(__dirname, `../../temp/${audioId}.ogg`);
    await writeFileAsync(tempAudioPath, audioBuffer);

    console.log(`Audio guardado temporalmente en: ${tempAudioPath}`);

    // 3. Preparar FormData para la API de OpenAI
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempAudioPath));
    formData.append('model', 'whisper-1');
    // No especificar el idioma para permitir detección automática

    // 4. Llamar a la API de OpenAI Whisper
    const response = await axios.post(
      'https://api.openai.com/v1/audio/transcriptions',
      formData,
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_APIKEY}`,
          ...formData.getHeaders()
        }
      }
    );

    // 5. Limpiar el archivo temporal
    await unlinkAsync(tempAudioPath);

    // 6. Procesar la transcripción
    if (response.data && response.data.text) {
      const transcribedText = response.data.text;
      console.log(`Transcripción exitosa: "${transcribedText}"`);

      // 7. Detectar el idioma de la transcripción
      const detectedLanguage = await detectLanguage(transcribedText);
      console.log(`Idioma detectado en el audio: ${detectedLanguage}`);

      // 8. Si el idioma no está entre los soportados, traducir a inglés
      const supportedLanguages = ['es', 'en', 'de', 'fr', 'it'];

      if (!supportedLanguages.includes(detectedLanguage)) {
        console.log(`Idioma no soportado (${detectedLanguage}), traduciendo a inglés...`);
        const translatedText = await translateToEnglish(transcribedText);
        return {
          text: translatedText,
          detectedLanguage: 'en', // Cambiamos el idioma detectado a inglés ya que ahora está en inglés
          wasTranslated: true,
          originalLanguage: detectedLanguage
        };
      }

      return { text: transcribedText, detectedLanguage };
    } else {
      throw new Error('No se recibió transcripción');
    }
  } catch (error) {
    console.error('Error en transcribeAudio:', error);
    throw new Error(`Error al transcribir el audio: ${error.message}`);
  }
};

/**
 * Detecta el idioma de un texto usando Gemini
 * @param {string} text - El texto para detectar el idioma
 * @returns {Promise<string>} - Código del idioma detectado
 */
async function detectLanguage(text) {
  try {
    // Prompt específico para detección de idiomas
    const prompt = `Detecta el idioma del siguiente texto y responde SOLO con el código del idioma ('es', 'en', 'de', 'fr', 'it'). Si no es ninguno de estos idiomas, responde con el código ISO 639-1 del idioma que detectes.
    
    Texto: "${text.substring(0, 100)}" 
    
    Solo responde con el código, nada más.`;

    const result = await model.generateContent(prompt);
    const languageCode = result.response.text().trim().toLowerCase();

    // Validar que la respuesta sea un código de idioma plausible (2 caracteres)
    if (languageCode.length === 2) {
      return languageCode;
    }

    return 'en'; // Valor predeterminado si la detección falla
  } catch (error) {
    console.error('Error detectando idioma:', error);
    return 'en'; // En caso de error, devolver inglés por defecto
  }
}

/**
 * Traduce un texto a inglés usando Gemini
 * @param {string} text - El texto para traducir
 * @returns {Promise<string>} - El texto traducido
 */
async function translateToEnglish(text) {
  try {
    // Prompt específico para traducción
    const prompt = `Traduce el siguiente texto al inglés. Responde solo con la traducción, sin explicaciones.
    
    Texto: ${text}
    
    Traducción al inglés:`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Error traduciendo texto:', error);
    return text; // En caso de error, devolver el texto original
  }
}