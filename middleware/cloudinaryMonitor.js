/**
 * Middleware para monitorear consumo de imágenes de Cloudinary
 * Ayuda a rastrear qué está consumiendo créditos
 */

class CloudinaryMonitor {
    constructor() {
        this.stats = {
            totalImages: 0,
            totalOptimized: 0,
            totalUnoptimized: 0,
            estimatedSavings: 0,
            imagesPerPage: {},
        };
    }

    /**
     * Procesa una URL de Cloudinary para análisis
     */
    analyzeUrl(url) {
        if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) {
            return null;
        }

        const isOptimized = url.includes('/upload/') && 
                           (url.includes('w_') || url.includes('q_') || url.includes('f_auto'));

        const stats = {
            url,
            isOptimized,
            estimatedUnoptimizedSize: 800, // KB
            estimatedOptimizedSize: isOptimized ? 80 : 800, // KB
            potentialSavings: isOptimized ? 720 : 0, // KB
        };

        return stats;
    }

    /**
     * Middleware para Express que registra todas las imágenes servidas
     */
    middleware() {
        const self = this;

        return (req, res, next) => {
            // Interceptar res.render para capturar imágenes
            const originalRender = res.render;

            res.render = function(view, locals, callback) {
                if (locals) {
                    self._analyzeLocals(locals);
                }

                return originalRender.call(this, view, locals, callback);
            };

            // Interceptar res.json para capturar API responses
            const originalJson = res.json;

            res.json = function(data) {
                if (data && typeof data === 'object') {
                    self._analyzeObject(data);
                }

                return originalJson.call(this, data);
            };

            next();
        };
    }

    /**
     * Analiza un objeto en busca de URLs de Cloudinary
     */
    _analyzeObject(obj, depth = 0) {
        if (depth > 5) return; // Limitar profundidad de recursión

        if (Array.isArray(obj)) {
            obj.forEach(item => this._analyzeObject(item, depth + 1));
        } else if (obj && typeof obj === 'object') {
            Object.values(obj).forEach(value => {
                if (typeof value === 'string' && value.includes('cloudinary.com')) {
                    this._recordImage(value);
                } else if (typeof value === 'object') {
                    this._analyzeObject(value, depth + 1);
                }
            });
        }
    }

    /**
     * Analiza locales de EJS
     */
    _analyzeLocals(locals) {
        Object.values(locals).forEach(value => {
            if (typeof value === 'string' && value.includes('cloudinary.com')) {
                this._recordImage(value);
            } else if (Array.isArray(value)) {
                value.forEach(item => {
                    if (item && typeof item === 'object' && item.img && item.img.includes('cloudinary.com')) {
                        this._recordImage(item.img);
                    }
                });
            }
        });
    }

    /**
     * Registra una imagen y actualiza estadísticas
     */
    _recordImage(url) {
        const stats = this.analyzeUrl(url);
        if (!stats) return;

        this.stats.totalImages++;

        if (stats.isOptimized) {
            this.stats.totalOptimized++;
        } else {
            this.stats.totalUnoptimized++;
        }

        this.stats.estimatedSavings += stats.potentialSavings;
    }

    /**
     * Obtiene un reporte de estadísticas
     */
    getReport() {
        const report = {
            ...this.stats,
            optimizationRate: this.stats.totalImages > 0 
                ? ((this.stats.totalOptimized / this.stats.totalImages) * 100).toFixed(2) + '%'
                : '0%',
            estimatedMonthlyUnoptimizedUsage: `${(this.stats.totalImages * 0.8 / 1024).toFixed(2)} GB`,
            estimatedMonthlyOptimizedUsage: `${(this.stats.totalImages * 0.1 / 1024).toFixed(2)} GB`,
            potentialMonthlySavings: `${(this.stats.estimatedSavings / 1024 / 1024).toFixed(2)} GB`,
        };

        return report;
    }

    /**
     * Resetea estadísticas
     */
    reset() {
        this.stats = {
            totalImages: 0,
            totalOptimized: 0,
            totalUnoptimized: 0,
            estimatedSavings: 0,
            imagesPerPage: {},
        };
    }
}

module.exports = CloudinaryMonitor;
