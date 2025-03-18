import axios from 'axios';

/**
 * Obtiene el contenido de un archivo multimedia desde la API de WhatsApp
 * @param {string} mediaId - ID del archivo multimedia
 * @returns {Promise<Buffer>} - Contenido del archivo como Buffer
 */
export const getMediaContent = async (mediaId) => {
  try {
    // 1. Primero obtenemos la URL del archivo
    const mediaUrlResponse = await axios.get(
      `https://graph.facebook.com/v22.0/${mediaId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        }
      }
    );

    if (!mediaUrlResponse.data || !mediaUrlResponse.data.url) {
      throw new Error('No se pudo obtener la URL del archivo multimedia');
    }

    const mediaUrl = mediaUrlResponse.data.url;

    // 2. Luego descargamos el archivo
    const mediaContentResponse = await axios.get(
      mediaUrl,
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`
        },
        responseType: 'arraybuffer'
      }
    );

    return Buffer.from(mediaContentResponse.data);
  } catch (error) {
    console.error('Error obteniendo contenido multimedia:', error);
    throw new Error(`Error al obtener contenido multimedia: ${error.message}`);
  }
};