require('dotenv').config();  // Cargar variables de entorno desde .env
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const multer = require('multer'); // Middleware para manejo de carga de archivos
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(compression());


const redis = require('redis');
const redisClient = redis.createClient({
    url: process.env.REDIS_URL, // Configura esto si estás usando Redis en la nube
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

(async () => {
    await redisClient.connect(); // Conectar al servidor de Redis
})();





// Middleware para bloquear rutas específicas
app.use((req, res, next) => {
    const blockedPaths = [
        '/wp-includes/pomo/wp-login.php',
        '/wp-includes/fonts/wp-login.php',
        '/wp-includes/customize/wp-login.php',
        '/.tmb/wp-login.php',
        '/.well-known/pki-validation/wp-login.php',
        '/cgi-bin/wp-login.php',
        '/images/wp-login.php',
        '/wp-admin/css/wp-login.php',
        '/wp-admin/images/wp-login.php',
        '/wp-admin/',
        '/wp-login.php'
    ];

    // Bloquea las rutas mencionadas
    if (blockedPaths.includes(req.path) || req.path === '/wp-login.php') {
        res.status(403).send('Access forbidden');
    } else {
        next();
    }
});

// Configurar Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
});

// Configuración de Multer para almacenamiento en Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uploads', // Carpeta en Cloudinary
        format: async (req, file) => 'png', // Puedes cambiar el formato si es necesario
        public_id: (req, file) => file.fieldname + '-' + Date.now(), // Nombre del archivo en Cloudinary
    },
});

const upload = multer({ storage: storage });

// Middleware para manejar la carga de archivos en una ruta específica y almacenar el enlace en la base de datos
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const imageUrl = req.file.path; // URL de la imagen en Cloudinary
        await pool.query('INSERT INTO imagenes (imagen1) VALUES ($1)', [imageUrl]); // Inserta la URL en la base de datos
        res.send('Archivo subido exitosamente y URL almacenada en la base de datos');
    } catch (error) {
        console.error('Error al subir la imagen o guardar la URL:', error);
        res.status(500).send('Error interno del servidor');
    }
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
const sessionSecret = process.env.SESSION_SECRET;

