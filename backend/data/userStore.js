const pool = require('./db');

const userStore = {
  async findByUsername(username) {
    const res = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return res.rows[0] || null;
  },

  async findById(userId) {
    const res = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    return res.rows[0] || null;
  },

  async createUser(username, password, role = 'ADMIN') {
    const bcrypt  = require('bcryptjs');
    const hashed  = await bcrypt.hash(password, 10);
    const count   = await pool.query('SELECT COUNT(*) FROM users');
    const userId  = `user_${String(parseInt(count.rows[0].count) + 1).padStart(3, '0')}`;
    const res = await pool.query(
      'INSERT INTO users (user_id, username, password, role) VALUES ($1,$2,$3,$4) RETURNING *',
      [userId, username, hashed, role]
    );
    return res.rows[0];
  },
};

module.exports = userStore;
