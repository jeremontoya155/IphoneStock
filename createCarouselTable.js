const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'monorail.proxy.rlwy.net',
    database: 'railway',
    password: 'RRJsjVktdsgNiHEAdcjPeMtPZyddslty',
    port: 26899,
});

const createTableQuery = `
    CREATE TABLE IF NOT EXISTS carousel (
        id SERIAL PRIMARY KEY,
        text VARCHAR(255),
        img VARCHAR(255),
        color1 VARCHAR(7),
        color2 VARCHAR(7)
    );
`;

pool.query(createTableQuery)
    .then(() => {
        console.log('Tabla "carousel" creada exitosamente');
    })
    .catch((err) => {
        console.error('Error al crear la tabla "carousel":', err);
    })
    .finally(() => {
        pool.end();
    });
