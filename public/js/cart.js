// Filtro de batería mínima en tiempo real
const batteryFilter = document.getElementById('battery-filter');
if (batteryFilter) {
    batteryFilter.addEventListener('input', function () {
        const batteryFilterValue = parseInt(this.value, 10); // Convertir el valor del filtro a número entero
        const items = document.querySelectorAll('.product-card');

        items.forEach(item => {
            const productBattery = parseInt(item.querySelector('.bateria-num').textContent, 10); // Obtener el porcentaje de batería como número entero

            if (isNaN(batteryFilterValue) || productBattery >= batteryFilterValue) {
                // Mostrar productos con batería igual o mayor al valor del filtro, o si el filtro está vacío
                item.style.display = '';
            } else {
                // Ocultar productos con batería menor al valor del filtro
                item.style.display = 'none';
            }
        });
    });
}

// Función para filtrar y ordenar productos
function filterProducts() {
    const searchValue = document.getElementById('search-input').value.toLowerCase().trim();
    const modelValue = document.getElementById('model-filter').value.toLowerCase().trim();
    const batteryFilterValue = parseInt(document.getElementById('battery-filter').value) || 0;
    const storageFilterValue = parseInt(document.getElementById('storage-filter').value) || 0;
    const estadoValue = document.getElementById('estado-filter').value.toUpperCase().trim(); // Filtro de estado
    const orderPriceValue = document.getElementById('order-price-filter').value; // Filtro de orden de precio
    const items = Array.from(document.querySelectorAll('.product-card')); // Convertimos el NodeList a Array para poder ordenarlo

    // Filtrar los productos
    const filteredItems = items.filter(item => {
        const text = item.textContent.toLowerCase();
        const productModel = item.querySelector('.product-name').textContent.toLowerCase().trim();
        const productBattery = parseInt(item.querySelector('.bateria-num').textContent.trim());
        const productStorage = parseInt(item.querySelector('.almacenamiento').textContent) || 0;
        const productEstado = item.querySelector('.estado').textContent.toUpperCase().trim();
        const productPrice = parseFloat(item.querySelector('.product-price').textContent.replace('USD', '').trim());

        // Aplicar todos los filtros combinados
        const matchesSearch = text.includes(searchValue);
        const matchesModel = modelValue === '' || productModel === modelValue;
        const matchesBattery = productBattery >= batteryFilterValue;
        const matchesStorage = productStorage >= storageFilterValue;
        const matchesEstado = estadoValue === '' || productEstado === estadoValue;

        return matchesSearch && matchesModel && matchesBattery && matchesStorage && matchesEstado;
    });

    // Ordenar los productos filtrados por precio
    if (orderPriceValue === 'asc') {
        filteredItems.sort((a, b) => {
            const priceA = parseFloat(a.querySelector('.product-price').textContent.replace('USD', '').trim());
            const priceB = parseFloat(b.querySelector('.product-price').textContent.replace('USD', '').trim());
            return priceA - priceB; // Orden ascendente (menor a mayor)
        });
    } else if (orderPriceValue === 'desc') {
        filteredItems.sort((a, b) => {
            const priceA = parseFloat(a.querySelector('.product-price').textContent.replace('USD', '').trim());
            const priceB = parseFloat(b.querySelector('.product-price').textContent.replace('USD', '').trim());
            return priceB - priceA; // Orden descendente (mayor a menor)
        });
    }

    // Ocultar todos los productos
    items.forEach(item => item.style.display = 'none');

    // Mostrar solo los productos filtrados y ordenados
    filteredItems.forEach(item => item.style.display = '');
}

// Asignar la función al botón de búsqueda
document.getElementById('filter-button').addEventListener('click', filterProducts);

// Opcional: Si también quieres permitir el filtrado al presionar "Enter"
document.getElementById('search-input').addEventListener('keyup', function (event) {
    if (event.key === 'Enter') {
        filterProducts();
    }
});
document.getElementById('battery-filter').addEventListener('keyup', function (event) {
    if (event.key === 'Enter') {
        filterProducts();
    }
});
document.getElementById('storage-filter').addEventListener('keyup', function (event) {
    if (event.key === 'Enter') {
        filterProducts();
    }
});
document.getElementById('estado-filter').addEventListener('change', function () {
    filterProducts();
});
document.getElementById('order-price-filter').addEventListener('change', function () {
    filterProducts();
});

// Función para manejar las pestañas en el modal
function showTab(event, tabId) {
    var i, tabcontent, tablinks;

    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    tablinks = document.querySelectorAll(".product-detail-card .tabs button");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    document.getElementById(tabId).style.display = "block";
    event.currentTarget.className += " active";
}

// Mostrar la pestaña "General" por defecto
document.addEventListener('DOMContentLoaded', function () {
    var defaultTabs = document.querySelectorAll('.tabs button.active');
    defaultTabs.forEach(function (tab) {
        var tabId = tab.getAttribute('onclick').match(/'([^']+)'/)[1];
        document.getElementById(tabId).style.display = 'block';
    });
});
