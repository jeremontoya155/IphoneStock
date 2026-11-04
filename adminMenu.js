// Estructura de la gestión interna. Es la única fuente de verdad: la usan el Panel,
// la barra de navegación interna y el menú superior. Para agregar una pantalla, sumarla acá.
module.exports = [
    {
        id: 'vender', title: 'Vender', icon: '🧾', admin: false,
        desc: 'Lo del día a día en el mostrador',
        items: [
            { href: '/cajas', label: 'Nueva venta', icon: '🧾', desc: 'Armá un comprobante para un cliente y descontá stock.', match: ['/cajas'] },
            { href: '/historico', label: 'Comprobantes', icon: '📚', desc: 'Buscá, mirá e imprimí ventas anteriores.', match: ['/historico', '/factura'] },
            { href: '/admin/cotizador', label: 'Presupuestos', icon: '💬', desc: 'Armá un presupuesto con cuotas para enviarle al cliente.', match: ['/admin/cotizador'] }
        ]
    },
    {
        id: 'catalogo', title: 'Catálogo', icon: '📱', admin: true,
        desc: 'Qué se vende y a qué precio',
        items: [
            { href: '/admin/productos', label: 'Productos', icon: '📱', desc: 'Alta, edición, stock y precios de cada equipo.', match: ['/admin/productos', '/edit/', '/new'] },
            { href: '/categorias', label: 'Categorías', icon: '📂', desc: 'Agrupá productos y definí las cuotas de cada grupo.', match: ['/categorias'] },
            { href: '/admin/ofertas', label: 'Ofertas', icon: '🏷️', desc: 'Descuentos por producto o para toda la tienda.', match: ['/admin/ofertas'] },
            { href: '/admin/cotizacion', label: 'Dólar', icon: '💲', desc: 'La cotización que usa toda la tienda para los precios en pesos.', match: ['/admin/cotizacion'] }
        ]
    },
    {
        id: 'sitio', title: 'Sitio web', icon: '🖼️', admin: true,
        desc: 'Lo que ven los clientes en la tienda',
        items: [
            { href: '/edit-carousel', label: 'Banners', icon: '🖼️', desc: 'Las imágenes del carrusel de la portada.', match: ['/edit-carousel', '/add-carousel'] },
            { href: '/edit-images', label: 'Logo e imágenes', icon: '🪪', desc: 'El logo del sitio y sus imágenes principales.', match: ['/edit-images'] },
            { href: '/edit-about', label: 'Sobre nosotros', icon: '✍️', desc: 'El texto y la foto de la sección “Sobre iLoop”.', match: ['/edit-about'] }
        ]
    }
];
