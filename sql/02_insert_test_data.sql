-- Script para insertar datos de prueba en ChipStore
-- Solo usuario administrador básico

-- ========== USUARIO ADMINISTRADOR ==========
INSERT INTO users (username, password, isadmin) VALUES 
('admin', 'admin123', 1);

-- ========== PRODUCTOS DE PRUEBA (IPHONES Y TECNOLOGÍA) ==========
INSERT INTO products (name, description, img, price, stock, bateria, almacenamiento, estado) VALUES 

-- iPhones
('iPhone 14 Pro Max', 'iPhone 14 Pro Max 256GB - Dynamic Island, cámara 48MP, chip A16 Bionic. Excelente estado, sin detalles. Incluye cargador original y caja.', 
'https://res.cloudinary.com/demo/image/upload/iphone14promax.png', 
850000, 5, 95, '256GB', 'Excelente'),

('iPhone 13', 'iPhone 13 128GB - Chip A15 Bionic, cámara dual 12MP, batería de larga duración. Muy buen estado, mínimos detalles estéticos.', 
'https://res.cloudinary.com/demo/image/upload/iphone13.png', 
620000, 8, 88, '128GB', 'Muy Bueno'),

('iPhone 12 Pro', 'iPhone 12 Pro 256GB - Triple cámara, LiDAR, pantalla Super Retina XDR. Buen estado general, funciona perfecto.', 
'https://res.cloudinary.com/demo/image/upload/iphone12pro.png', 
480000, 3, 82, '256GB', 'Bueno'),

('iPhone 11', 'iPhone 11 64GB - Cámara dual, gran autonomía de batería. Estado usado, pequeños rayones en el marco pero pantalla impecable.', 
'https://res.cloudinary.com/demo/image/upload/iphone11.png', 
320000, 12, 78, '64GB', 'Usado'),

('iPhone XR', 'iPhone XR 128GB - Pantalla Liquid Retina, Face ID, resistente al agua. Excelente opción calidad-precio.', 
'https://res.cloudinary.com/demo/image/upload/iphonexr.png', 
250000, 6, 75, '128GB', 'Bueno'),

-- iPads
('iPad Pro 11" 2022', 'iPad Pro 11 pulgadas con chip M2, 256GB, WiFi + Cellular. Incluye Apple Pencil 2da Gen. Como nuevo.', 
'https://res.cloudinary.com/demo/image/upload/ipadpro11.png', 
920000, 2, 98, '256GB', 'Excelente'),

('iPad Air 5ta Gen', 'iPad Air con chip M1, pantalla 10.9", 64GB WiFi. Ideal para estudiantes y profesionales. Muy buen estado.', 
'https://res.cloudinary.com/demo/image/upload/ipadair5.png', 
580000, 4, 92, '64GB', 'Muy Bueno'),

-- AirPods
('AirPods Pro 2da Gen', 'AirPods Pro con cancelación activa de ruido, estuche MagSafe. Nuevos en caja sellada.', 
'https://res.cloudinary.com/demo/image/upload/airpodspro2.png', 
285000, 10, 100, 'N/A', 'Nuevo'),

('AirPods 3ra Gen', 'AirPods tercera generación con audio espacial. Muy buen estado, con estuche original.', 
'https://res.cloudinary.com/demo/image/upload/airpods3.png', 
195000, 7, 95, 'N/A', 'Muy Bueno'),

-- Apple Watch
('Apple Watch Series 8 45mm', 'Apple Watch Series 8 GPS + Cellular, caja de aluminio, correa deportiva. Detección de accidentes y temperatura.', 
'https://res.cloudinary.com/demo/image/upload/applewatch8.png', 
520000, 3, 90, 'N/A', 'Excelente'),

-- MacBooks
('MacBook Air M2 2023', 'MacBook Air 13" con chip M2, 8GB RAM, 256GB SSD. Portátil y potente. Excelente estado.', 
'https://res.cloudinary.com/demo/image/upload/macbookairm2.png', 
1350000, 2, 95, '256GB', 'Excelente'),

-- Samsung (competencia)
('Samsung Galaxy S23 Ultra', 'Galaxy S23 Ultra 512GB - S Pen integrado, cámara 200MP, pantalla AMOLED 6.8". Como nuevo.', 
'https://res.cloudinary.com/demo/image/upload/s23ultra.png', 
980000, 4, 93, '512GB', 'Excelente'),

