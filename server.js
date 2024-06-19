require('dotenv').config();  // Cargar variables de entorno desde .env

const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de SweetAlert2
const Swal = require('sweetalert2');
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
app.use(cors()); // Middleware para permitir CORS

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

// Rutas

// Ruta principal
app.get('/', (req, res) => {
    db.all('SELECT * FROM products', (err, rows) => {
        if (err) {
            console.error('Error al obtener productos:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.render('index', { products: rows, isAdmin: req.session.isAdmin });
    });
});

// Ruta para editar un producto (requiere autenticación de administrador)
app.get('/edit/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
        if (err) {
            console.error('Error al obtener producto para edición:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.render('edit', { product: row });
    });
});

// Ruta para procesar la edición de un producto (requiere autenticación de administrador)
app.post('/edit/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    const { name, description, image, price, stock } = req.body;
    db.run('UPDATE products SET name = ?, description = ?, image = ?, price = ?, stock = ? WHERE id = ?', [name, description, image, price, stock, id], (err) => {
        if (err) {
            console.error('Error al actualizar producto:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.redirect('/');
    });
});

// Ruta para agregar un nuevo producto (requiere autenticación de administrador)
app.get('/new', requireAdmin, (req, res) => {
    res.render('new');
});

// Ruta para procesar el formulario de nuevo producto (requiere autenticación de administrador)
app.post('/new', requireAdmin, (req, res) => {
    const { name, description, image, price, stock } = req.body;
    db.run('INSERT INTO products (name, description, image, price, stock) VALUES (?, ?, ?, ?, ?)', [name, description, image, price, stock], (err) => {
        if (err) {
            console.error('Error al agregar nuevo producto:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.redirect('/');
    });
});

// Ruta para iniciar sesión
app.get('/login', (req, res) => {
    res.render('login');
});

// Ruta para procesar el formulario de inicio de sesión
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, user) => {
        if (err) {
            console.error('Error al buscar usuario:', err);
            res.status(500).send('Error interno del servidor');
            return;
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

// Ruta para cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Error al cerrar sesión:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.redirect('/');
    });
});

// Ruta para carrito de compras
app.get('/cart', (req, res) => {
    db.all('SELECT * FROM products', (err, rows) => {
        if (err) {
            console.error('Error al obtener productos para el carrito:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.render('cart', { products: rows });
    });
});

// Ruta para manejar la compra de productos
app.post('/buy/:id', (req, res) => {
    const id = req.params.id;
    db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
        if (err) {
            console.error('Error al obtener producto para compra:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        if (product.stock > 0) {
            db.run('UPDATE products SET stock = stock - 1 WHERE id = ?', [id], (err) => {
                if (err) {
                    console.error('Error al actualizar stock del producto:', err);
                    res.status(500).send('Error interno del servidor');
                    return;
                }
                // Redirigir a WhatsApp con el mensaje prellenado
                const message = `Compra realizada:\n\nModelo: ${product.name}\nCondición de batería: ${product.batteryCondition}\nPiezas originales: ${product.originalParts ? 'Sí' : 'No'}\nDetalle: ${product.description}`;
                const whatsappUrl = `https://wa.me/${process.env.MY_PHONE_NUMBER}?text=${encodeURIComponent(message)}`;
                res.redirect(whatsappUrl);
            });
        } else {
            res.send('Producto no disponible');
        }
    });
});

// Ruta para páginas no encontradas (404)
app.use((req, res, next) => {
    res.status(404).send("Página no encontrada");
});

// Middleware para verificar si el usuario es administrador
function requireAdmin(req, res, next) {
    if (req.session.userId) {
        db.get('SELECT isAdmin FROM users WHERE id = ?', [req.session.userId], (err, user) => {
            if (err) {
                console.error('Error al verificar administrador:', err);
                res.status(500).send('Error interno del servidor');
                return;
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

// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
