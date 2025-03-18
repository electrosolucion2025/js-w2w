import { GoogleGenerativeAI } from "@google/generative-ai";

// Inicializar el cliente de Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash", // Modelo más rápido y económico para esta tarea simple
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 10, // Respuesta muy corta
  }
});

/**
 * Detecta el idioma de un texto
 * @param {string} text - El texto a analizar
 * @returns {Promise<string>} - Código del idioma ('es', 'en', 'de', 'fr', 'it')
 */
const detectLanguage = async (text) => {
  try {
    if (!text || text.trim().length < 2) {
      return 'en'; // Por defecto inglés si el texto es muy corto
    }

    // Prompt específico para detección de idiomas
    const prompt = `Detecta el idioma del siguiente texto y responde SOLO con el código del idioma ('es', 'en', 'de', 'fr', 'it'). Si no es ninguno de estos idiomas, responde 'en'.
    
    Texto: "${text.substring(0, 100)}" 
    
    Solo responde con el código, nada más.`;

    const result = await model.generateContent(prompt);
    const response = result.response.text().trim().toLowerCase();

    // Validar que la respuesta sea uno de los códigos de idioma permitidos
    const validCodes = ['es', 'en', 'de', 'fr', 'it'];
    if (validCodes.includes(response)) {
      return response;
    }

    // Si la respuesta contiene un código válido (ej: "el idioma es es"), extraerlo
    for (const code of validCodes) {
      if (response.includes(code)) {
        return code;
      }
    }

    return 'en'; // Valor predeterminado
  } catch (error) {
    console.error('Error detectando idioma:', error);
    return 'en'; // En caso de error, devolver inglés por defecto
  }
};

export default detectLanguage;