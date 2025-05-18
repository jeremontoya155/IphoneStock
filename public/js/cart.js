// Seleccionar elementos para el modal
const modal = document.querySelector('.filters-modal');
const modalButtons = document.querySelectorAll('.filters-modal-btn-sidebar, .filters-modal-btn-phone');
// El closeButton en tu código original no se usa para cerrar.
// Para cerrar al hacer clic fuera, se usa el event listener en 'modal'.
// Si necesitas un botón de cerrar explícito dentro del modal, añade uno con una clase.
// Por ahora, mantendré la estructura original sin usar 'closeButton' para cerrar.
// const closeButton = document.querySelector('.filters-modal-content'); // Esta variable no se usa para cerrar

// Función para abrir/cerrar el modal (se mantiene igual)
const toggleModal = () => {
    modal.classList.toggle('active');
};

// Abrir el modal al hacer clic en los botones (se mantiene igual)
modalButtons.forEach(button => {
    button.addEventListener('click', toggleModal);
});

// Cerrar el modal al hacer clic fuera del contenido (se mantiene igual)
modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        modal.classList.remove('active');
    }
});


// --- Lógica de Aplicar Filtros (Modificada) ---
function applyFilters() {
    // Obtener los valores de todos los filtros
    const estado = document.getElementById('estado-filter').value.toUpperCase().trim(); // Trim para limpiar espacios
    const storage = parseInt(document.getElementById('storage-filter').value); // isNaN check needed later
    const battery = parseInt(document.getElementById('battery-filter').value);   // isNaN check needed later
    const model = document.getElementById('model-filter').value.toLowerCase().trim(); // Trim y toLowerCase
    const searchQuery = document.getElementById('search-input').value.toLowerCase().trim(); // Trim y toLowerCase
    // Obtener el valor del nuevo filtro de tipo
    const type = document.getElementById('type-filter').value.toLowerCase().trim(); // <-- NUEVO: Obtener y limpiar valor del tipo

    const products = document.querySelectorAll('.product-card');
    let anyVisible = false;
    const noResultsMessage = document.getElementById('no-results-message');

    products.forEach(product => {
        // Obtener los data-attributes de cada producto
        const productEstado = product.getAttribute('data-estado') ? product.getAttribute('data-estado').toUpperCase().trim() : ''; // Leer y limpiar
        const productStorage = parseInt(product.getAttribute('data-storage')) || 0; // Leer y default a 0 si no es número
        const productBattery = parseInt(product.getAttribute('data-battery')) || 0;   // Leer y default a 0 si no es número
        const productName = product.getAttribute('data-name') ? product.getAttribute('data-name').toLowerCase().trim() : ''; // Usar data-name para el nombre/modelo
        // Obtener el tipo del producto del data attribute
        const productType = product.getAttribute('data-type') ? product.getAttribute('data-type').toLowerCase().trim() : ''; // <-- NUEVO: Leer y limpiar data-type

        // Evaluar las condiciones de filtro para cada producto
        // Si el valor del filtro está vacío, la condición es TRUE (no se aplica ese filtro)
        let estadoMatch = !estado || productEstado === estado;
        let storageMatch = isNaN(storage) || productStorage >= storage; // Check isNaN for storage input
        let batteryMatch = isNaN(battery) || productBattery >= battery; // Check isNaN for battery input
        let modelMatch = !model || productName === model; // Comparar con data-name (modelo/nombre)
        let searchMatch = !searchQuery || productName.includes(searchQuery); // Buscar en data-name
        // Evaluar la condición del nuevo filtro de tipo
        let typeMatch = !type || productType === type; // <-- NUEVO: Comparar con data-type


        // Determinar si el producto cumple TODOS los filtros
        if (estadoMatch && storageMatch && batteryMatch && modelMatch && searchMatch && typeMatch) { // <-- Incluir typeMatch
            product.style.display = 'block'; // Mostrar el producto
            anyVisible = true; // Marcar que al menos uno está visible
        } else {
            product.style.display = 'none'; // Ocultar el producto
        }
    });

    // Mostrar u ocultar el mensaje de "No se encontraron coincidencias"
    noResultsMessage.style.display = anyVisible ? 'none' : 'block';

    // Opcional: Cerrar el modal después de aplicar filtros
    modal.classList.remove('active');
}


// --- Botones de Acción ---

// Listener para el botón de "Buscar"
document.getElementById('filter-button').addEventListener('click', applyFilters);

