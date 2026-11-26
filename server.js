require('dotenv').config();  // Cargar variables de entorno desde .env
const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const multer = require('multer'); // Middleware para manejo de carga de archivos
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const compression = require('compression');
const campaniaLib = require('./campania');

const app = express();
const PORT = process.env.PORT || 3000;
// Confiar solo en 1 proxy (Render/Heroku/etc.). Con `true` cualquiera podía falsear su IP con X-Forwarded-For
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression())

// Content-Security-Policy: solo se permiten los orígenes que las vistas realmente usan.
// 'unsafe-inline' sigue en script/style porque las vistas tienen <script> y onclick="" inline;
// quitarlo requiere mover ese JS a archivos .js (pendiente). Aun así bloquea scripts de
// dominios no listados, plugins (object-src), <base> inyectado, formularios a otros sitios y clickjacking.
// Si algo se rompe en producción: CSP_REPORT_ONLY=1 en las variables de entorno la pasa a modo "solo avisar".
const CSP_REPORT_ONLY = process.env.CSP_REPORT_ONLY === '1';
const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://code.jquery.com https://stackpath.bootstrapcdn.com https://maxcdn.bootstrapcdn.com https://kit.fontawesome.com https://www.googletagmanager.com https://connect.facebook.net https://www.google-analytics.com",
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://stackpath.bootstrapcdn.com https://maxcdn.bootstrapcdn.com https://kit.fontawesome.com https://ka-f.fontawesome.com https://fonts.googleapis.com",
    "font-src 'self' data: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://stackpath.bootstrapcdn.com https://maxcdn.bootstrapcdn.com https://ka-f.fontawesome.com https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://www.google-analytics.com https://*.google-analytics.com https://analytics.google.com https://*.analytics.google.com https://www.googletagmanager.com https://stats.g.doubleclick.net https://*.g.doubleclick.net https://www.google.com https://www.googleadservices.com https://www.facebook.com https://connect.facebook.net https://kit.fontawesome.com https://ka-f.fontawesome.com https://cdn.jsdelivr.net https://res.cloudinary.com",
    "frame-src https://www.google.com https://www.googletagmanager.com https://www.facebook.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://wa.me https://api.whatsapp.com",
    "frame-ancestors 'self'"
].join('; ');

// Cabeceras de seguridad básicas
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    res.setHeader(CSP_REPORT_ONLY ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy', CSP);
    next();
});

// Escapa texto para insertarlo de forma segura en HTML
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
// ✅ WebP + calidad 80 + máx 1200px — reduce hasta 80% el tamaño vs PNG original
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uploads',
        format: async (req, file) => 'webp',          // WebP en lugar de PNG
        transformation: [{ width: 1200, crop: 'limit', quality: 80, fetch_format: 'auto' }],
        public_id: (req, file) => file.fieldname + '-' + Date.now(),
    },
});

/**
 * Transforma cualquier URL de Cloudinary para servirla optimizada:
 * - f_auto  → el navegador recibe WebP/AVIF si lo soporta
 * - q_auto:good → calidad auto (~75-80)
 * - w_[size],c_limit → no agranda, solo achica si es mayor que size
 * Funciona con imágenes ya subidas SIN re-subirlas.
 */
function optimizeCloudinaryUrl(url, width = 800) {
    if (!url || !url.includes('res.cloudinary.com')) return url;
    // Evitar duplicar transformaciones
    if (url.includes('f_auto') || url.includes('q_auto')) return url;
    return url.replace(
        '/image/upload/',
        `/image/upload/f_auto,q_auto:eco,w_${width},c_limit,dpr_auto/`
    );
}

// Solo imágenes, máx. 8 MB, para evitar abuso del almacenamiento
const upload = multer({
    storage: storage,
    limits: { fileSize: 8 * 1024 * 1024, files: 3 },
    fileFilter: (req, file, cb) => {
        if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) cb(null, true);
        else cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif, avif)'));
    }
});

// Middleware para manejar la carga de archivos en una ruta específica y almacenar el enlace en la base de datos
// (antes era pública: cualquiera podía subir archivos a Cloudinary y escribir en la BD)
app.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
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
// Assets estáticos con cache 7 días — evita re-descargar en visitas repetidas (ahorra bandwidth en recurrentes)
app.use(express.static('public', {
    maxAge: '7d',
    setHeaders: (res, filePath) => {
        if (/\.(jpg|jpeg|png|webp|gif|svg|ico)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else if (/\.(css|js)$/i.test(filePath)) {
            res.setHeader('Cache-Control', 'public, max-age=86400');
        }
    }
}));
app.use(express.json()); // Usar express.json() directamente
app.use(express.urlencoded({ extended: true })); // Usar express.urlencoded() directamente
app.use(cors()); // Middleware para permitir CORS

// Configurar middleware para manejar sesiones
const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 16) {
    console.error('❌ SESSION_SECRET no está definido o es muy corto (mínimo 16 caracteres). Abortando.');
    process.exit(1);
}

app.use(session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    name: 'sid',
    cookie: {
        httpOnly: true,        // JS del navegador no puede leer la cookie (mitiga robo por XSS)
        sameSite: 'lax',       // bloquea envíos cross-site de formularios (mitiga CSRF)
        secure: 'auto',        // solo HTTPS cuando la conexión es HTTPS
        maxAge: 1000 * 60 * 60 * 8
    }
}));

app.locals.adminMenu = require('./adminMenu');

// Datos de sesión disponibles en TODAS las vistas (menú, barra de gestión, etc.)
app.use((req, res, next) => {
    res.locals.isLogged = !!(req.session && req.session.userId);
    res.locals.sessionUser = (req.session && req.session.username) || '';
    res.locals.currentPath = req.path;
    next();
});

// Conectar a la base de datos PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Cualquier usuario logueado (admin o vendedor)
function requireLogin(req, res, next) {
    if (req.session.userId) return next();
    res.redirect('/login');
}

// Solo administradores. Se verifica en la BD en cada request (no solo lo guardado en la sesión),
// así un usuario dado de baja o degradado pierde el acceso de inmediato.
async function requireAdmin(req, res, next) {
    if (!req.session.userId) return res.redirect('/login');
    try {
        const r = await pool.query('SELECT isadmin FROM users WHERE id = $1', [req.session.userId]);
        if (!r.rows.length) { // usuario borrado: cerrar sesión
            return req.session.destroy(() => res.redirect('/login'));
        }
        // La columna puede venir como boolean (true) o entero (1) según cómo se creó la tabla
        const flag = r.rows[0].isadmin;
        if (flag === true || flag === 1 || flag === '1' || flag === 't') {
            req.session.isAdmin = true;
            return next();
        }
        req.session.isAdmin = false;
    } catch (err) {
        console.error('Error verificando admin:', err.message);
        return res.status(500).send('Error interno del servidor');
    }
    const quiereJson = req.xhr || req.path.startsWith('/api/') || (req.get('accept') || '').includes('application/json');
    if (quiereJson) return res.status(403).json({ error: 'Acceso denegado: se requiere administrador' });
    res.status(403).send('Acceso denegado: se requiere un usuario administrador.');
}

