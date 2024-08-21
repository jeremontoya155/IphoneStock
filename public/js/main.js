// Función para filtrar la tabla
document.getElementById('search-input').addEventListener('keyup', function() {
    const searchValue = this.value.toLowerCase();
    const rows = document.querySelectorAll('#products-table tr');

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        let match = false;

        cells.forEach(cell => {
            if (cell.textContent.toLowerCase().includes(searchValue)) {
                match = true;
            }
        });

        if (match) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
});

// Función para descargar los productos en un archivo Excel
document.getElementById('download-btn').addEventListener('click', function() {
    const rows = document.querySelectorAll('#products-table tr');
    const data = [];

    // Cabeceras
    data.push(['Imagen', 'Nombre', 'Descripción', 'Precio', 'Stock']);

    // Filas
    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        const img = cells[0].querySelector('img').src;
        const name = cells[1].textContent;
        const description = cells[2].textContent;
        const price = cells[3].textContent;
        const stock = cells[4].textContent;

        data.push([img, name, description, price, stock]);
    });

    // Crear la hoja de Excel
    const worksheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Productos');

    // Descargar el archivo Excel
    XLSX.writeFile(workbook, 'productos.xlsx');
});

document.getElementById('.menu-toggle').addEventListener('click', function () {
    console.log("boton");
    this.classList.toggle('active');
    document.getElementById('.custom-navbar').classList.toggle('active');
});
