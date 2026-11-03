// Convierte todas las contraseñas en texto plano de la tabla users a hashes bcrypt.
// Uso: node hash-passwords.js   (seguro de correr más de una vez)
require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        const { rows } = await pool.query('SELECT id, username, password FROM users');
        let migrated = 0;
        for (const u of rows) {
            if (/^\$2[aby]\$/.test(u.password || '')) continue; // ya hasheada
            const hash = await bcrypt.hash(u.password, 12);
            await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, u.id]);
            migrated++;
            console.log(`✅ ${u.username} migrado`);
        }
        console.log(`Listo: ${migrated} migrados, ${rows.length - migrated} ya estaban hasheados.`);
    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        await pool.end();
    }
})();
