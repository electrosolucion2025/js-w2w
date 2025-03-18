import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redisClient.js';

export const updateSessionHistory = async (from, sessionData, role, content) => {
  sessionData.fullHistory.push({ role, content });
  await redisClient.set(`session:${from}`, JSON.stringify(sessionData), 'EX', 1800); // Expira en 1 hora
};

export const getSessionData = async (from) => {
  let sessionData = await redisClient.get(`session:${from}`);
  if (sessionData) {
    sessionData = JSON.parse(sessionData);
    sessionData.lastMessageAt = new Date();
  }
  return sessionData;
};

export const createNewSession = async (from, userId) => {
  const sessionData = {
    sessionId: uuidv4(),
    userId,
    startedAt: new Date(),
    lastMessageAt: new Date(),
    isActive: true,
    fullHistory: [],
  };
  await redisClient.set(`session:${from}`, JSON.stringify(sessionData), 'EX', 1800); // Expira en 1 hora
  return sessionData;
};