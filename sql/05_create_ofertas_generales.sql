-- Agregar ofertas generales al sistema
-- Una oferta general se aplica a TODOS los productos que no tengan oferta específica

CREATE TABLE IF NOT EXISTS ofertas_generales (
    id SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    tipo_descuento VARCHAR(20) NOT NULL CHECK (tipo_descuento IN ('porcentaje', 'monto_fijo')),
    valor_descuento DECIMAL(10, 2) NOT NULL CHECK (valor_descuento > 0),
    fecha_inicio TIMESTAMP NOT NULL,
    fecha_fin TIMESTAMP NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fecha_valida_general CHECK (fecha_fin > fecha_inicio)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ofertas_generales_activo ON ofertas_generales(activo);

COMMENT ON TABLE ofertas_generales IS 'Ofertas que se aplican a todos los productos del catálogo';
COMMENT ON COLUMN ofertas_generales.nombre IS 'Nombre de la campaña, ej: "15% en Efectivo"';

COMMIT;