app.use(session({
    secret: sessionSecret,
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

// Middleware para verificar si el usuario es administrador
function requireAdmin(req, res, next) {
    if (req.session.userId) {
        pool.query('SELECT isAdmin FROM users WHERE id = $1', [req.session.userId], (err, result) => {
            if (err) {
                console.error('Error al verificar administrador:', err);
                res.status(500).send('Error interno del servidor');
                return;
            }
            if (result.rows.length > 0 && result.rows[0].isadmin) {
                next();
            } else {
                res.send('Acceso denegado');
            }
        });
    } else {
        res.redirect('/login');
    }
}

//TODOS LOS GET
// Ruta para el inicio de sesión
app.get('/login', (req, res) => {
    pool.query('SELECT imagen2 FROM imagenes LIMIT 1', (err, result) => {
        if (err) {
            console.error('Error al obtener la URL de la primera imagen:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        
        if (result.rows.length === 0) {
            res.status(404).send('No se encontró la URL de la primera imagen');
            return;
        }

        const { imagen2 } = result.rows[0];
        res.render('login', { session: req.session, isAdmin: req.session.isAdmin, logoUrl: imagen2 });
    });
});

// Ruta para obtener la URL de la primera imagen (logo)
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
        res.send(imagen1); // Devolver la URL directamente
    });
});

// Ruta para mostrar el formulario de edición del carrusel (requiere autenticación de administrador)
app.get('/edit-carousel', requireAdmin, (req, res) => {
    pool.query('SELECT * FROM carousel', (err, result) => {
        if (err) {
            console.error('Error al obtener elementos del carrusel:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        res.render('edit-carousel', { carouselItems: result.rows, isAdmin: req.session.isAdmin });
    });
});


// Ruta para la página "about"
app.get('/about', (req, res) => {
    pool.query('SELECT * FROM about LIMIT 1', (err, result) => {
        if (err) {
            console.error('Error al obtener datos de la tabla about:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }

        const about = result.rows[0] || { titulo: '', texto: '', imagen: '' }; // Valores por defecto en caso de que no haya datos
        res.render('about', { about, isAdmin: req.session.isAdmin });
    });
});

// Ruta principal para renderizar la página principal
app.get('/', async (req, res) => {
    try {
        // Intenta obtener los datos del caché de Redis
        const cachedProducts = await redisClient.get('products');
        const cachedCarouselItems = await redisClient.get('carouselItems');
        const cachedAbout = await redisClient.get('about');
        const cachedImages = await redisClient.get('images');

        let products, carouselItems, aboutResult, images;

        if (cachedProducts && cachedCarouselItems && cachedAbout && cachedImages) {
            // Si los datos están en el caché, los parseamos
            products = JSON.parse(cachedProducts);
            carouselItems = JSON.parse(cachedCarouselItems);
            aboutResult = JSON.parse(cachedAbout);
            images = JSON.parse(cachedImages);
        } else {
            // Si los datos no están en el caché, obtenemos los datos de la base de datos
            const productsQuery = 'SELECT * FROM products';
            const carouselQuery = 'SELECT * FROM carousel';
            const aboutQuery = 'SELECT * FROM about LIMIT 1';
            const imagesQuery = 'SELECT imagen1, imagen2 FROM imagenes LIMIT 1';

            const [productsFromDb, carouselFromDb, aboutFromDb, imagesFromDb] = await Promise.all([
                pool.query(productsQuery).then(result => result.rows),
                pool.query(carouselQuery).then(result => result.rows),
                pool.query(aboutQuery).then(result => result.rows),
                pool.query(imagesQuery).then(result => result.rows[0])
            ]);

            products = productsFromDb;
            carouselItems = carouselFromDb;
            aboutResult = aboutFromDb.length > 0 ? aboutFromDb[0] : { titulo: '', texto: '', imagen: '' };
            images = imagesFromDb;

            // Guarda los resultados en Redis con una expiración de 60 segundos
            await redisClient.set('products', JSON.stringify(products), { EX: 60 });
            await redisClient.set('carouselItems', JSON.stringify(carouselItems), { EX: 60 });
            await redisClient.set('about', JSON.stringify(aboutResult), { EX: 60 });
            await redisClient.set('images', JSON.stringify(images), { EX: 60 });
        }

        // Renderizamos la página con los datos
        res.render('index', {
            products,
            carouselItems,
            about: aboutResult,
            logoUrl: images.imagen1,
            imagen2Url: images.imagen2,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al obtener datos:', err);
        res.status(500).send('Error interno del servidor');
    }
});


// Ruta para mostrar el formulario de edición de imágenes
app.get('/edit-images', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM imagenes WHERE id = $1', [1]); // Asumiendo que solo tienes un registro con ID 1
    const imagenes = result.rows[0];
    res.render('editImages', { isAdmin: true, imagenes });
});

// Ruta para carrito de compras
app.get('/cart', async (req, res) => {
    try {
        // Intenta obtener los datos del caché de Redis
        const cachedProducts = await redisClient.get('products');
        const cachedAbout = await redisClient.get('about');
        const cachedImages = await redisClient.get('images');

        let products, aboutResult, images;

        if (cachedProducts && cachedAbout && cachedImages) {
            // Si los datos están en el caché, los parseamos
            products = JSON.parse(cachedProducts);
            aboutResult = JSON.parse(cachedAbout);
            images = JSON.parse(cachedImages);
        } else {
            // Si los datos no están en el caché, obtenemos los datos de la base de datos
            const productsQuery = 'SELECT * FROM products';
            const aboutQuery = 'SELECT * FROM about LIMIT 1';
            const logoQuery = 'SELECT imagen1, imagen2 FROM imagenes LIMIT 1';

            const [productsFromDb, aboutFromDb, imagesFromDb] = await Promise.all([
                pool.query(productsQuery).then(result => result.rows),
                pool.query(aboutQuery).then(result => result.rows),
                pool.query(logoQuery).then(result => result.rows[0])
            ]);

            products = productsFromDb;
            aboutResult = aboutFromDb.length > 0 ? aboutFromDb[0] : { titulo: '', texto: '', imagen: '' };
            images = imagesFromDb;

            // Guarda los resultados en Redis con una expiración de 60 segundos
            await redisClient.set('products', JSON.stringify(products), { EX: 60 });
            await redisClient.set('about', JSON.stringify(aboutResult), { EX: 60 });
            await redisClient.set('images', JSON.stringify(images), { EX: 60 });
        }

        // Renderizamos la página con los datos
        res.render('cart', {
            products,
            about: aboutResult,
            logoUrl: images.imagen1,
            imagenUrl2: images.imagen2,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al obtener productos para el carrito:', err);
        res.status(500).send('Error interno del servidor');
    }
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
        res.render('edit', { product: result.rows[0], isAdmin: req.session.isAdmin });
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

// Editar el about
app.get('/edit-about', requireAdmin, (req, res) => {
    pool.query('SELECT * FROM about LIMIT 1', (err, result) => {
        if (err) {
            console.error('Error al obtener datos de la tabla about:', err);
            res.status(500).send('Error interno del servidor');
            return;
        }
        const about = result.rows.length > 0 ? result.rows[0] : { titulo: '', texto: '', imagen: '' };
        res.render('editAbout', { about, isAdmin: req.session.isAdmin });
    });
});

// Ruta para agregar un nuevo producto (requiere autenticación de administrador)
app.get('/new', requireAdmin, (req, res) => {
    res.render('new', { isAdmin: req.session.isAdmin });
});

// Ruta para procesar el formulario de nuevo producto (requiere autenticación de administrador)
app.post('/new', requireAdmin, upload.single('image'), async (req, res) => {
    const { name, description, price, stock, bateria, almacenamiento, estado } = req.body;
    let imageUrl;

    if (req.file) {
        imageUrl = req.file.path; // La URL de la imagen subida a Cloudinary
    }

    try {
        await pool.query('INSERT INTO products (name, description, img, price, stock, bateria, almacenamiento, estado) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [name, description, imageUrl, price, stock, bateria, almacenamiento, estado]);
        res.redirect('/');
    } catch (err) {
        console.error('Error al agregar nuevo producto:', err);
        res.status(500).send('Error interno del servidor');
    }
});


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

// Procesar el edit-about
app.post('/edit-about', requireAdmin, upload.single('imagen'), async (req, res) => {
    const { titulo, texto } = req.body;
    let imagen = req.body.imagen; // Mantener la URL de la imagen existente.

    // Si se carga una nueva imagen, actualizar con la nueva URL.
    if (req.file) {
        imagen = req.file.path;
    }

    try {
        // Actualiza los campos en la base de datos.
        await pool.query('UPDATE about SET titulo = $1, texto = $2, imagen = $3 WHERE id = $4', [titulo, texto, imagen, 1]);
        res.redirect('/');
    } catch (err) {
        console.error('Error al actualizar contenido de about:', err);
        res.status(500).send('Error interno del servidor');
    }
});



// Ruta para procesar la edición de un producto (requiere autenticación de administrador)
// Ruta para procesar la edición de un producto (requiere autenticación de administrador)
app.post('/edit/:id', requireAdmin, upload.single('image'), async (req, res) => {
    const id = req.params.id;
    const { name, description, price, stock, bateria, almacenamiento, estado } = req.body;
    let imageUrl = req.body.image; // Mantener la URL actual de la imagen

    if (req.file) {
        imageUrl = req.file.path; // Si se carga una nueva imagen, usar la URL de Cloudinary
    }

    try {
        await pool.query(
            'UPDATE products SET name = $1, description = $2, img = $3, price = $4, stock = $5, bateria = $6, almacenamiento = $7, estado = $8 WHERE id = $9',
            [name, description, imageUrl, price, stock, bateria, almacenamiento, estado, id]
        );
        res.redirect('/');
    } catch (err) {
        console.error('Error al actualizar producto:', err);
        res.status(500).send('Error interno del servidor');
    }
});

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
            // Generar el mensaje con solo el nombre del modelo, precio y porcentaje de batería
            const message = `Solicitud de compra:\n\nModelo: ${product.name}\nPrecio: $${product.price}\nBatería: ${product.bateria}%`;

            // Crear la URL de WhatsApp con el mensaje generado
            const whatsappUrl = `https://wa.me/${process.env.MY_PHONE_NUMBER}?text=${encodeURIComponent(message)}`;
            
            // Redirigir al usuario a WhatsApp con el mensaje prellenado
            res.redirect(whatsappUrl);
        } else {
            // Mostrar mensaje de error si el producto no tiene stock
            res.redirect('/cart');
        }
    });
});


// Ruta para eliminar un producto (requiere autenticación de administrador)
app.post('/delete/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query('DELETE FROM products WHERE id = $1', [id]);
        res.redirect('/');
    } catch (err) {
        console.error('Error al eliminar producto:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Ruta para editar y agregar elementos al carrusel (requiere autenticación de administrador)
app.post('/edit-carousel', requireAdmin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mobileImage', maxCount: 1 }]), async (req, res) => {
    const { id, text, color1, color2 } = req.body;
    let imageUrl;
    let mobileImageUrl;

    try {
        // Verificar si el ID es válido
        if (!id) {
            return res.status(400).send('ID inválido');
        }

        // Consultar las imágenes actuales para manejar el caso donde se suben nuevas imágenes
        const currentImagesQuery = await pool.query('SELECT img, imagenMobile FROM carousel WHERE id = $1', [id]);

        // Verificar si se encontró un registro
        if (currentImagesQuery.rows.length === 0) {
            return res.status(404).send('Elemento no encontrado');
        }

        const currentImages = currentImagesQuery.rows[0];

        // Si se subió una nueva imagen normal, eliminar la existente y guardar la nueva
        if (req.files['image']) {
            if (currentImages.img) {
                const publicId = currentImages.img.split('/').pop().split('.')[0]; // Obtener el public_id de Cloudinary
                await cloudinary.uploader.destroy(publicId); // Eliminar la imagen de Cloudinary
            }
            imageUrl = req.files['image'][0].path;  // Guardar la URL de la nueva imagen
        } else {
            imageUrl = currentImages.img; // Mantener la imagen existente si no se sube una nueva
        }

        // Si se subió una nueva imagen móvil, eliminar la existente y guardar la nueva
        if (req.files['mobileImage']) {
            if (currentImages.imagenmobile) {
                const publicId = currentImages.imagenmobile.split('/').pop().split('.')[0]; // Obtener el public_id de Cloudinary
                await cloudinary.uploader.destroy(publicId); // Eliminar la imagen móvil de Cloudinary
            }
            mobileImageUrl = req.files['mobileImage'][0].path;  // Guardar la URL de la nueva imagen móvil
        } else {
            mobileImageUrl = currentImages.imagenmobile; // Mantener la imagen existente si no se sube una nueva
        }

        // Actualizar el registro en la base de datos
        await pool.query(
            'UPDATE carousel SET text = $1, img = $2, imagenMobile = $3, color1 = $4, color2 = $5 WHERE id = $6',
            [text, imageUrl, mobileImageUrl, color1, color2, id]
        );

        res.redirect('/edit-carousel');
    } catch (err) {
        console.error('Error al actualizar el carrusel:', err);
        res.status(500).send('Error interno del servidor');
    }
});






// Ruta para eliminar un elemento del carrusel
app.post('/delete-carousel', requireAdmin, async (req, res) => {
    const { id } = req.body;
    try {
        await pool.query('DELETE FROM carousel WHERE id = $1', [id]);
        res.redirect('/edit-carousel');
    } catch (err) {
        console.error('Error al eliminar elemento del carrusel:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Ruta para manejar la actualización de las URLs de las imágenes
app.post('/edit-images', requireAdmin, async (req, res) => {
    const { imagen1, imagen2 } = req.body;
    try {
        await pool.query('UPDATE imagenes SET imagen1 = $1, imagen2 = $2 WHERE id = $3', [imagen1, imagen2, 1]);
        res.redirect('/');
    } catch (err) {
        console.error('Error al actualizar URLs de las imágenes:', err);
        res.status(500).send('Error interno del servidor');
    }
});


// Ruta para agregar un nuevo elemento al carrusel
app.post('/add-carousel', requireAdmin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'mobileImage', maxCount: 1 }]), async (req, res) => {
    const { text, color1, color2 } = req.body;
    let imageUrl;
    let mobileImageUrl;

    try {
        if (req.files['image']) {
            imageUrl = req.files['image'][0].path; // Guardar la URL de la nueva imagen
        }
        if (req.files['mobileImage']) {
            mobileImageUrl = req.files['mobileImage'][0].path; // Guardar la URL de la nueva imagen móvil
        }

        // Insertar el nuevo elemento en la base de datos
        await pool.query(
            'INSERT INTO carousel (text, img, imagenMobile, color1, color2) VALUES ($1, $2, $3, $4, $5)',
            [text, imageUrl, mobileImageUrl, color1, color2]
        );

        res.redirect('/edit-carousel');
    } catch (err) {
        console.error('Error al agregar el nuevo elemento al carrusel:', err);
        res.status(500).send('Error interno del servidor');
    }
});


// Manejador de errores para páginas no encontradas (404)
app.use((req, res, next) => {
    res.status(404).send("Página no encontrada");
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
