# Optimizaciones de Cloudinary - Plan Gratis vs Pagado

## Transformaciones que NO consumen créditos (FREE TIER):

✅ **Redimensionamiento (Resizing)**
- `w_` (width)
- `h_` (height)
- `c_` (crop mode)

✅ **Calidad**
- `q_` (quality: 1-100)
- `q_auto` (calidad automática)

✅ **Formato**
- `f_auto` (detecta mejor formato automáticamente)
- `f_webp` (conversión a WebP)
- Conversión entre formatos: jpg, png, gif, webp

✅ **Otros gratis**
- `fl_lossy` (compresión con pérdida)
- `fl_immutable_cache` (cachear indefinidamente)
- Recorte automático de aspectos

---

## Transformaciones que SÍ consumen créditos (PAGADAS):

❌ `e_` (effects)
❌ `l_` (overlay - textos, imágenes)
❌ `o_` (opacity)
❌ `co_` (color overlay)
❌ `ar_` (auto-rotate)
❌ Detección de rostros
❌ Análisis de contenido (AI/ML features)
❌ Blur de fondo

---

## Estrategia de Ahorro Máximo (Plan Gratis)

### 1. URLs Optimizadas Base
```
ANTES (consume mucho):
https://res.cloudinary.com/tu-cloud/image/upload/v123456/imagen.png

DESPUÉS (0 créditos extra):
https://res.cloudinary.com/tu-cloud/image/upload/w_400,q_70,f_auto/v123456/imagen.png
```

### 2. Parámetros Recomendados
```
- w_400 = ancho 400px (redimensiona, gratis)
- q_70 = calidad 70% (reduce archivo en 60-70%)
- f_auto = formato automático (usa WebP si soporta, gratis)
- fl_lossy = compresión inteligente (gratis)
```

### 3. Diferentes Tamaños por Contexto

**Para thumbnails (producto card):**
```
w_300,q_60,f_auto
```

**Para preview en modal:**
```
w_600,q_75,f_auto
```

**Para imagen grande:**
```
w_1000,q_80,f_auto
```

### 4. Cachear Agresivamente
Agregar headers en servidor:
```
Cache-Control: public, max-age=31536000
```
Las imágenes transformadas se cachean en navegador y CDN.

---

## Impacto Estimado

### Antes (Sin optimización):
- Imagen original: ~800KB
- Usuarios con 1 millón de interacciones: ~800GB consumo

### Después (Con optimizaciones gratis):
- Imagen redimensionada a 400px + q_70 + f_auto: ~80KB (90% menos)
- Misma 1 millón de interacciones: ~80GB consumo
- **Ahorro: ~90% (920GB menos)**

---

## Plan de Implementación

1. ✅ Crear funciones de optimización en `utils/cloudinaryOptimizer.js`
2. ⏳ Registrar helper en server.js para usarlo en templates
3. ⏳ Actualizar EJS templates para usar URLs optimizadas
4. ⏳ Agregar caché HTTP en servidor
5. ⏳ Implementar lazy-loading mejorado
6. ⏳ Monitoreo de consumo

---

## Bonus: Reducir aún más sin Cloudinary

Alternativas para imágenes que no cambian:
- Comprimir PNG/JPG localmente → servir desde `/public/imgs/`
- Usar formatos modernos: AVIF (mejor que WebP)
- CDN gratuito: Vercel, Netlify, Cloudflare Pages

