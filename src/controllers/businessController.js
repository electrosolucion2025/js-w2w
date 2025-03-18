import Business from '../models/business.js';

class BusinessController {
  async createBusiness(req, res) {
    const {
      code,
      name,
      shortName,
      contactPhone,
      email,
      address,
      website,
      language,
      timezone,
      currency,
      status,
      acceptsOrders,
      businessType,
      defaultPrompt,
      paymentMethods
    } = req.body;

    try {
      const business = new Business({
        code,
        name,
        shortName,
        contactPhone,
        email,
        address,
        website,
        language,
        timezone,
        currency,
        status,
        acceptsOrders,
        businessType,
        defaultPrompt,
        paymentMethods
      });
      await business.save();
      res.status(201).json(business);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  async getBusiness(req, res) {
    const { code } = req.params;

    try {
      const business = await Business.findOne({ code });
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }
      res.status(200).json(business);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  }

  // Puedes agregar más métodos para actualizar y eliminar negocios si es necesario
}

export default BusinessController;