-- ================================================
-- SCRIPT: Múltiples planes de cuotas por categoría
-- ================================================

-- Agregar columna para almacenar múltiples planes de cuotas como JSON
-- Formato: [{"cuotas": 3, "interes": 0}, {"cuotas": 6, "interes": 10}, {"cuotas": 12, "interes": 20}]
ALTER TABLE categorias ADD COLUMN IF NOT EXISTS cuotas_planes TEXT DEFAULT '[]';

-- Migrar datos existentes: si hay cuotas_max > 0, crear un plan con esos datos
UPDATE categorias 
SET cuotas_planes = CONCAT('[{"cuotas":', cuotas_max, ',"interes":', interes_cuotas, '}]')
WHERE cuotas_max > 0 AND (cuotas_planes IS NULL OR cuotas_planes = '[]');

COMMENT ON COLUMN categorias.cuotas_planes IS 'Planes de cuotas en formato JSON: [{"cuotas": N, "interes": X}, ...]';
