/* Carrito iLoop — guarda solo {id, qty} en el navegador; precios y stock vienen del servidor. */
(function () {
    'use strict';

    var KEY = 'iloop_cart_v1';
    var NAME_KEY = 'iloop_cart_nombre';
    var MAX_QTY = 10;

    var $ = function (id) { return document.getElementById(id); };
    var fab = $('cart-fab'), fabCount = $('cart-fab-count'), overlay = $('cart-overlay'),
        drawer = $('cart-drawer'), body = $('cart-body'), foot = $('cart-foot'),
        totalsEl = $('cart-totals'), toast = $('cart-toast'), nombreInput = $('cart-nombre'),
        btnCheckout = $('cart-checkout');
    if (!drawer) return;

    // ---------- almacenamiento (puede fallar en modo privado) ----------
    function load() {
        try {
            var raw = JSON.parse(localStorage.getItem(KEY) || '[]');
            if (!Array.isArray(raw)) return [];
            return raw.map(function (i) { return { id: parseInt(i.id), qty: parseInt(i.qty) }; })
                .filter(function (i) { return i.id > 0 && i.qty > 0; });
        } catch (e) { return []; }
    }
    function save(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { } }

    var items = load();
    save(items);             // descarta entradas inválidas que pudieran haber quedado guardadas
    var cache = {};          // id -> datos frescos del servidor
    var lastFocus = null;

    // ---------- utilidades ----------
    function money(n, m) {
        return (m === 'ARS' ? 'ARS $' : 'USD ') + Number(n).toLocaleString('es-AR', { maximumFractionDigits: 2 });
    }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined) e.textContent = text;
        return e;
    }
    function count() { return items.reduce(function (s, i) { return s + i.qty; }, 0); }

    var toastTimer;
    function showToast(msg, withAction) {
        toast.textContent = '';
        toast.appendChild(el('span', null, msg));
        if (withAction) {
            var b = el('button', 'cart-toast__btn', 'Ver carrito');
            b.type = 'button';
            b.addEventListener('click', openDrawer);
            toast.appendChild(b);
        }
        toast.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('is-visible'); }, 3200);
    }

    function updateBadge(bump) {
        var n = count();
        fabCount.textContent = n;
        fab.hidden = n === 0;
        if (bump) {
            fab.classList.remove('bump'); void fab.offsetWidth; fab.classList.add('bump');
        }
    }

    // ---------- operaciones ----------
    function add(id, name) {
        var it = items.find(function (i) { return i.id === id; });
        if (it) {
            if (it.qty >= MAX_QTY) { showToast('Máximo ' + MAX_QTY + ' unidades por producto'); return; }
            it.qty++;
        } else items.push({ id: id, qty: 1 });
        save(items); updateBadge(true);
        showToast((name || 'Producto') + ' agregado', true);
        if (isOpen()) render();
    }
    function setQty(id, qty) {
        var p = cache[id];
        var max = Math.min(MAX_QTY, p ? Math.max(p.stock, 1) : MAX_QTY);
        if (qty < 1) return remove(id);
        if (qty > max) { showToast(p && p.stock < MAX_QTY ? 'Solo hay ' + p.stock + ' en stock' : 'Máximo ' + MAX_QTY + ' unidades'); qty = max; }
        items.forEach(function (i) { if (i.id === id) i.qty = qty; });
        save(items); updateBadge(); render();
    }
    function remove(id) {
        items = items.filter(function (i) { return i.id !== id; });
        save(items); updateBadge(); render();
    }
    function clear() { items = []; save(items); updateBadge(); render(); }

    // ---------- panel ----------
    function isOpen() { return drawer.classList.contains('is-open'); }
    function openDrawer() {
        lastFocus = document.activeElement;
        overlay.hidden = false;
        requestAnimationFrame(function () {
            overlay.classList.add('is-open');
            drawer.classList.add('is-open');
        });
        drawer.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('cart-lock');
        toast.classList.remove('is-visible');
        render();
        setTimeout(function () { $('cart-close').focus(); }, 60);
    }
    function closeDrawer() {
        overlay.classList.remove('is-open');
        drawer.classList.remove('is-open');
        drawer.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('cart-lock');
        setTimeout(function () { overlay.hidden = true; }, 250);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    var renderToken = 0;
    function render() {
        var token = ++renderToken;
        if (!items.length) { return paint(); }
        // Si ya tenemos datos de todo lo que hay en el carrito, mostrarlos al instante (y refrescar abajo)
        var tieneTodo = items.every(function (i) { return cache[i.id]; });
        if (tieneTodo) paint();
        else if (!body.children.length || body.querySelector('.cart-empty')) {
            body.textContent = '';
            var sk = el('div', 'cart-loading');
            for (var k = 0; k < Math.min(items.length, 3); k++) sk.appendChild(el('div', 'cart-skeleton'));
            body.appendChild(sk);
            foot.hidden = true;
        }
        var ids = items.map(function (i) { return i.id; }).join(',');
        fetch('/api/carrito/productos?ids=' + encodeURIComponent(ids), { headers: { 'Accept': 'application/json' } })
            .then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); })
            .then(function (list) {
                if (token !== renderToken) return;
                cache = {};
                list.forEach(function (p) { cache[p.id] = p; });
                // limpiar productos que ya no existen
                var before = items.length;
                items = items.filter(function (i) { return cache[i.id]; });
                if (items.length !== before) { save(items); updateBadge(); }
                paint(list, token);
            })
            .catch(function () {
                if (token !== renderToken) return;
                body.textContent = '';
                body.appendChild(el('p', 'cart-empty__text', 'No pudimos cargar el carrito. Revisá tu conexión e intentá de nuevo.'));
                foot.hidden = true;
            });
    }

    function paint() {
        body.textContent = '';
        if (!items.length) {
            var empty = el('div', 'cart-empty');
            empty.appendChild(el('div', 'cart-empty__icon', '🛍️'));
            empty.appendChild(el('p', 'cart-empty__title', 'Tu carrito está vacío'));
            empty.appendChild(el('p', 'cart-empty__text', 'Agregá productos y pedí todo junto por WhatsApp.'));
            var go = el('a', 'btn-add-cart', 'Ver catálogo'); go.href = '/cart';
            empty.appendChild(go);
            body.appendChild(empty);
            foot.hidden = true;
            return;
        }

        var totales = {}, hayDisponibles = false;
        var ul = el('ul', 'cart-list');
        items.forEach(function (it) {
            var p = cache[it.id]; if (!p) return;
            var sinStock = p.stock < 1;
            var qty = sinStock ? it.qty : Math.min(it.qty, p.stock);
            if (!sinStock && qty !== it.qty) { it.qty = qty; save(items); updateBadge(); } // sincronizar con el stock real
            if (!sinStock) {
                hayDisponibles = true;
                totales[p.moneda] = (totales[p.moneda] || 0) + p.precio_final * qty;
            }

            var li = el('li', 'cart-item' + (sinStock ? ' is-out' : ''));
            var imgWrap = el('a', 'cart-item__img'); imgWrap.href = '/product/' + p.id;
            var img = el('img'); img.src = p.img || '/imgs/logo.jpg'; img.alt = ''; img.decoding = 'async';
            imgWrap.appendChild(img);

            var info = el('div', 'cart-item__info');
            var parts = String(p.name).split('/').map(function (s) { return s.trim(); }).filter(Boolean);
            var t = el('a', 'cart-item__title', parts[0] || p.name); t.href = '/product/' + p.id;
            info.appendChild(t);
            var sub = parts.slice(1);
            if (p.bateria) sub.push('🔋 ' + p.bateria + '%');
            if (sub.length) info.appendChild(el('div', 'cart-item__sub', sub.join(' · ')));

            if (sinStock) {
                info.appendChild(el('div', 'cart-item__warn', 'Sin stock por el momento'));
            } else {
                var price = el('div', 'cart-item__price', money(p.precio_final, p.moneda));
                if (p.precio_final < p.price) price.appendChild(el('s', null, money(p.price, p.moneda)));
                info.appendChild(price);
                if (p.stock <= 2) info.appendChild(el('div', 'cart-item__warn', p.stock === 1 ? 'Última unidad' : 'Quedan ' + p.stock));
            }

            var ctr = el('div', 'cart-item__ctrl');
            if (!sinStock) {
                var stepper = el('div', 'qty');
                var minus = el('button', null, '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Menos');
                var val = el('span', null, String(qty));
                var plus = el('button', null, '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Más');
                minus.addEventListener('click', function () { setQty(p.id, qty - 1); });
                plus.addEventListener('click', function () { setQty(p.id, qty + 1); });
                stepper.appendChild(minus); stepper.appendChild(val); stepper.appendChild(plus);
                ctr.appendChild(stepper);
            }
            var rm = el('button', 'cart-item__rm', 'Quitar'); rm.type = 'button';
            rm.addEventListener('click', function () { remove(p.id); });
            ctr.appendChild(rm);

            li.appendChild(imgWrap); li.appendChild(info); li.appendChild(ctr);
            ul.appendChild(li);
        });
        body.appendChild(ul);

        totalsEl.textContent = '';
        var monedas = Object.keys(totales);
        monedas.forEach(function (m) {
            var row = el('div', 'cart-total');
            row.appendChild(el('span', null, monedas.length > 1 ? 'Total en ' + m : 'Total'));
            row.appendChild(el('strong', null, money(totales[m], m)));
            totalsEl.appendChild(row);
        });
        btnCheckout.disabled = !hayDisponibles;
        foot.hidden = false;
    }

    // ---------- checkout por WhatsApp ----------
    function checkout() {
        var disponibles = items.filter(function (i) { return cache[i.id] && cache[i.id].stock > 0; });
        if (!disponibles.length) return;
        var nombre = (nombreInput.value || '').trim();
        try { localStorage.setItem(NAME_KEY, nombre); } catch (e) { }

        btnCheckout.disabled = true;
        var original = btnCheckout.lastChild.textContent;
        btnCheckout.lastChild.textContent = ' Armando tu pedido…';

        fetch('/carrito/whatsapp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ items: disponibles, nombre: nombre })
        })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (res) {
                if (!res.ok || !res.d.url) throw new Error(res.d && res.d.error || 'error');
                if (typeof window.fbq === 'function') { try { window.fbq('track', 'Contact'); } catch (e) { } }
                window.location.href = res.d.url;
            })
            .catch(function (e) {
                showToast(e && e.message && e.message !== 'error' ? e.message : 'No se pudo armar el pedido. Probá de nuevo.');
                render();
            })
            .then(function () {
                btnCheckout.lastChild.textContent = original;
                btnCheckout.disabled = false;
            });
    }

    // ---------- eventos ----------
    document.addEventListener('click', function (e) {
        var btn = e.target.closest && e.target.closest('[data-add-to-cart]');
        if (!btn || btn.disabled) return;
        e.preventDefault(); e.stopPropagation();
        var id = parseInt(btn.getAttribute('data-id'));
        if (id > 0) add(id, (btn.getAttribute('data-name') || '').split('/')[0].trim());
    }, true);

    fab.addEventListener('click', openDrawer);
    overlay.addEventListener('click', closeDrawer);
    $('cart-close').addEventListener('click', closeDrawer);
    $('cart-clear').addEventListener('click', clear);
    btnCheckout.addEventListener('click', checkout);
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen()) closeDrawer();
    });
    // sincronizar entre pestañas
    window.addEventListener('storage', function (e) {
        if (e.key === KEY) { items = load(); updateBadge(); if (isOpen()) render(); }
    });

    try { nombreInput.value = localStorage.getItem(NAME_KEY) || ''; } catch (e) { }
    updateBadge();
})();
