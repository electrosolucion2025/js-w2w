import mongoose from 'mongoose';

const allergenSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  businessId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Business',
    required: true
  }
});

const Allergen = mongoose.model('Allergen', allergenSchema);

export default Allergen;