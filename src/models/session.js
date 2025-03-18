import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true }, // Agregar campo para el UUID de la sesión
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  startedAt: { type: Date, required: true },
  lastMessageAt: { type: Date, required: true },
  isActive: { type: Boolean, required: true },
  fullHistory: { type: Array, required: true },
});

const Session = mongoose.model('Session', sessionSchema);

export default Session;