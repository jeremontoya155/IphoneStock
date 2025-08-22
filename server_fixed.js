// Función para generar HTML de factura para PDF
function generateInvoiceHTML(factura, logoUrl) {
    let items = [];
    
    // Manejar diferentes formatos de items
    try {
        if (typeof factura.items === 'string') {
            items = JSON.parse(factura.items);
        } else if (Array.isArray(factura.items)) {
            items = factura.items;
        } else if (factura.items && typeof factura.items === 'object') {
            items = [factura.items];
        }
        
        if (!Array.isArray(items)) {
            items = [];
        }
    } catch (error) {
        console.error('Error parsing items for PDF:', error);
        items = [];
    }
    
    const fecha = new Date(factura.fecha).toLocaleDateString('es-ES');
    const itemsRows = items.map(item => {
        const precio = parseFloat(item.price || 0);
        const cantidad = parseInt(item.cantidad || 1);
        const subtotal = precio * cantidad;
        return `
            <tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.name || 'Producto'}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${cantidad}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${precio.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${subtotal.toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
            </tr>`;
    }).join('');
    
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Factura ${factura.numero_factura}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .header { display: flex; justify-content: space-between; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #007bff; }
        .logo { max-height: 50px; }
        .invoice-info { text-align: right; }
        .invoice-info h1 { color: #007bff; margin: 0; }
        .customer-section { background: #f8f9fa; padding: 15px; margin: 15px 0; }
        .customer-section h3 { color: #007bff; margin: 0 0 10px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; }
        th { background: #007bff; color: white; padding: 8px; text-align: left; }
        td { padding: 8px; border: 1px solid #ddd; }
        tr:nth-child(even) { background: #f9f9f9; }
        .totals { background: #f8f9fa; padding: 15px; margin-top: 20px; }
        .totals table { margin: 0; }
        .total-row { font-weight: bold; color: #007bff; font-size: 16px; }
        .footer { text-align: center; margin-top: 30px; padding-top: 15px; border-top: 1px solid #ddd; color: #666; }
        .notes { background: #fff3cd; padding: 15px; margin: 15px 0; }
    </style>
</head>
<body>
    <div class="header">
        <div>${logoUrl ? `<img src="${logoUrl}" alt="iPhone Stock" class="logo">` : '<div style="font-size: 18px; font-weight: bold; color: #007bff;">iPhone Stock</div>'}</div>
        <div class="invoice-info">
            <h1>FACTURA</h1>
            <p><strong>N°:</strong> ${factura.numero_factura}</p>
            <p><strong>Fecha:</strong> ${fecha}</p>
        </div>
    </div>
    
    <div class="customer-section">
        <h3>Información del Cliente</h3>
        <p><strong>Nombre:</strong> ${factura.cliente_nombre}</p>
        ${factura.cliente_telefono ? `<p><strong>Teléfono:</strong> ${factura.cliente_telefono}</p>` : ''}
        ${factura.cliente_email ? `<p><strong>Email:</strong> ${factura.cliente_email}</p>` : ''}
        <p><strong>Método de Pago:</strong> ${factura.metodo_pago || 'Efectivo'}</p>
    </div>
    
    <h3 style="color: #007bff;">Productos</h3>
    <table>
        <thead>
            <tr>
                <th style="width: 50%;">Producto</th>
                <th style="width: 15%;">Cantidad</th>
                <th style="width: 20%;">Precio Unit.</th>
                <th style="width: 15%;">Subtotal</th>
            </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
    </table>
    
    <div class="totals">
        <table style="width: 300px; margin-left: auto;">
            <tr>
                <td>Subtotal:</td>
                <td style="text-align: right;">$${parseFloat(factura.subtotal || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr>
                <td>Impuestos:</td>
                <td style="text-align: right;">$${parseFloat(factura.impuestos || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}</td>
            </tr>
            <tr class="total-row">
                <td><strong>TOTAL:</strong></td>
                <td style="text-align: right;"><strong>$${parseFloat(factura.total || 0).toLocaleString('es-ES', {minimumFractionDigits: 2})}</strong></td>
            </tr>
        </table>
    </div>
    
    ${factura.notas ? `<div class="notes"><h4>Notas:</h4><p>${factura.notas}</p></div>` : ''}
    
    <div class="footer">
        <p><strong>¡Gracias por su compra!</strong></p>
        <p>Vendedor: ${factura.vendedor_nombre || 'Sistema'}</p>
        <p>iPhone Stock - Sistema de Facturación</p>
    </div>
</body>
</html>`;
}

module.exports = { generateInvoiceHTML };
