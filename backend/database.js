const { Pool } = require('pg');

// Configuração do banco de dados
let pool;

if (process.env.DATABASE_URL) {
  // Produção (Render.com)
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  // Desenvolvimento local com SQLite
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');
  const dbPath = path.join(__dirname, '..', 'data', 'consorcio.db');

  // Wrapper para SQLite manter compatibilidade
  const sqliteDb = new sqlite3.Database(dbPath);

  pool = {
    query: (text, params) => {
      return new Promise((resolve, reject) => {
        // Converter sintaxe PostgreSQL para SQLite
        let sqliteText = text
          .replace(/\$(\d+)/g, '?')
          .replace(/RETURNING \*/gi, '')
          .replace(/SERIAL/gi, 'INTEGER')
          .replace(/NOW\(\)/gi, "datetime('now')");

        const method = text.trim().toUpperCase().startsWith('SELECT') ? 'all' : 'run';

        if (method === 'all') {
          sqliteDb.all(sqliteText, params, (err, rows) => {
            if (err) reject(err);
            else resolve({ rows: rows || [] });
          });
        } else {
          sqliteDb.run(sqliteText, params, function (err) {
            if (err) reject(err);
            else resolve({ rows: [], rowCount: this.changes, lastID: this.lastID });
          });
        }
      });
    },
    connect: () => Promise.resolve({
      query: (text, params) => pool.query(text, params),
      release: () => { }
    })
  };

  // Inicializar SQLite
  sqliteDb.serialize(() => {
    sqliteDb.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone VARCHAR(20) UNIQUE NOT NULL,
            name VARCHAR(100),
            avatar TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS verification_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone VARCHAR(20) NOT NULL,
            code VARCHAR(6) NOT NULL,
            expires_at DATETIME NOT NULL,
            verified INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id INTEGER NOT NULL,
            receiver_id INTEGER NOT NULL,
            message TEXT,
            attachment_url TEXT,
            attachment_type VARCHAR(50),
            attachment_name VARCHAR(255),
            forwarded_from INTEGER,
            read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    sqliteDb.run(`CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            contact_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);

    console.log('✅ Conectado ao banco de dados SQLite (desenvolvimento)');
  });
}

// Inicializar tabelas no PostgreSQL
async function initializeDatabase() {
  if (!process.env.DATABASE_URL) return;

  try {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(20) UNIQUE NOT NULL,
                name VARCHAR(100),
                avatar TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                last_seen TIMESTAMP DEFAULT NOW()
            )
        `);

    await pool.query(`
            CREATE TABLE IF NOT EXISTS verification_codes (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(20) NOT NULL,
                code VARCHAR(6) NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                verified BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

    await pool.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id SERIAL PRIMARY KEY,
                sender_id INTEGER NOT NULL REFERENCES users(id),
                receiver_id INTEGER NOT NULL REFERENCES users(id),
                message TEXT,
                attachment_url TEXT,
                attachment_type VARCHAR(50),
                attachment_name VARCHAR(255),
                forwarded_from INTEGER REFERENCES messages(id),
                read BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

    await pool.query(`
            CREATE TABLE IF NOT EXISTS contacts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                contact_id INTEGER NOT NULL REFERENCES users(id),
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, contact_id)
            )
        `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_verification_phone ON verification_codes(phone)');

    // Adicionar colunas de anexo se não existirem (migração)
    try {
      await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_url TEXT');
      await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type VARCHAR(50)');
      await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255)');
      await pool.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS forwarded_from INTEGER');
      await pool.query('ALTER TABLE messages ALTER COLUMN message DROP NOT NULL');
      console.log('✅ Migração de anexos aplicada');
    } catch (migrationErr) {
      console.log('ℹ️ Migração de anexos já aplicada ou não necessária');
    }

    console.log('✅ Conectado ao banco de dados PostgreSQL');
    console.log('✅ Estrutura do banco de dados inicializada');
  } catch (err) {
    console.error('Erro ao inicializar banco:', err);
  }
}

// Inicializar
initializeDatabase();

module.exports = pool;
