// Campaña (Black Friday u otra): una oferta general + cómo se muestra en la tienda.
// El descuento vive en ofertas_generales; la apariencia, en configuracion (clave 'campania').

// Una oferta general solo corre entre sus fechas, en hora argentina.
const AHORA_AR = "(NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')";
const SQL_GENERAL_VIGENTE = `SELECT g.*, (SELECT valor FROM configuracion WHERE clave = 'campania') AS campania_cfg
    FROM ofertas_generales g
    WHERE activo = TRUE AND ${AHORA_AR} BETWEEN fecha_inicio AND fecha_fin
    ORDER BY created_at DESC LIMIT 1`;

// Si la campaña es de equipos elegidos a mano, la oferta corre solo para esos.
function incluye(oferta, productId) {
    let cfg = {};
    try { cfg = JSON.parse(oferta.campania_cfg || '{}'); } catch (e) { }
    if (String(cfg.oferta_id) !== String(oferta.id) || !cfg.productos || !cfg.productos.length) return true;
    return cfg.productos.includes(Number(productId));
}

const VISTAS = ['primero', 'solo', 'normal'];
const DEFAULTS = {
    oferta_id: null,
    productos: [],      // vacío = todos
    vista: 'primero',
    inicio: true,
    aviso: true,
    titulo: 'BLACK FRIDAY',
    mensaje: 'Precios especiales por tiempo limitado en equipos seleccionados.',
    boton: 'Ver ofertas'
};

async function leer(pool) {
    const r = await pool.query("SELECT valor FROM configuracion WHERE clave = 'campania'");
    if (!r.rows.length) return { ...DEFAULTS };
    try { return { ...DEFAULTS, ...JSON.parse(r.rows[0].valor) }; } catch (e) { return { ...DEFAULTS }; }
}

async function guardar(pool, datos) {
    await pool.query(
        "INSERT INTO configuracion (clave, valor, updated_at) VALUES ('campania', $1, NOW()) ON CONFLICT (clave) DO UPDATE SET valor = $1, updated_at = NOW()",
        [JSON.stringify(datos)]
    );
}

// Campaña que se está mostrando AHORA en la tienda, o null.
async function vigente(pool) {
    const config = await leer(pool);
    if (!config.oferta_id) return null;
    const oferta = (await pool.query(SQL_GENERAL_VIGENTE)).rows[0];
    if (!oferta || String(oferta.id) !== String(config.oferta_id)) return null;
    return { ...config, nombre: oferta.nombre };
}

// Productos con oferta primero (o solo ellos). Respeta el orden original dentro de cada grupo.
function ordenar(products, campania, verTodo) {
    if (!campania || campania.vista === 'normal') return products;
    const con = products.filter(p => p.tiene_oferta_vigente);
    if (campania.vista === 'solo' && !verTodo) return con;
    return con.concat(products.filter(p => !p.tiene_oferta_vigente));
}

module.exports = { SQL_GENERAL_VIGENTE, incluye, VISTAS, DEFAULTS, leer, guardar, vigente, ordenar };