function getPublicBaseUrl(req) {
    return (process.env.PUBLIC_SITE_URL || process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
}

function toAbsoluteUrl(value, baseUrl) {
    if (!value) return '';

    try {
        return new URL(value, baseUrl).toString();
    } catch (err) {
        return '';
    }
}

function formatCsvPrice(value) {
    const normalized = String(value || '').replace(/[^0-9.,-]/g, '').replace(',', '.');
    const price = Number.parseFloat(normalized);

    if (!Number.isFinite(price)) return '';

    return `${price.toFixed(2)} USD`;
}

function mapCatalogCondition(value) {
    const condition = String(value || '').toLowerCase();

    if (condition.includes('nuevo') || condition.includes('new')) return 'new';
    if (condition.includes('reacond') || condition.includes('refurb')) return 'refurbished';

    return 'used';
}

function escapeCsv(value) {
    const text = String(value ?? '').replace(/\r?\n|\r/g, ' ').trim();
    return `"${text.replace(/"/g, '""')}"`;
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

// Banners en el orden elegido por el admin, con la marca de ocultos (listas de ids en "configuracion").
// Los que no están en la lista de orden (recién cargados) van al final.
async function carruselOrdenado() {
    const { rows } = await pool.query('SELECT * FROM carousel ORDER BY id ASC');
    const listas = {};
    try {
        const r = await pool.query("SELECT clave, valor FROM configuracion WHERE clave IN ('carrusel_orden', 'carrusel_ocultos')");
        r.rows.forEach(f => { listas[f.clave] = f.valor.split(',').map(Number); });
    } catch (e) { console.log('Tabla configuracion no existe aún'); }
    const orden = listas.carrusel_orden || [];
    const ocultos = listas.carrusel_ocultos || [];
    const lugar = item => orden.includes(item.id) ? orden.indexOf(item.id) : orden.length;
    return rows.sort((a, b) => lugar(a) - lugar(b)).map(item => ({ ...item, oculto: ocultos.includes(item.id) }));
}

const guardarListaCarrusel = (clave, ids) => pool.query(
    'INSERT INTO configuracion (clave, valor, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (clave) DO UPDATE SET valor = $2, updated_at = NOW()',
    [clave, ids.join(',')]
);

app.post('/orden-carousel', requireAdmin, async (req, res) => {
    try {
        const items = await carruselOrdenado();
        const ids = items.map(item => item.id);
        const id = Number(req.body.id);
        const desde = ids.indexOf(id);
        const hasta = { primero: 0, subir: desde - 1, bajar: desde + 1 }[req.body.mover];
        if (desde >= 0 && (req.body.mover === 'ocultar' || req.body.mover === 'mostrar')) {
            const ocultos = items.filter(item => item.oculto && item.id !== id).map(item => item.id);
            if (req.body.mover === 'ocultar') ocultos.push(id);
            await guardarListaCarrusel('carrusel_ocultos', ocultos);
        } else if (desde >= 0 && hasta >= 0 && hasta < ids.length) {
            ids.splice(hasta, 0, ids.splice(desde, 1)[0]);
            await guardarListaCarrusel('carrusel_orden', ids);
        }
        res.redirect('/edit-carousel');
    } catch (err) {
        console.error('Error al ordenar el carrusel:', err);
        res.status(500).send('No se pudo guardar el orden');
    }
});

// Ruta para mostrar el formulario de edición del carrusel (requiere autenticación de administrador)
app.get('/edit-carousel', requireAdmin, async (req, res) => {
    try {
        res.render('edit-carousel', { carouselItems: await carruselOrdenado(), isAdmin: req.session.isAdmin });
    } catch (err) {
        console.error('Error al obtener elementos del carrusel:', err);
        res.status(500).send('Error interno del servidor');
    }
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

// Campaña vigente (aviso y orden de productos) para las páginas públicas
app.use(async (req, res, next) => {
    res.locals.campania = null;
    if (req.method !== 'GET' || !(req.path === '/' || req.path === '/cart' || req.path.startsWith('/product/'))) return next();
    try { res.locals.campania = await campaniaLib.vigente(pool); }
    catch (e) { console.error('No se pudo leer la campaña:', e.message); }
    next();
});

// Ruta principal para renderizar la página principal
app.get('/', async (req, res) => {
    try {
        // Obtener cotización del dólar y configuración de visibilidad
        let cotizacionDolar = 1200;
        let mostrarPrecioPesos = true;
        try {
            const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
            const pesosResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'mostrar_precio_pesos'");
            if (pesosResult.rows.length > 0) mostrarPrecioPesos = pesosResult.rows[0].valor === 'true';
        } catch (e) { console.log('Tabla configuracion no existe aún'); }

        // Consulta con JOIN a categorías para cuotas
        const productsResult = await pool.query('SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color, c.cuotas_max, c.interes_cuotas, c.cuotas_planes FROM products p LEFT JOIN categorias c ON p.categoria_id = c.id');
        const carouselRows = await carruselOrdenado();
        const aboutResult = await pool.query('SELECT * FROM about LIMIT 1');
        const imagesResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        
        // Obtener oferta general activa
        let ofertaGeneral = null;
        let categoriasExcluidas = [];
        try {
            const ofertaGeneralResult = await pool.query(campaniaLib.SQL_GENERAL_VIGENTE);
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
            if (ofertaGeneral && !categoriasExcluidas.includes(product.categoria_id) && campaniaLib.incluye(ofertaGeneral, product)) {
                const precioConDescuento = ofertaGeneral.tipo_descuento === 'porcentaje'
                    ? Math.round(product.price * (1 - campaniaLib.descuento(ofertaGeneral, product) / 100) * 100) / 100
                    : Math.max(Math.round((product.price - campaniaLib.descuento(ofertaGeneral, product)) * 100) / 100, 0);
                return { ...product, oferta_id: `general_${ofertaGeneral.id}`, tipo_descuento: ofertaGeneral.tipo_descuento,
                    valor_descuento: campaniaLib.descuento(ofertaGeneral, product), precio_final: precioConDescuento,
                    tiene_oferta_vigente: true, es_oferta_general: true, nombre_oferta_general: ofertaGeneral.nombre };
            }
            return { ...product, tiene_oferta_vigente: false, precio_final: product.price };
        });

        const carouselItems = carouselRows.filter(item => !item.oculto).map(item => ({
            ...item,
            img:         optimizeCloudinaryUrl(item.img, 1200),
            imagenmobile: optimizeCloudinaryUrl(item.imagenmobile, 600)
        }));
        const about = aboutResult.rows.length > 0 ? aboutResult.rows[0] : { titulo: '', texto: '', imagen: '' };
        const images = imagesResult.rows[0] || {};
        const logoUrl = images.imagen1;
        const imagen2Url = images.imagen2;

        // Optimizar URLs de imágenes de productos (reduce 70-85% el bandwidth)
        const productsOpt = products.map(p => ({
            ...p,
            img: optimizeCloudinaryUrl(p.img, 500)
        }));

        const enOferta = res.locals.campania && res.locals.campania.inicio
            ? productsOpt.filter(p => p.tiene_oferta_vigente && p.stock > 0).sort((a, b) => b.price - a.price).slice(0, 8)
            : [];

        res.render('index', { enOferta, products: productsOpt, carouselItems, about, logoUrl, imagen2Url, isAdmin: req.session.isAdmin, cotizacionDolar, mostrarPrecioPesos });
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
        // Obtener cotización del dólar y configuración de visibilidad
        let cotizacionDolar = 1200;
        let mostrarPrecioPesos = true;
        try {
            const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
            const pesosResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'mostrar_precio_pesos'");
            if (pesosResult.rows.length > 0) mostrarPrecioPesos = pesosResult.rows[0].valor === 'true';
        } catch (e) { }

        const productsResult = await pool.query('SELECT p.*, c.nombre as categoria_nombre, c.icono as categoria_icono, c.color as categoria_color, c.cuotas_max, c.interes_cuotas, c.cuotas_planes FROM products p LEFT JOIN categorias c ON p.categoria_id = c.id');
        const aboutResult = await pool.query('SELECT * FROM about LIMIT 1');
        const imagesResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        
        // Obtener oferta general activa
        let ofertaGeneral = null;
        let categoriasExcluidas = [];
        try {
            const ofertaGeneralResult = await pool.query(campaniaLib.SQL_GENERAL_VIGENTE);
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
            if (ofertaGeneral && !categoriasExcluidas.includes(product.categoria_id) && campaniaLib.incluye(ofertaGeneral, product)) {
                const precioConDescuento = ofertaGeneral.tipo_descuento === 'porcentaje'
                    ? Math.round(product.price * (1 - campaniaLib.descuento(ofertaGeneral, product) / 100) * 100) / 100
                    : Math.max(Math.round((product.price - campaniaLib.descuento(ofertaGeneral, product)) * 100) / 100, 0);
                return { ...product, oferta_id: `general_${ofertaGeneral.id}`, tipo_descuento: ofertaGeneral.tipo_descuento,
                    valor_descuento: campaniaLib.descuento(ofertaGeneral, product), precio_final: precioConDescuento,
                    tiene_oferta_vigente: true, es_oferta_general: true, nombre_oferta_general: ofertaGeneral.nombre };
            }
            return { ...product, tiene_oferta_vigente: false, precio_final: product.price };
        });

        const about = aboutResult.rows.length > 0 ? aboutResult.rows[0] : { titulo: '', texto: '', imagen: '' };
        const images = imagesResult.rows[0] || {};
        const logoUrl = images.imagen1;
        const imagenUrl2 = images.imagen2;

        const verTodo = req.query.todo === '1';
        const visibles = campaniaLib.ordenar(products, res.locals.campania, verTodo);

        res.render('cart', { verTodo, products: visibles.map(p => ({...p, img: optimizeCloudinaryUrl(p.img, 500)})), about, logoUrl, imagenUrl2, isAdmin: req.session.isAdmin, cotizacionDolar, mostrarPrecioPesos });
    } catch (err) {
        console.error('Error al obtener productos para el carrito:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Export CSV público de productos para Meta/Commerce Manager y hojas de cálculo.
app.get(['/exports/products.csv', '/products.csv', '/catalog/products.csv'], async (req, res) => {
    try {
        const { rows: products } = await pool.query(`
            SELECT p.*, c.nombre as categoria_nombre
            FROM products p
            LEFT JOIN categorias c ON p.categoria_id = c.id
            ORDER BY p.id
        `);
        const baseUrl = getPublicBaseUrl(req);
        const headers = [
            'id',
            'title',
            'description',
            'availability',
            'condition',
            'price',
            'link',
            'image_link',
            'brand',
            'inventory',
            'custom_label_0',
            'custom_label_1'
        ];

        const lines = products
            .map((product) => {
                const price = formatCsvPrice(product.price);
                const imageLink = toAbsoluteUrl(optimizeCloudinaryUrl(product.img, 600), baseUrl);

                if (!product.id || !product.name || !price || !imageLink) return null;

                const stock = Number.parseInt(product.stock, 10) || 0;
                const title = [product.name, product.almacenamiento ? `${product.almacenamiento}GB` : null].filter(Boolean).join(' ');

                return [
                    product.id,
                    title,
                    product.description || title,
                    stock > 0 ? 'in stock' : 'out of stock',
                    mapCatalogCondition(product.estado),
                    price,
                    `${baseUrl}/product/${encodeURIComponent(product.id)}`,
                    imageLink,
                    'Apple',
                    stock,
                    product.categoria_nombre || product.estado || '',
                    product.bateria ? `Bateria ${product.bateria}%` : ''
                ].map(escapeCsv).join(',');
            })
            .filter(Boolean);

        res.set('Content-Type', 'text/csv; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=300');
        res.send(`${headers.join(',')}\n${lines.join('\n')}\n`);
    } catch (err) {
        console.error('Error al exportar productos en CSV:', err);
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
app.get('/cajas', requireLogin, async (req, res) => {
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
app.get('/historico', requireLogin, async (req, res) => {
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
app.get('/factura/:id', requireLogin, async (req, res) => {
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
        // Obtener cotización del dólar y configuración de visibilidad
        let cotizacionDolar = 1200;
        let mostrarPrecioPesos = true;
        try {
            const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
            const pesosResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'mostrar_precio_pesos'");
            if (pesosResult.rows.length > 0) mostrarPrecioPesos = pesosResult.rows[0].valor === 'true';
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
            const ofertaGeneralResult = await pool.query(campaniaLib.SQL_GENERAL_VIGENTE);
            if (ofertaGeneralResult.rows.length > 0) {
                const ofertaGeneral = ofertaGeneralResult.rows[0];
                const categoriasExcluidas = ofertaGeneral.categorias_excluidas
                    ? ofertaGeneral.categorias_excluidas.split(',').map(c => parseInt(c.trim())).filter(c => !isNaN(c)) : [];
                if (!categoriasExcluidas.includes(product.categoria_id) && campaniaLib.incluye(ofertaGeneral, product)) {
                    const precioConDescuento = ofertaGeneral.tipo_descuento === 'porcentaje'
                        ? Math.round(product.price * (1 - campaniaLib.descuento(ofertaGeneral, product) / 100) * 100) / 100
                        : Math.max(Math.round((product.price - campaniaLib.descuento(ofertaGeneral, product)) * 100) / 100, 0);
                    product = { ...product, oferta_id: `general_${ofertaGeneral.id}`, tipo_descuento: ofertaGeneral.tipo_descuento,
                        valor_descuento: campaniaLib.descuento(ofertaGeneral, product), precio_final: precioConDescuento,
                        tiene_oferta_vigente: true, es_oferta_general: true, nombre_oferta_general: ofertaGeneral.nombre };
                } else {
                    product = { ...product, tiene_oferta_vigente: false, precio_final: product.price };
                }
            } else {
                product = { ...product, tiene_oferta_vigente: false, precio_final: product.price };
            }
        }

        // Link directo a WhatsApp con el producto (precio final con oferta + link a esta ficha)
        const telWa = String(process.env.MY_PHONE_NUMBER || '').replace(/\D/g, '');
        const precioWa = Number(product.precio_final ?? product.price);
        const simboloWa = (product.moneda || 'USD') === 'USD' ? 'USD' : 'ARS $';
        const mensajeWa = [
            'Hola iLoop! Quiero consultar por este equipo:',
            '',
            product.name,
            `Precio: ${simboloWa} ${precioWa.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`,
            product.bateria ? `Batería: ${product.bateria}%` : null,
            product.estado ? `Estado: ${product.estado}` : null,
            '',
            `${req.protocol}://${req.get('host')}/product/${product.id}`
        ].filter(v => v !== null).join('\n');
        const whatsappUrl = telWa ? `https://wa.me/${telWa}?text=${encodeURIComponent(mensajeWa)}` : null;

        res.render('product', { product: {...product, img: optimizeCloudinaryUrl(product.img, 1000)}, isAdmin: req.session.isAdmin, cotizacionDolar, mostrarPrecioPesos, whatsappUrl });
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

    res.redirect(`/product/${encodeURIComponent(String(productId))}`);
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
        res.redirect('/admin/productos');
    } catch (err) {
        console.error('Error al agregar nuevo producto:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// ==================== RUTAS POST PARA SISTEMA DE CAJAS ====================

// Procesar nuevo comprobante
app.post('/cajas/procesar-venta', requireLogin, async (req, res) => {
    // (se eliminaron los logs del body completo: contenían teléfonos/emails de clientes)
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
                // cantidad negativa o no numérica permitía inflar el stock
                if (!Number.isInteger(Number(item.cantidad)) || Number(item.cantidad) < 1 || !Number.isInteger(Number(item.product_id))) {
                    throw new Error('Cantidad o producto inválido');
                }
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
            message: 'Error al procesar la venta'
        });
    } finally {
        client.release();
    }
});

// Generar página para imprimir (sin PDF)
app.get('/factura/:id/pdf', requireLogin, async (req, res) => {
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
    <title>Comprobante ${esc(factura.numero_factura)}</title>
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
        <p><strong>N°:</strong> ${esc(factura.numero_factura)}</p>
        <p><strong>Fecha:</strong> ${fecha}</p>
    </div>
    
    <div class="info">
        <h3>CLIENTE:</h3>
        <p><strong>Nombre:</strong> ${esc(factura.cliente_nombre)}</p>
        ${factura.cliente_telefono ? `<p><strong>Teléfono:</strong> ${esc(factura.cliente_telefono)}</p>` : ''}
        ${factura.cliente_email ? `<p><strong>Email:</strong> ${esc(factura.cliente_email)}</p>` : ''}
        <p><strong>Pago:</strong> ${esc(factura.metodo_pago || 'Efectivo')}</p>
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
            <td>${esc(item.name || 'Producto')}</td>
            <td>${Number(item.cantidad) || 1}</td>
            <td>$${(Number(item.price) || 0).toLocaleString()}</td>
            <td>$${((Number(item.price) || 0) * (Number(item.cantidad) || 1)).toLocaleString()}</td>
        </tr>
        `).join('')}
    </table>
    
    <div class="totals">
        <p><strong>Subtotal: $${parseFloat(factura.subtotal || 0).toLocaleString()}</strong></p>
        <p><strong>Impuestos: $${parseFloat(factura.impuestos || 0).toLocaleString()}</strong></p>
        <p class="total">TOTAL: $${parseFloat(factura.total || 0).toLocaleString()}</p>
    </div>
    
    ${factura.notas ? `<div class="info"><h3>NOTAS:</h3><p>${esc(factura.notas)}</p></div>` : ''}
    
    <div style="text-align: center; margin-top: 30px;">
        <p><strong>¡Gracias por su compra!</strong></p>
        <p>iPhone Stock - Vendedor: ${esc(factura.vendedor_nombre || 'Sistema')}</p>
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);

    } catch (err) {
        console.error('Error:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Búsqueda de comprobantes
app.get('/api/facturas/search', requireLogin, async (req, res) => {
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
const DUMMY_HASH = bcrypt.hashSync('dummy-password', 12);
const LOGIN_MAX_FALLOS = 5;
const LOGIN_VENTANA_MIN = 15;

pool.query(`CREATE TABLE IF NOT EXISTS login_attempts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100),
    success BOOLEAN NOT NULL,
    ip VARCHAR(64),
    user_agent TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    accuracy DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)`).catch(e => console.error('Error creando login_attempts:', e));

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const num = v => (v !== undefined && v !== '' && isFinite(Number(v)) ? Number(v) : null);
    const lat = num(req.body.lat), lng = num(req.body.lng), accuracy = num(req.body.accuracy);
    const ip = req.ip;
    const registrar = (success) => pool.query(
        'INSERT INTO login_attempts (username, success, ip, user_agent, lat, lng, accuracy) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [String(username || '').slice(0, 100), success, ip, req.get('user-agent') || null, lat, lng, accuracy]
    ).catch(e => console.error('Error registrando intento:', e));
    try {
        if (typeof username !== 'string' || typeof password !== 'string') {
            req.session.error = 'Credenciales incorrectas';
            return res.redirect('/login');
        }
        // Límite: demasiados fallos recientes desde esta IP o para este usuario
        const fallos = await pool.query(
            `SELECT COUNT(*)::int AS n FROM login_attempts
             WHERE success = FALSE AND created_at > NOW() - ($3 || ' minutes')::interval
               AND (ip = $1 OR username = $2)`,
            [ip, username.slice(0, 100), String(LOGIN_VENTANA_MIN)]
        );
        if (fallos.rows[0].n >= LOGIN_MAX_FALLOS) {
            req.session.error = `Demasiados intentos fallidos. Probá de nuevo en ${LOGIN_VENTANA_MIN} minutos.`;
            return res.redirect('/login');
        }
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];
        let ok = false;
        // Comparación "dummy" cuando el usuario no existe: evita revelar por tiempo de respuesta qué usuarios existen
        if (!user) await bcrypt.compare(password, DUMMY_HASH);
        if (user) {
            const stored = user.password || '';
            if (/^\$2[aby]\$/.test(stored)) {
                ok = await bcrypt.compare(password, stored);
            } else if (stored === password) {
                // Contraseña vieja en texto plano: validar y migrar a hash en este login
                ok = true;
                const hash = await bcrypt.hash(password, 12);
                await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, user.id]);
            }
        }
        await registrar(ok);
        if (ok) {
            // Nueva sesión al loguear: evita session fixation
            req.session.regenerate((regErr) => {
                if (regErr) {
                    console.error('Error regenerando sesión:', regErr);
                    return res.status(500).send('Error interno del servidor');
                }
                req.session.userId = user.id;
                req.session.isAdmin = user.isadmin;
                req.session.username = user.username;
                req.session.save(() => res.redirect('/panel'));
            });
        } else {
            req.session.error = 'Credenciales incorrectas';
            res.redirect('/login');
        }
    } catch (err) {
        console.error('Error al buscar usuario:', err);
        res.status(500).send('Error interno del servidor');
    }
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
        res.redirect('/panel');
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
        res.redirect('/admin/productos');
    } catch (err) {
        console.error('Error al actualizar producto:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Cambio rápido de precios desde el listado: solo toca el precio, todos juntos o ninguno
app.post('/admin/productos/precios', requireAdmin, async (req, res) => {
    const cambios = Array.isArray(req.body.cambios) ? req.body.cambios : [];
    const valido = c => c && Number.isInteger(c.id) && c.id > 0 && typeof c.precio === 'number' && c.precio > 0 && c.precio < 100000000;
    if (!cambios.length || !cambios.every(valido)) {
        return res.status(400).json({ success: false, message: 'Hay un precio que no es válido' });
    }
    try {
        const r = await pool.query(
            'UPDATE products SET price = v.precio FROM unnest($1::int[], $2::numeric[]) AS v(id, precio) WHERE products.id = v.id RETURNING products.id',
            [cambios.map(c => c.id), cambios.map(c => c.precio)]
        );
        res.json({ success: true, ids: r.rows.map(x => x.id) });
    } catch (err) {
        console.error('Error al cambiar precios:', err);
        res.status(500).json({ success: false, message: 'No se pudieron guardar los precios' });
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
        if (!product) {
            return res.redirect('/cart'); // antes: TypeError no capturado que tumbaba el servidor
        }
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

// ==================== CARRITO PÚBLICO (checkout por WhatsApp) ====================
// El navegador solo guarda {id, qty}. Precios, ofertas y stock se resuelven acá desde la BD,
// así nadie puede manipular un precio desde el cliente.

const CARRITO_MAX_ITEMS = 30;
const CARRITO_MAX_QTY = 10;
const carritoHits = new Map(); // limitador simple por IP: 60 pedidos/min
setInterval(() => carritoHits.clear(), 60 * 1000).unref();
function carritoLimiter(req, res, next) {
    const n = (carritoHits.get(req.ip) || 0) + 1;
    carritoHits.set(req.ip, n);
    if (n > 60) return res.status(429).json({ error: 'Demasiadas solicitudes, probá en un minuto.' });
    next();
}

// Devuelve los productos pedidos con su precio final (oferta específica > oferta general > precio normal)
async function cargarProductosPublicos(ids) {
    ids = [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, CARRITO_MAX_ITEMS);
    if (!ids.length) return [];
    // Las 3 consultas son independientes: se lanzan en paralelo (la BD es remota y cada ida y vuelta cuesta)
    const [prodsRes, generalRes, especificasRes] = await Promise.all([
        pool.query('SELECT * FROM products WHERE id = ANY($1::int[])', [ids]),
        pool.query(campaniaLib.SQL_GENERAL_VIGENTE).catch(() => null),
        pool.query(`
            SELECT o.product_id,
                CASE WHEN o.tipo_descuento = 'porcentaje' THEN ROUND(p.price * (1 - o.valor_descuento / 100), 2)
                ELSE GREATEST(ROUND(p.price - o.valor_descuento, 2), 0) END AS precio_final
            FROM ofertas o JOIN products p ON o.product_id = p.id
            WHERE o.activo = TRUE AND o.product_id = ANY($1::int[])`, [ids]).catch(() => null)
    ]);
    const prods = prodsRes.rows;

    const ofertaGeneral = generalRes && generalRes.rows[0] ? generalRes.rows[0] : null;
    const excluidas = ofertaGeneral && ofertaGeneral.categorias_excluidas
        ? ofertaGeneral.categorias_excluidas.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x)) : [];

    const especificas = {};
    if (especificasRes) especificasRes.rows.forEach(o => { especificas[o.product_id] = Number(o.precio_final); });

    return prods.map(p => {
        const precio = Number(p.price) || 0;
        let final = precio;
        if (especificas[p.id] !== undefined) final = especificas[p.id];
        else if (ofertaGeneral && !excluidas.includes(p.categoria_id) && campaniaLib.incluye(ofertaGeneral, p)) {
            final = ofertaGeneral.tipo_descuento === 'porcentaje'
                ? Math.round(precio * (1 - campaniaLib.descuento(ofertaGeneral, p) / 100) * 100) / 100
                : Math.max(Math.round((precio - campaniaLib.descuento(ofertaGeneral, p)) * 100) / 100, 0);
        }
        return {
            id: p.id, name: p.name, img: optimizeCloudinaryUrl(p.img, 300),
            moneda: p.moneda === 'ARS' ? 'ARS' : 'USD',
            price: precio, precio_final: final,
            stock: Math.max(parseInt(p.stock) || 0, 0),
            bateria: p.bateria, almacenamiento: p.almacenamiento, estado: p.estado
        };
    });
}

// Datos frescos de los productos del carrito (para dibujar el panel)
app.get('/api/carrito/productos', carritoLimiter, async (req, res) => {
    try {
        const ids = String(req.query.ids || '').split(',').map(Number);
        res.json(await cargarProductosPublicos(ids));
    } catch (err) {
        console.error('Error carrito/productos:', err.message);
        res.status(500).json({ error: 'No se pudo cargar el carrito' });
    }
});

// Arma el mensaje de WhatsApp con todo el carrito y devuelve la URL
app.post('/carrito/whatsapp', carritoLimiter, async (req, res) => {
    try {
        const telefono = String(process.env.MY_PHONE_NUMBER || '').replace(/\D/g, '');
        if (!telefono) return res.status(500).json({ error: 'WhatsApp no está configurado' });

        const pedidos = Array.isArray(req.body && req.body.items) ? req.body.items.slice(0, CARRITO_MAX_ITEMS) : [];
        const qtyPorId = {};
        pedidos.forEach(i => {
            const id = parseInt(i && i.id), q = parseInt(i && i.qty);
            if (Number.isInteger(id) && id > 0 && Number.isInteger(q) && q > 0) qtyPorId[id] = Math.min(q, CARRITO_MAX_QTY);
        });
        const productos = (await cargarProductosPublicos(Object.keys(qtyPorId))).filter(p => p.stock > 0);
        if (!productos.length) return res.status(400).json({ error: 'Tu carrito está vacío o los productos ya no tienen stock.' });

        const nombre = String((req.body && req.body.nombre) || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 60);
        const base = getPublicBaseUrl(req);
        const fmt = (n, m) => (m === 'ARS' ? 'ARS $' : 'USD ') + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
        const totales = {};
        const ajustes = [];

        const lineas = productos.map((p, i) => {
            let qty = qtyPorId[p.id];
            if (qty > p.stock) { qty = p.stock; ajustes.push(p.name); }
            const sub = p.precio_final * qty;
            totales[p.moneda] = (totales[p.moneda] || 0) + sub;
            const detalle = [p.almacenamiento ? `${p.almacenamiento}GB` : '', p.bateria ? `Batería ${p.bateria}%` : '', p.estado || '']
                .filter(Boolean).join(' · ');
            return `${i + 1}) *${p.name}*` + (detalle ? `\n   ${detalle}` : '') +
                `\n   ${qty} x ${fmt(p.precio_final, p.moneda)} = ${fmt(sub, p.moneda)}` +
                `\n   ${base}/product/${p.id}`;
        });

        const totalTxt = Object.keys(totales).map(m => fmt(totales[m], m)).join(' + ');
        const mensaje = `Hola iLoop! 👋${nombre ? ' Soy ' + nombre + '.' : ''} Quiero consultar por estos productos:\n\n` +
            lineas.join('\n\n') + `\n\n*Total: ${totalTxt}*\n\n¿Están disponibles?`;

        res.json({
            url: `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`,
            ajustados: ajustes
        });
    } catch (err) {
        console.error('Error carrito/whatsapp:', err.message);
        res.status(500).json({ error: 'No se pudo armar el pedido' });
    }
});

// Ruta para eliminar un producto (requiere autenticación de administrador)
app.post('/delete/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    
    if (!id || isNaN(id)) {
        console.error('ID de producto inválido:', id);
        return res.status(400).send('ID de producto inválido');
    }
    
    try {
        // Verificar si el producto existe
        const checkProduct = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
        if (checkProduct.rows.length === 0) {
            console.error('Producto no encontrado:', id);
            return res.status(404).send('Producto no encontrado');
        }
        
        // Eliminar registros dependientes primero para evitar errores de foreign key
        // Usamos try/catch individual por si alguna tabla no existe
        try { 
            const result1 = await pool.query('DELETE FROM stock_historial WHERE product_id = $1', [id]); 
            console.log(`Eliminados ${result1.rowCount} registros de stock_historial para producto ${id}`);
        } catch(e) { 
            console.log('Tabla stock_historial no existe o error:', e.message); 
        }
        
        try { 
            const result2 = await pool.query('DELETE FROM carrito_items WHERE product_id = $1', [id]); 
            console.log(`Eliminados ${result2.rowCount} registros de carrito_items para producto ${id}`);
        } catch(e) { 
            console.log('Tabla carrito_items no existe o error:', e.message); 
        }
        
        // La tabla ofertas tiene ON DELETE CASCADE, pero por las dudas lo hacemos manualmente
        try { 
            const result3 = await pool.query('DELETE FROM ofertas WHERE product_id = $1', [id]); 
            console.log(`Eliminadas ${result3.rowCount} ofertas para producto ${id}`);
        } catch(e) { 
            console.log('Error al eliminar ofertas:', e.message); 
        }
        
        // Finalmente eliminar el producto
        const deleteResult = await pool.query('DELETE FROM products WHERE id = $1', [id]);
        console.log(`Producto ${id} eliminado correctamente (${deleteResult.rowCount} filas afectadas)`);
        
        res.redirect('/admin/productos');
    } catch (err) {
        console.error('Error al eliminar producto:', err);
        res.status(500).send('Error al eliminar producto: ' + err.message);
    }
});

// Ruta para eliminar múltiples productos (requiere autenticación de administrador)
app.post('/products/delete-multiple', requireAdmin, async (req, res) => {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'No se proporcionaron IDs de productos válidos' 
        });
    }
    
    // Validar que todos los IDs sean números válidos
    const validIds = productIds.filter(id => !isNaN(id) && id > 0);
    if (validIds.length === 0) {
        return res.status(400).json({ 
            success: false, 
            message: 'No se proporcionaron IDs de productos válidos' 
        });
    }
    
    try {
        let deletedCount = 0;
        const errors = [];
        
        // Eliminar cada producto con sus dependencias
        for (const id of validIds) {
            try {
                // Verificar si el producto existe
                const checkProduct = await pool.query('SELECT id, name FROM products WHERE id = $1', [id]);
                if (checkProduct.rows.length === 0) {
                    console.log(`Producto ${id} no encontrado, saltando...`);
                    errors.push(`Producto ID ${id} no encontrado`);
                    continue;
                }
                
                const productName = checkProduct.rows[0].name;
                
                // Eliminar registros dependientes primero
                try { 
                    await pool.query('DELETE FROM stock_historial WHERE product_id = $1', [id]); 
                } catch(e) { 
                    console.log(`Error al eliminar stock_historial para producto ${id}:`, e.message); 
                }
                
                try { 
                    await pool.query('DELETE FROM carrito_items WHERE product_id = $1', [id]); 
                } catch(e) { 
                    console.log(`Error al eliminar carrito_items para producto ${id}:`, e.message); 
                }
                
                try { 
                    await pool.query('DELETE FROM ofertas WHERE product_id = $1', [id]); 
                } catch(e) { 
                    console.log(`Error al eliminar ofertas para producto ${id}:`, e.message); 
                }
                
                // Eliminar el producto
                const result = await pool.query('DELETE FROM products WHERE id = $1', [id]);
                if (result.rowCount > 0) {
                    deletedCount++;
                    console.log(`Producto ${id} (${productName}) eliminado correctamente`);
                }
            } catch (err) {
                console.error(`Error al eliminar producto ${id}:`, err);
                errors.push(`Error al eliminar producto ID ${id}: ${err.message}`);
            }
        }
        
        const response = {
            success: true, 
            deletedCount,
            totalRequested: validIds.length,
            message: `${deletedCount} de ${validIds.length} producto${validIds.length !== 1 ? 's' : ''} eliminado${deletedCount !== 1 ? 's' : ''} correctamente`
        };
        
        if (errors.length > 0) {
            response.errors = errors;
            response.message += `. ${errors.length} error${errors.length !== 1 ? 'es' : ''} encontrado${errors.length !== 1 ? 's' : ''}`;
        }
        
        res.json(response);
    } catch (err) {
        console.error('Error general al eliminar productos:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Error al eliminar productos: ' + err.message 
        });
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
        res.redirect('/panel');
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
        if (!req.files || !req.files['image']) {
            return res.status(400).send('Tenés que cargar una imagen para el carrusel');
        }

        if (req.files['image']) {
            imageUrl = req.files['image'][0].path; // Guardar la URL de Cloudinary
        }
        if (req.files['mobileImage']) {
            mobileImageUrl = req.files['mobileImage'][0].path; // Guardar la URL móvil de Cloudinary
        } else {
            mobileImageUrl = imageUrl;
        }

        // Insertar el nuevo elemento en la base de datos
        await pool.query(
            'INSERT INTO carousel (text, img, imagenMobile, color1, color2) VALUES ($1, $2, $3, $4, $5)',
            [text || 'Banner iLoop', imageUrl, mobileImageUrl, color1 || '#ffffff', color2 || '#ffffff']
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
        <h1 class="title">COMPROBANTE ${esc(factura.numero_factura)}</h1>
        <div class="info">
            <strong>Fecha:</strong> ${fecha}<br>
            <strong>Cliente:</strong> ${esc(factura.cliente_nombre)}<br>
            ${factura.cliente_telefono ? `<strong>Teléfono:</strong> ${esc(factura.cliente_telefono)}<br>` : ''}
            <strong>Pago:</strong> ${esc(factura.metodo_pago || 'Efectivo')}
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
            <td>${esc(item.name || 'Producto')}</td>
            <td>${Number(item.cantidad) || 1}</td>
            <td>$${parseFloat(Number(item.price) || 0).toLocaleString('es-ES')}</td>
            <td>$${(parseFloat(Number(item.price) || 0) * (Number(item.cantidad) || 1)).toLocaleString('es-ES')}</td>
        </tr>
        `).join('')}
    </table>
    
    <div class="total">
        <strong>TOTAL: $${parseFloat(factura.total || 0).toLocaleString('es-ES')}</strong>
    </div>
    
    <div class="footer">
        <p>iPhone Stock - Gracias por su compra</p>
        <p>Vendedor: ${esc(factura.vendedor_nombre || 'Sistema')}</p>
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
        const precio = parseFloat(Number(item.price) || 0);
        const cantidad = parseInt(Number(item.cantidad) || 1);
        const subtotal = precio * cantidad;
        return `
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${esc(item.name || 'Producto')}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${cantidad}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${precio.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${subtotal.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
            </tr>`;
    }).join('');
    
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Comprobante ${esc(factura.numero_factura)}</title>
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
        <div>${logoUrl ? `<img src="${esc(logoUrl)}" alt="iPhone Stock" class="logo">` : '<div style="font-size: 18px; font-weight: bold; color: #007bff;">iPhone Stock</div>'}</div>
        <div class="invoice-info">
            <h1>COMPROBANTE</h1>
            <p><strong>N°:</strong> ${esc(factura.numero_factura)}</p>
            <p><strong>Fecha:</strong> ${fecha}</p>
        </div>
    </div>
    
    <div class="customer-section">
        <h3>Información del Cliente</h3>
        <p><strong>Nombre:</strong> ${esc(factura.cliente_nombre)}</p>
        ${factura.cliente_telefono ? `<p><strong>Teléfono:</strong> ${esc(factura.cliente_telefono)}</p>` : ''}
        ${factura.cliente_email ? `<p><strong>Email:</strong> ${esc(factura.cliente_email)}</p>` : ''}
        <p><strong>Método de Pago:</strong> ${esc(factura.metodo_pago || 'Efectivo')}</p>
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
    
    ${factura.notas ? `<div class="notes"><h4>Notas:</h4><p>${esc(factura.notas)}</p></div>` : ''}
    
    <div class="footer">
        <p><strong>¡Gracias por su compra!</strong></p>
        <p>Vendedor: ${esc(factura.vendedor_nombre || 'Sistema')}</p>
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
        const campaniaCfg = await campaniaLib.leer(pool);
        const campaniaOferta = ofertasGeneralesResult.rows.find(o => String(o.id) === String(campaniaCfg.oferta_id)) || null;
        res.render('ofertas', {
            campaniaCfg, campaniaOferta,
            campaniaMsg: req.query.campania || '',
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

// ==================== CAMPAÑA BLACK FRIDAY ====================

app.post('/admin/ofertas/campania', requireAdmin, async (req, res) => {
    try {
        const b = req.body;
        const nombre = String(b.nombre || '').trim().slice(0, 60);
        const tipo = b.tipo_descuento === 'monto_fijo' ? 'monto_fijo' : 'porcentaje';
        const modo = b.modo === 'precio' ? 'precio' : 'porcentaje';
        const precios = {};
        if (modo === 'precio') {
            let crudo = {};
            try { crudo = JSON.parse(b.precios || '{}'); } catch (e) { }
            Object.entries(crudo || {}).slice(0, 2000).forEach(([id, v]) => {
                const n = Math.round(Number(v) * 100) / 100;
                if (/^[1-9][0-9]{0,8}$/.test(id) && n > 0 && n < 1e9) precios[id] = n;
            });
            if (!Object.keys(precios).length) return res.status(400).send('Escribí al menos un precio de oferta');
        }
        // En modo precio la columna del porcentaje no se usa (la tabla la exige)
        const valor = modo === 'precio' ? 1 : parseFloat(b.valor_descuento);
        const ini = String(b.fecha_inicio || '');
        const fin = String(b.fecha_fin || '');
        if (!nombre || !ini || !fin || !(valor > 0)) return res.status(400).send('Completá nombre, descuento y fechas');
        if (tipo === 'porcentaje' && valor >= 100) return res.status(400).send('El porcentaje debe ser menor a 100');
        if (fin <= ini) return res.status(400).send('La fecha de fin debe ser posterior a la de inicio');
        const elegidos = b.alcance === 'elegidos';
        const productos = elegidos ? String(b.productos || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0) : [];
        if (elegidos && !productos.length) return res.status(400).send('Elegí al menos un equipo');
        const excluidas = elegidos ? '' : [].concat(b.categorias_excluidas || []).join(',');

        const agrupar = ['categoria', 'modelo'].includes(b.agrupar) ? b.agrupar : 'no';
        const porGrupo = {};
        if (agrupar !== 'no') {
            let crudo = {};
            try { crudo = JSON.parse(b.por_grupo || '{}'); } catch (e) { }
            Object.entries(crudo || {}).slice(0, 300).forEach(([k, v]) => {
                const n = Number(v);
                if (k !== '__proto__' && k.length <= 80 && Number.isInteger(n) && n >= 0 && n <= 90) porGrupo[k] = n;
            });
        }

        const cfg = await campaniaLib.leer(pool);
        // Solo puede haber una oferta general encendida
        await pool.query('UPDATE ofertas_generales SET activo = FALSE WHERE activo = TRUE');
        let id = null;
        if (cfg.oferta_id) {
            const up = await pool.query(
                'UPDATE ofertas_generales SET nombre = $1, tipo_descuento = $2, valor_descuento = $3, fecha_inicio = $4, fecha_fin = $5, categorias_excluidas = $6, activo = TRUE, updated_at = NOW() WHERE id = $7 RETURNING id',
                [nombre, tipo, valor, ini, fin, excluidas, cfg.oferta_id]);
            if (up.rows.length) id = up.rows[0].id;
        }
        if (!id) {
            const ins = await pool.query(
                'INSERT INTO ofertas_generales (nombre, descripcion, tipo_descuento, valor_descuento, fecha_inicio, fecha_fin, activo, categorias_excluidas) VALUES ($1, NULL, $2, $3, $4, $5, TRUE, $6) RETURNING id',
                [nombre, tipo, valor, ini, fin, excluidas]);
            id = ins.rows[0].id;
        }
        await campaniaLib.guardar(pool, {
            oferta_id: id,
            productos,
            modo,
            precios,
            agrupar,
            porGrupo,
            vista: campaniaLib.VISTAS.includes(b.vista) ? b.vista : 'primero',
            inicio: b.inicio === 'on',
            aviso: b.aviso === 'on',
            titulo: String(b.titulo || '').trim().slice(0, 60) || nombre,
            mensaje: String(b.mensaje || '').trim().slice(0, 220),
            boton: String(b.boton || '').trim().slice(0, 30) || campaniaLib.DEFAULTS.boton
        });
        res.redirect('/admin/ofertas?campania=guardada');
    } catch (err) {
        console.error('Error al guardar la campaña:', err);
        res.status(500).send('Error al guardar la campaña');
    }
});

app.post('/admin/ofertas/campania/apagar', requireAdmin, async (req, res) => {
    try {
        const cfg = await campaniaLib.leer(pool);
        if (cfg.oferta_id) await pool.query('UPDATE ofertas_generales SET activo = FALSE WHERE id = $1', [cfg.oferta_id]);
        res.redirect('/admin/ofertas?campania=apagada');
    } catch (err) {
        console.error('Error al apagar la campaña:', err);
        res.status(500).send('Error al apagar la campaña');
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
        let mostrarPrecioPesos = true;
        try {
            const cotizResult = await pool.query("SELECT valor, updated_at FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) {
                cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
            }
            const pesosResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'mostrar_precio_pesos'");
            if (pesosResult.rows.length > 0) mostrarPrecioPesos = pesosResult.rows[0].valor === 'true';
        } catch (e) {
            console.log('Tabla configuracion no existe, creando...');
        }
        const logoResult = await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1');
        const images = logoResult.rows[0] || {};
        res.render('cotizacion', {
            cotizacionDolar,
            mostrarPrecioPesos,
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
        const { cotizacion, mostrar_pesos } = req.body;
        const valor = parseFloat(cotizacion);
        if (isNaN(valor) || valor <= 0) {
            return res.status(400).send('La cotización debe ser un número positivo');
        }
        await pool.query(
            "INSERT INTO configuracion (clave, valor, updated_at) VALUES ('cotizacion_dolar', $1, NOW()) ON CONFLICT (clave) DO UPDATE SET valor = $1, updated_at = NOW()",
            [valor.toString()]
        );
        // Guardar configuración de visibilidad del precio en pesos
        const mostrarPesosVal = mostrar_pesos === 'on' ? 'true' : 'false';
        await pool.query(
            "INSERT INTO configuracion (clave, valor, updated_at) VALUES ('mostrar_precio_pesos', $1, NOW()) ON CONFLICT (clave) DO UPDATE SET valor = $1, updated_at = NOW()",
            [mostrarPesosVal]
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

// ==================== COTIZADOR (presupuestos a clientes) ====================
// Solo lee la cotización del dólar: nunca la modifica. El PDF/imagen se genera en el navegador
// al momento de descargar; acá solo se guarda el registro para el historial.

pool.query(`
    CREATE TABLE IF NOT EXISTS cotizaciones (
        id SERIAL PRIMARY KEY,
        cliente_nombre VARCHAR(150),
        cliente_contacto VARCHAR(150),
        canal VARCHAR(20) NOT NULL,
        items JSONB NOT NULL,
        descuento NUMERIC(12,2) DEFAULT 0,
        total_usd NUMERIC(14,2),
        total_ars NUMERIC(16,2),
        cotizacion_dolar NUMERIC(12,2),
        notas TEXT,
        user_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
`).then(() => pool.query('ALTER TABLE cotizaciones ADD COLUMN IF NOT EXISTS opciones JSONB, ADD COLUMN IF NOT EXISTS vendedor VARCHAR(80)'))
  .catch(err => console.error('Error creando tabla cotizaciones:', err.message));

app.get('/admin/cotizador', requireLogin, async (req, res) => {
    try {
        let cotizacionDolar = 1200;
        let cuotasGuardadas = { planes: [] };
        try {
            const cotizResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'");
            if (cotizResult.rows.length > 0) cotizacionDolar = parseFloat(cotizResult.rows[0].valor);
            const cuotasResult = await pool.query("SELECT valor FROM configuracion WHERE clave = 'cotizador_cuotas'");
            if (cuotasResult.rows.length > 0) {
                const v = JSON.parse(cuotasResult.rows[0].valor);
                cuotasGuardadas = Array.isArray(v) ? { planes: v } : v; // formato viejo: solo el array de planes
            }
        } catch (e) { console.log('Tabla configuracion no existe aún'); }

        const productsResult = await pool.query('SELECT p.id, p.name, p.img, p.price, p.stock, p.moneda, p.bateria, p.almacenamiento, p.estado, p.categoria_id, c.cuotas_max, c.interes_cuotas, c.cuotas_planes FROM products p LEFT JOIN categorias c ON p.categoria_id = c.id ORDER BY p.name');

        // Ofertas vigentes (específicas y general) para sugerir el precio final
        let ofertaGeneral = null;
        let categoriasExcluidas = [];
        const ofertasMap = {};
        try {
            ofertaGeneral = (await pool.query(campaniaLib.SQL_GENERAL_VIGENTE)).rows[0];
            categoriasExcluidas = ofertaGeneral && ofertaGeneral.categorias_excluidas
                ? ofertaGeneral.categorias_excluidas.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
                : [];
            const ofertasResult = await pool.query(`
                SELECT o.product_id,
                    CASE WHEN o.tipo_descuento = 'porcentaje' THEN ROUND(p.price * (1 - o.valor_descuento / 100), 2)
                    ELSE GREATEST(ROUND(p.price - o.valor_descuento, 2), 0) END as precio_con_descuento
                FROM ofertas o JOIN products p ON o.product_id = p.id WHERE o.activo = TRUE
            `);
            ofertasResult.rows.forEach(o => { ofertasMap[o.product_id] = parseFloat(o.precio_con_descuento); });
        } catch (e) { console.log('Tablas de ofertas no existen aún'); }

        const products = productsResult.rows.map(p => {
            let precioFinal = parseFloat(p.price);
            if (ofertasMap[p.id] !== undefined) precioFinal = ofertasMap[p.id];
            else if (ofertaGeneral && !categoriasExcluidas.includes(p.categoria_id) && campaniaLib.incluye(ofertaGeneral, p)) {
                precioFinal = ofertaGeneral.tipo_descuento === 'porcentaje'
                    ? Math.round(p.price * (1 - campaniaLib.descuento(ofertaGeneral, p) / 100) * 100) / 100
                    : Math.max(Math.round((p.price - campaniaLib.descuento(ofertaGeneral, p)) * 100) / 100, 0);
            }
            let planes = [];
            try { planes = JSON.parse(p.cuotas_planes || '[]'); } catch (e) { planes = []; }
            if (planes.length === 0 && p.cuotas_max > 0) planes = [{ cuotas: p.cuotas_max, interes: p.interes_cuotas || 0 }];
            return {
                id: p.id, name: p.name, img: optimizeCloudinaryUrl(p.img, 200), stock: p.stock,
                moneda: p.moneda || 'USD', price: parseFloat(p.price), precio_final: precioFinal,
                bateria: p.bateria, almacenamiento: p.almacenamiento, estado: p.estado, planes
            };
        });

        const images = (await pool.query('SELECT imagen1, imagen2 FROM imagenes LIMIT 1')).rows[0] || {};
        const usuario = (await pool.query('SELECT username FROM users WHERE id = $1', [req.session.userId])).rows[0];
        res.render('cotizador', {
            products,
            cotizacionDolar,
            cuotasGuardadas,
            usuarioActual: usuario ? usuario.username : '',
            logoUrl: images.imagen1,
            imagenUrl2: images.imagen2,
            isAdmin: req.session.isAdmin
        });
    } catch (err) {
        console.error('Error al cargar cotizador:', err);
        res.status(500).send('Error interno del servidor');
    }
});

// Guarda los intereses de cuotas del cotizador para que queden cargados la próxima vez
app.post('/admin/cotizador/cuotas', requireAdmin, async (req, res) => {
    try {
        const planes = (Array.isArray(req.body.planes) ? req.body.planes : [])
            .map(p => ({ cuotas: parseInt(p.cuotas), interes: Math.max(0, parseFloat(p.interes) || 0), on: !!p.on }))
            .filter(p => p.cuotas >= 2 && p.cuotas <= 60);
        const guardado = { planes, por: String(req.body.vendedor || '').slice(0, 80) || null, fecha: new Date().toISOString() };
        await pool.query(
            "INSERT INTO configuracion (clave, valor, updated_at) VALUES ('cotizador_cuotas', $1, NOW()) ON CONFLICT (clave) DO UPDATE SET valor = $1, updated_at = NOW()",
            [JSON.stringify(guardado)]
        );
        res.json(guardado);
    } catch (err) {
        console.error('Error al guardar cuotas del cotizador:', err);
        res.status(500).json({ error: 'Error al guardar los porcentajes' });
    }
});

app.get('/admin/cotizador/historial', requireLogin, async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        const vendedor = (req.query.vendedor || '').trim();
        const params = [];
        const conds = [];
        if (q) {
            params.push(`%${q}%`);
            conds.push(`(cliente_nombre ILIKE $${params.length} OR cliente_contacto ILIKE $${params.length} OR vendedor ILIKE $${params.length})`);
        }
        if (vendedor) {
            params.push(vendedor);
            conds.push(`LOWER(vendedor) = LOWER($${params.length})`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const result = await pool.query(`SELECT * FROM cotizaciones ${where} ORDER BY created_at DESC LIMIT 200`, params);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener historial de cotizaciones:', err);
        res.status(500).json({ error: 'Error al obtener historial' });
    }
});

app.post('/admin/cotizador/guardar', requireLogin, async (req, res) => {
    try {
        const { cliente_nombre, cliente_contacto, canal, items, descuento, total_usd, total_ars, cotizacion_dolar, notas, opciones, vendedor } = req.body;
        if (!['whatsapp', 'pdf', 'imagen', 'excel'].includes(canal)) return res.status(400).json({ error: 'Canal inválido' });
        if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'La cotización no tiene productos' });
        const result = await pool.query(
            `INSERT INTO cotizaciones (cliente_nombre, cliente_contacto, canal, items, descuento, total_usd, total_ars, cotizacion_dolar, notas, user_id, opciones, vendedor)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, created_at`,
            [cliente_nombre || null, cliente_contacto || null, canal, JSON.stringify(items), parseFloat(descuento) || 0,
             parseFloat(total_usd) || 0, parseFloat(total_ars) || 0, parseFloat(cotizacion_dolar) || null, notas || null, req.session.userId || null,
             opciones ? JSON.stringify(opciones) : null, String(vendedor || '').slice(0, 80) || null]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al guardar cotización de cliente:', err);
        res.status(500).json({ error: 'Error al guardar la cotización' });
    }
});

// Planilla Excel de la cotización: se arma en el momento y no se guarda en el servidor
app.post('/admin/cotizador/excel', requireLogin, async (req, res) => {
    try {
        const ExcelJS = require('exceljs');
        const d = req.body || {};
        const items = Array.isArray(d.items) ? d.items : [];
        const cuotas = Array.isArray(d.cuotas) ? d.cuotas : [];
        const num = v => Number(v) || 0;
        const fmtUSD = '"USD" #,##0.00';
        const fmtARS = '"$" #,##0';
        const bold = { bold: true };
        const gris = { argb: 'FFF2F2F7' };

        const wb = new ExcelJS.Workbook();
        wb.creator = 'iLoop';
        const ws = wb.addWorksheet('Cotización', { views: [{ showGridLines: false }] });
        ws.columns = [{ width: 42 }, { width: 30 }, { width: 8 }, { width: 16 }, { width: 9 }, { width: 18 }];

        ws.mergeCells('A1:F1');
        ws.getCell('A1').value = 'COTIZACIÓN iLoop';
        ws.getCell('A1').font = { bold: true, size: 16 };
        ws.addRow(['Fecha', d.fecha || new Date().toLocaleDateString('es-AR')]);
        if (d.validez) ws.addRow(['Válida hasta', d.vence || '']);
        if (d.cliente_nombre) ws.addRow(['Cliente', d.cliente_nombre]);
        if (d.cliente_contacto) ws.addRow(['Contacto', d.cliente_contacto]);
        ws.addRow(['Dólar', num(d.dolar)]).getCell(2).numFmt = fmtARS;
        ws.addRow([]);

        const head = ws.addRow(['Producto', 'Detalle', 'Cant.', 'Precio unitario', 'Moneda', 'Subtotal']);
        head.eachCell(c => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D1D1F' } }; });
        items.forEach(it => {
            const row = ws.addRow([it.name || 'Ítem', it.detalle || '', num(it.qty), num(it.precio), it.moneda || 'USD', null]);
            row.getCell(6).value = { formula: `C${row.number}*D${row.number}`, result: num(it.qty) * num(it.precio) };
            const f = it.moneda === 'ARS' ? fmtARS : fmtUSD;
            row.getCell(4).numFmt = f;
            row.getCell(6).numFmt = f;
            row.eachCell(c => { c.border = { bottom: { style: 'thin', color: { argb: 'FFE5E5EA' } } }; });
        });
        ws.addRow([]);

        const total = (label, valor, fmt, strong) => {
            const r = ws.addRow(['', '', '', '', label, valor]);
            r.getCell(6).numFmt = fmt;
            if (strong) { r.getCell(5).font = bold; r.getCell(6).font = bold; }
        };
        if (num(d.desc) > 0) {
            total('Subtotal', num(d.subUSD), fmtUSD);
            total(`Desc. ${num(d.desc)}%`, -num(d.descUSD), fmtUSD);
        }
        total('Total USD', num(d.totalUSD), fmtUSD, true);
        total('Total ARS', num(d.totalARS), fmtARS, true);

        if (cuotas.length) {
            ws.addRow([]);
            ws.addRow(['Opciones en cuotas']).getCell(1).font = bold;
            const h = ws.addRow(['Plan', 'Interés', '', 'Valor cuota', '', 'Total']);
            h.eachCell(c => { c.font = bold; c.fill = { type: 'pattern', pattern: 'solid', fgColor: gris }; });
            cuotas.forEach(p => {
                const r = ws.addRow([`${num(p.cuotas)} cuotas`, num(p.interes) > 0 ? num(p.interes) / 100 : 'Sin interés', '', num(p.cuota), '', num(p.total)]);
                if (num(p.interes) > 0) r.getCell(2).numFmt = '0.##%';
                r.getCell(4).numFmt = fmtARS;
                r.getCell(6).numFmt = fmtARS;
            });
        }
        if (d.notas) {
            ws.addRow([]);
            ws.addRow(['Notas']).getCell(1).font = bold;
            ws.addRow([d.notas]).getCell(1).alignment = { wrapText: true };
        }
        ws.addRow([]);
        ws.addRow(['Precios sujetos a disponibilidad de stock.']).getCell(1).font = { italic: true, color: { argb: 'FF86868B' } };

        const nombre = String(d.cliente_nombre || 'cliente').replace(/[^\w\-]+/g, '_');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="cotizacion-${nombre}-${new Date().toISOString().slice(0, 10)}.xlsx"`);
        await wb.xlsx.write(res);
        res.end();
    } catch (err) {
        console.error('Error al generar Excel de cotización:', err);
        res.status(500).json({ error: 'Error al generar el Excel' });
    }
});

app.post('/admin/cotizador/eliminar/:id', requireAdmin, async (req, res) => {
    try {
        await pool.query('DELETE FROM cotizaciones WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('Error al eliminar cotización de cliente:', err);
        res.status(500).json({ error: 'Error al eliminar' });
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
Disallow: /admin/

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

// ==================== PANEL DE GESTIÓN ====================
const esFlagAdmin = (f) => f === true || f === 1 || f === '1' || f === 't';

// Inicio de la gestión: accesos agrupados por tarea y estado del negocio de un vistazo
app.get('/panel', requireLogin, async (req, res) => {
    try {
        const u = await pool.query('SELECT username, isadmin FROM users WHERE id = $1', [req.session.userId]);
        if (!u.rows.length) return req.session.destroy(() => res.redirect('/login'));
        const esAdmin = esFlagAdmin(u.rows[0].isadmin);
        req.session.isAdmin = esAdmin;
        req.session.username = u.rows[0].username;

        const q = (sql, params) => pool.query(sql, params).then(r => r.rows).catch(() => null);
        const soloMias = esAdmin ? '' : ' AND vendedor_id = $1';
        const pv = esAdmin ? [] : [req.session.userId];
        const [stock, ofertas, general, dolar, ventasHoy, ultimas] = await Promise.all([
            esAdmin ? q(`SELECT COUNT(*)::int AS total,
                    COUNT(*) FILTER (WHERE stock > 0)::int AS con_stock,
                    COUNT(*) FILTER (WHERE stock IS NULL OR stock <= 0)::int AS sin_stock,
                    COUNT(*) FILTER (WHERE stock BETWEEN 1 AND 2)::int AS poco_stock FROM products`) : null,
            esAdmin ? q('SELECT COUNT(*)::int AS n FROM ofertas WHERE activo = TRUE') : null,
            esAdmin ? q(campaniaLib.SQL_GENERAL_VIGENTE) : null,
            esAdmin ? q("SELECT valor FROM configuracion WHERE clave = 'cotizacion_dolar'") : null,
            q(`SELECT COUNT(*)::int AS n FROM facturas WHERE fecha::date = (NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date${soloMias}`, pv),
            q(`SELECT id, numero_factura, cliente_nombre, total, fecha FROM facturas WHERE TRUE${soloMias} ORDER BY fecha DESC LIMIT 5`, pv)
        ]);

        res.render('panel', {
            esAdmin,
            usuario: u.rows[0].username,
            stock: stock && stock[0],
            ofertasActivas: ofertas && ofertas[0] ? ofertas[0].n : null,
            ofertaGeneral: general && general[0] ? general[0] : null,
            dolar: dolar && dolar[0] ? parseFloat(dolar[0].valor) : null,
            ventasHoy: ventasHoy && ventasHoy[0] ? ventasHoy[0].n : null,
            ultimas: ultimas || [],
            isAdmin: esAdmin
        });
    } catch (err) {
        console.error('Error en /panel:', err.message);
        res.status(500).send('Error interno del servidor');
    }
});

app.get('/admin', requireLogin, (req, res) => res.redirect('/panel'));

// Gestión de productos (antes era una tabla al final de la portada pública)
app.get('/admin/productos', requireAdmin, async (req, res) => {
    try {
        const [prods, cats] = await Promise.all([
            pool.query(`SELECT p.id, p.name, p.img, p.price, p.moneda, p.stock, p.estado, p.bateria, p.almacenamiento,
                               p.categoria_id, c.nombre AS categoria_nombre
                        FROM products p LEFT JOIN categorias c ON p.categoria_id = c.id ORDER BY p.id DESC`),
            pool.query('SELECT id, nombre FROM categorias ORDER BY nombre').catch(() => ({ rows: [] }))
        ]);
        res.render('productos', {
            products: prods.rows.map(p => ({ ...p, img: optimizeCloudinaryUrl(p.img, 120) })),
            categorias: cats.rows,
            isAdmin: true
        });
    } catch (err) {
        console.error('Error en /admin/productos:', err.message);
        res.status(500).send('Error interno del servidor');
    }
});

// Manejador de errores para páginas no encontradas (404)
app.use((req, res, next) => {
    res.status(404).send("Página no encontrada");
});

// Manejador de errores global: no filtra trazas ni detalles internos al cliente
app.use((err, req, res, next) => {
    console.error('Error no manejado:', err.message);
    if (err.name === 'MulterError' || /imágenes/.test(err.message)) {
        return res.status(400).send(err.message);
    }
    res.status(500).send('Error interno del servidor');
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});
