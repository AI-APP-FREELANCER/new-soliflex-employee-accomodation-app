const User = require('../models/User');

// In-memory user store (in production, this would be a database)
// Default user for testing: username: admin, password: admin123
class UserStore {
  constructor() {
    this.users = [];
    this.initialized = false;
    this.initPromise = this.initializeDefaultUser();
  }

  async initializeDefaultUser() {
    if (this.initialized) return;
    // Create default admin user
    const hashedPassword = await User.hashPassword('admin123');
    const defaultUser = new User('user_001', 'admin', hashedPassword, 'ADMIN');
    this.users.push(defaultUser);
    this.initialized = true;
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initPromise;
    }
  }

  async findByUsername(username) {
    await this.ensureInitialized();
    return this.users.find(u => u.username === username);
  }

  async findById(userId) {
    await this.ensureInitialized();
    return this.users.find(u => u.user_id === userId);
  }

  async createUser(username, password, role = 'ADMIN') {
    await this.ensureInitialized();
    const hashedPassword = await User.hashPassword(password);
    const userId = `user_${String(this.users.length + 1).padStart(3, '0')}`;
    const user = new User(userId, username, hashedPassword, role);
    this.users.push(user);
    return user;
  }
}

// Singleton instance
const userStore = new UserStore();

module.exports = userStore;

