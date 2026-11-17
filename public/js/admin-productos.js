/* Gestión de productos: filtros, selección múltiple, borrado y descarga a Excel */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var rows = Array.prototype.slice.call(document.querySelectorAll('#pr-table .pr-row[data-id]'));
    var q = $('pr-q'), fEstado = $('pr-estado'), fCat = $('pr-cat'), fStock = $('pr-stock'),
        count = $('pr-count'), empty = $('pr-empty'), all = $('pr-all'),
        bulk = $('pr-bulk'), selN = $('pr-sel'), dialog = $('pr-dialog'), toast = $('adm-toast');
    var total = rows.length;

    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    rows.forEach(function (r) {
        r._n = norm([r.getAttribute('data-name'), r.getAttribute('data-x-cat'), r.getAttribute('data-estado'), r.getAttribute('data-x-alm'),
            r.getAttribute('data-x-bateria'), r.getAttribute('data-x-precio')].join(' '));
        r._c = r._n.replace(/\s+/g, '');
    });
    function matches(r, text) {
        return text.split(/\s+/).every(function (t) { return r._n.indexOf(t) !== -1 || r._c.indexOf(t) !== -1; });
    }

    function showToast(msg) {
        toast.textContent = msg; toast.classList.add('is-on');
        clearTimeout(showToast._t); showToast._t = setTimeout(function () { toast.classList.remove('is-on'); }, 3200);
    }

    function visibleRows() { return rows.filter(function (r) { return !r.hidden; }); }
    function checked() { return rows.filter(function (r) { return r.querySelector('.pr-check').checked; }); }

    function applyFilters() {
        var text = norm(q.value.trim()), est = fEstado.value, cat = fCat.value, st = fStock.value;
        rows.forEach(function (r) {
            var stock = parseInt(r.getAttribute('data-stock')) || 0;
            var ok = (!text || matches(r, text)) &&
                (!est || r.getAttribute('data-estado') === est) &&
                (!cat || r.getAttribute('data-cat') === cat) &&
                (!st || (st === 'con' && stock > 0) || (st === 'sin' && stock <= 0) || (st === 'poco' && stock >= 1 && stock <= 2));
            r.hidden = !ok;
            if (!ok) r.querySelector('.pr-check').checked = false; // no dejar seleccionado algo que no se ve
        });
        var v = visibleRows().length;
        count.textContent = 'Mostrando ' + v + ' de ' + total;
        empty.hidden = v !== 0;
        updateSelection();
    }

    function updateSelection() {
        var n = checked().length, v = visibleRows();
        selN.textContent = n;
        bulk.classList.toggle('is-on', n > 0);
        all.checked = v.length > 0 && v.every(function (r) { return r.querySelector('.pr-check').checked; });
        all.indeterminate = n > 0 && !all.checked;
    }

    [q, fEstado, fCat, fStock].forEach(function (el) { el.addEventListener('input', applyFilters); });
    all.addEventListener('change', function () {
        visibleRows().forEach(function (r) { r.querySelector('.pr-check').checked = all.checked; });
        updateSelection();
    });
    rows.forEach(function (r) { r.querySelector('.pr-check').addEventListener('change', updateSelection); });
    $('pr-clear').addEventListener('click', function () {
        rows.forEach(function (r) { r.querySelector('.pr-check').checked = false; });
        updateSelection();
    });

    // Filtros que llegan por la URL (ej. desde el Panel: /admin/productos?stock=sin)
    try {
        var p = new URLSearchParams(location.search);
        if (p.get('stock')) fStock.value = p.get('stock');
        if (p.get('q')) q.value = p.get('q');
    } catch (e) { }

    // ---- Eliminar ----
    $('pr-delete').addEventListener('click', function () {
        var sel = checked(); if (!sel.length) return;
        var nombres = sel.slice(0, 3).map(function (r) { return r.getAttribute('data-x-nombre'); });
        $('pr-dialog-title').textContent = sel.length === 1 ? '¿Eliminar este producto?' : '¿Eliminar ' + sel.length + ' productos?';
        $('pr-dialog-text').textContent = nombres.join(' · ') + (sel.length > 3 ? ' y ' + (sel.length - 3) + ' más' : '') +
            '. Esta acción no se puede deshacer.';
        dialog.showModal();
    });
    $('pr-dialog-no').addEventListener('click', function () { dialog.close(); });
    $('pr-dialog-yes').addEventListener('click', function () {
        var btn = this, sel = checked();
        var ids = sel.map(function (r) { return r.getAttribute('data-id'); });
        btn.disabled = true; btn.textContent = 'Eliminando…';
        fetch('/products/delete-multiple', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ productIds: ids })
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                if (!res.ok || !res.d.success) throw new Error(res.d && res.d.message || 'No se pudo eliminar');
                sel.forEach(function (r) { r.remove(); });
                rows = rows.filter(function (r) { return document.body.contains(r); });
                total = rows.length;
                applyFilters();
                showToast(res.d.message || 'Productos eliminados');
            })
            .catch(function (e) { showToast('Error: ' + e.message); })
            .then(function () { btn.disabled = false; btn.textContent = 'Sí, eliminar'; dialog.close(); });
    });

    // ---- Excel (lo que se está viendo) ----
    $('pr-download').addEventListener('click', function () {
        if (typeof XLSX === 'undefined') { showToast('No se pudo cargar el generador de Excel'); return; }
        var data = [['Producto', 'Estado', 'Categoría', 'Precio', 'Moneda', 'Stock', 'Batería %', 'Almacenamiento GB']];
        visibleRows().forEach(function (r) {
            data.push([
                r.getAttribute('data-x-nombre'), r.getAttribute('data-estado'), r.getAttribute('data-x-cat'),
                parseFloat(r.getAttribute('data-x-precio')) || 0, r.getAttribute('data-x-moneda'),
                parseInt(r.getAttribute('data-stock')) || 0, r.getAttribute('data-x-bateria'), r.getAttribute('data-x-alm')
            ]);
        });
        var ws = XLSX.utils.aoa_to_sheet(data);
        ws['!cols'] = [{ wch: 44 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 8 }, { wch: 7 }, { wch: 10 }, { wch: 18 }];
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Productos');
        XLSX.writeFile(wb, 'productos-' + new Date().toISOString().slice(0, 10) + '.xlsx');
        showToast('Descargando ' + (data.length - 1) + ' productos');
    });

    applyFilters();
})();
