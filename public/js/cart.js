// Seleccionar elementos
const modal = document.querySelector('.filters-modal');
const modalButtons = document.querySelectorAll('.filters-modal-btn-sidebar, .filters-modal-btn-phone');
const closeButton = document.querySelector('.filters-modal-content');

// Función para abrir/cerrar el modal
const toggleModal = () => {
    modal.classList.toggle('active');
};

// Abrir el modal al hacer clic en los botones
modalButtons.forEach(button => {
    button.addEventListener('click', toggleModal);
});

// Cerrar el modal al hacer clic fuera del contenido
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('active');
    }
});

// Aplicar filtros
function applyFilters() {
    const estado = document.getElementById('estado-filter').value.toUpperCase();
    const storage = parseInt(document.getElementById('storage-filter').value);
    const battery = parseInt(document.getElementById('battery-filter').value);
    const model = document.getElementById('model-filter').value.toLowerCase();
    const searchQuery = document.getElementById('search-input').value.toLowerCase();

    const products = document.querySelectorAll('.product-card');
    let anyVisible = false;

    products.forEach(product => {
        const productEstado = product.getAttribute('data-estado').toUpperCase();
        const productStorage = parseInt(product.getAttribute('data-storage'));
        const productBattery = parseInt(product.getAttribute('data-battery'));
        const productModel = product.getAttribute('data-model').toLowerCase();
        const productName = productModel;

        let estadoMatch = !estado || productEstado === estado;
        let storageMatch = isNaN(storage) || productStorage >= storage;
        let batteryMatch = isNaN(battery) || productBattery >= battery;
        let modelMatch = !model || productModel === model;
        let searchMatch = !searchQuery || productName.includes(searchQuery);

        if (estadoMatch && storageMatch && batteryMatch && modelMatch && searchMatch) {
            product.style.display = 'block';
            anyVisible = true;
        } else {
            product.style.display = 'none';
        }
    });

    document.getElementById('no-results-message').style.display = anyVisible ? 'none' : 'block';
    modal.classList.remove('active');
}

// Botones de acción
document.getElementById('filter-button').addEventListener('click', applyFilters);

document.getElementById('reset-button').addEventListener('click', () => {
    document.getElementById('estado-filter').value = "";
    document.getElementById('storage-filter').value = "";
    document.getElementById('battery-filter').value = "";
    document.getElementById('model-filter').value = "";
    document.getElementById('search-input').value = "";

    document.querySelectorAll('.product-card').forEach(product => {
        product.style.display = 'block';
    });

    document.getElementById('no-results-message').style.display = 'none';
});
