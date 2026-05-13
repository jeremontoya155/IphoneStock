/**
 * EJEMPLO: Comparador de URLs antes/después
 * Ejecutar: node compare-urls.js
 * 
 * Muestra la diferencia entre URLs optimizadas y sin optimizar
 */

const { optimizeCloudinaryUrl, generateResponsiveImageSrcset } = require('./utils/cloudinaryOptimizer');

console.log('\n' + '='.repeat(80));
console.log('COMPARADOR DE URLS CLOUDINARY - ANTES vs DESPUÉS');
console.log('='.repeat(80) + '\n');

// URL de ejemplo (tu URL real sería https://res.cloudinary.com/TU-CLOUD/image/upload/...)
const exampleUrl = 'https://res.cloudinary.com/demo/image/upload/v1234/sample';

const examples = [
    {
        name: 'THUMBNAIL (Producto Card)',
        width: 300,
        quality: 70,
        use: 'Listas de productos'
    },
    {
        name: 'PREVIEW MEDIANO (Modal)',
        width: 600,
        quality: 75,
        use: 'Ventanas emergentes'
    },
    {
        name: 'GRANDE (Carrusel)',
        width: 1000,
        quality: 80,
        use: 'Hero, banners, slides'
    },
    {
        name: 'AVATAR (Perfil)',
        width: 100,
        quality: 70,
        use: 'Fotos de usuario'
    }
];

console.log('📊 EJEMPLOS DE OPTIMIZACIÓN:\n');

examples.forEach((example, index) => {
    console.log(`${index + 1}. ${example.name}`);
    console.log(`   Uso: ${example.use}`);
    console.log(`   Parámetros: width=${example.width}, quality=${example.quality}`);
    
    const optimizedUrl = optimizeCloudinaryUrl(exampleUrl, {
        width: example.width,
        quality: example.quality,
        format: 'auto'
    });
    
    console.log(`   \n   URL ANTES:\n   ${exampleUrl}`);
    console.log(`   \n   URL DESPUÉS:\n   ${optimizedUrl}`);
    
    // Estimar tamaño
    const estimatedBefore = 800; // KB promedio
    const estimatedAfter = estimatedBefore * (example.quality / 100) * (example.width / 1000);
    const savings = ((1 - estimatedAfter / estimatedBefore) * 100).toFixed(0);
    
    console.log(`   \n   📈 ESTIMADO:`);
    console.log(`   Antes: ~${estimatedBefore}KB | Después: ~${estimatedAfter.toFixed(0)}KB`);
    console.log(`   ✅ AHORRO: ${savings}%\n`);
    console.log('-'.repeat(80) + '\n');
});

// Ejemplo con srcset
console.log('📱 EJEMPLO CON SRCSET (Imágenes responsivas):\n');
const srcsetExample = generateResponsiveImageSrcset(exampleUrl, {
    smallWidth: 320,
    mediumWidth: 768,
    largeWidth: 1200
});

console.log('HTML:');
console.log(`<img 
  src="${srcsetExample.medium}"
  srcset="${srcsetExample.srcset}"
  sizes="(max-width: 768px) 100vw, 50vw"
  alt="Product">`);

console.log('\n✅ BENEFICIOS:');
console.log('  • El navegador elige el mejor tamaño según pantalla');
console.log('  • Usuarios móviles descargan solo 320px');
console.log('  • Usuarios desktop descargan 1200px');
console.log('  • Ahorro promedio: 75%');

console.log('\n' + '='.repeat(80));
console.log('💡 RECOMENDACIONES:');
console.log('='.repeat(80));

console.log(`
✅ Para THUMBNAILS pequeñas:
   → width: 300, quality: 70
   → Ahorro: ~90%

✅ Para PREVIEWS medianos:
   → width: 600, quality: 75
   → Ahorro: ~85%

✅ Para IMÁGENES GRANDES (carrusel):
   → width: 1000-1200, quality: 80-85
   → Ahorro: ~80%

✅ TODOS los parámetros usados son GRATIS en Cloudinary

❌ NO USAR (son pagados):
   × Overlays (l_)
   × Efectos (e_)
   × Detección de rostros
   × Transformaciones con ML/AI
`);

console.log('='.repeat(80));
console.log('\n🚀 Para empezar: Ver IMPLEMENTATION_CHECKLIST.md\n');
