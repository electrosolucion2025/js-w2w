import { v4 as uuidv4 } from 'uuid';
import { messageQueue } from '../queues/messageQueue.js';

export const storeMessageInQueue = async (message) => {
  try {
    await messageQueue.add({ message });
  } catch (error) {
    console.error('Error adding message to queue:', error.message);
  }
};

export const storeBotMessageInQueue = async (from, content, user, sessionData) => {
  storeMessageInQueue({
    waId: uuidv4(), // Generar un nuevo ID para el mensaje del bot
    from: 'bot',
    to: from,
    content,
    role: 'bot',
    businessCode: user.businessCode,
    sessionId: sessionData.sessionId,
  });
};