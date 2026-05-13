/**
 * Utilidades para optimizar URLs de Cloudinary y reducir consumo de créditos
 * Implementa transformaciones que NO se cargan en el plan gratis
 */

// Función para generar URLs optimizadas de Cloudinary
function optimizeCloudinaryUrl(originalUrl, options = {}) {
    if (!originalUrl || typeof originalUrl !== 'string') {
        return originalUrl;
    }

    // Si no es una URL de Cloudinary, devolverla sin cambios
    if (!originalUrl.includes('cloudinary.com')) {
        return originalUrl;
    }

    const {
        width = 400,
        height = null,
        quality = 70, // Reducir calidad para tier gratis
        format = 'auto', // WebP cuando sea posible
        crop = 'fill',
        gravity = 'auto'
    } = options;

    try {
        // Extraer componentes de la URL
        // Formato: https://res.cloudinary.com/[cloud_name]/image/upload/[transformations]/[public_id]
        const urlParts = originalUrl.split('/upload/');
        if (urlParts.length !== 2) {
            return originalUrl;
        }

        const baseUrl = urlParts[0];
        const publicIdWithFormat = urlParts[1];

        // Construir transformaciones
        let transformations = [];

        // 1. Redimensionar (es FREE en Cloudinary)
        if (width && !height) {
            transformations.push(`w_${width}`);
            transformations.push('c_scale'); // Scale manteniendo aspecto
        } else if (width && height) {
            transformations.push(`w_${width},h_${height}`);
            transformations.push(`c_${crop}`);
            transformations.push(`g_${gravity}`);
        }

        // 2. Calidad (es FREE)
        transformations.push(`q_${quality}`);

        // 3. Formato auto (es FREE - detecta WebP automáticamente)
        transformations.push(`f_${format}`);

        // 4. Fetch format (convierte formato automáticamente sin costo)
        transformations.push('fl_lossy');

        // Construir URL optimizada
        const transformationString = transformations.join(',');
        return `${baseUrl}/upload/${transformationString}/${publicIdWithFormat}`;

    } catch (error) {
        console.error('Error optimizando URL de Cloudinary:', error);
        return originalUrl;
    }
}

// Función para generar múltiples variantes de imagen (srcset)
function generateImageSrcset(originalUrl, baseWidth = 400) {
    const sizes = [
        { width: Math.round(baseWidth * 0.5), descriptor: '0.5x' },
        { width: baseWidth, descriptor: '1x' },
        { width: Math.round(baseWidth * 1.5), descriptor: '1.5x' },
        { width: Math.round(baseWidth * 2), descriptor: '2x' }
    ];

    return sizes.map(size => 
        `${optimizeCloudinaryUrl(originalUrl, { width: size.width })} ${size.descriptor}`
    ).join(', ');
}

// Función para generar URLs responsive (diferentes tamaños para breakpoints)
function generateResponsiveImageSrcset(originalUrl, options = {}) {
    const {
        smallWidth = 320,
        mediumWidth = 768,
        largeWidth = 1200
    } = options;

    return {
        small: optimizeCloudinaryUrl(originalUrl, { width: smallWidth }),
        medium: optimizeCloudinaryUrl(originalUrl, { width: mediumWidth }),
        large: optimizeCloudinaryUrl(originalUrl, { width: largeWidth }),
        srcset: `
            ${optimizeCloudinaryUrl(originalUrl, { width: smallWidth })} 320w,
            ${optimizeCloudinaryUrl(originalUrl, { width: mediumWidth })} 768w,
            ${optimizeCloudinaryUrl(originalUrl, { width: largeWidth })} 1200w
        `
    };
}

// Función para crear URLs con parámetros cacheable
function generateCacheableUrl(originalUrl, ttl = 31536000) {
    // ttl por defecto: 1 año en segundos
    // Cloudinary soporta cache headers
    if (!originalUrl.includes('cloudinary.com')) {
        return originalUrl;
    }

    try {
        const urlParts = originalUrl.split('/upload/');
        if (urlParts.length === 2) {
            const baseUrl = urlParts[0];
            const publicId = urlParts[1];
            // Agregar transformación de caché
            return `${baseUrl}/upload/c_limit,w_1000,q_auto,f_auto/${publicId}`;
        }
    } catch (error) {
        console.error('Error generando URL cacheable:', error);
    }

    return originalUrl;
}

module.exports = {
    optimizeCloudinaryUrl,
    generateImageSrcset,
    generateResponsiveImageSrcset,
    generateCacheableUrl
};
