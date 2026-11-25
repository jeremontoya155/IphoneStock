/* Asistente de la oferta Black Friday: 5 pasos, uno por pantalla */
(function () {
    'use strict';
    var f = document.getElementById('form-campania');
    var $ = function (id) { return document.getElementById(id); };
    var todos = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };
    var pasos = todos('.bf-paso'), marcas = todos('#bf-pasos li'), prods = todos('.bf-prod');
    var actual = 0;
    // Con una oferta ya cargada: se abre en el resumen y cada dato se cambia por separado
    var editar = f.getAttribute('data-editar');
    var ultimo = pasos.length - 1;

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

    // ---- Precio escrito a mano ----
    var precios = {};
    Object.keys(reglas.precios || {}).forEach(function (id) { precios[id] = String(reglas.precios[id]); });

    function porPrecio() { return f.querySelector('[name=modo]:checked').value === 'precio'; }
    function idDe(p) { return p.getAttribute('data-id'); }
    function actualDe(p) { return Number(p.getAttribute('data-precio')); }
    function escrito(p) { return (precios[idDe(p)] || '').trim(); }
    function precioValido(p) { var n = Number(escrito(p)); return n > 0 && n < actualDe(p); }
    function rebaja(p) { return Math.round((1 - Number(escrito(p)) / actualDe(p)) * 100); }

    // Una fila por equipo; se crean una sola vez y después solo se muestran u ocultan
    var filas = prods.map(function (p) {
        var fila = document.createElement('div'); fila.className = 'bf-fila'; fila.setAttribute('data-id', idDe(p));
        var img = document.createElement('img'); img.src = p.querySelector('img').getAttribute('src'); img.alt = ''; img.loading = 'lazy';
        var nombre = document.createElement('span'); nombre.className = 'bf-fila__n'; nombre.textContent = p.getAttribute('data-nombre');
        var antes = document.createElement('small'); antes.textContent = 'Hoy ' + plata(p, actualDe(p));
        nombre.appendChild(antes);
        var caja = document.createElement('label'); caja.className = 'bf-fila__p';
        var moneda = document.createElement('span'); moneda.textContent = p.getAttribute('data-moneda');
        var input = document.createElement('input');
        input.type = 'number'; input.min = '0'; input.step = '0.01'; input.inputMode = 'decimal'; input.placeholder = 'Oferta';
        input.setAttribute('aria-label', 'Precio de oferta de ' + p.getAttribute('data-nombre'));
        input.value = precios[idDe(p)] || '';
        input.addEventListener('input', function () { precios[idDe(p)] = input.value; });
        caja.appendChild(moneda); caja.appendChild(input);
        var estado = document.createElement('em');
        fila.appendChild(img); fila.appendChild(nombre); fila.appendChild(caja); fila.appendChild(estado);
        $('bf-lista').appendChild(fila);
        return { p: p, el: fila, input: input, estado: estado, texto: norm(p.getAttribute('data-nombre')) };
    });

    function filasVisibles() { return filas.filter(function (x) { return !x.el.hidden; }); }

    function pintarPrecios() {
        var palabras = norm($('bf-pbuscar').value).split(/\s+/);
        var disponibles = elegidos();
        filas.forEach(function (x) {
            var junto = x.texto.replace(/\s+/g, '');
            x.el.hidden = disponibles.indexOf(x.p) === -1 ||
                !palabras.every(function (t) { return x.texto.indexOf(t) !== -1 || junto.indexOf(t) !== -1; });
            var t = escrito(x.p), texto = '', clase = '';
            if (t) {
                if (!precioValido(x.p)) { texto = 'Tiene que ser menor que hoy'; clase = 'is-mal'; }
                else if (rebaja(x.p) > 50) { texto = '⚠️ -' + rebaja(x.p) + '% ¿Está bien?'; clase = 'is-raro'; }
                else { texto = '-' + rebaja(x.p) + '%'; clase = 'is-ok'; }
            }
            x.estado.textContent = texto;
            x.el.className = 'bf-fila ' + clase;
        });
        $('bf-pvisibles').textContent = filasVisibles().length;
        $('bf-pcargados').textContent = disponibles.filter(precioValido).length;
    }

    $('bf-pbuscar').addEventListener('input', function () { $('bf-pmsg').textContent = ''; });
    $('bf-paplicar').addEventListener('click', function () {
        var n = Number($('bf-pvarios').value), lista = filasVisibles(), msg = $('bf-pmsg');
        if (!(n > 0)) { msg.textContent = 'Primero escribí el precio.'; return; }
        var monedas = lista.map(function (x) { return x.p.getAttribute('data-moneda'); });
        if (monedas.some(function (m) { return m !== monedas[0]; })) {
            msg.textContent = 'Ahí hay equipos en pesos y en dólares mezclados. Buscá un grupo de una sola moneda.'; return;
        }
        var puestos = 0, salteados = 0;
        lista.forEach(function (x) {
            if (n < actualDe(x.p)) { precios[idDe(x.p)] = String(n); x.input.value = n; puestos++; }
            else salteados++;
        });
        msg.textContent = 'Precio puesto en ' + puestos + (puestos === 1 ? ' equipo.' : ' equipos.') +
            (salteados ? ' En ' + salteados + ' no, porque hoy ya cuestan eso o menos.' : '');
        if (editar) $('bf-sinGuardar').hidden = false;
        pintar();
    });
    $('bf-pborrar').addEventListener('click', function () {
        filasVisibles().forEach(function (x) { delete precios[idDe(x.p)]; x.input.value = ''; });
        $('bf-pmsg').textContent = '';
        if (editar) $('bf-sinGuardar').hidden = false;
        pintar();
    });

    function enOferta() {
        if (porPrecio()) return elegidos().filter(precioValido);
        return elegidos().filter(function (p) { return agrupar() === 'no' || descuento(p) > 0; });
    }

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

        $('bf-modo-precio').hidden = !porPrecio();
        $('bf-modo-pct').hidden = porPrecio();
        if (porPrecio()) pintarPrecios();
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
            ['Descuento', porPrecio() ? 'Precios que escribiste: ' + lista.slice(0, 3).map(function (p) {
                return p.getAttribute('data-nombre') + ' a ' + plata(p, Number(escrito(p)));
            }).join(' · ') + (lista.length > 3 ? ' y ' + (lista.length - 3) + ' más' : '')
                : agrupar() === 'no' ? valor() + '%' : grupos().map(function (g) {
                    var d = descuento(g.items[0]);
                    return g.nombre + ': ' + (d ? d + '%' : 'sin descuento');
                }).join(' · ')],
            ['Empieza', fecha(f.elements.fecha_inicio.value)],
            ['Termina', fecha(f.elements.fecha_fin.value)],
            ['Aviso al entrar', f.elements.aviso.checked ? 'Sí: "' + f.elements.titulo.value + '"' : 'No'],
            ['Catálogo', vista]
        ];
        if (porPrecio()) {
            lineas[0][1] = lista.length + (lista.length === 1 ? ' con precio de oferta' : ' con precios de oferta');
            var muy = lista.filter(function (p) { return rebaja(p) > 50; });
            if (muy.length) lineas.push(['⚠️ Rebaja muy grande', muy.slice(0, 5).map(function (p) {
                return p.getAttribute('data-nombre') + ' queda en ' + plata(p, Number(escrito(p))) + ' (-' + rebaja(p) + '%)';
            }).join(' · ')]);
        }
        var raros = sospechosos(lista);
        if (raros.length) lineas.push(['⚠️ Revisá la moneda', raros.map(function (p) { return p.getAttribute('data-nombre') + ' figura como ' + plata(p, Number(p.getAttribute('data-precio'))); }).join(' · ')]);
        lineas.forEach(function (l) {
            var li = document.createElement('li');
            if (l[0].indexOf('⚠️') === 0) li.className = 'is-warn';
            var k = document.createElement('span'); k.textContent = l[0];
            var v = document.createElement('b'); v.textContent = l[1];
            li.appendChild(k); li.appendChild(v);
            var paso = { 'Equipos en oferta': 0, 'Descuento': 1, 'Empieza': 2, 'Termina': 2, 'Aviso al entrar': 3, 'Catálogo': 3 }[l[0]];
            if (editar && paso !== undefined) {
                var boton = document.createElement('button');
                boton.type = 'button'; boton.className = 'bf-cambiar'; boton.textContent = 'Cambiar';
                boton.setAttribute('data-paso', paso);
                boton.setAttribute('aria-label', 'Cambiar ' + l[0].toLowerCase());
                boton.addEventListener('click', function () { ir(paso); $('campania-box').scrollIntoView(); });
                li.appendChild(boton);
            }
            ul.appendChild(li);
        });
    }

    // Qué falta en cada paso, en castellano
    function falta(i) {
        if (i === 0 && !enOferta().length) return 'Elegí al menos un equipo.';
        if (i === 1 && porPrecio()) {
            var mal = elegidos().filter(function (p) { return escrito(p) && !precioValido(p); });
            if (mal.length) return 'Revisá el precio de ' + mal[0].getAttribute('data-nombre') + ': tiene que ser menor que el de hoy.';
            return enOferta().length ? '' : 'Escribí al menos un precio de oferta.';
        }
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
        if (editar) {
            marcas.forEach(function (m, n) { m.className = n === i ? 'is-on' : 'is-ok'; });
            $('bf-atras').style.visibility = i === ultimo ? 'hidden' : 'visible';
            $('bf-atras').textContent = '← Volver al resumen';
            $('bf-sigue').hidden = true;
            $('bf-publicar').hidden = false;
        } else {
            $('bf-atras').style.visibility = i ? 'visible' : 'hidden';
            $('bf-sigue').hidden = i === ultimo;
            $('bf-publicar').hidden = i !== ultimo;
        }
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
    $('bf-atras').addEventListener('click', function () { ir(editar ? ultimo : actual - 1); });
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
        if (!editar && actual !== ultimo) { e.preventDefault(); return; }
        var aGuardar = {};
        if (porPrecio()) enOferta().forEach(function (p) { aGuardar[idDe(p)] = Number(escrito(p)); });
        $('bf-precios').value = JSON.stringify(aGuardar);
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

    if (editar) {
        $('bf-resumen-titulo').textContent = 'Tu oferta';
        $('bf-resumen-ayuda').hidden = false;
        $('bf-publicar').textContent = editar === 'apagada' ? '▶ Volver a encender' : '💾 Guardar cambios';
        marcas.forEach(function (m, n) {
            m.tabIndex = 0; m.setAttribute('role', 'button'); m.style.cursor = 'pointer';
            m.addEventListener('click', function () { ir(n); });
            m.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ir(n); } });
        });
        // En 'input' (no en 'change'): si apareciera al salir del campo, movería el botón justo al hacer clic
        f.addEventListener('input', function (e) {
            if (['bf-buscar', 'bf-pbuscar', 'bf-pvarios'].indexOf(e.target.id) === -1) $('bf-sinGuardar').hidden = false;
        });
        todos('.bf-num, .bf-fecha, #bf-marcar, #bf-limpiar').forEach(function (b) {
            b.addEventListener('click', function () { $('bf-sinGuardar').hidden = false; });
        });
    }
    ir(editar ? ultimo : 0);
})();
