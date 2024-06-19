// server.js
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const Swal = require('sweetalert2');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de SweetAlert2
const SwalMixin = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
        toast.addEventListener('mouseenter', Swal.stopTimer);
        toast.addEventListener('mouseleave', Swal.resumeTimer);
    }
});

// Configurar middleware
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));

// Configurar middleware para manejar sesiones
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true,
}));

// Conectar a la base de datos SQLite
let db = new sqlite3.Database('./database.db');

// Middleware para verificar si el usuario está autenticado
function requireLogin(req, res, next) {
    if (req.session.userId) {
        next();
    } else {
        res.redirect('/login');
    }
}

// Middleware para verificar si el usuario es administrador
function requireAdmin(req, res, next) {
    if (req.session.userId) {
        db.get('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err) {
                throw err;
            }
            if (user && user.isAdmin === 1) {
                next();
            } else {
                res.send('Acceso denegado');
            }
        });
    } else {
        res.redirect('/login');
    }
}

// Rutas
app.get('/', (req, res) => {
    db.all('SELECT * FROM products', (err, rows) => {
        if (err) {
            throw err;
        }
        res.render('index', { products: rows, isAdmin: req.session.isAdmin });
    });
});

app.get('/edit/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
        if (err) {
            throw err;
        }
        res.render('edit', { product: row });
    });
});

app.post('/edit/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    const { name, description, image, price, stock } = req.body;
    db.run('UPDATE products SET name = ?, description = ?, image = ?, price = ?, stock = ? WHERE id = ?', [name, description, image, price, stock, id], (err) => {
        if (err) {
            throw err;
        }
        res.redirect('/');
    });
});

app.get('/new', requireAdmin, (req, res) => {
    res.render('new');
});

app.post('/new', requireAdmin, (req, res) => {
    const { name, description, image, price, stock } = req.body;
    db.run('INSERT INTO products (name, description, image, price, stock) VALUES (?, ?, ?, ?, ?)', [name, description, image, price, stock], (err) => {
        if (err) {
            throw err;
        }
        res.redirect('/');
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
        if (err) {
            throw err;
        }
        if (user) {
            req.session.userId = user.id;
            req.session.isAdmin = user.isAdmin;
            res.redirect('/');
        } else {
            res.send('Credenciales incorrectas');
        }
    });
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
        }
        res.redirect('/');
    });
});

// Ruta para carrito de compras
app.get('/cart', (req, res) => {
    db.all('SELECT * FROM products', (err, rows) => {
        if (err) {
            throw err;
        }
        res.render('cart', { products: rows });
    });
});

// Ruta para manejar la compra de productos
app.post('/buy/:id', (req, res) => {
    const id = req.params.id;
    db.get('SELECT stock FROM products WHERE id = ?', [id], (err, product) => {
        if (err) {
            throw err;
        }
        if (product.stock > 0) {
            db.run('UPDATE products SET stock = stock - 1 WHERE id = ?', [id], (err) => {
                if (err) {
                    throw err;
                }
                res.send('Compra realizada con éxito');
            });
        } else {
            res.send('Producto no disponible');
        }
    });
});

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
