require('dotenv').config();  // Cargar variables de entorno desde .env

const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const multer = require('multer'); // Middleware para manejo de carga de archivos
const path = require('path');
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

// Conectar a la base de datos PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
// Middleware para manejar la carga de archivos con Multer
const upload = multer({
    storage: multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'uploads/'); // Directorio donde se guardarán las imágenes
        },
        filename: function (req, file, cb) {
            cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); // Nombre del archivo con timestamp
        }
    }),
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
});

// Función para validar tipos de archivo permitidos
function checkFileType(file, cb) {
    const filetypes = /jpeg|jpg|png|gif/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);

    if (extname && mimetype) {
        return cb(null, true);
    } else {
        cb('Error: Solo se permiten imágenes (jpeg/jpg/png/gif)');
    }
}
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
        pool.query('SELECT isAdmin FROM users WHERE id = $1', [req.session.userId], (err, result) => {
            if (err) {
                console.error('Error al verificar administrador:', err);
                res.status(500).send('Error interno del servidor');
                alert("Error de verifiacion de administrador")
                res.redirect("/login")
                return;
            }
            if (result.rows.length > 0 && result.rows[0].isadmin) {
                next();
            } else {
                res.send('Acceso denegado');
                alert("Acceso incorrecto")
                res.redirect("/login")
            }
        });
    } else {
        res.redirect('/login');
    }
}
// Ruta principal
app.get('/', (req, res) => {
    pool.query('SELECT * FROM products', (err, result) => {
        if (err) {
            console.error('Error al obtener productos:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.render('index', { products: result.rows, isAdmin: req.session.isAdmin });
    });
});

// Ruta para editar un producto (requiere autenticación de administrador)
app.get('/edit/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    pool.query('SELECT * FROM products WHERE id = $1', [id], (err, result) => {
        if (err) {
            console.error('Error al obtener producto para edición:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.render('edit', { product: result.rows[0] });
    });
});

// Ruta para procesar la edición de un producto (requiere autenticación de administrador)
app.post('/edit/:id', requireAdmin, upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { name, description, price, stock } = req.body;
    let imageUrl = req.body.image; // Por defecto, la URL se toma del formulario
    if (req.file) {
        imageUrl = '/uploads/' + req.file.filename; // Si se carga una nueva imagen, usar la ruta de Multer
    }
    pool.query('UPDATE products SET name = $1, description = $2, img = $3, price = $4, stock = $5 WHERE id = $6', [name, description, imageUrl, price, stock, id], (err) => {
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
// Ruta para procesar el formulario de nuevo producto (requiere autenticación de administrador)
app.post('/new', requireAdmin, (req, res) => {
    const { name, description, price, stock, image } = req.body;
    const imageUrl = image; // Utilizar la URL de la imagen proporcionada en el formulario
    pool.query('INSERT INTO products (name, description, img, price, stock) VALUES ($1, $2, $3, $4, $5)', [name, description, imageUrl, price, stock], (err) => {
        if (err) {
            console.error('Error al agregar nuevo producto:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.redirect('/');
    });
});

// Ruta para iniciar sesión
// Ruta para iniciar sesión
app.get('/login', (req, res) => {
    res.render('login', { session: req.session });
});


// Ruta para procesar el formulario de inicio de sesión
// Ruta para procesar el formulario de inicio de sesión
// Ruta para procesar el formulario de inicio de sesión
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password], (err, result) => {
        if (err) {
            console.error('Error al buscar usuario:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        if (result.rows.length > 0) {
            const user = result.rows[0];
            req.session.userId = user.id;
            req.session.isAdmin = user.isadmin;
            res.redirect('/');
        } else {
            req.session.error = 'Credenciales incorrectas'; // Guardar el mensaje de error en la sesión
            res.redirect('/login'); // Redirigir al usuario a la página de inicio de sesión
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
    pool.query('SELECT * FROM products', (err, result) => {
        if (err) {
            console.error('Error al obtener productos para el carrito:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.render('cart', { products: result.rows });
    });
});

// Ruta para manejar la compra de productos
app.post('/buy/:id', (req, res) => {
    const id = req.params.id;
    pool.query('SELECT * FROM products WHERE id = $1', [id], (err, result) => {
        if (err) {
            console.error('Error al obtener producto para compra:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        const product = result.rows[0];
        if (product.stock > 0) {
            pool.query('UPDATE products SET stock = stock - 1 WHERE id = $1', [id], (err) => {
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
            SwalMixin.fire({
                icon: 'error',
                title: 'Error',
                text: 'Producto sin stock disponible',
            });
            res.redirect('/cart');
        }
    });
});


// Ruta para eliminar un producto (requiere autenticación de administrador)
app.post('/delete/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    pool.query('DELETE FROM products WHERE id = $1', [id], (err) => {
        if (err) {
            console.error('Error al eliminar producto:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.redirect('/');
    });
});


// Manejador de errores para páginas no encontradas (404)
app.use((req, res, next) => {
    res.status(404).send("Página no encontrada");
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});

