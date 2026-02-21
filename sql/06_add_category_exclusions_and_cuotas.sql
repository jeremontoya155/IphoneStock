-- ================================================
-- SCRIPT: Exclusión de categorías en ofertas generales + Cuotas por categoría
-- ================================================

-- 1. Agregar columna de categorías excluidas a ofertas_generales
-- Almacena IDs de categorías separados por coma, ej: "1,3,5"
ALTER TABLE ofertas_generales ADD COLUMN IF NOT EXISTS categorias_excluidas TEXT DEFAULT '';

-- 2. Agregar campos de cuotas a la tabla categorias
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS cuotas_max INTEGER DEFAULT 0;
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS interes_cuotas DECIMAL(5, 2) DEFAULT 0;

COMMENT ON COLUMN ofertas_generales.categorias_excluidas IS 'IDs de categorías excluidas separados por coma';
COMMENT ON COLUMN categorias.cuotas_max IS 'Cantidad máxima de cuotas disponibles (0 = sin cuotas)';
COMMENT ON COLUMN categorias.interes_cuotas IS 'Porcentaje de interés por cuota';
