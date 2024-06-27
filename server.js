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

// Configuración de Multer para almacenamiento de archivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) { 
        cb(null, 'uploads/'); // Directorio donde se guardarán los archivos subidos
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); // Nombre del archivo con timestamp
    }
});

// Inicializar el middleware de Multer
const upload = multer({ storage: storage });

// Middleware para manejar la carga de archivos en una ruta específica
app.post('/upload', upload.single('file'), (req, res) => {
    // Esta función se ejecutará después de que se haya subido el archivo
    res.send('Archivo subido exitosamente');
});


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
// const upload = multer({
//     storage: multer.diskStorage({
//         destination: function (req, file, cb) {
//             cb(null, 'uploads/'); // Directorio donde se guardarán las imágenes
//         },
//         filename: function (req, file, cb) {
//             cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)); // Nombre del archivo con timestamp
//         }
//     }),
//     fileFilter: function (req, file, cb) {
//         checkFileType(file, cb);
//     }
// });

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

// Ruta para obtener la URL de la primera imagen
app.get('/logoImageUrl', (req, res) => {
    pool.query('SELECT imagen1 FROM imagenes LIMIT 1', (err, result) => {
        if (err) {
            console.error('Error al obtener la URL de la primera imagen:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        
        if (result.rows.length === 0) {
            res.status(404).send('No se encontró la URL de la primera imagen');
            return;
        }

        const { imagen1 } = result.rows[0];
        res.send({ imageUrl: imagen1 });
    });
});


app.get('/about', (req, res) => {
    pool.query('SELECT * FROM about LIMIT 1', (err, result) => {
        if (err) {
            console.error('Error al obtener datos de la tabla about:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }

        const about = result.rows[0] || { titulo: '', texto: '', imagen: '' }; // Valores por defecto en caso de que no haya datos
        res.render('about', { about });
    });
});


// Ruta principal
// Ruta principal para renderizar la página principal
app.get('/', (req, res) => {
    let productsQuery = 'SELECT * FROM products';
    let carouselQuery = 'SELECT * FROM carousel';
    const aboutQuery = 'SELECT * FROM about LIMIT 1';

    Promise.all([
        pool.query(productsQuery).then(result => result.rows),
        pool.query(carouselQuery).then(result => result.rows),
        pool.query(aboutQuery).then(result => result.rows),
    ])
    .then(([products, carouselItems, aboutResult]) => {
        const about = aboutResult.length > 0 ? aboutResult[0] : { titulo: '', texto: '', imagen: '' };

        res.render('index', { products: products, carouselItems: carouselItems, about, isAdmin: req.session.isAdmin });
    })
    .catch(err => {
        console.error('Error al obtener datos:', err);
        res.status(500).send('Error interno del servidor');
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
        res.render('edit', { product: result.rows[0],isAdmin: req.session.isAdmin });
    });
});


//editar el about
app.get('/edit-about', requireAdmin, (req, res) => {
    pool.query('SELECT * FROM about LIMIT 1', (err, result) => {
        if (err) {
            console.error('Error al obtener datos de la tabla about:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        const about = result.rows.length > 0 ? result.rows[0] : { titulo: '', texto: '', imagen: '' };
        res.render('editAbout', { about,isAdmin: req.session.isAdmin });
    });
});

//procesar el edit
app.post('/edit-about', requireAdmin, upload.single('image'), (req, res) => {
    const { titulo, texto } = req.body;
    let imagen = req.body.imagen; // Por defecto, la URL se toma del formulario

    if (req.file) {
        imagen = '/uploads/' + req.file.filename; // Si se carga una nueva imagen, usar la ruta de Multer
    }

    pool.query('UPDATE about SET titulo = $1, texto = $2, imagen = $3', [titulo, texto, imagen], (err) => {
        if (err) {
            console.error('Error al actualizar contenido de about:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.redirect('/');
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
    res.render('new',{isAdmin: req.session.isAdmin});
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
    res.render('login', { session: req.session ,isAdmin: req.session.isAdmin});
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
        res.render('cart', { products: result.rows,isAdmin: req.session.isAdmin });
    });
});

// Ruta para manejar la compra de productos

// Ruta para manejar la compra de productos
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
            // Aquí puedes realizar cualquier otra acción que necesites sin modificar el stock
            // Por ejemplo, redirigir a WhatsApp con el mensaje prellenado
            const message = `Solicitud:\n\nModelo: ${product.name}\nCondición de batería: ${product.batteryCondition}\nPiezas originales: ${product.originalParts ? 'Sí' : 'No'}\nDetalle: ${product.description}`;
            const whatsappUrl = `https://wa.me/${process.env.MY_PHONE_NUMBER}?text=${encodeURIComponent(message)}`;
            res.redirect(whatsappUrl);
        } else {
            // Mostrar mensaje de error si el producto no tiene stock
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

// Ruta para mostrar el formulario de edición del carrusel (requiere autenticación de administrador)
// Ruta para editar y agregar elementos al carrusel (requiere autenticación de administrador)
app.get('/edit-carousel', requireAdmin, (req, res) => {
    pool.query('SELECT * FROM carousel', (err, result) => {
        if (err) {
            console.error('Error al obtener elementos del carrusel:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.render('edit-carousel', { carouselItems: result.rows ,isAdmin: req.session.isAdmin});
    });
});

app.post('/edit-carousel', requireAdmin, upload.single('image'), (req, res) => {
    const { id, text, color1, color2 } = req.body;
    let imageUrl = req.body.image; // Por defecto, la URL se toma del formulario

    // Verificar si se subió una nueva imagen
    if (req.file) {
        imageUrl = '/uploads/' + req.file.filename; // Utilizar la nueva imagen subida
    }

    // Consultar la imagen actual para manejar el caso donde no se sube una nueva
    pool.query('SELECT img FROM carousel WHERE id = $1', [id], (err, result) => {
        if (err) {
            console.error('Error al obtener imagen actual del carrusel:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }

        // Si no se subió una nueva imagen, mantener la imagen existente
        if (!req.file && result.rows.length > 0) {
            imageUrl = result.rows[0].img;
        }

        // Insertar o actualizar el elemento del carrusel en la base de datos
        if (id) {
            // Si hay un ID, actualizamos
            pool.query('UPDATE carousel SET text = $1, img = $2, color1 = $3, color2 = $4 WHERE id = $5', [text, imageUrl, color1, color2, id], (err) => {
                if (err) {
                    console.error('Error al actualizar elemento del carrusel:', err);
                    res.status(500).send('Error interno del servidor');
                    return;
                }
                res.redirect('/edit-carousel');
            });
        } else {
            // Si no hay un ID, insertamos un nuevo elemento
            pool.query('INSERT INTO carousel (text, img, color1, color2) VALUES ($1, $2, $3, $4)', [text, imageUrl, color1, color2], (err) => {
                if (err) {
                    console.error('Error al agregar nuevo elemento al carrusel:', err);
                    res.status(500).send('Error interno del servidor');
                    return;
                }
                res.redirect('/edit-carousel');
            });
        }
    });
});

// Ruta para eliminar un elemento del carrusel
app.post('/delete-carousel', requireAdmin, (req, res) => {
    const { id } = req.body;
    pool.query('DELETE FROM carousel WHERE id = $1', [id], (err) => {
        if (err) {
            console.error('Error al eliminar elemento del carrusel:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.redirect('/edit-carousel');
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

