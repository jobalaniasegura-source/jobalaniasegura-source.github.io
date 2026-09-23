// ============================================================
// JZAC ERP - UI: vista app, navegacion y ayudantes
// ============================================================
const NAV = [
  { ruta: 'dashboard',    label: 'Inicio',        mod: 'dashboard' },
  { ruta: 'ventas',       label: 'Ventas',        mod: 'ventas' },
  { ruta: 'inventario',   label: 'Inventario',    mod: 'inventario' },
  { ruta: 'clientes',     label: 'Clientes',      mod: 'clientes' },
  { ruta: 'fiados',       label: 'Fiados',        mod: 'fiados' },
  { ruta: 'proveedores',  label: 'Proveedores',   mod: 'proveedores' },
  { ruta: 'gastos',       label: 'Gastos',        mod: 'gastos' },
  { ruta: 'reportes',     label: 'Reportes',      mod: 'reportes' },
  { ruta: 'config',       label: 'Configuración', mod: 'config' }
];

const ui = {
  esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),

  dinero: (n) => {
    const v = Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return 'S/ ' + v;
  },

  n: (n) => { const nn = Number(n || 0); return Number.isInteger(nn) ? String(nn) : String(nn).replace('.', ','); },

  fh: (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  },

  fe: (ms) => {
    if (!ms) return '—';
    const d = new Date(ms);
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  },

  hoyRango: () => {
    const d = new Date();
    const ini = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return { desde: ini.getTime(), hasta: ini.getTime() + 86400000 - 1 };
  },

  fechaInput: (ms) => {
    const d = new Date(ms || Date.now());
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  fechaDesdeInput: (val) => {
    const m = String(val || '').split('-').map(Number);
    if (m.length !== 3 || m.some((x) => isNaN(x))) return null;
    return new Date(m[0], m[1] - 1, m[2]).getTime();
  },

  toast: (msg, tipo) => {
    const c = document.getElementById('toast');
    const el = document.createElement('div');
    el.className = 'toast-item ' + (tipo || '');
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => el.remove(), 3000);
  },

  modal(html, pie, amplio) {
    const raiz = document.getElementById('modal-root');
    raiz.innerHTML = `
      <div class="modal-fondo">
        <div class="modal ${amplio ? 'amplio' : ''}">
          ${html}
          ${pie ? `<div class="modal-pie">${pie}</div>` : ''}
        </div>
      </div>`;
    const fondo = raiz.firstElementChild;
    const cerrar = () => { raiz.innerHTML = ''; };
    fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(); });
    raiz.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', cerrar));
    return { cerrar, raiz };
  },

  confirmar(msg, titulo) {
    return new Promise((resolve) => {
      const m = ui.modal(
        `<div class="modal-hdr"><h3>${titulo || 'Confirmar'}</h3><button class="cierre" data-cerrar>×</button></div>
         <p>${msg}</p>`,
        `<button class="btn btn-suave" data-cerrar>Cancelar</button>
         <button class="btn btn-peligro" id="conf-ok">Sí, continuar</button>`
      );
      m.raiz.querySelector('#conf-ok').addEventListener('click', () => { m.cerrar(); resolve(true); });
      m.raiz.querySelector('[data-cerrar]').addEventListener('click', () => resolve(false));
      // resolver false si cierra por fondo
      const f = m.raiz.querySelector('.modal-fondo');
      f.addEventListener('click', (e) => { if (e.target === f) resolve(false); });
    });
  },

  vacio: (icono, msg, extra) =>
    `<div class="vacio"><div class="big">${icono}</div><div>${msg}</div>${extra || ''}</div>`
};

