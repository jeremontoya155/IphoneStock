// Seleccionar elementos
const modal = document.querySelector('.filters-modal');
const modalButtons = document.querySelectorAll('.filters-modal-btn-sidebar, .filters-modal-btn-phone');

// Abrir el modal al hacer clic en cualquiera de los botones
modalButtons.forEach(button => {
    button.addEventListener('click', () => {
        modal.classList.toggle('active');
    });
});

// Cerrar el modal al hacer clic fuera del contenido del modal
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('active');
    }
});

function applyFilters() {
    // Obtener los valores de los filtros
    const estado = document.getElementById('estado-filter').value.toUpperCase();
    const storage = parseInt(document.getElementById('storage-filter').value);
    const battery = parseInt(document.getElementById('battery-filter').value);
    const model = document.getElementById('model-filter').value.toLowerCase();
    const searchQuery = document.getElementById('search-input').value.toLowerCase();

    // Seleccionar todos los productos
    const products = document.querySelectorAll('.product-card');
    let anyVisible = false; // Variable para rastrear si algún producto es visible

    products.forEach(product => {
        // Obtener datos de cada producto
        const productEstado = product.getAttribute('data-estado').toUpperCase();
        const productStorage = parseInt(product.getAttribute('data-storage'));
        const productBattery = parseInt(product.getAttribute('data-battery'));
        const productModel = product.getAttribute('data-model').toLowerCase();
        const productName = productModel;

        // Aplicar las condiciones de cada filtro
        let estadoMatch = !estado || productEstado === estado;
        let storageMatch = isNaN(storage) || productStorage >= storage;
        let batteryMatch = isNaN(battery) || productBattery >= battery;
        let modelMatch = !model || productModel === model;
        let searchMatch = !searchQuery || productName.includes(searchQuery);

        // Mostrar u ocultar el producto según los filtros
        if (estadoMatch && storageMatch && batteryMatch && modelMatch && searchMatch) {
            product.style.display = 'block';
            anyVisible = true; // Al menos un producto es visible
        } else {
            product.style.display = 'none';
        }
    });

    // Mostrar el mensaje de "No se encontraron coincidencias" si no hay productos visibles
    document.getElementById('no-results-message').style.display = anyVisible ? 'none' : 'block';

    // Cerrar el modal después de aplicar los filtros
    modal.classList.remove('active');
}

// Agregar evento al botón "Buscar"
document.getElementById('filter-button').addEventListener('click', applyFilters);

// Agregar evento al botón "Resetear"
document.getElementById('reset-button').addEventListener('click', function () {
    // Limpiar todos los filtros
    document.getElementById('estado-filter').value = "";
    document.getElementById('storage-filter').value = "";
    document.getElementById('battery-filter').value = "";
    document.getElementById('model-filter').value = "";
    document.getElementById('search-input').value = "";

    // Restablecer los productos a visibles
    document.querySelectorAll('.product-card').forEach(product => {
        product.style.display = 'block';
    });

    // Ocultar el mensaje de "No se encontraron coincidencias"
    document.getElementById('no-results-message').style.display = 'none';
});
