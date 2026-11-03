// Crea la tabla login_attempts (si no existe) e inserta un registro de ejemplo:
// intento de ingreso de ayer a la tarde, con ubicación en Córdoba, Argentina.
// Uso: node seed-login-attempt.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS login_attempts (
            id SERIAL PRIMARY KEY,
            username VARCHAR(100),
            success BOOLEAN NOT NULL,
            ip VARCHAR(64),
            user_agent TEXT,
            lat DOUBLE PRECISION,
            lng DOUBLE PRECISION,
            accuracy DOUBLE PRECISION,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);
        // Ayer a las 16:30 (hora Argentina, UTC-3)
        const r = await pool.query(
            `INSERT INTO login_attempts (username, success, ip, user_agent, lat, lng, accuracy, created_at)
             VALUES ('admin', TRUE, 'registro-manual', 'registro de ejemplo', -31.4260314, -64.1852237, NULL,
                     ((CURRENT_DATE - 1) + TIME '16:30') AT TIME ZONE 'America/Argentina/Buenos_Aires')
             RETURNING id, created_at`
        );
        console.log('✅ Registro insertado:', r.rows[0]);
    } catch (e) {
        console.error('❌ Error:', e);
    } finally {
        await pool.end();
    }
})();
