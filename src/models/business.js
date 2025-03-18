import mongoose from 'mongoose';

const businessSchema = new mongoose.Schema({
  code: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  shortName: {
    type: String,
    required: true
  },
  contactPhone: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  address: {
    type: String,
    default: 'No address provided'
  },
  website: {
    type: String,
    default: 'No website provided'
  },
  language: {
    type: String,
    default: 'es'
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  currency: {
    type: String,
    default: 'EUR'
  },
  status: {
    type: String,
    default: 'active'
  },
  acceptsOrders: {
    type: Boolean,
    default: true
  },
  businessType: {
    type: String,
    default: 'restaurant'
  },
  defaultPrompt: {
    type: String,
    default: 'Welcome to our business!'
  },
  paymentMethods: {
    type: [String],
    default: ['Redsys', 'Strype']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const Business = mongoose.model('Business', businessSchema);

export default Business;