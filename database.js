// database_setup.js
const sqlite3 = require('sqlite3').verbose();

let db = new sqlite3.Database('./database.db');

db.serialize(() => {
    // Crear tabla de usuarios
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            isAdmin INTEGER NOT NULL DEFAULT 0
        )
    `);

    // Crear tabla de productos
    db.run(`
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            description TEXT NOT NULL,
            image TEXT NOT NULL,
            price REAL NOT NULL,
            stock INTEGER NOT NULL
        )
    `);

    // Insertar usuario administrador
    db.run(`INSERT INTO users (username, password, isAdmin) VALUES (?, ?, ?)`, ['admin', 'adminpassword', 1]);
});

db.close();
