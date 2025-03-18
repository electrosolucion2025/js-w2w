import User from '../models/user.js';

class UserController {
  async createUser(req, res) {
    const { whatsappNumber, profileName } = req.body;

    try {
      const user = new User({
        whatsappNumber,
        profileName
      });

      await user.save();
      res.status(201).json(user);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async getUsers(req, res) {
    const { whatsappNumber } = req.params;

    try {
      const user = await User.findOne({ whatsappNumber });

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.status(200).json(user);
    } catch (error) {
      res.status(404).json({ message: error.message });
    }
  }
}

export default UserController;