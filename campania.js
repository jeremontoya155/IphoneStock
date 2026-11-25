// Campaña (Black Friday u otra): una oferta general + cómo se muestra en la tienda.
// El descuento vive en ofertas_generales; la apariencia, en configuracion (clave 'campania').

// Una oferta general solo corre entre sus fechas, en hora argentina.
const AHORA_AR = "(NOW() AT TIME ZONE 'America/Argentina/Buenos_Aires')";
const SQL_GENERAL_VIGENTE = `SELECT g.*, (SELECT valor FROM configuracion WHERE clave = 'campania') AS campania_cfg
    FROM ofertas_generales g
    WHERE activo = TRUE AND ${AHORA_AR} BETWEEN fecha_inicio AND fecha_fin
    ORDER BY created_at DESC LIMIT 1`;

// El modelo es lo que va antes de la primera barra: "IPHONE 15 PRO / 256GB / NEGRO"
const modelo = nombre => String(nombre || '').split('/')[0].trim().toUpperCase();

// Reglas de la campaña, solo si pertenecen a esta oferta
function reglas(oferta) {
    let cfg = {};
    try { cfg = JSON.parse(oferta.campania_cfg || '{}'); } catch (e) { }
    return String(cfg.oferta_id) === String(oferta.id) ? cfg : {};
}

// Porcentaje que le toca a un producto: el de su grupo, o el general.
function descuento(oferta, product) {
    const cfg = reglas(oferta);
    // Precio escrito a mano: se expresa como porcentaje exacto, así el resto de la tienda calcula igual.
    // Si no tiene precio, o ya cuesta menos que eso, no hay oferta.
    if (cfg.modo === 'precio') {
        const nuevo = cfg.precios && Object.prototype.hasOwnProperty.call(cfg.precios, product.id) ? Number(cfg.precios[product.id]) : 0;
        const actual = Number(product.price);
        return nuevo > 0 && nuevo < actual ? (1 - nuevo / actual) * 100 : 0;
    }
    const clave = cfg.agrupar === 'categoria' ? String(product.categoria_id || 0)
        : cfg.agrupar === 'modelo' ? modelo(product.name) : null;
    if (clave !== null && cfg.porGrupo && Object.prototype.hasOwnProperty.call(cfg.porGrupo, clave)) return cfg.porGrupo[clave];
    return oferta.valor_descuento;
}

// ¿El producto entra en la oferta? (elegido a mano, si corresponde, y su grupo no quedó sin descuento)
function incluye(oferta, product) {
    const cfg = reglas(oferta);
    if (cfg.productos && cfg.productos.length && !cfg.productos.includes(Number(product.id))) return false;
    return Number(descuento(oferta, product)) > 0;
}

const VISTAS = ['primero', 'solo', 'normal'];
const DEFAULTS = {
    oferta_id: null,
    productos: [],      // vacío = todos
    modo: 'porcentaje', // 'porcentaje' | 'precio'
    precios: {},        // { idProducto: precio de oferta }
    agrupar: 'no',      // 'no' | 'categoria' | 'modelo'
    porGrupo: {},       // { grupo: porcentaje }, 0 = sin descuento
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

module.exports = { SQL_GENERAL_VIGENTE, incluye, descuento, VISTAS, DEFAULTS, leer, guardar, vigente, ordenar };