// Listener para el botón de "Resetear" (Modificado)
document.getElementById('reset-button').addEventListener('click', () => {
    // Resetear todos los campos del filtro a sus valores por defecto
    document.getElementById('estado-filter').value = "";
    document.getElementById('storage-filter').value = "";
    document.getElementById('battery-filter').value = "";
    document.getElementById('model-filter').value = "";
    document.getElementById('search-input').value = "";
    // <-- NUEVO: Resetear el filtro de tipo
    document.getElementById('type-filter').value = "";

    // Mostrar todos los productos
    document.querySelectorAll('.product-card').forEach(product => {
        product.style.display = 'block';
    });

    // Ocultar el mensaje de "No se encontraron coincidencias"
    document.getElementById('no-results-message').style.display = 'none';

    // Opcional: Cerrar el modal después de resetear
    // modal.classList.remove('active');
    // Nota: No es común cerrar el modal al resetear, pero si lo quieres descomenta la línea de arriba.
});

// --- Opcional: Aplicar filtros automáticamente al cambiar algún input/select ---
// Descomenta las líneas siguientes si quieres que los filtros se apliquen
// en tiempo real mientras el usuario interactúa con el modal.
// document.getElementById('estado-filter').addEventListener('change', applyFilters);
// document.getElementById('storage-filter').addEventListener('input', applyFilters); // 'input' para cambios mientras escribe
// document.getElementById('battery-filter').addEventListener('input', applyFilters); // 'input' para cambios mientras escribe
// document.getElementById('model-filter').addEventListener('change', applyFilters);
// document.getElementById('search-input').addEventListener('input', applyFilters);   // 'input' para búsqueda instantánea
// document.getElementById('type-filter').addEventListener('change', applyFilters); // <-- NUEVO: Aplicar al cambiar tipo


// --- Lógica de Ordenación (Tu script existente para ordenar por precio/fecha) ---
// Asegúrate de que tu script de ordenación (el que pusiste en el head)
// esté presente y se ejecute después de que el DOM esté listo.
// Ese script DEBE interactuar con los mismos elementos '.product-card'.
// Si el script de ordenación está en este archivo cart.js, asegúrate de que
// esté incluido aquí, por ejemplo, al final del archivo.
// Ejemplo de cómo podría verse si está en este archivo:

/*
document.addEventListener('DOMContentLoaded', () => {
    // ... (todo el código de filtros y modal de arriba) ...

    // --- Lógica de Ordenación (ejemplo, si estaba en tu head) ---
    const sortSelect = document.getElementById('sort-select');
    const productsContainer = document.getElementById('cart-items');

    if (sortSelect && productsContainer) { // Asegurarse de que los elementos existan
        sortSelect.addEventListener('change', () => {
            const sortBy = sortSelect.value;
            let productCards = Array.from(productsContainer.querySelectorAll('.product-card'));

            if (sortBy === 'default') {
                productCards.sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index));
            } else if (sortBy === 'price-asc') {
                productCards.sort((a, b) => parseFloat(a.dataset.price) - parseFloat(b.dataset.price));
            } else if (sortBy === 'price-desc') {
                productCards.sort((a, b) => parseFloat(b.dataset.price) - parseFloat(a.dataset.price));
            }

            // Re-insertar ordenado
            productsContainer.innerHTML = ''; // Limpiar
            productCards.forEach(card => productsContainer.appendChild(card));
        });

        // Opcional: Aplicar la ordenación por defecto al cargar
        // const initialSort = sortSelect.value;
        // if (initialSort !== 'default') { // Si la opción por defecto es diferente de 'default'
        //     // Podrías necesitar llamar a la lógica de ordenación aquí si quieres
        //     // que la lista aparezca inicialmente ordenada por otra cosa.
        //     // Sin embargo, el sort por default (fecha de carga) es el orden original del HTML,
        //     // así que no necesita ordenación explícita al inicio a menos que cambies el valor por defecto.
        // }
    } else {
         console.warn("Elementos de ordenación no encontrados: #sort-select o #cart-items.");
    }

    // Asegurarse de que los filtros se apliquen al cargar la página (por si hay filtros precargados o estado inicial)
    // Considera si quieres aplicar filtros al cargar. Si no, comenta la siguiente línea.
    // applyFilters(); // <-- Descomentar si quieres que se apliquen los filtros iniciales

});
*/

// Si tu script de ordenación estaba *directamente* en la etiqueta <script> del head,
// asegúrate de que se ejecute *después* de que el DOM esté completamente cargado
// (por ejemplo, envolviéndolo en document.addEventListener('DOMContentLoaded', ...)).
// Lo más limpio sería mover toda la lógica de JS (modal, filtros, ordenación)
// dentro de un solo `document.addEventListener('DOMContentLoaded', () => { ... });`
// en este archivo `cart.js`.