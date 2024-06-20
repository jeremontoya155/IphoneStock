const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('./database.db');

db.serialize(() => {
    db.run("ALTER TABLE products ADD COLUMN visible INTEGER DEFAULT 1", (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('La columna "visible" ya existe.');
            } else {
                console.error('Error al agregar la columna visible:', err);
            }
        } else {
            console.log('Columna visible agregada exitosamente.');
        }
    });
});

db.close();
