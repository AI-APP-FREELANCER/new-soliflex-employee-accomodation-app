const bcrypt = require('bcryptjs');

class User {
  constructor(userId, username, password, role = 'ADMIN') {
    this.user_id = userId;
    this.username = username;
    this.password = password; // Will be hashed
    this.role = role;
  }

  static async hashPassword(password) {
    return await bcrypt.hash(password, 10);
  }

  static async comparePassword(password, hashedPassword) {
    return await bcrypt.compare(password, hashedPassword);
  }
}

module.exports = User;

