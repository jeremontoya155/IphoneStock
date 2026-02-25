-- Tabla de configuración para cotización del dólar y otros ajustes
CREATE TABLE IF NOT EXISTS configuracion (
    id SERIAL PRIMARY KEY,
    clave VARCHAR(100) UNIQUE NOT NULL,
    valor TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insertar cotización del dólar por defecto
INSERT INTO configuracion (clave, valor) VALUES ('cotizacion_dolar', '1200')
ON CONFLICT (clave) DO NOTHING;

-- Agregar columna moneda a productos (USD o ARS)
ALTER TABLE products ADD COLUMN IF NOT EXISTS moneda VARCHAR(3) DEFAULT 'USD';

-- Comentarios
COMMENT ON TABLE configuracion IS 'Configuraciones del sistema (cotización dólar, etc)';
COMMENT ON COLUMN products.moneda IS 'Moneda del precio: USD o ARS';
