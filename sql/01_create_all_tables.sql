-- Script para crear todas las tablas de ChipStore
-- Ejecutar este archivo primero si las tablas no existen

-- Tabla de usuarios (administradores y vendedores)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    isadmin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de productos
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    img VARCHAR(500),
    price DECIMAL(10, 2) NOT NULL,
    stock INTEGER DEFAULT 0,
    bateria INTEGER,
    almacenamiento VARCHAR(50),
    estado VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de carrusel (banners de la página principal)
CREATE TABLE IF NOT EXISTS carousel (
    id SERIAL PRIMARY KEY,
    text TEXT,
    img VARCHAR(500),
    imagenMobile VARCHAR(500),
    color1 VARCHAR(50),
    color2 VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla about (sección "Sobre nosotros")
CREATE TABLE IF NOT EXISTS about (
    id SERIAL PRIMARY KEY,
    titulo VARCHAR(255),
    texto TEXT,
    imagen VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de imágenes (logo y otros assets)
CREATE TABLE IF NOT EXISTS imagenes (
    id SERIAL PRIMARY KEY,
    imagen1 VARCHAR(500),
    imagen2 VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de facturas (comprobantes de venta)
CREATE TABLE IF NOT EXISTS facturas (
    id SERIAL PRIMARY KEY,
    numero_factura VARCHAR(50) UNIQUE NOT NULL,
    cliente_nombre VARCHAR(255) NOT NULL,
    cliente_telefono VARCHAR(50),
    cliente_email VARCHAR(255),
    items JSONB NOT NULL,
    subtotal DECIMAL(10, 2) DEFAULT 0,
    impuestos DECIMAL(10, 2) DEFAULT 0,
    total DECIMAL(10, 2) NOT NULL,
    metodo_pago VARCHAR(50) DEFAULT 'efectivo',
    vendedor_id INTEGER REFERENCES users(id),
    notas TEXT,
    estado VARCHAR(50) DEFAULT 'completada',
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Crear índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_products_stock ON products(stock);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha ON facturas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente ON facturas(cliente_nombre);
CREATE INDEX IF NOT EXISTS idx_facturas_numero ON facturas(numero_factura);

-- Comentarios útiles
COMMENT ON TABLE users IS 'Usuarios del sistema (administradores y vendedores)';
COMMENT ON TABLE products IS 'Catálogo de productos (celulares, tablets, etc)';
COMMENT ON TABLE carousel IS 'Banners del carrusel de la página principal';
COMMENT ON TABLE about IS 'Contenido de la sección Sobre Nosotros';
COMMENT ON TABLE imagenes IS 'URLs de imágenes del sistema (logos, etc)';
COMMENT ON TABLE facturas IS 'Comprobantes de ventas realizadas';

COMMIT;
