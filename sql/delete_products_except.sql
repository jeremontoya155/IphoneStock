-- Script para eliminar todos los productos EXCEPTO los especificados
-- Ejecutar con precaución

-- Ver todos los productos actuales antes de eliminar
SELECT id, name, price, stock FROM products ORDER BY id;

-- Eliminar todos los productos EXCEPTO:
-- 1. "Nuevo" (producto de ejemplo)
-- 2. "iPhone 14 Pro Max"
-- 3. "ejemplo accesorio"

DELETE FROM products 
WHERE name NOT IN (
    'Nuevo',
    'iPhone 14 Pro Max',
    'ejemplo accesorio'
);

-- Verificar productos restantes
SELECT id, name, price, stock FROM products ORDER BY id;

-- Si todo está correcto, hacer COMMIT
-- Si algo salió mal, hacer ROLLBACK
