import Bull from 'bull';
import dotenv from 'dotenv';
import Message from '../models/message.js';
import Session from '../models/session.js';
import User from '../models/user.js';
import sendMessage from '../services/messageService.js';
import redisClient from '../utils/redisClient.js';

dotenv.config();

const redisUrl = process.env.REDIS_URL;
const enableBull = process.env.ENABLE_BULL === 'true';

let messageQueue;
let dumpMessagesToDB;
let closeInactiveSessions;

if (enableBull) {
  messageQueue = new Bull('messageQueue', {
    redis: redisUrl,
  });

  messageQueue.process(async (job) => {
    const { message } = job.data;
    try {
      await redisClient.lPush('messages', JSON.stringify(message));
      console.log(`Message stored in Redis: ${JSON.stringify(message)}`);
    } catch (error) {
      console.error('Error storing message in Redis:', error.message);
    }
  });

  dumpMessagesToDB = async () => {
    try {
      const messages = await redisClient.lRange('messages', 0, -1);
      if (messages.length > 0) {
        const parsedMessages = messages.map((message) => JSON.parse(message));
        await Message.insertMany(parsedMessages);
        await redisClient.del('messages');
        console.log(`Dumped ${parsedMessages.length} messages to the database.`);
      }
    } catch (error) {
      console.error('Error dumping messages to the database:', error.message);
    }
  };

  closeInactiveSessions = async () => {
    try {
      const keys = await redisClient.keys('session:*');
      const now = new Date();
      console.log(`Checking ${keys.length} sessions for inactivity...`);
      for (const key of keys) {
        const sessionData = await redisClient.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          const lastMessageAt = new Date(session.lastMessageAt);
          const diffMinutes = (now - lastMessageAt) / (1000 * 60);
          if (diffMinutes > 15) {
            console.log(`Closing inactive session for user ${session.userId}`);
            // Volcar la sesión a la base de datos
            await Session.updateOne(
              { sessionId: session.sessionId },
              {
                $set: {
                  userId: session.userId,
                  startedAt: session.startedAt,
                  lastMessageAt: session.lastMessageAt,
                  isActive: false,
                  fullHistory: session.fullHistory,
                },
              },
              { upsert: true }
            );

            // Borrar la sesión de Redis
            await redisClient.del(key);

            // Establecer el businessCode del usuario a null
            await User.updateOne({ _id: session.userId }, { $set: { businessCode: null } });

            // Borrar el número de mesa de la sesión
            await redisClient.del(`tableNumber:${session.userId}`);

            console.log(`Session for user ${session.userId} closed due to inactivity and saved to DB.`);
            await sendMessage(session.userId, 'Tu sesión ha sido cerrada por inactividad y guardada.');
          }
        }
      }
    } catch (error) {
      console.error('Error closing inactive sessions:', error.message);
    }
  };

  setInterval(dumpMessagesToDB, 30000); // Ejecutar cada 30 segundos
  setInterval(closeInactiveSessions, 300000); // Ejecutar cada 5 minutos
} else {
  console.log('Bull is disabled');
  dumpMessagesToDB = async () => {
    console.log('Bull is disabled, no messages to dump');
  };
  closeInactiveSessions = async () => {
    console.log('Bull is disabled, no sessions to close');
  };
}

export { closeInactiveSessions, dumpMessagesToDB, messageQueue };

