// ============================================================
// JZAC ERP - Ventas (registrar, listar, anular, boleta)
// ============================================================
(function () {
  async function guardarVenta(u, items, cliente, metodo, descuento) {
    await DB.ready;
    return new Promise((resolve, reject) => {
      const t = DB.db.transaction(['usuarios', 'ventas', 'detalle_venta', 'productos'], 'readwrite');
      const us = t.objectStore('usuarios');
      const vs = t.objectStore('ventas');
      const ds = t.objectStore('detalle_venta');
      const ps = t.objectStore('productos');
      let resultado = null;
      const getU = us.get(u.id);
      getU.onsuccess = () => {
        const user = getU.result || u;
        const numero = Number(user.correlativoBoleta || 1000);
        user.correlativoBoleta = numero + 1;
        us.put(user);
        const sub = items.reduce((a, it) => a + Number(it.precio) * Number(it.cantidad), 0);
        const total = Math.max(0, sub - Number(descuento || 0));
        const venta = {
          serie: user.serieBoleta || 'B001',
          numero,
          boleta: (user.serieBoleta || 'B001') + '-' + String(numero).padStart(8, '0'),
          cliente: cliente || '',
          metodoPago: metodo,
          subtotal: Math.round(sub * 100) / 100,
          descuento: Math.round(Number(descuento || 0) * 100) / 100,
          total: Math.round(total * 100) / 100,
          fecha: Date.now()
        };
        vs.add(venta).onsuccess = (e) => {
          const ventaId = e.target.result;
          items.forEach((it) => {
            ds.add({
              ventaId,
              producto: it.nombre,
              cantidad: Number(it.cantidad),
              precio: Number(it.precio),
              costo: Number(it.costo),
              total: Number(it.precio) * Number(it.cantidad)
            });
            const gp = ps.get(it.productoId);
            gp.onsuccess = () => {
              const p = gp.result;
              if (p) { p.stock = Math.max(0, Number(p.stock) - Number(it.cantidad)); ps.put(p); }
            };
          });
          resultado = { ventaId, boleta: venta.boleta, total: venta.total };
        };
      };
      getU.onerror = () => reject(getU.error);
      t.onerror = () => reject(t.error);
      t.oncomplete = () => resolve(resultado);
    });
  }

  async function anularVenta(venta) {
    const productos = await JZAC.db.listar('productos');
    const dets = (await JZAC.db.listar('detalle_venta')).filter((d) => d.ventaId === venta.id);
    await DB.ready;
    return new Promise((resolve, reject) => {
      const t = DB.db.transaction(['ventas', 'detalle_venta', 'productos'], 'readwrite');
      const vs = t.objectStore('ventas');
      const ds = t.objectStore('detalle_venta');
      const ps = t.objectStore('productos');
      dets.forEach((d) => {
        ds.delete(d.id);
        const p = productos.find((x) => JZAC.negocio.nombreNorm(x.nombre) === JZAC.negocio.nombreNorm(d.producto));
        if (p) { p.stock = Number(p.stock || 0) + Number(d.cantidad); ps.put(p); }
      });
      vs.delete(venta.id);
      t.oncomplete = () => resolve(dets);
      t.onerror = () => reject(t.error);
    });
  }

  // ---------- vista: listado ----------
  async function vistaLista(cont, u) {
    const ventas = await JZAC.db.listar('ventas');
    const detv = await JZAC.db.listar('detalle_venta');
    ventas.sort((a, b) => b.fecha - a.fecha);
    const totales = {};
    detv.forEach((d) => { totales[d.ventaId] = (totales[d.ventaId] || 0) + Number(d.cantidad); });

    cont.innerHTML = `
      <div class="panel-hdr">
        <div>
          <div class="seccion-titulo" style="margin:0">Historial de ventas</div>
          <div class="texto-suave" style="font-size:13px">${ventas.length} venta(s) · Boleta ${JZAC.ui.esc(u.serieBoleta || 'B001')}</div>
        </div>
        <button class="btn btn-primario" id="nueva-venta">+ Nueva venta</button>
      </div>
      ${ventas.length === 0
        ? JZAC.ui.vacio('Registra tu primera venta', 'Aún no hay ventas registradas.')
        : `<div class="tabla-wrap"><table>
            <tr><th>Boleta</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Items</th><th class="monto">Total</th><th></th></tr>
            ${ventas.map((v) => `
              <tr>
                <td class="negrita">${JZAC.ui.esc(v.boleta)}</td>
                <td>${JZAC.ui.fh(v.fecha)}</td>
                <td>${JZAC.ui.esc(v.cliente || '—')}</td>
                <td><span class="badge badge-gris">${JZAC.ui.esc(v.metodoPago || 'Efectivo')}</span></td>
                <td>${totales[v.id] || 0}</td>
                <td class="monto">${JZAC.ui.dinero(v.total)}</td>
                <td>
                  <div class="acciones">
                    <button class="btn btn-sm" data-ver="${v.id}">Ver</button>
                    <button class="btn btn-sm btn-peligro" data-anular="${v.id}">Anular</button>
                  </div>
                </td>
              </tr>`).join('')}
          </table></div>`}`;

    document.getElementById('nueva-venta').addEventListener('click', () => JZAC.ir('ventas/nueva'));
    cont.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', async () => {
      const v = ventas.find((x) => x.id === Number(b.dataset.ver));
      const det = detv.filter((d) => d.ventaId === v.id);
      detalleModal(v, det);
    }));
    cont.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
      const v = ventas.find((x) => x.id === Number(b.dataset.anular));
      if (await JZAC.ui.confirmar(`¿Anular la boleta <b>${v.boleta}</b> por ${JZAC.ui.dinero(v.total)}? Se repondrá el stock.`)) {
        await anularVenta(v);
        JZAC.ui.toast('Venta anulada y stock repuesto.', 'bien');
        await vistaLista(cont, u);
      }
    }));
  }

  function detalleModal(v, det) {
    const filas = det.map((d) => `
      <tr><td>${JZAC.ui.esc(d.producto)}</td><td class="center">${JZAC.ui.n(d.cantidad)}</td><td class="monto">${JZAC.ui.dinero(d.precio)}</td><td class="monto">${JZAC.ui.dinero(d.total)}</td></tr>`).join('');
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Boleta ${JZAC.ui.esc(v.boleta)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:10px">
        ${JZAC.ui.fh(v.fecha)} · ${JZAC.ui.esc(v.cliente || 'Sin cliente')} · <span class="badge badge-gris">${JZAC.ui.esc(v.metodoPago)}</span>
      </div>
      <div class="tabla-wrap"><table>
        <tr><th>Producto</th><th class="center">Cant.</th><th class="monto">Precio</th><th class="monto">Total</th></tr>
        ${filas}
      </table></div>
      <div style="margin-top:12px">
        <div class="derecha">Subtotal: <b>${JZAC.ui.dinero(v.subtotal)}</b></div>
        ${v.descuento ? `<div class="derecha">Descuento: <b>−${JZAC.ui.dinero(v.descuento)}</b></div>` : ''}
        <div class="derecha negrita" style="font-size:16px">TOTAL: ${JZAC.ui.dinero(v.total)}</div>
      </div>`,
      `<button class="btn" data-cerrar>Cerrar</button>
       <button class="btn btn-whatsapp" id="wha-boleta">Enviar por WhatsApp</button>`,
      true);
    m.raiz.querySelector('#wha-boleta').addEventListener('click', () => {
      const lineas = det.map((d) => `${d.cantidad} × ${d.producto}: ${JZAC.ui.dinero(d.total)}`).join('\n');
      JZAC.negocio.wha(`BOLETA ${v.boleta}\nFecha: ${JZAC.ui.fh(v.fecha)}\nCliente: ${v.cliente || '—'}\n\n${lineas}\n\nTOTAL: ${JZAC.ui.dinero(v.total)}\nGracias por su compra.`);
    });
    m.raiz.querySelector('[data-cerrar]').addEventListener('click', m.cerrar);
  }

  // ---------- vista: nueva venta ----------
  async function vistaNueva(cont, u) {
    const productos = await JZAC.db.listar('productos');
    const clientes = await JZAC.db.listar('clientes');
    let items = [];
    const metodos = ['Efectivo', 'Tarjeta', 'Yape', 'Plin', 'Transferencia'];

    const optionesMontaje = () => `
      <option value="">Busca y selecciona un producto...</option>
      ${productos.map((p) => `<option value="${p.id}">${JZAC.ui.esc(p.nombre)} · S/ ${Number(p.precioVenta).toFixed(2)} · stock: ${JZAC.ui.n(p.stock)}</option>`).join('')}`;

    cont.innerHTML = `
      <button class="btn btn-sm" id="volver" style="margin-bottom:14px">← Volver a ventas</button>
      <div class="grid grid-2">
        <div class="card">
          <div class="seccion-titulo" style="margin-top:0">1 · Productos</div>
          <div class="fila">
            <div class="campo">
              <label>Producto</label>
              <select id="sel-prod">${optionesMontaje()}</select>
            </div>
            <div class="campo">
              <label>Precio unit. (S/)</label>
              <input type="number" id="in-precio" step="0.01" min="0" value="0">
            </div>
          </div>
          <div class="fila">
            <div class="campo" style="display:flex;align-items:flex-end;gap:8px">
              <div style="flex:1">
                <label>Cantidad</label>
                <input type="number" id="in-cant" step="1" min="1" value="1">
              </div>
              <button class="btn btn-primario" id="agregar-item">Agregar</button>
            </div>
          </div>
          <div id="lista-items"></div>
        </div>
        <div class="card">
          <div class="seccion-titulo" style="margin-top:0">2 · Cliente y pago</div>
          <div class="campo">
            <label>Cliente</label>
            <select id="sel-cliente">
              <option value="">Sin cliente</option>
              ${clientes.map((c) => `<option>${JZAC.ui.esc(c.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="campo">
            <label>Método de pago</label>
            <select id="sel-metodo">${metodos.map((m) => `<option>${m}</option>`).join('')}</select>
          </div>
          <div class="campo">
            <label>Descuento (S/)</label>
            <input type="number" id="in-descuento" step="0.01" min="0" value="0">
          </div>
          <div class="card" style="background:var(--bg);border:none">
            <div class="derecha" style="font-size:14px">Subtotal: <b id="tot-sub">${JZAC.ui.dinero(0)}</b></div>
            <div class="derecha negrita" style="font-size:22px;margin-top:4px" id="tot-final">${JZAC.ui.dinero(0)}</div>
          </div>
          <button class="btn btn-primario btn-bloco" id="guardar-venta">Registrar venta</button>
        </div>
      </div>`;

    function actualizaTot() {
      const sub = items.reduce((a, it) => a + it.precio * it.cantidad, 0);
      const dsc = Math.max(0, Number(document.getElementById('in-descuento').value || 0));
      document.getElementById('tot-sub').textContent = JZAC.ui.dinero(sub);
      document.getElementById('tot-final').textContent = JZAC.ui.dinero(Math.max(0, sub - dsc));
    }

    function pintaItems() {
      const caja = document.getElementById('lista-items');
      if (items.length === 0) {
        caja.innerHTML = JZAC.ui.vacio('Aún sin productos', 'Agrega productos a la venta.');
        actualizaTot(); return;
      }
      caja.innerHTML = `<div class="tabla-wrap"><table>
        <tr><th>Producto</th><th class="center">Cant.</th><th class="monto">Pcio</th><th class="monto">Total</th><th></th></tr>
        ${items.map((it, i) => `
          <tr>
            <td>${JZAC.ui.esc(it.nombre)}</td>
            <td class="center">${JZAC.ui.n(it.cantidad)}</td>
            <td class="monto">${JZAC.ui.dinero(it.precio)}</td>
            <td class="monto">${JZAC.ui.dinero(it.precio * it.cantidad)}</td>
            <td class="derecha"><button class="btn btn-sm btn-peligro" data-quit="${i}">Quitar</button></td>
          </tr>`).join('')}
      </table></div>`;
      caja.querySelectorAll('[data-quit]').forEach((b) => b.addEventListener('click', () => {
        items.splice(Number(b.dataset.quit), 1);
        pintaItems();
      }));
    }

    document.getElementById('volver').addEventListener('click', () => JZAC.ir('ventas'));

    const selProd = document.getElementById('sel-prod');
    const inPrecio = document.getElementById('in-precio');
    selProd.addEventListener('change', () => {
      const p = productos.find((x) => x.id === Number(selProd.value));
      if (p) { inPrecio.value = p.precioVenta; }
    });

    document.getElementById('agregar-item').addEventListener('click', () => {
      const p = productos.find((x) => x.id === Number(selProd.value));
      if (!p) { JZAC.ui.toast('Selecciona un producto.', 'mal'); return; }
      const cant = Math.max(1, Number(document.getElementById('in-cant').value || 1));
      if (cant > Number(p.stock)) { JZAC.ui.toast(`Solo hay ${JZAC.ui.n(p.stock)} en stock.`, 'mal'); return; }
      const precio = Math.max(0, Number(inPrecio.value || 0)) || Number(p.precioVenta);
      const existente = items.find((it) => it.productoId === p.id);
      if (existente) { existente.cantidad += cant; }
      else {
        items.push({ productoId: p.id, nombre: p.nombre, cantidad: cant, precio, costo: Number(p.precioCompra || 0) });
      }
      pintaItems();
    });

    document.getElementById('in-descuento').addEventListener('input', actualizaTot);

    document.getElementById('guardar-venta').addEventListener('click', async () => {
      if (items.length === 0) { JZAC.ui.toast('Agrega al menos un producto.', 'mal'); return; }
      const cli = document.getElementById('sel-cliente').value;
      const metodo = document.getElementById('sel-metodo').value;
      const dsc = Number(document.getElementById('in-descuento').value || 0);
      const btn = document.getElementById('guardar-venta');
      btn.disabled = true;
      try {
        const res = await guardarVenta(u, items, cli, metodo, dsc);
        JZAC.ui.toast(`Venta registrada: ${res.boleta} · ${JZAC.ui.dinero(res.total)}`, 'bien');
        JZAC.ir('ventas');
      } catch (e) {
        JZAC.ui.toast('Error al guardar la venta.', 'mal');
        console.error(e);
        btn.disabled = false;
      }
    });
  }

  function render(cont) {
    const seg = JZAC.rutaSeg();
    if (seg[1] === 'nueva') {
      JZAC.auth.usuarioActual().then((u) => vistaNueva(cont, u)).catch(() => JZAC.ui.toast('Debes iniciar sesión.', 'mal'));
    } else {
      JZAC.auth.usuarioActual().then((u) => vistaLista(cont, u));
    }
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.ventas = { render };
})();