-- Tabla de ofertas
-- Permite aplicar descuentos por porcentaje o monto fijo a productos durante un período específico

CREATE TABLE IF NOT EXISTS ofertas (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    tipo_descuento VARCHAR(20) NOT NULL CHECK (tipo_descuento IN ('porcentaje', 'monto_fijo')),
    valor_descuento DECIMAL(10, 2) NOT NULL CHECK (valor_descuento > 0),
    fecha_inicio TIMESTAMP NOT NULL,
    fecha_fin TIMESTAMP NOT NULL,
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fecha_valida CHECK (fecha_fin > fecha_inicio)
);

-- Índices para mejor rendimiento
CREATE INDEX IF NOT EXISTS idx_ofertas_product ON ofertas(product_id);
CREATE INDEX IF NOT EXISTS idx_ofertas_activo ON ofertas(activo);
CREATE INDEX IF NOT EXISTS idx_ofertas_fechas ON ofertas(fecha_inicio, fecha_fin);

-- Función para calcular precio con descuento
CREATE OR REPLACE FUNCTION calcular_precio_oferta(
    precio_original DECIMAL(10, 2),
    tipo_desc VARCHAR(20),
    valor_desc DECIMAL(10, 2)
) RETURNS DECIMAL(10, 2) AS $$
BEGIN
    IF tipo_desc = 'porcentaje' THEN
        RETURN ROUND(precio_original * (1 - valor_desc / 100), 2);
    ELSE -- monto_fijo
        RETURN GREATEST(ROUND(precio_original - valor_desc, 2), 0);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Vista para obtener productos con sus ofertas activas
CREATE OR REPLACE VIEW productos_con_ofertas AS
SELECT 
    p.*,
    o.id as oferta_id,
    o.tipo_descuento,
    o.valor_descuento,
    o.fecha_inicio,
    o.fecha_fin,
    o.activo as oferta_activa,
    CASE 
        WHEN o.activo = TRUE 
            AND NOW() BETWEEN o.fecha_inicio AND o.fecha_fin 
        THEN calcular_precio_oferta(p.price, o.tipo_descuento, o.valor_descuento)
        ELSE p.price
    END as precio_final,
    CASE 
        WHEN o.activo = TRUE 
            AND NOW() BETWEEN o.fecha_inicio AND o.fecha_fin 
        THEN TRUE
        ELSE FALSE
    END as tiene_oferta_vigente
FROM products p
LEFT JOIN ofertas o ON p.id = o.product_id 
    AND o.activo = TRUE 
    AND NOW() BETWEEN o.fecha_inicio AND o.fecha_fin;

COMMENT ON TABLE ofertas IS 'Ofertas y descuentos aplicables a productos';
COMMENT ON COLUMN ofertas.tipo_descuento IS 'Tipo de descuento: porcentaje o monto_fijo';
COMMENT ON COLUMN ofertas.valor_descuento IS 'Valor del descuento (porcentaje 0-100 o monto en moneda)';

COMMIT;
