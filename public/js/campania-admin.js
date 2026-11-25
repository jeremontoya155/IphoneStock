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

    // ---- Descuento por grupos ----
    var reglas = {};
    try { reglas = JSON.parse(f.getAttribute('data-reglas')) || {}; } catch (e) { }
    var porGrupo = { categoria: {}, modelo: {} };
    if (porGrupo[reglas.agrupar]) porGrupo[reglas.agrupar] = reglas.porGrupo || {};

    function agrupar() { return f.querySelector('[name=agrupar]:checked').value; }
    function clave(p) {
        return agrupar() === 'categoria' ? (p.getAttribute('data-cat') || '0')
            : p.getAttribute('data-nombre').split('/')[0].trim().toUpperCase();
    }
    function nombreGrupo(p) { return agrupar() === 'categoria' ? p.getAttribute('data-catnombre') : clave(p); }
    function descuento(p) {
        if (agrupar() === 'no') return valor();
        var propio = porGrupo[agrupar()][clave(p)];
        return propio === undefined ? valor() : propio;
    }

    // Los grupos presentes entre los equipos elegidos
    function grupos() {
        var mapa = {}, orden = [];
        elegidos().forEach(function (p) {
            var k = clave(p);
            if (!mapa[k]) { mapa[k] = { clave: k, nombre: nombreGrupo(p), items: [] }; orden.push(mapa[k]); }
            mapa[k].items.push(p);
        });
        return orden.sort(function (x, y) { return x.nombre.localeCompare(y.nombre, 'es', { numeric: true }); });
    }

    var firmaGrupos = '';
    function pintarGrupos() {
        var caja = $('bf-grupos');
        if (agrupar() === 'no') { caja.textContent = ''; firmaGrupos = ''; return; }
        var lista = grupos();
        // Solo se redibuja si cambió algo, para no cerrar el desplegable que se está usando
        var firma = agrupar() + '|' + valor() + '|' + lista.map(function (g) { return g.clave + ':' + g.items.length; }).join(',');
        if (firma === firmaGrupos) return;
        firmaGrupos = firma;
        caja.textContent = '';
        lista.forEach(function (g) {
            var fila = document.createElement('label'); fila.className = 'bf-grupo';
            var nombre = document.createElement('span'); nombre.textContent = g.nombre;
            var cuantos = document.createElement('small'); cuantos.textContent = g.items.length === 1 ? '1 equipo' : g.items.length + ' equipos';
            var sel = document.createElement('select'); sel.setAttribute('data-grupo', g.clave);
            var actual = porGrupo[agrupar()][g.clave];
            var opciones = [['', 'El general' + (valor() ? ' (' + valor() + '%)' : '')], [0, 'Sin descuento']];
            var numeros = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
            if (actual && numeros.indexOf(actual) === -1) numeros.push(actual);
            numeros.sort(function (x, y) { return x - y; }).forEach(function (n) { opciones.push([n, n + '%']); });
            opciones.forEach(function (o) {
                var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
            });
            sel.value = actual === undefined ? '' : String(actual);
            sel.addEventListener('change', function () {
                if (sel.value === '') delete porGrupo[agrupar()][g.clave];
                else porGrupo[agrupar()][g.clave] = Number(sel.value);
                pintar();
            });
            fila.appendChild(nombre); fila.appendChild(cuantos); fila.appendChild(sel);
            caja.appendChild(fila);
        });
    }

    function enOferta() { return elegidos().filter(function (p) { return agrupar() === 'no' || descuento(p) > 0; }); }

    // Equipos marcados en el paso 1
    function elegidos() {
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

        pintarGrupos();
        var ul = $('bf-ejemplos'); ul.textContent = '';
        // Con grupos, un ejemplo de cada uno
        var ejemplos = agrupar() === 'no' ? elegidos().slice(0, 5) : grupos().map(function (g) { return g.items[0]; }).slice(0, 8);
        ejemplos.forEach(function (p) {
            var antes = Number(p.getAttribute('data-precio'));
            var li = document.createElement('li');
            var n = document.createElement('span'); n.textContent = p.getAttribute('data-nombre');
            var a = document.createElement('s'); a.textContent = plata(p, antes);
            var d = document.createElement('b'); var pct = descuento(p);
            d.textContent = pct ? plata(p, Math.round(antes * (100 - pct)) / 100) + ' (-' + pct + '%)' : (valor() ? 'Sin descuento' : '—');
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
            ['Descuento', agrupar() === 'no' ? valor() + '%' : grupos().map(function (g) {
                var d = descuento(g.items[0]);
                return g.nombre + ': ' + (d ? d + '%' : 'sin descuento');
            }).join(' · ')],
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
        if (i === 1 && !(valor() >= 1 && valor() <= 90 && Number.isInteger(valor()))) return 'Elegí el descuento (un número entero entre 1 y 90).';
        if (i === 1 && !enOferta().length) return 'Dejaste todos los grupos sin descuento. Ponele descuento a alguno.';
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
        $('bf-porgrupo').value = JSON.stringify(agrupar() === 'no' ? {} : porGrupo[agrupar()]);
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
