const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'monorail.proxy.rlwy.net',
    database: 'railway',
    password: 'RRJsjVktdsgNiHEAdcjPeMtPZyddslty',
    port: 26899,
});

const createTableQuery = `
    CREATE TABLE IF NOT EXISTS about (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255),
        texto TEXT,
        imagen VARCHAR(5000)
    );
`;

pool.query(createTableQuery)
    .then(() => {
        console.log('Tabla "about" creada exitosamente');
    })
    .catch((err) => {
        console.error('Error al crear la tabla "carousel":', err);
    })
    .finally(() => {
        pool.end();
    });
