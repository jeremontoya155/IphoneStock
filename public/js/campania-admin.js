/* Asistente de la oferta Black Friday: 5 pasos, uno por pantalla */
(function () {
    'use strict';
    var f = document.getElementById('form-campania');
    var $ = function (id) { return document.getElementById(id); };
    var todos = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    var pasos = todos('.bf-paso'), marcas = todos('#bf-pasos li'), prods = todos('.bf-prod');
    var actual = 0;

    function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
    function plata(p, n) { return p.getAttribute('data-moneda') + ' ' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }
    function alcance() { return f.querySelector('[name=alcance]:checked').value; }
    function valor() { return Number($('bf-valor').value) || 0; }
    function marcado(p) { return p.querySelector('.bf-check').checked; }

    function enOferta() {
        if (alcance() === 'elegidos') return prods.filter(marcado);
        var fuera = todos('[name=categorias_excluidas]:checked').map(function (c) { return c.value; });
        return prods.filter(function (p) { return fuera.indexOf(p.getAttribute('data-cat')) === -1; });
    }

    // Un precio en dólares de más de 10.000 casi seguro son pesos mal cargados
    function sospechosos(lista) {
        return lista.filter(function (p) { return p.getAttribute('data-moneda') === 'USD' && Number(p.getAttribute('data-precio')) > 10000; });
    }

    function pintar() {
        var solo = alcance() === 'elegidos';
        $('bf-todos').hidden = solo;
        $('bf-elegir').hidden = !solo;
        $('bf-cuantos').textContent = prods.filter(marcado).length;
        todos('.bf-num').forEach(function (b) { b.classList.toggle('is-on', Number(b.getAttribute('data-valor')) === valor()); });

        var ul = $('bf-ejemplos'); ul.textContent = '';
        enOferta().slice(0, 5).forEach(function (p) {
            var antes = Number(p.getAttribute('data-precio'));
            var li = document.createElement('li');
            var n = document.createElement('span'); n.textContent = p.getAttribute('data-nombre');
            var a = document.createElement('s'); a.textContent = plata(p, antes);
            var d = document.createElement('b'); d.textContent = valor() ? plata(p, Math.round(antes * (100 - valor())) / 100) : '—';
            li.appendChild(n); li.appendChild(a); li.appendChild(d); ul.appendChild(li);
        });

        ['titulo', 'mensaje', 'boton'].forEach(function (k) { $('previa-' + k).textContent = f.elements[k].value; });
    }

    function fecha(v) {
        return new Date(v).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    }

    function resumen() {
        var lista = enOferta(), ul = $('bf-resumen'); ul.textContent = '';
        var vista = { primero: 'Ofertas primero', solo: 'Solo ofertas', normal: 'Como siempre' }[f.querySelector('[name=vista]:checked').value];
        var lineas = [
            ['Equipos en oferta', lista.length + (alcance() === 'todos' ? ' (todos los que no dejaste afuera)' : ' elegidos por vos')],
            ['Descuento', valor() + '%'],
            ['Empieza', fecha(f.elements.fecha_inicio.value)],
            ['Termina', fecha(f.elements.fecha_fin.value)],
            ['Aviso al entrar', f.elements.aviso.checked ? 'Sí: "' + f.elements.titulo.value + '"' : 'No'],
            ['Catálogo', vista]
        ];
        var raros = sospechosos(lista);
        if (raros.length) lineas.push(['⚠️ Revisá la moneda', raros.map(function (p) { return p.getAttribute('data-nombre') + ' figura como ' + plata(p, Number(p.getAttribute('data-precio'))); }).join(' · ')]);
        lineas.forEach(function (l) {
            var li = document.createElement('li');
            if (l[0].indexOf('⚠️') === 0) li.className = 'is-warn';
            var k = document.createElement('span'); k.textContent = l[0];
            var v = document.createElement('b'); v.textContent = l[1];
            li.appendChild(k); li.appendChild(v); ul.appendChild(li);
        });
    }

    // Qué falta en cada paso, en castellano
    function falta(i) {
        if (i === 0 && !enOferta().length) return 'Elegí al menos un equipo.';
        if (i === 1 && !(valor() >= 1 && valor() <= 90)) return 'Elegí el descuento (entre 1 y 90).';
        if (i === 2) {
            var a = f.elements.fecha_inicio.value, b = f.elements.fecha_fin.value;
            if (!a || !b) return 'Completá las dos fechas.';
            if (b <= a) return 'La fecha en que termina tiene que ser después de la que empieza.';
            if (new Date(b) <= new Date()) return 'Esa fecha de fin ya pasó.';
        }
        return '';
    }

    function ir(i) {
        actual = i;
        pasos.forEach(function (p, n) { p.hidden = n !== i; });
        marcas.forEach(function (m, n) { m.className = n === i ? 'is-on' : (n < i ? 'is-ok' : ''); });
        $('bf-atras').style.visibility = i ? 'visible' : 'hidden';
        $('bf-sigue').hidden = i === pasos.length - 1;
        $('bf-publicar').hidden = i !== pasos.length - 1;
        $('bf-error').textContent = '';
        pintar();
        if (i === pasos.length - 1) resumen();
    }

    function avanzar() {
        var error = falta(actual);
        if (error) { $('bf-error').textContent = error; return; }
        ir(actual + 1);
        $('campania-box').scrollIntoView();
    }

    $('bf-sigue').addEventListener('click', avanzar);
    $('bf-atras').addEventListener('click', function () { ir(actual - 1); });
    f.addEventListener('input', function () { $('bf-error').textContent = ''; pintar(); });
    f.addEventListener('change', pintar);
    // Enter no debe publicar a medias
    f.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault();
    });
    f.addEventListener('submit', function (e) {
        for (var i = 0; i < pasos.length - 1; i++) {
            if (falta(i)) { e.preventDefault(); var msg = falta(i); ir(i); $('bf-error').textContent = msg; return; }
        }
        if (actual !== pasos.length - 1) { e.preventDefault(); return; }
        $('bf-productos').value = alcance() === 'elegidos' ? prods.filter(marcado).map(function (p) { return p.getAttribute('data-id'); }).join(',') : '';
        $('bf-publicar').disabled = true;
        $('bf-publicar').textContent = 'Guardando…';
    });

    todos('.bf-num').forEach(function (b) {
        b.addEventListener('click', function () { $('bf-valor').value = b.getAttribute('data-valor'); $('bf-error').textContent = ''; pintar(); });
    });

    todos('.bf-fecha').forEach(function (b) {
        b.addEventListener('click', function () {
            var desde = b.getAttribute('data-desde'), hasta = b.getAttribute('data-hasta');
            if (b.getAttribute('data-modo') === 'ya') {
                var local = function (d) { return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
                desde = local(new Date(Date.now() - 60000));
                hasta = local(new Date(Date.now() + 3 * 86400000));
            }
            f.elements.fecha_inicio.value = desde;
            f.elements.fecha_fin.value = hasta;
            todos('.bf-fecha').forEach(function (x) { x.classList.toggle('is-on', x === b); });
            $('bf-error').textContent = '';
        });
    });

    $('bf-buscar').addEventListener('input', function () {
        var palabras = norm(this.value).split(/\s+/);
        prods.forEach(function (p) {
            var n = norm(p.getAttribute('data-nombre')), junto = n.replace(/\s+/g, '');
            p.hidden = !palabras.every(function (t) { return n.indexOf(t) !== -1 || junto.indexOf(t) !== -1; });
        });
    });
    $('bf-marcar').addEventListener('click', function () { prods.forEach(function (p) { if (!p.hidden) p.querySelector('.bf-check').checked = true; }); pintar(); });
    $('bf-limpiar').addEventListener('click', function () { prods.forEach(function (p) { p.querySelector('.bf-check').checked = false; }); pintar(); });

    ir(0);
})();
