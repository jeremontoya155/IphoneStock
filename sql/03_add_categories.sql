-- ================================================
-- SCRIPT PARA AGREGAR SISTEMA DE CATEGORÍAS
-- ChipStore - Sistema de categorías personalizables
-- ================================================

-- 1. Crear tabla de categorías
CREATE TABLE IF NOT EXISTS categorias (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL UNIQUE,
    descripcion TEXT,
    icono VARCHAR(50), -- Emoji o nombre de icono
    color VARCHAR(7) DEFAULT '#0052A3', -- Color hexadecimal
    orden INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Agregar columna categoria_id a la tabla products
ALTER TABLE products ADD COLUMN IF NOT EXISTS categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL;

-- 3. Eliminar columna estado de products (ya no se usa)
ALTER TABLE products DROP COLUMN IF EXISTS estado;

-- 4. Insertar categorías por defecto
INSERT INTO categorias (nombre, descripcion, icono, color, orden) VALUES
('Smartphones', 'Teléfonos celulares y dispositivos móviles', '📱', '#0052A3', 1),
('Accesorios', 'Cargadores, fundas, protectores y más', '🔌', '#00B4D8', 2),
('Audio', 'Auriculares, parlantes y dispositivos de audio', '🎧', '#0096c7', 3),
('Tablets', 'Tablets y dispositivos de lectura', '📲', '#003d7a', 4),
('Computadoras', 'Laptops, PCs y componentes', '💻', '#48cae4', 5)
ON CONFLICT (nombre) DO NOTHING;

-- 5. Actualizar productos existentes (asignar a categoría por defecto)
UPDATE products 
SET categoria_id = (SELECT id FROM categorias WHERE nombre = 'Smartphones' LIMIT 1)
WHERE categoria_id IS NULL;

-- Índice para mejorar performance en búsquedas
CREATE INDEX IF NOT EXISTS idx_products_categoria ON products(categoria_id);
CREATE INDEX IF NOT EXISTS idx_categorias_activo ON categorias(activo);
