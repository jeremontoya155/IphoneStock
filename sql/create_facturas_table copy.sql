-- Tabla para almacenar las facturas/ventas del sistema de CAJAS
CREATE TABLE facturas(
    id SERIAL NOT NULL,
    numero_factura VARCHAR(20) UNIQUE NOT NULL,
    fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cliente_nombre VARCHAR(255) NOT NULL,
    cliente_telefono VARCHAR(20),
    cliente_email VARCHAR(255),
    items JSONB NOT NULL, -- Almacenar los productos como JSON
    subtotal DECIMAL(10,2) NOT NULL,
    impuestos DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    metodo_pago VARCHAR(50) DEFAULT 'efectivo',
    vendedor_id INTEGER REFERENCES users(id),
    notas TEXT,
    estado VARCHAR(20) DEFAULT 'completada',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(id)
);

-- Índices para mejorar el rendimiento
CREATE INDEX idx_facturas_fecha ON facturas(fecha);
CREATE INDEX idx_facturas_vendedor ON facturas(vendedor_id);
CREATE INDEX idx_facturas_numero ON facturas(numero_factura);

-- Función para generar número de factura automáticamente
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.numero_factura := 'FAC-' || TO_CHAR(CURRENT_TIMESTAMP, 'YYYYMMDD') || '-' || LPAD(NEW.id::text, 4, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para generar número de factura
CREATE TRIGGER trigger_generate_invoice_number
    BEFORE INSERT ON facturas
    FOR EACH ROW
    EXECUTE FUNCTION generate_invoice_number();