('Samsung Galaxy Tab S8', 'Galaxy Tab S8 11" con S Pen, 128GB. Perfecta para productividad y entretenimiento.', 
'https://res.cloudinary.com/demo/image/upload/tabs8.png', 
480000, 3, 88, '128GB', 'Muy Bueno'),

-- Accesorios
('Cargador MagSafe Original', 'Cargador inalámbrico MagSafe de Apple, 15W. Nuevo en caja.', 
'https://res.cloudinary.com/demo/image/upload/magsafe.png', 
45000, 20, 100, 'N/A', 'Nuevo'),

('Funda Spigen iPhone 14 Pro', 'Funda protectora Spigen con certificación militar. Transparente con bordes reforzados.', 
'https://res.cloudinary.com/demo/image/upload/spigeniphone14.png', 
15000, 30, 100, 'N/A', 'Nuevo')

ON CONFLICT DO NOTHING;

-- ========== CARRUSEL (BANNERS PROMOCIONALES) ==========
INSERT INTO carousel (text, img, imagenMobile, color1, color2) VALUES 

('🚀 iPhone 14 Pro Max - Hasta 12 cuotas sin interés', 
'https://res.cloudinary.com/demo/image/upload/banner-iphone14.jpg',
'https://res.cloudinary.com/demo/image/upload/banner-iphone14-mobile.jpg',
'#0052A3', '#00B4D8'),

('💎 MacBook Air M2 - La potencia que necesitas', 
'https://res.cloudinary.com/demo/image/upload/banner-macbook.jpg',
'https://res.cloudinary.com/demo/image/upload/banner-macbook-mobile.jpg',
'#003d7a', '#0096c7'),

('🎧 AirPods Pro - Envío gratis a toda Argentina', 
'https://res.cloudinary.com/demo/image/upload/banner-airpods.jpg',
'https://res.cloudinary.com/demo/image/upload/banner-airpods-mobile.jpg',
'#0052A3', '#00B4D8')

ON CONFLICT DO NOTHING;

-- ========== SECCIÓN ABOUT (SOBRE NOSOTROS) ==========
INSERT INTO about (id, titulo, texto, imagen) VALUES 
(1,
'ChipStore - Tu tienda de tecnología en Córdoba',
'Somos una tienda especializada en productos Apple y tecnología premium en Córdoba, Argentina. Con más de 5 años de experiencia, ofrecemos iPhones, iPads, MacBooks y accesorios originales con garantía. Todos nuestros productos son revisados y certificados. Aceptamos mercado pago, transferencia y efectivo. ¡Visitanos o comprá online con envío a todo el país!',
'https://res.cloudinary.com/demo/image/upload/about-chipstore.jpg')
ON CONFLICT (id) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    texto = EXCLUDED.texto,
    imagen = EXCLUDED.imagen;

-- ========== IMÁGENES DEL SISTEMA (LOGOS) ==========
INSERT INTO imagenes (id, imagen1, imagen2) VALUES 
(1,
'https://res.cloudinary.com/demo/image/upload/logo-chipstore-primary.png',
'https://res.cloudinary.com/demo/image/upload/logo-chipstore-secondary.png')
ON CONFLICT (id) DO UPDATE SET
    imagen1 = EXCLUDED.imagen1,
    imagen2 = EXCLUDED.imagen2;

-- ========== FACTURA DE PRUEBA ==========
INSERT INTO facturas (
    numero_factura, 
    cliente_nombre, 
    cliente_telefono, 
    cliente_email,
    items,
    subtotal,
    impuestos,
    total,
    metodo_pago,
    vendedor_id,
    notas,
    estado
) VALUES 
('C240108001',
'Juan Pérez',
'351-1234567',
'juan.perez@email.com',
'[
    {"product_id": 1, "name": "iPhone 14 Pro Max", "price": 850000, "cantidad": 1},
    {"product_id": 8, "name": "AirPods Pro 2da Gen", "price": 285000, "cantidad": 1}
]'::jsonb,
1135000,
0,
1135000,
'transferencia',
1,
'Cliente habitual, envío a domicilio incluido',
'completada')
ON CONFLICT (numero_factura) DO NOTHING;

COMMIT;

-- ========== RESUMEN DE DATOS CARGADOS ==========
-- Usuarios: 3 (1 admin, 2 vendedores)
-- Productos: 15 dispositivos
-- Carrusel: 3 banners
-- About: 1 sección
-- Imágenes: 2 logos
-- Facturas: 1 comprobante de prueba
