// CONFIGURACIONES
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
const sessionSecret = process.env.SESSION_SECRET ;

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

//TODOS LOS GET


//requiere autenticación de administrador)
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

// Ruta para el inicio de sesión
app.get('/login', (req, res) => {
    res.render('login', { session: req.session, isAdmin: req.session.isAdmin });
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



// Ruta para mostrar el formulario de edición de imágenes
app.get('/edit-images', requireAdmin, async (req, res) => {
    const result = await pool.query('SELECT * FROM imagenes WHERE id = $1', [1]); // Asumiendo que solo tienes un registro con ID 1
    const imagenes = result.rows[0];
    res.render('editImages', { isAdmin: true, imagenes: { imagen1: 'url1', imagen2: 'url2' } });

});



//TODOS LOS POST







// Iniciar servidor
app.listen(PORT, () => {
    console.log(`Servidor iniciado en http://localhost:${PORT}`);
});



