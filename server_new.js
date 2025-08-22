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
app.use(compression())

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
app.use(express.json()); // Usar express.json() directamente
app.use(express.urlencoded({ extended: true })); // Usar express.urlencoded() directamente
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
    // Simplificado para desarrollo - solo verifica que esté logueado
    if (req.session.userId) {
        console.log('Usuario logueado, acceso permitido. UserID:', req.session.userId);
        next();
    } else {
        console.log('Usuario no logueado, redirigiendo al login');
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
app.get('/', (req, res) => {
    let productsQuery = 'SELECT * FROM products';
    let carouselQuery = 'SELECT * FROM carousel';
    const aboutQuery = 'SELECT * FROM about LIMIT 1';
    const imagesQuery = 'SELECT imagen1, imagen2 FROM imagenes LIMIT 1'; // Query para obtener imagen2

    Promise.all([
        pool.query(productsQuery).then(result => result.rows),
        pool.query(carouselQuery).then(result => result.rows),
        pool.query(aboutQuery).then(result => result.rows),
        pool.query(imagesQuery).then(result => result.rows[0]) // Obtener imagen1 y imagen2 aquí
    ])
    .then(([products, carouselItems, aboutResult, images]) => {
        const about = aboutResult.length > 0 ? aboutResult[0] : { titulo: '', texto: '', imagen: '' };
        const logoUrl = images.imagen1; // Asignar imagen1 como logoUrl
        const imagen2Url = images.imagen2; // Obtener imagen2

        res.render('index', { products, carouselItems, about, logoUrl, imagen2Url, isAdmin: req.session.isAdmin });
    })
    .catch(err => {
        console.error('Error al obtener datos:', err);
        res.status(500).send('Error interno del servidor');
    });
});

// Ruta para mostrar el formulario de edición de imágenes
app.get('/edit-images', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM imagenes WHERE id = $1', [1]); // Asumiendo que solo tienes un registro con ID 1
    const imagenes = result.rows[0];
    res.render('editImages', { isAdmin: true, imagenes });
});