// ---------- rutas ----------
function rutaActual() {
  const h = (location.hash || '#/dashboard').replace(/^#\/?/, '');
  return h.split('/')[0] || 'dashboard';
}

function ir(ruta) {
  location.hash = '#/' + ruta;
}

// ---------- shell ----------
async function mostrarApp(usuario) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app">
      <nav class="nav" id="nav">
        <div class="nav-brand">
          <img src="./icons/icono.svg" alt="JZAC">
          <div>JZAC ERP<small>${ui.esc(usuario.nombreNegocio)}</small></div>
        </div>
        ${NAV.map((it) => `<a href="#/${it.ruta}" data-ruta="${it.ruta}">${ui.esc(it.label)}</a>`).join('')}
        <a href="#" data-salir style="margin-top:14px;color:#F87171;">Cerrar sesión</a>
      </nav>
      <div class="main">
        <div class="topbar">
          <button class="btn btn-sm btn-menu" id="btn-menu">☰</button>
          <h2 id="titulo-mod">Inicio</h2>
          <div class="topbar-user"><b>${ui.esc(usuario.nombre)}</b></div>
        </div>
        <div id="trial-banner" style="display:none"></div>
        <div class="contenido" id="contenido"></div>
      </div>
    </div>`;

  const est = JZAC.lic.estado();
  if (est.tipo === 'prueba') {
    const b = document.getElementById('trial-banner');
    b.style.display = 'block';
    b.className = 'trial-bar';
    b.innerHTML = `
      <div>Prueba gratuita en curso: quedan <span class="rojo">${est.diasRestantes} día(s)</span></div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-sm" id="act-banner">Activar licencia</button>
      </div>`;
    b.querySelector('#act-banner').addEventListener('click', () => JZAC.mostrarEstadoLicencia());
  }

  const nav = document.getElementById('nav');
  document.getElementById('btn-menu').addEventListener('click', () => nav.classList.toggle('abierto'));
  nav.querySelectorAll('a[data-ruta]').forEach((a) => {
    a.addEventListener('click', () => nav.classList.remove('abierto'));
  });
  nav.querySelector('[data-salir]').addEventListener('click', (e) => {
    e.preventDefault();
    JZAC.auth.borrarSesion();
    location.reload();
  });

  cargarModulo();
  window.addEventListener('hashchange', cargarModulo);
}

function cargarModulo() {
  const ruta = rutaActual();
  const nav = NAV.find((x) => x.ruta === ruta);
  if (!nav) { location.hash = '#/dashboard'; return; }
  document.querySelectorAll('.nav a[data-ruta]').forEach((a) => {
    a.classList.toggle('active', a.dataset.ruta === ruta);
  });
  document.getElementById('titulo-mod').textContent = nav.label;
  const cont = document.getElementById('contenido');
  cont.scrollTop = 0;
  window.scrollTo(0, 0);
  const mod = JZAC.modulos[nav.mod];
  mod.render(cont);
}

window.JZAC = window.JZAC || {};
window.JZAC.ui = ui;
window.JZAC.ir = ir;
window.JZAC.rutaSeg = () => (location.hash || '#/dashboard').replace(/^#\/?/, '').split('/');
window.JZAC.mostrarApp = mostrarApp;
window.JZAC.cargarModulo = cargarModulo;

document.addEventListener('focusin', (e) => {
  const t = e.target;
  if (t && t.matches && t.matches('input[type=number]') && t.value !== '') {
    t.select();
  }
  // Lector USB: en la pantalla de caja, si el foco cae en un botón o en el
  // fondo (no en un campo editable ni dentro de un modal), volver al escáner
  // para que el código escaneado no se "teclee" en otro control.
  const escapable = () => {
    if (!e.target || !e.target.matches) return;
    const esc = document.getElementById('scan-rapido');
    const ruta = (window.JZAC && JZAC.rutaSeg) ? JZAC.rutaSeg() : [];
    if (!esc || ruta[0] !== 'ventas') return;
    if (e.target.closest('input, select, textarea')) return;
    if (document.querySelector('#modal-root .modal-fondo')) return;
    if (esc.getRootNode().activeElement !== esc) esc.focus();
  };
  escapable();
});
// Algunos clics (ej. sobre un div) hacen blur del escáner sin disparar
// 'focusin' en el nuevo elemento; lo devolvemos con 'focusout'.
// Nota: en el instante del 'focusout', 'activeElement' aún no muestra el
// destino, por eso la comprobación se hace dentro del requestAnimationFrame.
document.addEventListener('focusout', (e) => {
  if (!e.target || e.target.id !== 'scan-rapido') return;
  if ((window.JZAC && JZAC.rutaSeg ? JZAC.rutaSeg() : [])[0] !== 'ventas') return;
  if (document.querySelector('#modal-root .modal-fondo')) return;
  window.requestAnimationFrame(() => {
    const esc = document.getElementById('scan-rapido');
    if (!esc) return;
    if (document.querySelector('#modal-root .modal-fondo')) return;
    const a = document.activeElement;
    if (a && a.closest && a.closest('input, select, textarea') && a !== esc) return;
    esc.focus();
  });
}, true);
window.JZAC.negocio = {
  nombreNorm: (n) => String(n || '').trim().replace(/\s+/g, ' ').toUpperCase(),
  nombreClave: (n) => String(n || '').trim().toLowerCase().replace(/\s+/g, ' '),
  imprimir: () => { try { window.print(); } catch (e) { ui.toast('No se pudo imprimir', 'mal'); } },
  wha: (texto) => {
    window.open('https://wa.me/51929068219?text=' + encodeURIComponent(texto), '_blank');
  }
};

// Impresión confiable desde la web: usa un iframe oculto, sin ventanas
// emergentes (no las bloquea el navegador) y sin abrir pestañas.
window.JZAC.ui.imprimirHTML = function (html, cssDoc) {
  let f = document.getElementById('jzac-iframe-imp');
  if (!f) {
    f = document.createElement('iframe');
    f.id = 'jzac-iframe-imp';
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(f);
  }
  try {
    const doc = f.contentDocument;
    doc.open();
    doc.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Impresión JZAC</title><style>' + (cssDoc || '') + '</style></head><body>' + html + '</body></html>');
    doc.close();
    f.contentWindow.focus();
    setTimeout(() => { try { f.contentWindow.print(); } catch (e) { ui.toast('No se pudo imprimir. Revisa la impresora.', 'mal'); } }, 250);
  } catch (e) {
    ui.toast('No se pudo imprimir. Revisa la impresora.', 'mal');
  }
};