// Primero, asegúrate de instalar la librería: npm install openai

import OpenAI from 'openai';

// Configura el cliente con tu API key
const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_APIKEY, // Asegúrate de tener tu API key en las variables de entorno
  baseURL: 'https://api.deepseek.com',
});

// Configuración para optimizaciones
const MAX_HISTORY_TOKENS = 4000; // Ajustar según tus necesidades
const SUMMARY_TRIGGER_LENGTH = 8; // Resumir cuando hay muchos mensajes
const MAX_OUTPUT_TOKENS = 1000; // Limitar longitud de respuesta

/**
 * Estima la cantidad de tokens en un texto (función simple)
 * @param {string} text - Texto a analizar
 * @returns {number} - Estimación de tokens
 */
const estimateTokens = (text) => {
  if (!text) return 0;
  // Aproximadamente 4 caracteres = 1 token (estimación rápida)
  return Math.ceil(text.length / 4);
};

/**
 * Genera un resumen del historial de conversación
 * @param {Array} oldHistory - Historial a resumir
 * @returns {Promise<string>} - Resumen generado
 */
const generateSummary = async (oldHistory) => {
  try {
    // Si hay pocos mensajes, no vale la pena resumir
    if (oldHistory.length < 3) {
      return oldHistory.map(m => `${m.role}: ${m.content.substring(0, 30)}...`).join('; ');
    }

    // Para implementaciones avanzadas, usar LLM para resumir
    // Aquí usamos una versión simplificada
    const userMessages = oldHistory
      .filter(m => m.role === 'user')
      .map(m => m.content.substring(0, 50))
      .slice(-3);

    const assistantResponses = oldHistory
      .filter(m => m.role === 'assistant')
      .map(m => m.content.substring(0, 50))
      .slice(-2);

    return `Historial resumido: El usuario mencionó: ${userMessages.join(', ')}. El asistente respondió sobre: ${assistantResponses.join(', ')}`;
  } catch (error) {
    console.error('Error al generar resumen:', error);
    return "Conversación previa sobre pedidos en un restaurante";
  }
};

/**
 * Comprime el historial de mensajes para optimizar tokens
 * @param {Array} history - Historial completo
 * @param {number} maxTokens - Máximo de tokens permitidos
 * @returns {Promise<Array>} - Historial comprimido
 */
const compressHistory = async (history, maxTokens) => {
  // Si no hay suficiente historial, devolver tal cual
  if (history.length <= 2) return history;

  let tokenCount = 0;
  let compressed = [];

  // Separar mensajes recientes (últimos 2 intercambios) que siempre se mantienen
  const recentMessages = history.slice(-4);
  const olderMessages = history.slice(0, -4);

  // Siempre incluir mensajes recientes
  for (const msg of recentMessages) {
    compressed.push(msg);
    tokenCount += estimateTokens(msg.content);
  }

  // Si hay muchos mensajes antiguos, resumir en vez de incluirlos todos
  if (olderMessages.length > SUMMARY_TRIGGER_LENGTH) {
    const summaryContent = await generateSummary(olderMessages);
    compressed.unshift({
      role: "system",
      content: `Resumen de la conversación anterior: ${summaryContent}`
    });
    console.log(`Historial resumido: ${olderMessages.length} mensajes -> 1 resumen`);
  } else {
    // Incluir mensajes antiguos hasta el límite de tokens
    for (let i = olderMessages.length - 1; i >= 0; i--) {
      const msg = olderMessages[i];
      const msgTokens = estimateTokens(msg.content);

      if (tokenCount + msgTokens > maxTokens) break;

      compressed.unshift(msg);
      tokenCount += msgTokens;
    }
  }

  return compressed;
};

/**
 * Genera respuestas usando la API de Deepseek con optimizaciones
 * @param {string} systemPrompt - Instrucciones del sistema
 * @param {Array} messageHistory - Historial de mensajes
 * @returns {Promise<string>} - Respuesta generada
 */
const generateResponse = async (systemPrompt, messageHistory) => {
  try {
    // Detectar si estamos en el caso simplificado (solo mensaje actual)
    const isSimpleCase = messageHistory.length === 1 && messageHistory[0].role === 'user';

    let processedMessages = [];

    if (isSimpleCase) {
      // Caso optimizado: solo un mensaje del usuario
      processedMessages = [
        { role: 'system', content: systemPrompt },
        messageHistory[0] // El único mensaje del usuario
      ];

      console.log('Modo optimizado: Enviando solo el mensaje actual');
    } else {
      // Caso con historial completo que requiere compresión
      console.time('History Compression');

      // Normalizar mensajes (combinar consecutivos del mismo rol)
      const normalizedHistory = [];
      let lastRole = null;

      for (const message of messageHistory) {
        if (lastRole === message.role) {
          const lastIndex = normalizedHistory.length - 1;
          normalizedHistory[lastIndex].content += "\n\n" + message.content;
        } else {
          normalizedHistory.push({ ...message });
          lastRole = message.role;
        }
      }

      // Asegurarse de que el último mensaje sea del usuario
      if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === 'assistant') {
        normalizedHistory.push({
          role: 'user',
          content: 'Por favor, responde a mi mensaje anterior.'
        });
      }

      // Comprimir historial para optimizar tokens
      const optimizedHistory = await compressHistory(normalizedHistory, MAX_HISTORY_TOKENS);
      console.timeEnd('History Compression');

      // Construir mensajes finales
      processedMessages = [
        { role: 'system', content: systemPrompt },
        ...optimizedHistory
      ];

      console.log(`Enviando ${processedMessages.length} mensajes a la API (modo historial)`);
    }

    // Realizar llamada a la API con tiempo medido
    console.time('API Request Duration');
    const completion = await openai.chat.completions.create({
      model: 'deepseek-reasoner',
      messages: processedMessages,
      temperature: 0.3,
      max_tokens: MAX_OUTPUT_TOKENS,
      timeout: 8000, // Aumentado para evitar timeouts
    });
    console.timeEnd('API Request Duration');

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating response from Deepseek:', error.message);
    throw error;
  }
};

export default generateResponse;