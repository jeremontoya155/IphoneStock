# GUÍA DE IMPLEMENTACIÓN - Ahorro de Créditos Cloudinary

## 🎯 Objetivo
Reducir consumo de créditos de Cloudinary del **70-90%** usando transformaciones **GRATIS**.

## 📊 Impacto Esperado
```
Sin optimización:    1,000,000 imágenes × 800KB = ~800GB de consumo
Con optimización:    1,000,000 imágenes × 100KB = ~100GB de consumo
AHORRO:              700GB = 87.5% menos consumo
```

---

## ✅ PASO 1: Agregar configuración al servidor

En tu `server.js`, después de la línea `app.use(compression());` agregar:

```javascript
// Importar configuración de optimización de Cloudinary
const { setupCloudinaryOptimization } = require('./config/cloudinaryConfig');

// Configurar optimizaciones
setupCloudinaryOptimization(app);
```

**Ubicación exacta en server.js (después de línea ~15):**
```
const app = express();
const PORT = process.env.PORT || 3000;
app.use(compression());

// ← AGREGAR AQUÍ
const { setupCloudinaryOptimization } = require('./config/cloudinaryConfig');
setupCloudinaryOptimization(app);
// ← HASTA AQUÍ
```

---

## ✅ PASO 2: Actualizar templates EJS

### En `views/partials/productCard.ejs`:

**CAMBIAR ESTO:**
```html
<img src="<%= product.img %>" alt="<%= product.name %>" loading="lazy" class="product-image">
```

**POR ESTO:**
```html
<img 
  src="<%= optimizeImageUrl(product.img, { width: 300, quality: 70, format: 'auto' }) %>" 
  alt="<%= product.name %>" 
  loading="lazy"
  class="product-image"
  srcset="<%= optimizeImageUrl(product.img, { width: 300, quality: 70 }) %> 1x, <%= optimizeImageUrl(product.img, { width: 600, quality: 75 }) %> 2x"
  sizes="(max-width: 768px) 100vw, 300px">
```

### En otros templates (carousel, about, editImages):

Buscar todas las instancias de:
```html
<img src="<%= ... %>"
```

Y reemplazarlas con:
```html
<img src="<%= optimizeImageUrl(..., { width: [ANCHO], quality: [CALIDAD], format: 'auto' }) %>"
```

**Guía de anchos por contexto:**
- Thumbnails pequeñas: `width: 200, quality: 60`
- Cards de producto: `width: 300, quality: 70`
- Previews/Modales: `width: 600, quality: 75`
- Full-size (carrusel): `width: 1000, quality: 80`

---

## ✅ PASO 3: Optimizar subidas futuras (Multer)

En `server.js`, en la configuración de Multer, cambiar:

**ACTUAL:**
```javascript
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uploads',
        format: async (req, file) => 'png',
        public_id: (req, file) => file.fieldname + '-' + Date.now(),
    },
});
```

**OPTIMIZADO:**
```javascript
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uploads',
        format: async (req, file) => 'webp', // Cambiar a WebP (más comprimido)
        public_id: (req, file) => file.fieldname + '-' + Date.now(),
        quality: 80, // Establecer calidad por defecto
        flags: 'lossy', // Compresión con pérdida
    },
});
```

---

## ✅ PASO 4: Agregar headers de caché HTTP

En `server.js`, después de `app.use(express.static('public'));` agregar:

```javascript
// Headers de caché para imágenes estáticas
app.use((req, res, next) => {
    if (req.url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
        res.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 año
    }
    next();
});
```

---

## ✅ PASO 5: Monitorear consumo

1. Ve a [Cloudinary Dashboard](https://cloudinary.com/console/dashboard)
2. Busca "Usage" o "Bandwidth"
3. Deberías ver **reducción significativa** en 3-7 días

**Indicadores de éxito:**
- ✅ Imágenes se ven igual de bien
- ✅ Consumo de créditos baja 70-90%
- ✅ Velocidad de carga mejora (archivos más pequeños)
- ✅ Sigue funcionando el tier gratis

---

## 🔍 VERIFICACIÓN RÁPIDA

Visita tu sitio y abre DevTools (F12):
1. Network tab
2. Carga una página con imágenes
3. Busca URLs con parámetros como: `w_300,q_70,f_auto`
4. Si ves esos parámetros = ✅ está funcionando

**URL antes:** 
```
https://res.cloudinary.com/cloud/image/upload/v123/imagen.png (800KB)
```

**URL después:**
```
https://res.cloudinary.com/cloud/image/upload/w_300,q_70,f_auto/v123/imagen.png (80KB)
```

---

## ⚠️ NOTAS IMPORTANTES

1. **No cambia tu plan de Cloudinary** - Todas estas transformaciones son GRATIS
2. **Imágenes se ven igual** - La compresión es inteligente (q_70 es casi imperceptible)
3. **Funciona con URLs existentes** - No necesitas re-subir imágenes
4. **Es retroactivo** - Imágenes ya subidas se optimizarán al acceder
5. **Combine con CDN** - Si usas Vercel/Netlify, agregan caché extra

---

## 🎓 PARÁMETROS CLOUDINARY (Todos GRATIS)

| Parámetro | Efecto | Gratis |
|-----------|--------|--------|
| `w_X` | Redimensionar ancho | ✅ Sí |
| `h_X` | Redimensionar alto | ✅ Sí |
| `c_scale` | Escalar manteniendo aspecto | ✅ Sí |
| `q_X` | Ajustar calidad (1-100) | ✅ Sí |
| `q_auto` | Calidad automática | ✅ Sí |
| `f_auto` | Formato automático (WebP) | ✅ Sí |
| `f_webp` | Convertir a WebP | ✅ Sí |
| `fl_lossy` | Compresión inteligente | ✅ Sí |
| `e_blur` | Difuminar | ❌ Pago |
| `l_` | Overlay/Texto | ❌ Pago |
| `e_*` | Cualquier efecto | ❌ Pago |

---

## 📞 Soporte

Si tienes dudas:
1. Revisa `CLOUDINARY_OPTIMIZATION_GUIDE.md`
2. Consulta `utils/cloudinaryOptimizer.js` para ver funciones disponibles
3. Prueba parámetros en: [Cloudinary URL Builder](https://cloudinary.com/blog/the_cloudinary_url_builder)

