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
app.get('/', async (req, res) => {
    try {
        // Obtener cotización del dólar
        let cotizacionDolar = 1200;
        try {
            const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
        } catch (e) { console.log('Tabla configuracion no existe aún'); }

        // Consulta con JOIN a categorías para cuotas
        const productsResult = await pool.query('SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color, c.cuotas_max, c.interes_cuotas, c.cuotas_planes FROM products p LEFT JOIN categorias c ON p.categoria_id = c.id');
        const carouselResult = await pool.query('SELECT * FROM carousel');
        const aboutResult = await pool.query('SELECT * FROM about LIMIT 1');
        const imagesResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        
        // Obtener oferta general activa
        let ofertaGeneral = null;
        let categoriasExcluidas = [];
        try {
            const ofertaGeneralResult = await pool.query(`
                SELECT * FROM ofertas_generales
                WHERE activo = TRUE
                ORDER BY created_at DESC
                LIMIT 1
            `);
            ofertaGeneral = ofertaGeneralResult.rows[0];
            categoriasExcluidas = ofertaGeneral && ofertaGeneral.categorias_excluidas
                ? ofertaGeneral.categorias_excluidas.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
                : [];
        } catch (e) { console.log('Tabla ofertas_generales no existe aún'); }
        
        // Obtener ofertas específicas activas
        let ofertasMap = {};
        try {
            const ofertasResult = await pool.query(`
                SELECT o.*, p.price as precio_original,
                    CASE WHEN o.tipo_descuento = 'porcentaje' THEN ROUND(p.price * (1 - o.valor_descuento / 100), 2)
                    ELSE GREATEST(ROUND(p.price - o.valor_descuento, 2), 0) END as precio_con_descuento
                FROM ofertas o JOIN products p ON o.product_id = p.id WHERE o.activo = TRUE
            `);
            ofertasResult.rows.forEach(oferta => {
                ofertasMap[oferta.product_id] = {
                    oferta_id: oferta.id, tipo_descuento: oferta.tipo_descuento,
                    valor_descuento: oferta.valor_descuento, precio_final: oferta.precio_con_descuento,
                    tiene_oferta_vigente: true, es_oferta_general: false
                };
            });
        } catch (e) { console.log('Tabla ofertas no existe aún'); }

        // Combinar productos con ofertas
        const products = productsResult.rows.map(product => {
            if (ofertasMap[product.id]) return { ...product, ...ofertasMap[product.id] };
            if (ofertaGeneral && !categoriasExcluidas.includes(product.categoria_id)) {
                const precioConDescuento = ofertaGeneral.tipo_descuento === 'porcentaje'
                    ? Math.round(product.price * (1 - ofertaGeneral.valor_descuento / 100) * 100) / 100
                    : Math.max(Math.round((product.price - ofertaGeneral.valor_descuento) * 100) / 100, 0);
                return { ...product, oferta_id: `general_${ofertaGeneral.id}`, tipo_descuento: ofertaGeneral.tipo_descuento,
                    valor_descuento: ofertaGeneral.valor_descuento, precio_final: precioConDescuento,
                    tiene_oferta_vigente: true, es_oferta_general: true, nombre_oferta_general: ofertaGeneral.nombre };
            }
            return { ...product, tiene_oferta_vigente: false, precio_final: product.price };
        });

        const carouselItems = carouselResult.rows;
        const about = aboutResult.rows.length > 0 ? aboutResult.rows[0] : { titulo: '', texto: '', imagen: '' };
        const images = imagesResult.rows[0] || {};
        const logoUrl = images.imagen1;
        const imagen2Url = images.imagen2;

        res.render('index', { products, carouselItems, about, logoUrl, imagen2Url, isAdmin: req.session.isAdmin, cotizacionDolar });
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
        // Obtener cotización del dólar
        let cotizacionDolar = 1200;
        try {
            const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
        } catch (e) { }

        const productsResult = await pool.query('SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color, c.cuotas_max, c.interes_cuotas, c.cuotas_planes FROM products p LEFT JOIN categorias c ON p.categoria_id = c.id');
        const aboutResult = await pool.query('SELECT * FROM about LIMIT 1');
        const imagesResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        
        // Obtener oferta general activa
        let ofertaGeneral = null;
        let categoriasExcluidas = [];
        try {
            const ofertaGeneralResult = await pool.query(`SELECT * FROM ofertas_generales WHERE activo = TRUE ORDER BY created_at DESC LIMIT 1`);
            ofertaGeneral = ofertaGeneralResult.rows[0];
            categoriasExcluidas = ofertaGeneral && ofertaGeneral.categorias_excluidas
                ? ofertaGeneral.categorias_excluidas.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
        } catch (e) { }

        // Obtener ofertas específicas activas
        let ofertasMap = {};
        try {
            const ofertasResult = await pool.query(`
                SELECT o.*, p.price as precio_original,
                    CASE WHEN o.tipo_descuento = 'porcentaje' THEN ROUND(p.price * (1 - o.valor_descuento / 100), 2)
                    ELSE GREATEST(ROUND(p.price - o.valor_descuento, 2), 0) END as precio_con_descuento
                FROM ofertas o JOIN products p ON o.product_id = p.id WHERE o.activo = TRUE
            `);
            ofertasResult.rows.forEach(oferta => {
                ofertasMap[oferta.product_id] = {
                    oferta_id: oferta.id, tipo_descuento: oferta.tipo_descuento,
                    valor_descuento: oferta.valor_descuento, precio_final: oferta.precio_con_descuento,
                    tiene_oferta_vigente: true, es_oferta_general: false
                };
            });
        } catch (e) { }

        // Combinar productos con ofertas
        const products = productsResult.rows.map(product => {
            if (ofertasMap[product.id]) return { ...product, ...ofertasMap[product.id] };
            if (ofertaGeneral && !categoriasExcluidas.includes(product.categoria_id)) {
                const precioConDescuento = ofertaGeneral.tipo_descuento === 'porcentaje'
                    ? Math.round(product.price * (1 - ofertaGeneral.valor_descuento / 100) * 100) / 100
                    : Math.max(Math.round((product.price - ofertaGeneral.valor_descuento) * 100) / 100, 0);
                return { ...product, oferta_id: `general_${ofertaGeneral.id}`, tipo_descuento: ofertaGeneral.tipo_descuento,
                    valor_descuento: ofertaGeneral.valor_descuento, precio_final: precioConDescuento,
                    tiene_oferta_vigente: true, es_oferta_general: true, nombre_oferta_general: ofertaGeneral.nombre };
            }
            return { ...product, tiene_oferta_vigente: false, precio_final: product.price };
        });

        const about = aboutResult.rows.length > 0 ? aboutResult.rows[0] : { titulo: '', texto: '', imagen: '' };
        const images = imagesResult.rows[0] || {};
        const logoUrl = images.imagen1;
        const imagenUrl2 = images.imagen2;

        res.render('cart', { products, about, logoUrl, imagenUrl2, isAdmin: req.session.isAdmin, cotizacionDolar });
    } catch (err) {
        console.error('Error al obtener productos para el carrito:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Ruta para editar un producto (requiere autenticación de administrador)
app.get('/edit/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    try {
        const productResult = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
        const categoriasResult = await pool.query('SELECT * FROM categorias ORDER BY orden, nombre');
        res.render('edit', { product: productResult.rows[0], categorias: categoriasResult.rows, isAdmin: req.session.isAdmin });
    } catch (err) {
        console.error('Error al obtener producto para edición:', err);
        res.status(500).send('Error interno del servidor');
    }
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
app.get('/new', requireAdmin, async (req, res) => {
    try {
        const categoriasResult = await pool.query('SELECT * FROM categorias ORDER BY orden, nombre');
        res.render('new', { categorias: categoriasResult.rows, isAdmin: req.session.isAdmin });
    } catch (err) {
        console.error('Error al cargar página de nuevo producto:', err);
        res.render('new', { categorias: [], isAdmin: req.session.isAdmin });
    }
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

// Ruta para ver un comprobante específico
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
            return res.status(404).send('Comprobante no encontrado');
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
        console.error('Error al cargar comprobante:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Ruta para obtener todos los datos de un producto específico
app.get('/product/:id', async (req, res) => {
    const id = req.params.id;

    try {
        // Obtener cotización del dólar
        let cotizacionDolar = 1200;
        try {
            const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
        } catch (e) { }

        const productResult = await pool.query('SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color, c.cuotas_max, c.interes_cuotas, c.cuotas_planes FROM products p LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.id = $1', [id]);

        if (productResult.rows.length === 0) {
            return res.status(404).send('Producto no encontrado');
        }

        let product = productResult.rows[0];

        // Verificar oferta específica
        const ofertaResult = await pool.query(`
            SELECT o.*, CASE WHEN o.tipo_descuento = 'porcentaje' THEN ROUND($2::numeric * (1 - o.valor_descuento / 100), 2)
            ELSE GREATEST(ROUND($2::numeric - o.valor_descuento, 2), 0) END as precio_con_descuento
            FROM ofertas o WHERE o.product_id = $1 AND o.activo = TRUE LIMIT 1
        `, [id, product.price]);

        if (ofertaResult.rows.length > 0) {
            const oferta = ofertaResult.rows[0];
            product = { ...product, oferta_id: oferta.id, tipo_descuento: oferta.tipo_descuento,
                valor_descuento: oferta.valor_descuento, precio_final: oferta.precio_con_descuento,
                tiene_oferta_vigente: true, es_oferta_general: false };
        } else {
            // Verificar oferta general
            const ofertaGeneralResult = await pool.query(`SELECT * FROM ofertas_generales WHERE activo = TRUE ORDER BY created_at DESC LIMIT 1`);
            if (ofertaGeneralResult.rows.length > 0) {
                const ofertaGeneral = ofertaGeneralResult.rows[0];
                const categoriasExcluidas = ofertaGeneral.categorias_excluidas
                    ? ofertaGeneral.categorias_excluidas.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c)) : [];
                if (!categoriasExcluidas.includes(product.categoria_id)) {
                    const precioConDescuento = ofertaGeneral.tipo_descuento === 'porcentaje'
                        ? Math.round(product.price * (1 - ofertaGeneral.valor_descuento / 100) * 100) / 100
                        : Math.max(Math.round((product.price - ofertaGeneral.valor_descuento) * 100) / 100, 0);
                    product = { ...product, oferta_id: `general_${ofertaGeneral.id}`, tipo_descuento: ofertaGeneral.tipo_descuento,
                        valor_descuento: ofertaGeneral.valor_descuento, precio_final: precioConDescuento,
                        tiene_oferta_vigente: true, es_oferta_general: true, nombre_oferta_general: ofertaGeneral.nombre };
                } else {
                    product = { ...product, tiene_oferta_vigente: false, precio_final: product.price };
                }
            } else {
                product = { ...product, tiene_oferta_vigente: false, precio_final: product.price };
            }
        }

        res.render('product', { product, isAdmin: req.session.isAdmin, cotizacionDolar });
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
    const { name, description, price, stock, bateria, almacenamiento, estado, categoria_id, moneda } = req.body;
    let imageUrl;

    if (req.file) {
        imageUrl = req.file.path; // La URL de la imagen subida a Cloudinary
    }

    try {
        const catId = categoria_id && categoria_id !== '' ? parseInt(categoria_id) : null;
        const monedaVal = moneda === 'ARS' ? 'ARS' : 'USD';
        await pool.query('INSERT INTO products (name, description, img, price, stock, bateria, almacenamiento, estado, categoria_id, moneda) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [name, description, imageUrl, price, stock, bateria, almacenamiento, estado, catId, monedaVal]);
        res.redirect('/');
    } catch (err) {
        console.error('Error al agregar nuevo producto:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// ==================== RUTAS POST PARA SISTEMA DE CAJAS ====================

// Procesar nuevo comprobante
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
            notas,
            afectar_stock = false  // Nuevo parámetro: por defecto NO afecta stock
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

        // Generar número de comprobante único más corto
        const fecha = new Date();
        const year = fecha.getFullYear().toString().slice(-2); // Últimos 2 dígitos del año
        const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const day = fecha.getDate().toString().padStart(2, '0');
        const random = Math.floor(Math.random() * 999).toString().padStart(3, '0');
        const numeroFactura = `C${year}${month}${day}${random}`; // Formato: C24082200X (10 chars)
        
        console.log('=== PROCESANDO COMPROBANTE ===');
        console.log('Número de comprobante:', numeroFactura);
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

        // Actualizar stock de productos solo si afectar_stock es true
        if (afectar_stock) {
            console.log('=== ACTUALIZANDO STOCK (afectar_stock = true) ===');
            for (let item of items) {
                console.log('Actualizando stock - Producto ID:', item.product_id, 'Cantidad:', item.cantidad);
                await client.query(
                    'UPDATE products SET stock = stock - $1 WHERE id = $2',
                    [item.cantidad, item.product_id]
                );
            }
        } else {
            console.log('=== STOCK NO AFECTADO (afectar_stock = false) ===');
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

// Generar página para imprimir (sin PDF)
app.get('/factura/:id/pdf', requireAdmin, async (req, res) => {
    try {
        const facturaId = req.params.id;
        
        const facturaResult = await pool.query(`
            SELECT f.*, u.username as vendedor_nombre 
            FROM facturas f 
            LEFT JOIN users u ON f.vendedor_id = u.id 
            WHERE f.id = $1
        `, [facturaId]);

        if (facturaResult.rows.length === 0) {
            return res.status(404).send('Comprobante no encontrado');
        }

        const factura = facturaResult.rows[0];
        const logoResult = await pool.query('SELECT imagen1 FROM imagenes LIMIT 1');
        const logoUrl = logoResult.rows[0]?.imagen1 || '';

        // Parse items
        let items = [];
        try {
            if (typeof factura.items === 'string') {
                items = JSON.parse(factura.items);
            } else if (Array.isArray(factura.items)) {
                items = factura.items;
            } else if (factura.items && typeof factura.items === 'object') {
                items = [factura.items];
            }
        } catch (error) {
            console.error('Error parsing items:', error);
        }

        // Generar HTML simple para imprimir
        const fecha = new Date(factura.fecha).toLocaleDateString('es-ES');
        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Comprobante ${factura.numero_factura}</title>
    <style>
        @media print {
            body { margin: 0; }
            .no-print { display: none; }
        }
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
        .info { margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #000; padding: 8px; text-align: left; }
        th { background: #f0f0f0; }
        .totals { text-align: right; margin-top: 20px; }
        .total { font-size: 18px; font-weight: bold; }
        .print-btn { background: #007bff; color: white; padding: 10px 20px; border: none; cursor: pointer; margin: 10px; }
    </style>
</head>
<body>
    <div class="no-print">
        <button class="print-btn" onclick="window.print()">🖨️ IMPRIMIR (Ctrl+P)</button>
        <button class="print-btn" onclick="window.close()">❌ CERRAR</button>
    </div>
    
    <div class="header">
        <h1>COMPROBANTE</h1>
        <p><strong>N°:</strong> ${factura.numero_factura}</p>
        <p><strong>Fecha:</strong> ${fecha}</p>
    </div>
    
    <div class="info">
        <h3>CLIENTE:</h3>
        <p><strong>Nombre:</strong> ${factura.cliente_nombre}</p>
        ${factura.cliente_telefono ? `<p><strong>Teléfono:</strong> ${factura.cliente_telefono}</p>` : ''}
        ${factura.cliente_email ? `<p><strong>Email:</strong> ${factura.cliente_email}</p>` : ''}
        <p><strong>Pago:</strong> ${factura.metodo_pago || 'Efectivo'}</p>
    </div>
    
    <table>
        <tr>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Precio</th>
            <th>Total</th>
        </tr>
        ${items.map(item => `
        <tr>
            <td>${item.name || 'Producto'}</td>
            <td>${item.cantidad || 1}</td>
            <td>$${(item.price || 0).toLocaleString()}</td>
            <td>$${((item.price || 0) * (item.cantidad || 1)).toLocaleString()}</td>
        </tr>
        `).join('')}
    </table>
    
    <div class="totals">
        <p><strong>Subtotal: $${parseFloat(factura.subtotal || 0).toLocaleString()}</strong></p>
        <p><strong>Impuestos: $${parseFloat(factura.impuestos || 0).toLocaleString()}</strong></p>
        <p class="total">TOTAL: $${parseFloat(factura.total || 0).toLocaleString()}</p>
    </div>
    
    ${factura.notas ? `<div class="info"><h3>NOTAS:</h3><p>${factura.notas}</p></div>` : ''}
    
    <div style="text-align: center; margin-top: 30px;">
        <p><strong>¡Gracias por su compra!</strong></p>
        <p>iPhone Stock - Vendedor: ${factura.vendedor_nombre || 'Sistema'}</p>
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);

    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Error: ' + err.message);
    }
});

// Búsqueda de comprobantes
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
    const { name, description, price, stock, bateria, almacenamiento, estado, categoria_id, moneda } = req.body;
    let imageUrl = req.body.image; // Mantener la URL actual de la imagen

    if (req.file) {
        imageUrl = req.file.path; // Si se carga una nueva imagen, usar la URL de Cloudinary
    }

    try {
        const catId = categoria_id && categoria_id !== '' ? parseInt(categoria_id) : null;
        const monedaVal = moneda === 'ARS' ? 'ARS' : 'USD';
        await pool.query(
            'UPDATE products SET name = $1, description = $2, img = $3, price = $4, stock = $5, bateria = $6, almacenamiento = $7, estado = $8, categoria_id = $9, moneda = $10 WHERE id = $11',
            [name, description, imageUrl, price, stock, bateria, almacenamiento, estado, catId, monedaVal, id]
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

// Función simple para generar PDF rápido
function generateSimplePDF(factura, logoUrl) {
    let items = [];
    try {
        if (typeof factura.items === 'string') {
            items = JSON.parse(factura.items);
        } else if (Array.isArray(factura.items)) {
            items = factura.items;
        } else if (factura.items) {
            items = [factura.items];
        }
    } catch (error) {
        items = [];
    }
    
    const fecha = new Date(factura.fecha).toLocaleDateString('es-ES');
    
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Comprobante</title>
    <style>
        body { font-family: Arial; margin: 20px; }
        .header { border-bottom: 2px solid #007bff; padding-bottom: 10px; margin-bottom: 20px; }
        .title { color: #007bff; text-align: center; margin: 0; }
        .info { margin: 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 8px; border: 1px solid #ddd; text-align: left; }
        th { background: #007bff; color: white; }
        .total { background: #f8f9fa; padding: 15px; text-align: right; margin-top: 20px; }
        .footer { text-align: center; margin-top: 30px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1 class="title">COMPROBANTE ${factura.numero_factura}</h1>
        <div class="info">
            <strong>Fecha:</strong> ${fecha}<br>
            <strong>Cliente:</strong> ${factura.cliente_nombre}<br>
            ${factura.cliente_telefono ? `<strong>Teléfono:</strong> ${factura.cliente_telefono}<br>` : ''}
            <strong>Pago:</strong> ${factura.metodo_pago || 'Efectivo'}
        </div>
    </div>
    
    <table>
        <tr>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Precio</th>
            <th>Total</th>
        </tr>
        ${items.map(item => `
        <tr>
            <td>${item.name || 'Producto'}</td>
            <td>${item.cantidad || 1}</td>
            <td>$${parseFloat(item.price || 0).toLocaleString('es-ES')}</td>
            <td>$${(parseFloat(item.price || 0) * (item.cantidad || 1)).toLocaleString('es-ES')}</td>
        </tr>
        `).join('')}
    </table>
    
    <div class="total">
        <strong>TOTAL: $${parseFloat(factura.total || 0).toLocaleString('es-ES')}</strong>
    </div>
    
    <div class="footer">
        <p>iPhone Stock - Gracias por su compra</p>
        <p>Vendedor: ${factura.vendedor_nombre || 'Sistema'}</p>
    </div>
</body>
</html>`;
}

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
    <title>Comprobante ${factura.numero_factura}</title>
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
            <h1>COMPROBANTE</h1>
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
        <p>iPhone Stock - Sistema de Comprobantes</p>
    </div>
</body>
</html>`;
}

// Endpoint para sitemap.xml dinámico
app.get('/sitemap.xml', async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, updated_at FROM productos WHERE stock > 0 ORDER BY id');
        const products = result.rows;
        const baseUrl = process.env.BASE_URL || 'https://iloop.com.ar';
        const currentDate = new Date().toISOString().split('T')[0];

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

  <!-- Página principal -->
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Catálogo de productos -->
  <url>
    <loc>${baseUrl}/cart</loc>
    <lastmod>${currentDate}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>

  <!-- Productos disponibles -->
`;

        products.forEach(product => {
            const lastmod = product.updated_at ? new Date(product.updated_at).toISOString().split('T')[0] : currentDate;
            xml += `  <url>
    <loc>${baseUrl}/product/${product.id}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
`;
        });

        xml += `</urlset>`;

        res.header('Content-Type', 'application/xml');
        res.send(xml);
    } catch (error) {
        console.error('Error generando sitemap:', error);
        res.status(500).send('Error generando sitemap');
    }
});

// ==================== RUTAS PARA GESTIÓN DE CATEGORÍAS ====================

app.get('/categorias', requireAdmin, async (req, res) => {
    try {
        const categoriasResult = await pool.query('SELECT * FROM categorias ORDER BY orden, nombre');
        const productsResult = await pool.query('SELECT id, name, categoria_id, price FROM products ORDER BY name');
        res.render('categorias', { categorias: categoriasResult.rows, products: productsResult.rows, isAdmin: req.session.isAdmin });
    } catch (err) {
        console.error('Error al obtener categorías:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Página para editar categoría
app.get('/categorias/:id/editar', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const categoriaResult = await pool.query('SELECT * FROM categorias WHERE id = $1', [id]);
        if (categoriaResult.rows.length === 0) {
            return res.redirect('/categorias');
        }
        res.render('categoria-editar', { 
            categoria: categoriaResult.rows[0], 
            user: req.session.isAdmin ? { isAdmin: true } : null,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al obtener categoría:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Página para asignar productos a categoría
app.get('/categorias/:id/productos', requireAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const categoriaResult = await pool.query('SELECT * FROM categorias WHERE id = $1', [id]);
        if (categoriaResult.rows.length === 0) {
            return res.redirect('/categorias');
        }
        const productsResult = await pool.query('SELECT id, name, categoria_id, price FROM products ORDER BY name');
        res.render('categoria-productos', { 
            categoria: categoriaResult.rows[0], 
            products: productsResult.rows,
            user: req.session.isAdmin ? { isAdmin: true } : null,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al obtener productos:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Agregar categoría
app.post('/add-category', requireAdmin, async (req, res) => {
    const { nombre, descripcion, icono, color, orden, cuotas_max, interes_cuotas } = req.body;
    let cuotasPlanes = '[]';
    const planCuotas = req.body['plan_cuotas[]'] || req.body.plan_cuotas;
    const planInteres = req.body['plan_interes[]'] || req.body.plan_interes;
    if (planCuotas) {
        const cuotasArr = Array.isArray(planCuotas) ? planCuotas : [planCuotas];
        const interesArr = Array.isArray(planInteres) ? planInteres : [planInteres || '0'];
        const planes = cuotasArr.map((c, i) => ({
            cuotas: parseInt(c) || 0,
            interes: parseFloat(interesArr[i]) || 0
        })).filter(p => p.cuotas > 0).sort((a, b) => a.cuotas - b.cuotas);
        cuotasPlanes = JSON.stringify(planes);
    }
    try {
        await pool.query(
            'INSERT INTO categorias (nombre, descripcion, icono, color, orden, cuotas_max, interes_cuotas, cuotas_planes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
            [nombre, descripcion || null, icono || '📦', color || '#0052A3', parseInt(orden) || 0, parseInt(cuotas_max) || 0, parseFloat(interes_cuotas) || 0, cuotasPlanes]
        );
        res.redirect('/categorias');
    } catch (err) {
        console.error('Error al agregar categoría:', err);
        res.status(500).send('Error al agregar categoría: ' + err.message);
    }
});

// Editar categoría
app.post('/edit-category/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, icono, color, orden, cuotas_max, interes_cuotas } = req.body;
    let cuotasPlanes = '[]';
    const planCuotas = req.body['plan_cuotas[]'] || req.body.plan_cuotas;
    const planInteres = req.body['plan_interes[]'] || req.body.plan_interes;
    if (planCuotas) {
        const cuotasArr = Array.isArray(planCuotas) ? planCuotas : [planCuotas];
        const interesArr = Array.isArray(planInteres) ? planInteres : [planInteres || '0'];
        const planes = cuotasArr.map((c, i) => ({
            cuotas: parseInt(c) || 0,
            interes: parseFloat(interesArr[i]) || 0
        })).filter(p => p.cuotas > 0).sort((a, b) => a.cuotas - b.cuotas);
        cuotasPlanes = JSON.stringify(planes);
    }
    try {
        await pool.query(
            'UPDATE categorias SET nombre = $1, descripcion = $2, icono = $3, color = $4, orden = $5, cuotas_max = $6, interes_cuotas = $7, cuotas_planes = $8 WHERE id = $9',
            [nombre, descripcion || null, icono || '📦', color || '#0052A3', parseInt(orden) || 0, parseInt(cuotas_max) || 0, parseFloat(interes_cuotas) || 0, cuotasPlanes, id]
        );
        res.redirect('/categorias');
    } catch (err) {
        console.error('Error al editar categoría:', err);
        res.status(500).send('Error al editar categoría: ' + err.message);
    }
});

// Eliminar categoría
app.post('/delete-category/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('UPDATE products SET categoria_id = NULL WHERE categoria_id = $1', [id]);
        await pool.query('DELETE FROM categorias WHERE id = $1', [id]);
        res.redirect('/categorias');
    } catch (err) {
        console.error('Error al eliminar categoría:', err);
        res.status(500).send('Error al eliminar categoría: ' + err.message);
    }
});

// Asignar productos a una categoría (múltiple)
app.post('/assign-products-category/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    let productosIds = req.body.productos || [];
    if (!Array.isArray(productosIds)) productosIds = [productosIds];
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Primero quitar esta categoría de todos los productos que la tenían
        await client.query('UPDATE products SET categoria_id = NULL WHERE categoria_id = $1', [id]);
        // Luego asignar a los productos seleccionados
        if (productosIds.length > 0) {
            const placeholders = productosIds.map((_, i) => `$${i + 2}`).join(',');
            await client.query(
                `UPDATE products SET categoria_id = $1 WHERE id IN (${placeholders})`,
                [id, ...productosIds.map(p => parseInt(p))]
            );
        }
        await client.query('COMMIT');
        res.redirect('/categorias');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al asignar productos:', err);
        res.status(500).send('Error al asignar productos: ' + err.message);
    } finally {
        client.release();
    }
});

// ==================== RUTAS PARA GESTIÓN DE OFERTAS ====================

app.get('/admin/ofertas', requireAdmin, async (req, res) => {
    try {
        const productsResult = await pool.query('SELECT * FROM products ORDER BY name');
        const ofertasActivasResult = await pool.query(`
            SELECT o.*, p.name as product_name, p.price as precio_original,
                CASE WHEN o.tipo_descuento = 'porcentaje' THEN ROUND(p.price * (1 - o.valor_descuento / 100), 2)
                ELSE GREATEST(ROUND(p.price - o.valor_descuento, 2), 0) END as precio_final
            FROM ofertas o JOIN products p ON o.product_id = p.id WHERE o.activo = TRUE ORDER BY o.fecha_inicio DESC
        `);
        const todasOfertasResult = await pool.query(`
            SELECT o.*, p.name as product_name FROM ofertas o JOIN products p ON o.product_id = p.id ORDER BY o.created_at DESC
        `);
        const ofertasGeneralesResult = await pool.query(`SELECT * FROM ofertas_generales ORDER BY created_at DESC`);
        const categoriasResult = await pool.query('SELECT * FROM categorias ORDER BY orden, nombre');
        res.render('ofertas', {
            products: productsResult.rows,
            ofertasActivas: ofertasActivasResult.rows,
            todasOfertas: todasOfertasResult.rows,
            ofertasGenerales: ofertasGeneralesResult.rows,
            categorias: categoriasResult.rows,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al cargar página de ofertas:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Crear ofertas para múltiples productos
app.post('/admin/ofertas/crear', requireAdmin, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { productos, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin } = req.body;
        if (!productos || (Array.isArray(productos) && productos.length === 0)) {
            await client.query('ROLLBACK'); return res.status(400).send('Debes seleccionar al menos un producto');
        }
        if (!tipo_descuento || !valor_descuento || !fecha_inicio || !fecha_fin) {
            await client.query('ROLLBACK'); return res.status(400).send('Todos los campos son obligatorios');
        }
        const valorDesc = parseFloat(valor_descuento);
        if (valorDesc <= 0) { await client.query('ROLLBACK'); return res.status(400).send('El valor del descuento debe ser mayor a 0'); }
        if (tipo_descuento === 'porcentaje' && (valorDesc < 0 || valorDesc > 100)) {
            await client.query('ROLLBACK'); return res.status(400).send('El porcentaje debe estar entre 0 y 100');
        }
        const fechaInicioDate = new Date(fecha_inicio);
        const fechaFinDate = new Date(fecha_fin);
        if (fechaFinDate <= fechaInicioDate) {
            await client.query('ROLLBACK'); return res.status(400).send('La fecha de fin debe ser posterior a la fecha de inicio');
        }
        const productosArray = Array.isArray(productos) ? productos : [productos];
        for (const productId of productosArray) {
            await client.query('UPDATE ofertas SET activo = FALSE WHERE product_id = $1 AND activo = TRUE', [productId]);
            await client.query(`INSERT INTO ofertas (product_id, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, activo) VALUES ($1, $2, $3, $4, $5, TRUE)`,
                [productId, tipo_descuento, valorDesc, fechaInicioDate, fechaFinDate]);
        }
        await client.query('COMMIT');
        res.redirect('/admin/ofertas');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear ofertas:', err);
        res.status(500).send('Error al crear ofertas: ' + err.message);
    } finally { client.release(); }
});

// Eliminar oferta
app.post('/admin/ofertas/eliminar/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM ofertas WHERE id = $1', [id]);
        res.redirect('/admin/ofertas');
    } catch (err) {
        console.error('Error al eliminar oferta:', err);
        res.status(500).send('Error al eliminar oferta: ' + err.message);
    }
});

// Toggle oferta
app.post('/admin/ofertas/toggle/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT activo FROM ofertas WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Oferta no encontrada');
        const nuevoEstado = !result.rows[0].activo;
        await pool.query('UPDATE ofertas SET activo = $1 WHERE id = $2', [nuevoEstado, id]);
        res.redirect('/admin/ofertas');
    } catch (err) {
        console.error('Error al cambiar estado de oferta:', err);
        res.status(500).send('Error al cambiar estado: ' + err.message);
    }
});

// Editar oferta específica
app.post('/admin/ofertas/editar/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { tipo_descuento, valor_descuento, fecha_inicio, fecha_fin } = req.body;
    try {
        const valorDesc = parseFloat(valor_descuento);
        if (!tipo_descuento || !valor_descuento || !fecha_inicio || !fecha_fin) return res.status(400).send('Todos los campos son obligatorios');
        if (valorDesc <= 0) return res.status(400).send('El valor del descuento debe ser mayor a 0');
        if (tipo_descuento === 'porcentaje' && (valorDesc < 0 || valorDesc > 100)) return res.status(400).send('El porcentaje debe estar entre 0 y 100');
        await pool.query(`UPDATE ofertas SET tipo_descuento = $1, valor_descuento = $2, fecha_inicio = $3, fecha_fin = $4, updated_at = NOW() WHERE id = $5`,
            [tipo_descuento, valorDesc, fecha_inicio, fecha_fin, id]);
        res.redirect('/admin/ofertas');
    } catch (err) {
        console.error('Error al editar oferta:', err);
        res.status(500).send('Error al editar oferta: ' + err.message);
    }
});

// API productos con ofertas
app.get('/api/productos-ofertas', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM productos_con_ofertas ORDER BY tiene_oferta_vigente DESC, name`);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener productos con ofertas:', err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// ==================== OFERTAS GENERALES ====================

app.post('/admin/ofertas/general/crear', requireAdmin, async (req, res) => {
    try {
        const { nombre, descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin } = req.body;
        let categoriasExcluidas = req.body.categorias_excluidas || [];
        if (!Array.isArray(categoriasExcluidas)) categoriasExcluidas = [categoriasExcluidas];
        const categoriasExcluidasStr = categoriasExcluidas.join(',');
        if (!nombre || !tipo_descuento || !valor_descuento || !fecha_inicio || !fecha_fin) return res.status(400).send('Todos los campos son obligatorios');
        const valorDesc = parseFloat(valor_descuento);
        if (valorDesc <= 0) return res.status(400).send('El valor del descuento debe ser mayor a 0');
        if (tipo_descuento === 'porcentaje' && (valorDesc < 0 || valorDesc > 100)) return res.status(400).send('El porcentaje debe estar entre 0 y 100');
        await pool.query('UPDATE ofertas_generales SET activo = FALSE WHERE activo = TRUE');
        await pool.query(`INSERT INTO ofertas_generales (nombre, descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, activo, categorias_excluidas) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)`,
            [nombre, descripcion || null, tipo_descuento, valorDesc, fecha_inicio, fecha_fin, categoriasExcluidasStr]);
        res.redirect('/admin/ofertas');
    } catch (err) {
        console.error('Error al crear oferta general:', err);
        res.status(500).send('Error al crear oferta general: ' + err.message);
    }
});

app.post('/admin/ofertas/general/toggle/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT activo FROM ofertas_generales WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).send('Oferta general no encontrada');
        const nuevoEstado = !result.rows[0].activo;
        if (nuevoEstado) await pool.query('UPDATE ofertas_generales SET activo = FALSE WHERE activo = TRUE');
        await pool.query('UPDATE ofertas_generales SET activo = $1 WHERE id = $2', [nuevoEstado, id]);
        res.redirect('/admin/ofertas');
    } catch (err) {
        console.error('Error al cambiar estado de oferta general:', err);
        res.status(500).send('Error al cambiar estado: ' + err.message);
    }
});

app.post('/admin/ofertas/general/editar/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin } = req.body;
    let categoriasExcluidas = req.body.categorias_excluidas || [];
    if (!Array.isArray(categoriasExcluidas)) categoriasExcluidas = [categoriasExcluidas];
    const categoriasExcluidasStr = categoriasExcluidas.join(',');
    try {
        const valorDesc = parseFloat(valor_descuento);
        if (!nombre || !tipo_descuento || !valor_descuento || !fecha_inicio || !fecha_fin) return res.status(400).send('Todos los campos son obligatorios');
        if (valorDesc <= 0) return res.status(400).send('El valor del descuento debe ser mayor a 0');
        if (tipo_descuento === 'porcentaje' && (valorDesc < 0 || valorDesc > 100)) return res.status(400).send('El porcentaje debe estar entre 0 y 100');
        await pool.query(`UPDATE ofertas_generales SET nombre = $1, descripcion = $2, tipo_descuento = $3, valor_descuento = $4, fecha_inicio = $5, fecha_fin = $6, categorias_excluidas = $7, updated_at = NOW() WHERE id = $8`,
            [nombre, descripcion || null, tipo_descuento, valorDesc, fecha_inicio, fecha_fin, categoriasExcluidasStr, id]);
        res.redirect('/admin/ofertas');
    } catch (err) {
        console.error('Error al editar oferta general:', err);
        res.status(500).send('Error al editar oferta general: ' + err.message);
    }
});

app.post('/admin/ofertas/general/eliminar/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM ofertas_generales WHERE id = $1', [id]);
        res.redirect('/admin/ofertas');
    } catch (err) {
        console.error('Error al eliminar oferta general:', err);
        res.status(500).send('Error al eliminar oferta general: ' + err.message);
    }
});

// ==================== COTIZACIÓN DEL DÓLAR ====================

// Página admin para cotización
app.get('/admin/cotizacion', requireAdmin, async (req, res) => {
    try {
        let cotizacionDolar = 1200;
        try {
            const cotizResult = await pool.query("SELECT valor, updated_at FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) {
                cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
            }
        } catch (e) {
            console.log('Tabla configuracion no existe, creando...');
        }
        const logoResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        const images = logoResult.rows[0] || {};
        res.render('cotizacion', {
            cotizacionDolar,
            logoUrl: images.imagen1,
            imagen2Url: images.imagen2,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al cargar cotización:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Guardar cotización
app.post('/admin/cotizacion', requireAdmin, async (req, res) => {
    try {
        const { cotizacion } = req.body;
        const valor = parseFloat(cotizacion);
        if (isNaN(valor) || valor <= 0) {
            return res.status(400).send('La cotización debe ser un número positivo');
        }
        await pool.query(
            "INSERT INTO configuracion (clave, valor, updated_at) VALUES ('cotizacion_dolar', $1, NOW()) ON CONFLICT (clave) DO UPDATE SET valor = $1, updated_at = NOW()",
            [valor.toString()]
        );
        res.redirect('/admin/cotizacion');
    } catch (err) {
        console.error('Error al guardar cotización:', err);
        res.status(500).send('Error al guardar cotización: ' + err.message);
    }
});

// API para obtener cotización actual
app.get('/api/cotizacion', async (req, res) => {
    try {
        let cotizacionDolar = 1200;
        const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
        if (cotizResult.rows.length > 0) cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
        res.json({ cotizacion: cotizacionDolar });
    } catch (err) {
        res.json({ cotizacion: 1200 });
    }
});

// Ruta para robots.txt
app.get('/robots.txt', (req, res) => {
    const baseUrl = process.env.BASE_URL || 'https://iloop.com.ar';
    const robotsTxt = `# robots.txt para iLoop - Tienda de iPhones en Córdoba, Argentina

User-agent: *
Allow: /
Allow: /cart
Allow: /product/*

# Bloquear rutas administrativas
Disallow: /login
Disallow: /logout
Disallow: /cajas
Disallow: /historico
Disallow: /factura/*
Disallow: /edit/*
Disallow: /edit-carousel
Disallow: /edit-images
Disallow: /edit-about
Disallow: /new
Disallow: /delete/*
Disallow: /buy/*
Disallow: /api/*

# Bloquear archivos y carpetas innecesarias
Disallow: /wp-admin/
Disallow: /wp-includes/
Disallow: /wp-login.php
Disallow: /cgi-bin/

# Archivos de configuración
Disallow: /*.json$
Disallow: /*.sql$
Disallow: /*.env$

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml
`;

    res.header('Content-Type', 'text/plain');
    res.send(robotsTxt);
});

// Manejador de errores para páginas no encontradas (404)
app.use((req, res, next) => {
    res.status(404).send("Página no encontrada");
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
