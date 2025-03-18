import { GoogleGenerativeAI } from "@google/generative-ai";

// Inicializar el cliente de Google Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI);
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  generationConfig: {
    temperature: 0,
  }
});

/**
 * Genera respuestas usando la API de Google Gemini
 * @param {string} systemPrompt - Instrucciones del sistema
 * @param {Array} messageHistory - Mensaje del usuario (solo el actual)
 * @param {string} language - Idioma deseado para la respuesta ('es' o 'en')
 * @returns {Promise<string>} - Respuesta generada
 */
const generateGeminiResponse = async (systemPrompt, messageHistory, language = 'es') => {
  console.log('Google Gemini API inicializado', process.env.GOOGLE_GEMINI);

  try {
    console.time('Gemini API Request Duration');

    // Extraer el mensaje del usuario
    const userMessage = messageHistory[0]?.content || "";

    // Determinar idioma y añadir instrucción específica
    let languageInstruction = "";
    switch (language.toLowerCase()) {
      case 'es':
        languageInstruction = "\nIMPORTANTE: Genera tu respuesta únicamente en español.";
        break;
      case 'en':
        languageInstruction = "\nIMPORTANT: Generate your response in English only.";
        break;
      case 'de':
        languageInstruction = "\nWICHTIG: Generiere deine Antwort nur auf Deutsch.";
        break;
      case 'fr':
        languageInstruction = "\nIMPORTANT: Générez votre réponse uniquement en français.";
        break;
      case 'it':
        languageInstruction = "\nIMPORTANTE: Genera la tua risposta solo in italiano.";
        break;
      default:
        // Si no es ninguno de los idiomas soportados, usar inglés por defecto
        languageInstruction = "\nIMPORTANT: Generate your response in English only.";
        console.log(`Idioma no soportado: ${language}, usando inglés como predeterminado`);
        language = 'en';
        break;
    }

    // Combinar el prompt del sistema con el mensaje del usuario e instrucción de idioma
    const fullPrompt = `${systemPrompt}${languageInstruction}\n\nMensaje del usuario: ${userMessage}`;
    console.log('Idioma seleccionado:', language);

    // Realizar la llamada directa a Gemini
    const result = await model.generateContent(fullPrompt);
    const response = result.response.text();

    console.timeEnd('Gemini API Request Duration');

    return response.trim();
  } catch (error) {
    console.error('Error generando respuesta con Gemini:', error.message);
    throw error;
  }
};

export default generateGeminiResponse;