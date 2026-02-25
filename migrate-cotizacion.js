require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    bright: '\x1b[1m'
};

async function migrate() {
    console.log(`\n${colors.cyan}${colors.bright}=====================================${colors.reset}`);
    console.log(`${colors.cyan}  Migración: Cotización del Dólar${colors.reset}`);
    console.log(`${colors.cyan}=====================================${colors.reset}\n`);

    try {
        // 1. Crear tabla configuracion
        console.log(`${colors.yellow}► Creando tabla configuracion...${colors.reset}`);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracion (
                id SERIAL PRIMARY KEY,
                clave VARCHAR(100) UNIQUE NOT NULL,
                valor TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log(`${colors.green}  ✔ Tabla configuracion creada${colors.reset}`);

        // 2. Insertar cotización por defecto
        console.log(`${colors.yellow}► Insertando cotización por defecto (1200)...${colors.reset}`);
        await pool.query(`
            INSERT INTO configuracion (clave, valor) 
            VALUES ('cotizacion_dolar', '1200')
            ON CONFLICT (clave) DO NOTHING
        `);
        console.log(`${colors.green}  ✔ Cotización por defecto insertada${colors.reset}`);

        // 3. Agregar columna moneda a products
        console.log(`${colors.yellow}► Agregando columna moneda a products...${colors.reset}`);
        await pool.query(`
            ALTER TABLE products ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'USD'
        `);
        console.log(`${colors.green}  ✔ Columna moneda agregada (default: USD)${colors.reset}`);

        // 4. Insertar configuración de visibilidad del precio en pesos
        console.log(`${colors.yellow}► Insertando configuración mostrar_precio_pesos...${colors.reset}`);
        await pool.query(`
            INSERT INTO configuracion (clave, valor) 
            VALUES ('mostrar_precio_pesos', 'true')
            ON CONFLICT (clave) DO NOTHING
        `);
        console.log(`${colors.green}  ✔ Configuración mostrar_precio_pesos insertada${colors.reset}`);

        // Verificar resultado
        const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
        const cotiz = cotizResult.rows[0]?.valor || 'N/A';

        console.log(`\n${colors.green}${colors.bright}=====================================${colors.reset}`);
        console.log(`${colors.green}  ✔ Migración completada con éxito${colors.reset}`);
        console.log(`${colors.green}  Cotización actual: $${cotiz} ARS${colors.reset}`);
        console.log(`${colors.green}=====================================${colors.reset}\n`);

    } catch (err) {
        console.error(`\n${colors.red}✘ Error en la migración:${colors.reset}`, err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

migrate();
