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
    function indexar(r) {
        r._n = norm([r.getAttribute('data-name'), r.getAttribute('data-x-cat'), r.getAttribute('data-estado'), r.getAttribute('data-x-alm'),
            r.getAttribute('data-x-bateria'), r.getAttribute('data-x-precio')].join(' '));
        r._c = r._n.replace(/\s+/g, '');
    }
    rows.forEach(indexar);
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

    // ---- Cambio rápido de precios ----
    var modo = false, tabla = $('pr-table'), panel = $('pr-px'), barra = $('pr-px-barra'),
        boton = $('pr-precios'), guardar = $('pr-px-guardar'), pxDialog = $('pr-px-dialog'), msg = $('pr-px-msg');

    // Acepta "450", "1399,99", "1.399,99" y "1.250" (mil doscientos cincuenta). NaN si no se entiende.
    function leerPrecio(t) {
        t = t.replace(/\s/g, '');
        if (t.indexOf(',') !== -1) t = t.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
        return /^\d+(\.\d{1,2})?$/.test(t) && Number(t) > 0 ? Number(t) : NaN;
    }
    function fmt(n) { return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 }); }
    function moneda(r) { return r.getAttribute('data-x-moneda') === 'USD' ? 'USD' : 'ARS $'; }
    function actual(r) { return parseFloat(r.getAttribute('data-x-precio')) || 0; }
    function campo(r) { return r.querySelector('.pr-price input'); }

    // null = no se toca; NaN = mal escrito
    function nuevo(r) {
        var i = campo(r);
        if (!i || !i.value.trim()) return null;
        var n = leerPrecio(i.value);
        return n === actual(r) ? null : n;
    }

    function revisar() {
        var bien = 0, mal = 0;
        rows.forEach(function (r) {
            if (!campo(r)) return;
            var n = nuevo(r), clase = '', texto = '';
            if (n !== null && isNaN(n)) { mal++; clase = 'is-mal'; texto = 'No se entiende'; }
            else if (n !== null) {
                bien++;
                var raro = actual(r) && Math.abs(n / actual(r) - 1) > 0.3;
                clase = raro ? 'is-ojo' : 'is-ok';
                texto = 'Antes ' + fmt(actual(r)) + (raro ? ' · ¿Está bien?' : '');
            }
            r.querySelector('.pr-price').className = 'pr-price ' + clase;
            r.querySelector('.pr-price em').textContent = texto;
        });
        $('pr-px-n').textContent = mal ? 'Corregí ' + mal + (mal === 1 ? ' precio' : ' precios') :
            bien ? bien + (bien === 1 ? ' precio cambiado' : ' precios cambiados') : 'Sin cambios';
        guardar.disabled = !bien || mal > 0;
    }
    function pendientes() { return modo && rows.some(function (r) { return nuevo(r) !== null; }); }

    function pintar(r) {
        var cel = r.querySelector('.pr-price');
        cel.className = 'pr-price';
        if (!modo) { cel.textContent = moneda(r) + ' ' + fmt(actual(r)); return; }
        cel.innerHTML = '<label><b></b><input type="text" inputmode="decimal" autocomplete="off"></label><em></em>';
        cel.querySelector('b').textContent = moneda(r);
        var i = cel.querySelector('input');
        i.value = String(actual(r)).replace('.', ',');
        i.setAttribute('aria-label', 'Precio de ' + r.getAttribute('data-x-nombre'));
        i.addEventListener('focus', function () { i.select(); });
        i.addEventListener('input', revisar);
        i.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            var v = visibleRows(), sig = v[v.indexOf(r) + 1];
            if (sig) campo(sig).focus();
        });
    }
    function ponerModo(si) {
        modo = si;
        tabla.classList.toggle('is-precios', si);
        panel.hidden = !si; barra.hidden = !si; boton.hidden = si;
        $('pr-px-todos').value = ''; msg.textContent = '';
        rows.forEach(pintar);
        revisar();
    }

    boton.addEventListener('click', function () { ponerModo(true); });
    $('pr-px-salir').addEventListener('click', function () {
        if (pendientes() && !window.confirm('Hay precios sin guardar. ¿Salir igual?')) return;
        ponerModo(false);
    });
    window.addEventListener('beforeunload', function (e) { if (pendientes()) { e.preventDefault(); e.returnValue = ''; } });

    $('pr-px-aplicar').addEventListener('click', function () {
        var n = leerPrecio($('pr-px-todos').value), v = visibleRows();
        if (isNaN(n)) { msg.textContent = 'Escribí un precio.'; return; }
        if (!v.length) { msg.textContent = 'No hay productos a la vista.'; return; }
        if (v.some(function (r) { return moneda(r) !== moneda(v[0]); })) { msg.textContent = 'Hay precios en dólares y en pesos a la vista. Filtrá mejor.'; return; }
        v.forEach(function (r) { campo(r).value = String(n).replace('.', ','); });
        msg.textContent = 'Precio puesto en ' + v.length + (v.length === 1 ? ' producto.' : ' productos.') + ' Falta guardar.';
        revisar();
    });
    $('pr-px-todos').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('pr-px-aplicar').click(); } });

    function cambiados() { return rows.filter(function (r) { var n = nuevo(r); return n !== null && !isNaN(n); }); }

    guardar.addEventListener('click', function () {
        var c = cambiados(), lista = $('pr-px-lista');
        $('pr-px-title').textContent = c.length === 1 ? '¿Guardar este precio?' : '¿Guardar ' + c.length + ' precios?';
        lista.textContent = '';
        c.forEach(function (r) {
            var li = document.createElement('li'), nombre = document.createElement('span'), cambio = document.createElement('strong');
            nombre.textContent = r.getAttribute('data-x-nombre');
            cambio.textContent = moneda(r) + ' ' + fmt(actual(r)) + ' → ' + fmt(nuevo(r));
            li.appendChild(nombre); li.appendChild(cambio); lista.appendChild(li);
        });
        pxDialog.showModal();
    });
    $('pr-px-no').addEventListener('click', function () { pxDialog.close(); });
    $('pr-px-si').addEventListener('click', function () {
        var btn = this, c = cambiados();
        var cambios = c.map(function (r) { return { id: Number(r.getAttribute('data-id')), precio: nuevo(r) }; });
        btn.disabled = true; btn.textContent = 'Guardando…';
        fetch('/admin/productos/precios', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ cambios: cambios })
        })
            .then(function (r) {
                return r.json().catch(function () { throw new Error('se cerró tu sesión, volvé a entrar'); });
            })
            .then(function (d) {
                if (!d.success) throw new Error(d.message || 'no se pudo guardar');
                c.forEach(function (r, k) {
                    if (d.ids.indexOf(cambios[k].id) === -1) return;
                    r.setAttribute('data-x-precio', cambios[k].precio); indexar(r);
                });
                ponerModo(false);
                showToast(d.ids.length === cambios.length ? 'Precios guardados: ' + d.ids.length :
                    'Se guardaron ' + d.ids.length + ' de ' + cambios.length + '. Actualizá la página.');
            })
            .catch(function (e) { showToast('Error: ' + e.message); })
            .then(function () { btn.disabled = false; btn.textContent = 'Sí, guardar'; pxDialog.close(); });
    });

    applyFilters();
})();