// Ruta para carrito de compras
app.get('/cart', (req, res) => {
    let productsQuery = 'SELECT * FROM products';
    const aboutQuery = 'SELECT * FROM about LIMIT 1';
    const logoQuery = 'SELECT imagen1, imagen2 FROM imagenes LIMIT 1'; // Query para obtener las imágenes

    Promise.all([
        pool.query(productsQuery).then(result => result.rows),
        pool.query(aboutQuery).then(result => result.rows),
        pool.query(logoQuery).then(result => result.rows[0]) // Obtener imagen1 (logo) y imagen2 aquí
    ])
    .then(([products, aboutResult, images]) => {
        const about = aboutResult.length > 0 ? aboutResult[0] : { titulo: '', texto: '', imagen: '' };
        const logoUrl = images.imagen1; // URL de imagen1 (logo)
        const imagenUrl2 = images.imagen2; // URL de imagen2

        res.render('cart', { products, about, logoUrl, imagenUrl2, isAdmin: req.session.isAdmin });
    })
    .catch(err => {
        console.error('Error al obtener productos para el carrito:', err);
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

// ==================== RUTAS PARA SISTEMA DE CAJAS ====================

// Ruta principal de CAJAS (solo admin)
app.get('/cajas', requireAdmin, async (req, res) => {
    try {
        const productsResult = await pool.query('SELECT * FROM products ORDER BY name');
        const logoResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        
        const products = productsResult.rows;
        const images = logoResult.rows[0] || {};
        const logoUrl = images.imagen1;
        const imagen2Url = images.imagen2;

        res.render('cajas', { 
            products, 
            logoUrl, 
            imagen2Url, 
            isAdmin: req.session.isAdmin 
        });
    } catch (err) {
        console.error('Error al cargar sistema de cajas:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Ruta para el histórico de ventas (solo admin)
app.get('/historico', requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 20;
        const offset = (page - 1) * limit;

        // Obtener total de registros para paginación
        const countResult = await pool.query('SELECT COUNT(*) FROM facturas');
        const totalRecords = parseInt(countResult.rows[0].count);
        const totalPages = Math.ceil(totalRecords / limit);

        // Obtener facturas con información del vendedor
        const facturasResult = await pool.query(`
            SELECT f.*, u.username as vendedor_nombre 
            FROM facturas f 
            LEFT JOIN users u ON f.vendedor_id = u.id 
            ORDER BY f.fecha DESC 
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const logoResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        const images = logoResult.rows[0] || {};

        res.render('historico', {
            facturas: facturasResult.rows,
            currentPage: page,
            totalPages,
            totalRecords,
            logoUrl: images.imagen1,
            imagen2Url: images.imagen2,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al cargar histórico:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Ruta para ver una factura específica
app.get('/factura/:id', requireAdmin, async (req, res) => {
    try {
        const facturaId = req.params.id;
        const facturaResult = await pool.query(`
            SELECT f.*, u.username as vendedor_nombre 
            FROM facturas f 
            LEFT JOIN users u ON f.vendedor_id = u.id 
            WHERE f.id = $1
        `, [facturaId]);

        if (facturaResult.rows.length === 0) {
            return res.status(404).send('Factura no encontrada');
        }

        const logoResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        const images = logoResult.rows[0] || {};

        res.render('factura-detalle', {
            factura: facturaResult.rows[0],
            logoUrl: images.imagen1,
            imagen2Url: images.imagen2,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al cargar factura:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Ruta para obtener todos los datos de un producto específico
app.get('/product/:id', async (req, res) => {
    const id = req.params.id;

    try {
        const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [id]);

        if (productResult.rows.length === 0) {
            return res.status(404).send('Producto no encontrado');
        }

        const product = productResult.rows[0];
        res.render('product', { product, isAdmin: req.session.isAdmin });
    } catch (err) {
        console.error('Error al obtener el producto:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// ==================== RUTAS POST ====================

// Ruta POST para redirigir a la hoja de producto
app.post('/product', (req, res) => {
    const { productId } = req.body;

    if (!productId) {
        return res.status(400).send('ID del producto no proporcionado');
    }

    res.redirect(`/product/${productId}`);
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

// ==================== RUTAS POST PARA SISTEMA DE CAJAS ====================

// Procesar nueva factura
app.post('/cajas/procesar-venta', requireAdmin, async (req, res) => {
    console.log('=== DEBUG COMPLETO ===');
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Body RAW:', req.body);
    console.log('Body stringify:', JSON.stringify(req.body, null, 2));
    console.log('Body keys:', Object.keys(req.body || {}));
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const {
            cliente_nombre,
            cliente_telefono,
            cliente_email,
            items,
            subtotal,
            impuestos,
            total,
            metodo_pago,
            notas
        } = req.body;

        console.log('=== DATOS EXTRAÍDOS ===');
        console.log('cliente_nombre:', cliente_nombre, typeof cliente_nombre);
        console.log('items:', items, typeof items, Array.isArray(items));
        console.log('subtotal:', subtotal, typeof subtotal);
        console.log('total:', total, typeof total);

        // Validación más específica
        if (!cliente_nombre) {
            console.log('ERROR: cliente_nombre es', cliente_nombre);
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'El nombre del cliente es requerido - está vacío o undefined'
            });
        }

        if (typeof cliente_nombre === 'string' && cliente_nombre.trim() === '') {
            console.log('ERROR: cliente_nombre es string vacío');
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'El nombre del cliente es requerido - es string vacío'
            });
        }

        if (!items) {
            console.log('ERROR: items es', items);
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'Items es undefined o null'
            });
        }

        if (!Array.isArray(items)) {
            console.log('ERROR: items no es array', typeof items);
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'Items no es un array'
            });
        }

        if (items.length === 0) {
            console.log('ERROR: items array está vacío');
            await client.query('ROLLBACK');
            return res.json({
                success: false,
                message: 'Debe agregar al menos un producto al carrito - array vacío'
            });
        }

        // Generar número de factura único más corto
        const fecha = new Date();
        const year = fecha.getFullYear().toString().slice(-2); // Últimos 2 dígitos del año
        const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const day = fecha.getDate().toString().padStart(2, '0');
        const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
        const numeroFactura = `F${year}${month}${day}${random}`; // Formato: F24082200X (10 chars)
        
        console.log('=== PROCESANDO FACTURA ===');
        console.log('Número de factura:', numeroFactura);
        console.log('Cliente:', cliente_nombre);
        console.log('Items count:', items.length);
        
        // Insertar factura en la base de datos
        const facturaResult = await client.query(`
            INSERT INTO facturas (
                numero_factura, cliente_nombre, cliente_telefono, cliente_email,
                items, subtotal, impuestos, total, metodo_pago, vendedor_id, notas, estado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING id, numero_factura
        `, [
            numeroFactura,
            cliente_nombre.trim(),
            cliente_telefono || null,
            cliente_email || null,
            JSON.stringify(items),
            parseFloat(subtotal || 0),
            parseFloat(impuestos || 0),
            parseFloat(total || 0),
            metodo_pago || 'efectivo',
            req.session.userId || 1,
            notas || null,
            'completada'
        ]);

        const factura = facturaResult.rows[0];
        console.log('Factura creada exitosamente:', factura);

        // Actualizar stock de productos
        for (let item of items) {
            console.log('Actualizando stock - Producto ID:', item.product_id, 'Cantidad:', item.cantidad);
            await client.query(
                'UPDATE products SET stock = stock - $1 WHERE id = $2',
                [item.cantidad, item.product_id]
            );
        }

        await client.query('COMMIT');
        console.log('=== TRANSACCIÓN COMPLETADA ===');
        
        res.json({
            success: true,
            facturaId: factura.id,
            numeroFactura: factura.numero_factura,
            message: 'Venta procesada exitosamente'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('=== ERROR EN PROCESAR VENTA ===');
        console.error('Tipo de error:', err.name);
        console.error('Mensaje:', err.message);
        console.error('Stack completo:', err.stack);
        res.status(500).json({ 
            success: false, 
            message: 'Error al procesar la venta: ' + err.message 
        });
    } finally {
        client.release();
    }
});

// Generar PDF de factura
app.get('/factura/:id/pdf', requireAdmin, async (req, res) => {
    try {
        const facturaId = req.params.id;
        console.log('Generando PDF para factura ID:', facturaId);
        
        const facturaResult = await pool.query(`
            SELECT f.*, u.username as vendedor_nombre 
            FROM facturas f 
            LEFT JOIN users u ON f.vendedor_id = u.id 
            WHERE f.id = $1
        `, [facturaId]);

        if (facturaResult.rows.length === 0) {
            console.log('Factura no encontrada:', facturaId);
            return res.status(404).send('Factura no encontrada');
        }

        const factura = facturaResult.rows[0];
        console.log('Factura encontrada:', {
            id: factura.id,
            numero_factura: factura.numero_factura,
            items_type: typeof factura.items,
            items_content: factura.items
        });

        const logoResult = await pool.query('SELECT imagen1 FROM imagenes LIMIT 1');
        const logoUrl = logoResult.rows[0]?.imagen1 || '';

        // Generar HTML para PDF
        const htmlContent = generateInvoiceHTML(factura, logoUrl);
        console.log('HTML generado, longitud:', htmlContent.length);
        
        // Configurar puppeteer para generar PDF
        const puppeteer = require('puppeteer');
        let browser;
        try {
            browser = await puppeteer.launch({ 
                headless: 'new',
                args: [
                    '--no-sandbox', 
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu'
                ]
            });
            console.log('Browser launched successfully');
            
            const page = await browser.newPage();
            console.log('New page created');
            
            // Configurar viewport y opciones
            await page.setViewport({ width: 800, height: 1200, deviceScaleFactor: 1 });
            
            // Cargar el HTML con un timeout más largo
            await page.setContent(htmlContent, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000
            });
            console.log('Content set successfully');
            
            // Esperar un poco para que se renderice
            await page.waitForTimeout(1000);
            
            const pdfBuffer = await page.pdf({
                format: 'A4',
                printBackground: true,
                margin: {
                    top: '20mm',
                    bottom: '20mm',
                    left: '15mm',
                    right: '15mm'
                },
                preferCSSPageSize: false,
                displayHeaderFooter: false,
                timeout: 30000
            });
            console.log('PDF generated successfully, size:', pdfBuffer.length);

            // Configurar headers para descarga de PDF
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="Factura-${factura.numero_factura}.pdf"`);
            res.setHeader('Content-Length', pdfBuffer.length);
            res.send(pdfBuffer);

        } finally {
            if (browser) {
                await browser.close();
                console.log('Browser closed');
            }
        }

    } catch (err) {
        console.error('Error detallado al generar PDF:', {
            name: err.name,
            message: err.message,
            stack: err.stack
        });
        res.status(500).send('Error al generar PDF: ' + err.message);
    }
});

// Búsqueda de facturas
app.get('/api/facturas/search', requireAdmin, async (req, res) => {
    try {
        const { q, fecha_desde, fecha_hasta } = req.query;
        let query = `
            SELECT f.*, u.username as vendedor_nombre 
            FROM facturas f 
            LEFT JOIN users u ON f.vendedor_id = u.id 
            WHERE 1=1
        `;
        let params = [];
        let paramCount = 0;

        if (q) {
            paramCount++;
            query += ` AND (f.numero_factura ILIKE $${paramCount} OR f.cliente_nombre ILIKE $${paramCount})`;
            params.push(`%${q}%`);
        }

        if (fecha_desde) {
            paramCount++;
            query += ` AND f.fecha >= $${paramCount}`;
            params.push(fecha_desde);
        }

        if (fecha_hasta) {
            paramCount++;
            query += ` AND f.fecha <= $${paramCount}`;
            params.push(fecha_hasta + ' 23:59:59');
        }

        query += ' ORDER BY f.fecha DESC LIMIT 50';

        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error('Error en búsqueda:', err);
        res.status(500).json({ error: 'Error en la búsqueda' });
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

// ==================== FUNCIONES AUXILIARES ====================

// Función para generar HTML de factura para PDF
function generateInvoiceHTML(factura, logoUrl) {
    let items = [];
    
    // Manejar diferentes formatos de items
    try {
        if (typeof factura.items === 'string') {
            items = JSON.parse(factura.items);
        } else if (Array.isArray(factura.items)) {
            items = factura.items;
        } else if (factura.items && typeof factura.items === 'object') {
            items = [factura.items];
        }
        
        if (!Array.isArray(items)) {
            items = [];
        }
    } catch (error) {
        console.error('Error parsing items for PDF:', error);
        items = [];
    }
    
    const fecha = new Date(factura.fecha).toLocaleDateString('es-ES');
    const itemsRows = items.map(item => {
        const precio = parseFloat(item.price || 0);
        const cantidad = parseInt(item.cantidad || 1);
        const subtotal = precio * cantidad;
        return `
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.name || 'Producto'}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${cantidad}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${precio.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${subtotal.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
            </tr>`;
    }).join('');
    
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Factura ${factura.numero_factura}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #007bff; }
        .logo { max-height: 50px; }
        .invoice-info { text-align: right; }
        .invoice-info h1 { color: #007bff; margin: 0; }
        .customer-section { background: #f8f9fa; padding: 15px; margin: 15px 0; }
        .customer-section h3 { color: #007bff; margin: 0 0 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background: #007bff; color: white; padding: 8px; text-align: left; }
        td { padding: 8px; border: 1px solid #ddd; }
        tr:nth-child(even) { background: #f9f9f9; }
        .totals { background: #f8f9fa; padding: 15px; margin-top: 20px; }
        .totals table { margin: 0; }
        .total-row { font-weight: bold; color: #007bff; font-size: 16px; }
        .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; color: #666; }
        .notes { background: #fff3cd; padding: 15px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="header">
        <div>${logoUrl ? `<img src="${logoUrl}" alt="iPhone Stock" class="logo">` : '<div style="font-size: 18px; font-weight: bold; color: #007bff;">iPhone Stock</div>'}</div>
        <div class="invoice-info">
            <h1>FACTURA</h1>
            <p><strong>N°:</strong> ${factura.numero_factura}</p>
            <p><strong>Fecha:</strong> ${fecha}</p>
        </div>
    </div>
    
    <div class="customer-section">
        <h3>Información del Cliente</h3>
        <p><strong>Nombre:</strong> ${factura.cliente_nombre}</p>
        ${factura.cliente_telefono ? `<p><strong>Teléfono:</strong> ${factura.cliente_telefono}</p>` : ''}
        ${factura.cliente_email ? `<p><strong>Email:</strong> ${factura.cliente_email}</p>` : ''}
        <p><strong>Método de Pago:</strong> ${factura.metodo_pago || 'Efectivo'}</p>
    </div>
    
    <h3 style="color: #007bff;">Productos</h3>
    <table>
        <thead>
            <tr>
                <th style="width: 50%;">Producto</th>
                <th style="width: 15%;">Cantidad</th>
                <th style="width: 20%;">Precio Unit.</th>
                <th style="width: 15%;">Subtotal</th>
            </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>
    
    <div class="totals">
        <table style="width: 300px; margin-left: auto;">
            <tr>
                <td>Subtotal:</td>
                <td style="text-align: right;">$${parseFloat(factura.subtotal || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
                <td>Impuestos:</td>
                <td style="text-align: right;">$${parseFloat(factura.impuestos || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr class="total-row">
                <td><strong>TOTAL:</strong></td>
                <td style="text-align: right;"><strong>$${parseFloat(factura.total || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}</strong></td>
            </tr>
        </table>
    </div>
    
    ${factura.notas ? `<div class="notes"><h4>Notas:</h4><p>${factura.notas}</p></div>` : ''}
    
    <div class="footer">
        <p><strong>¡Gracias por su compra!</strong></p>
        <p>Vendedor: ${factura.vendedor_nombre || 'Sistema'}</p>
        <p>iPhone Stock - Sistema de Facturación</p>
    </div>
</body>
</html>`;
}

// Manejador de errores para páginas no encontradas (404)
app.use((req, res, next) => {
    res.status(404).send("Página no encontrada");
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
