import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  waId: { type: String, required: true, unique: true },
  from: { type: String, required: true },
  to: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  role: { type: String, enum: ['user', 'system', 'bot'], required: true },
  businessCode: { type: String, required: false },
});

const Message = mongoose.model('Message', messageSchema);

export default Message;