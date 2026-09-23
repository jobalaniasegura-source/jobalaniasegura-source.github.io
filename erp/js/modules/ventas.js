// ============================================================
// JZAC ERP - Ventas (registrar, listar, anular, boleta)
// ============================================================
(function () {
  async function guardarVenta(u, items, cliente, metodo, descuento, extra) {
    extra = extra || {};
    const esFactura = !!extra.factura;
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
        const numero = Number(user[esFactura ? 'correlativoFactura' : 'correlativoBoleta'] || 1000);
        user[esFactura ? 'correlativoFactura' : 'correlativoBoleta'] = numero + 1;
        us.put(user);
        const serie = esFactura ? (user.serieFactura || 'F001') : (user.serieBoleta || 'B001');
        const sub = items.reduce((a, it) => a + Number(it.precio) * Number(it.cantidad), 0);
        const total = Math.max(0, sub - Number(descuento || 0));
        const venta = {
          serie,
          numero,
          boleta: serie + '-' + String(numero).padStart(8, '0'),
          esFactura,
          cliente: cliente || '',
          metodoPago: metodo,
          recibido: extra.recibido ? Math.round(Number(extra.recibido) * 100) / 100 : null,
          vuelto: extra.vuelto != null ? Math.round(Number(extra.vuelto) * 100) / 100 : null,
          pagoEfectivo: extra.pagoEfectivo != null ? Math.round(Number(extra.pagoEfectivo) * 100) / 100 : null,
          pagoSaldo: extra.pagoSaldo != null ? Math.round(Number(extra.pagoSaldo) * 100) / 100 : null,
          metodo2: extra.metodo2 || null,
          ruc: extra.ruc || '',
          razonSocial: extra.razonSocial || '',
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
              total: Number(it.precio) * Number(it.cantidad),
              esPeso: !!it.esPeso
            });
            const gp = ps.get(it.productoId);
            gp.onsuccess = () => {
              const p = gp.result;
              if (p) { p.stock = Math.max(0, Number(p.stock) - Number(it.cantidad)); ps.put(p); }
            };
          });
          resultado = {
            ventaId,
            boleta: venta.boleta,
            total: venta.total,
            venta
          };
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

  // ---------- boleta termica (58mm) ----------
  const CSS_RECIBO = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Courier New', monospace; font-size: 11px; color: #000; }
    .rec { width: 58mm; margin: 0 auto; padding: 1mm 0; }
    .cen { text-align: center; }
    .sep { border-top: 1px dashed #000; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-weight: 700; border-bottom: 1px solid #000; }
    td, th { padding: 1px 0; }
    .r { text-align: right; }
    .sum { display: flex; justify-content: space-between; font-weight: 700; }
    .total { font-size: 13px; }
    @media print { @page { margin: 3mm; } }
  `;

  function crearBoletaHTML(u, v, det) {
    const c = (t) => `<div class="cen">${t}</div>`;
    const filas = det.map((d) =>
      `<tr><td>${JZAC.ui.esc(d.producto)}${Number(d.cantidad) > 1 ? ` x${JZAC.ui.n(d.cantidad)}${d.esPeso ? ' kg' : ''}` : (d.esPeso ? ` x${JZAC.ui.n(d.cantidad)} kg` : '')}</td><td class="r">${JZAC.ui.dinero(d.precio)}</td><td class="r">${JZAC.ui.dinero(d.total)}</td></tr>`
    ).join('');
    const tipo = v.esFactura ? 'FACTURA' : 'BOLETA';
    const pagos = [];
    if (v.metodoPago === 'Mixto' || (v.pagoEfectivo != null && v.pagoSaldo != null)) {
      pagos.push(`Efectivo: ${JZAC.ui.dinero(v.pagoEfectivo)}`);
      pagos.push(`${v.metodo2 || ''}: ${JZAC.ui.dinero(v.pagoSaldo)}`);
    } else {
      pagos.push((v.metodoPago || 'Efectivo'));
      if (v.recibido != null) { pagos.push(`Recibido: ${JZAC.ui.dinero(v.recibido)}`); }
      if (v.vuelto != null) { pagos.push(`Vuelto: ${JZAC.ui.dinero(v.vuelto)}`); }
    }
    return `
      <div class="rec">
        ${c(`<b>${JZAC.ui.esc(u.nombreNegocio || u.nombre)}</b>`)}
        ${c(JZAC.ui.esc(u.ruc ? 'RUC: ' + u.ruc : (u.nombre || '')))}
        ${c(JZAC.ui.fh(v.fecha))}
        <div class="sep"></div>
        ${c(`<b>${tipo} ${JZAC.ui.esc(v.boleta)}</b>`)}
        ${v.esFactura ? `${c('RUC: ' + JZAC.ui.esc(v.ruc || '—'))}${c('Razón social: ' + JZAC.ui.esc(v.razonSocial || v.cliente || '—'))}` : c('Cliente: ' + JZAC.ui.esc(v.cliente || '—'))}
        ${pagos.map((p) => c('Pago: ' + JZAC.ui.esc(p))).join('')}
        <div class="sep"></div>
        <table>
          <tr><th>Producto</th><th class="r">Pcio</th><th class="r">Sub</th></tr>
          ${filas}
        </table>
        <div class="sep"></div>
        <div class="sum"><span>Subtotal</span><span>${JZAC.ui.dinero(v.subtotal)}</span></div>
        ${v.descuento ? `<div class="sum"><span>Descuento</span><span>-${JZAC.ui.dinero(v.descuento)}</span></div>` : ''}
        <div class="sum total"><span>TOTAL</span><span>${JZAC.ui.dinero(v.total)}</span></div>
        <div class="sep"></div>
        ${c('¡Gracias por su compra!')}
        ${c('JZAC ERP · Software que trabaja por tu negocio')}
      </div>`;
  }

  function imprimirBoleta(u, v, det) {
    const w = window.open('', '_blank', 'width=420,height=600');
    if (!w) { JZAC.ui.toast('Permite las ventanas emergentes para imprimir la boleta.', 'mal'); return; }
    w.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Boleta ${JZAC.ui.esc(v.boleta)}</title><style>${CSS_RECIBO}</style></head><body>${crearBoletaHTML(u, v, det)}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { try { w.print(); } catch (e) { } }, 300);
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
      detalleModal(u, v, det);
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

  function detalleModal(u, v, det) {
    const filas = det.map((d) => `
      <tr><td>${JZAC.ui.esc(d.producto)}</td><td class="center">${JZAC.ui.n(d.cantidad)}${d.esPeso ? ' kg' : ''}</td><td class="monto">${JZAC.ui.dinero(d.precio)}</td><td class="monto">${JZAC.ui.dinero(d.total)}</td></tr>`).join('');
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>${v.esFactura ? 'Factura' : 'Boleta'} ${JZAC.ui.esc(v.boleta)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:10px">
        ${JZAC.ui.fh(v.fecha)} · ${v.esFactura ? JZAC.ui.esc((v.razonSocial || v.ruc || 'Sin cliente')) : JZAC.ui.esc(v.cliente || 'Sin cliente')} · <span class="badge badge-gris">${JZAC.ui.esc(v.metodoPago)}</span>
        ${v.esFactura && v.ruc ? `<div style="margin-top:4px">RUC: ${JZAC.ui.esc(v.ruc)}</div>` : ''}
      </div>
      <div class="tabla-wrap"><table>
        <tr><th>Producto</th><th class="center">Cant.</th><th class="monto">Precio</th><th class="monto">Total</th></tr>
        ${filas}
      </table></div>
      <div style="margin-top:12px">
        <div class="derecha">Subtotal: <b>${JZAC.ui.dinero(v.subtotal)}</b></div>
        ${v.descuento ? `<div class="derecha">Descuento: <b>−${JZAC.ui.dinero(v.descuento)}</b></div>` : ''}
        ${v.pagoEfectivo != null && v.pagoSaldo != null ? `<div class="derecha">Efectivo: <b>${JZAC.ui.dinero(v.pagoEfectivo)}</b> · ${JZAC.ui.esc(v.metodo2 || '')}: <b>${JZAC.ui.dinero(v.pagoSaldo)}</b></div>` : ''}
        ${v.recibido != null ? `<div class="derecha">Recibido: <b>${JZAC.ui.dinero(v.recibido)}</b> · Vuelto: <b>${JZAC.ui.dinero(v.vuelto)}</b></div>` : ''}
        <div class="derecha negrita" style="font-size:16px">TOTAL: ${JZAC.ui.dinero(v.total)}</div>
      </div>`,
      `<button class="btn" data-cerrar>Cerrar</button>
       <button class="btn btn-dorado" id="imprimir-boleta">Imprimir boleta</button>
       <button class="btn btn-whatsapp" id="wha-boleta">Enviar por WhatsApp</button>`,
      true);
    m.raiz.querySelector('#imprimir-boleta').addEventListener('click', () => imprimirBoleta(u, v, det));
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
    const metodos = ['Efectivo', 'Tarjeta', 'Yape', 'Plin', 'Transferencia', 'Mixto'];
    const metodos2 = ['Yape', 'Plin', 'Tarjeta', 'Transferencia'];

    const optionesMontaje = () => `
      <option value="">Busca y selecciona un producto...</option>
      ${productos.map((p) => `<option value="${p.id}">${JZAC.ui.esc(p.nombre)}${p.ventaPeso ? ' (por kg)' : ''} · S/ ${Number(p.precioVenta).toFixed(2)} · stock: ${JZAC.ui.n(p.stock)}</option>`).join('')}`;

    cont.innerHTML = `
      <button class="btn btn-sm" id="volver" style="margin-bottom:14px">← Volver a ventas</button>
      <div class="grid grid-2">
        <div class="card">
          <div class="seccion-titulo" style="margin-top:0">1 · Productos</div>
          <div class="scan-btn-fila" style="margin-bottom:13px">
            <div class="campo" style="margin-bottom:0">
              <label>Código / QR del producto</label>
              <input id="scan-rapido" placeholder="Escanea con el lector o escribe el código y Enter..." autocomplete="off" style="font-size:14px">
            </div>
            <button class="btn" id="escanear-venta" title="Escanear con la cámara del celular"> Escanear cámara</button>
          </div>
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
                <label id="lb-cant">Cantidad</label>
                <input type="number" id="in-cant" step="1" min="0" value="1">
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
              ${clientes.map((c) => `<option data-ruc="${JZAC.ui.esc(c.ruc || '')}" data-razon="${JZAC.ui.esc(c.razonSocial || '')}">${JZAC.ui.esc(c.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="campo" style="display:flex;align-items:center;gap:8px;margin-top:-2px">
            <input type="checkbox" id="chk-factura" style="width:18px;height:18px">
            <label for="chk-factura" style="margin:0">Emitir factura (con RUC)</label>
          </div>
          <div class="fila" id="panel-factura" style="display:none">
            <div class="campo"><label>RUC</label><input id="in-ruc" inputmode="numeric" maxlength="11" placeholder="Ej.: 20123456789"></div>
            <div class="campo"><label>Razón social</label><input id="in-razon" placeholder="Nombre o razón social"></div>
          </div>
          <div class="campo">
            <label>Método de pago</label>
            <select id="sel-metodo">${metodos.map((m) => `<option>${m}</option>`).join('')}</select>
          </div>
          <div class="campo" id="panel-efectivo" style="display:none">
            <label>Monto recibido (S/)</label>
            <input type="number" id="in-recibido" step="0.01" min="0" value="0">
            <div class="texto-suave" style="font-size:13px;margin-top:4px" id="txt-vuelto"></div>
          </div>
          <div id="panel-mixto" style="display:none">
            <div class="fila">
              <div class="campo"><label>Efectivo (S/)</label><input type="number" id="in-efectivo" step="0.01" min="0" value="0"></div>
              <div class="campo"><label>Saldo por</label><select id="sel-metodo2">${metodos2.map((m) => `<option>${m}</option>`).join('')}</select></div>
            </div>
            <div class="texto-suave" style="font-size:13px;margin-top:-6px" id="txt-saldo"></div>
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

    function totalVenta() {
      const sub = items.reduce((a, it) => a + it.precio * it.cantidad, 0);
      const dsc = Math.max(0, Number(document.getElementById('in-descuento').value || 0));
      return { sub, dsc, tot: Math.max(0, sub - dsc) };
    }

    function actualizaTot() {
      const { sub, tot } = totalVenta();
      document.getElementById('tot-sub').textContent = JZAC.ui.dinero(sub);
      document.getElementById('tot-final').textContent = JZAC.ui.dinero(tot);
      const metodo = document.getElementById('sel-metodo').value;
      if (metodo === 'Efectivo') {
        const inRec = document.getElementById('in-recibido');
        if (!recibidoManual) { inRec.value = tot; }
        const rec = Number(inRec.value || 0);
        const vuelto = Math.max(0, rec - tot);
        document.getElementById('txt-vuelto').textContent = (rec >= tot)
          ? `Vuelto: <b>${JZAC.ui.dinero(vuelto)}</b>`
          : `Falta: <b>${JZAC.ui.dinero(Math.max(0, tot - rec))}</b>`;
      } else if (metodo === 'Mixto') {
        const ef = Number(document.getElementById('in-efectivo').value || 0);
        const saldo = Math.max(0, tot - ef);
        document.getElementById('txt-saldo').textContent = `Saldo por ${document.getElementById('sel-metodo2').value}: <b>${JZAC.ui.dinero(saldo)}</b>`;
      }
    }

    function agregarItem(p, cant, precio) {
      const existente = items.find((it) => it.productoId === p.id);
      if (existente) { existente.cantidad = Number(existente.cantidad) + Number(cant); }
      else { items.push({ productoId: p.id, nombre: p.nombre, cantidad: Number(cant), precio, costo: Number(p.precioCompra || 0), esPeso: !!p.ventaPeso }); }
      pintaItems();
    }

    function pedirPeso(p, alAgregar) {
      const total = JZAC.ui.dinero(0);
      const m = JZAC.ui.modal(`
        <div class="modal-hdr"><h3>${JZAC.ui.esc(p.nombre)}</h3><button class="cierre" data-cerrar>×</button></div>
        <div class="campo">
          <label>Peso (kg)</label>
          <input type="number" id="peso-kg" step="0.001" min="0.001" value="1">
        </div>
        <div class="texto-suave" style="font-size:14px;margin:-4px 0 14px">Precio por kg: <b>${JZAC.ui.dinero(p.precioVenta)}</b> · Total: <b id="peso-total">${total}</b></div>`,
        `<button class="btn" data-cerrar>Cancelar</button>
         <button class="btn btn-primario" id="peso-ok">Añadir</button>`);
      const act = () => {
        const kg = Number(document.getElementById('peso-kg').value || 0);
        document.getElementById('peso-total').textContent = JZAC.ui.dinero(Number(p.precioVenta) * kg);
      };
      document.getElementById('peso-kg').addEventListener('input', act);
      m.raiz.querySelector('#peso-ok').addEventListener('click', () => {
        const kg = Number(document.getElementById('peso-kg').value || 0);
        if (kg <= 0) { JZAC.ui.toast('Escribe el peso en kg.', 'mal'); return; }
        if (kg > Number(p.stock || 0)) { JZAC.ui.toast(`Solo hay ${JZAC.ui.n(p.stock)} en stock.`, 'mal'); return; }
        m.cerrar();
        alAgregar(kg);
      });
      return m;
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
            <td>${JZAC.ui.esc(it.nombre)}${it.esPeso ? ' <span class="badge badge-azul">por kg</span>' : ''}</td>
            <td class="center">${it.esPeso ? JZAC.ui.n(it.cantidad) + ' kg' : JZAC.ui.n(it.cantidad)}</td>
            <td class="monto">${JZAC.ui.dinero(it.precio)}</td>
            <td class="monto">${JZAC.ui.dinero(it.precio * it.cantidad)}</td>
            <td class="derecha"><button class="btn btn-sm btn-peligro" data-quit="${i}">Quitar</button></td>
          </tr>`).join('')}
      </table></div>`;
      caja.querySelectorAll('[data-quit]').forEach((b) => b.addEventListener('click', () => {
        items.splice(Number(b.dataset.quit), 1);
        pintaItems();
      }));
      actualizaTot();
    }

    document.getElementById('volver').addEventListener('click', () => JZAC.ir('ventas'));

    const selProd = document.getElementById('sel-prod');
    const inPrecio = document.getElementById('in-precio');
    selProd.addEventListener('change', () => {
      const p = productos.find((x) => x.id === Number(selProd.value));
      if (p) {
        inPrecio.value = p.precioVenta;
        document.getElementById('lb-cant').textContent = p.ventaPeso ? 'Peso (kg)' : 'Cantidad';
        document.getElementById('in-cant').step = p.ventaPeso ? '0.001' : '1';
      }
    });

    document.getElementById('agregar-item').addEventListener('click', () => {
      const p = productos.find((x) => x.id === Number(selProd.value));
      if (!p) { JZAC.ui.toast('Selecciona un producto.', 'mal'); return; }
      if (p.ventaPeso) {
        pedirPeso(p, (kg) => {
          agregarItem(p, kg, Number(p.precioVenta));
          JZAC.ui.toast(`${p.nombre}: ${JZAC.ui.n(kg)} kg agregado.`, 'bien');
        });
        return;
      }
      const cant = Math.max(1, Number(document.getElementById('in-cant').value || 1));
      if (cant > Number(p.stock)) { JZAC.ui.toast(`Solo hay ${JZAC.ui.n(p.stock)} en stock.`, 'mal'); return; }
      const precio = Math.max(0, Number(inPrecio.value || 0)) || Number(p.precioVenta);
      agregarItem(p, cant, precio);
    });

    // ---------- lector de barras USB (escribe codigo + Enter) ----------
    const scanRapido = document.getElementById('scan-rapido');
    function agregaPorCodigo(texto, cantidadDefault) {
      const t = String(texto || '').trim();
      if (!t) return;
      const p = JZAC.productoPorCodigo(productos, t);
      if (!p) { JZAC.ui.toast(`Código no encontrado: ${t}`, 'mal'); return; }
      if (Number(p.stock) < 1) { JZAC.ui.toast(`${p.nombre}: sin stock.`, 'mal'); return; }
      if (p.ventaPeso) {
        pedirPeso(p, (kg) => {
          agregarItem(p, kg, Number(p.precioVenta));
          JZAC.ui.toast(`${p.nombre}: ${JZAC.ui.n(kg)} kg.`, 'bien');
          if (scanRapido) scanRapido.focus();
        });
        return;
      }
      agregarItem(p, cantidadDefault != null ? cantidadDefault : 1, Number(p.precioVenta));
      JZAC.ui.toast(`${p.nombre} +${cantidadDefault != null ? cantidadDefault : 1}`, 'bien');
    }
    if (scanRapido) {
      scanRapido.focus();
      scanRapido.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(timerScan);
          agregaPorCodigo(scanRapido.value);
          scanRapido.value = '';
        }
      });
      // el lector puede no terminar en Enter; agrega tras una pausa breve
      let timerScan = null;
      scanRapido.addEventListener('input', () => {
        clearTimeout(timerScan);
        timerScan = setTimeout(() => {
          const t = scanRapido.value.trim();
          if (t) { agregaPorCodigo(t); scanRapido.value = ''; }
        }, 220);
      });
    }

    document.getElementById('escanear-venta').addEventListener('click', async () => {
      const res = await JZAC.escanear({ titulo: 'Escanear producto' });
      if (!res || !res.texto) return;
      if (scanRapido) scanRapido.value = res.texto;
      agregaPorCodigo(res.texto);
    });

    // ---------- pago: efectivo / mixto / factura ----------
    const inDescuento = document.getElementById('in-descuento');
    inDescuento.addEventListener('input', actualizaTot);
    let recibidoManual = false;
    const inRecibido = document.getElementById('in-recibido');
    inRecibido.addEventListener('input', () => { recibidoManual = true; actualizaTot(); });
    document.getElementById('sel-metodo').addEventListener('change', () => {
      const m = document.getElementById('sel-metodo').value;
      document.getElementById('panel-efectivo').style.display = m === 'Efectivo' ? '' : 'none';
      document.getElementById('panel-mixto').style.display = m === 'Mixto' ? '' : 'none';
      if (m === 'Efectivo') { recibidoManual = false; }
      actualizaTot();
    });
    document.getElementById('in-efectivo').addEventListener('input', actualizaTot);
    document.getElementById('sel-metodo2').addEventListener('change', actualizaTot);
    document.getElementById('chk-factura').addEventListener('change', () => {
      document.getElementById('panel-factura').style.display = document.getElementById('chk-factura').checked ? '' : 'none';
    });
    document.getElementById('sel-cliente').addEventListener('change', () => {
      const op = document.getElementById('sel-cliente').selectedOptions[0];
      if (op && op.dataset.ruc) {
        document.getElementById('in-ruc').value = op.dataset.ruc;
        document.getElementById('in-razon').value = op.dataset.razon;
      }
    });

    function leeDocFiscal(docFiscal, cli, m, dsc) {
      const extra = {};
      if (m === 'Efectivo') {
        const rec = Number(document.getElementById('in-recibido').value || 0);
        if (rec < dsc.tot) { JZAC.ui.toast('El monto recibido cubre el total.', 'mal'); return null; }
        extra.recibido = rec;
        extra.vuelto = Math.max(0, rec - dsc.tot);
      } else if (m === 'Mixto') {
        const ef = Number(document.getElementById('in-efectivo').value || 0);
        if (ef >= dsc.tot) { JZAC.ui.toast('Si el efectivo cubre todo, usa Efectivo.', 'mal'); return null; }
        extra.pagoEfectivo = ef;
        extra.pagoSaldo = Math.max(0, dsc.tot - ef);
        extra.metodo2 = document.getElementById('sel-metodo2').value;
      }
      if (docFiscal) {
        const ruc = document.getElementById('in-ruc').value.trim();
        const razon = document.getElementById('in-razon').value.trim();
        if (!/^\d{11}$/.test(ruc)) { JZAC.ui.toast('RUC inválido: escribe 11 números.', 'mal'); return null; }
        if (!razon) { JZAC.ui.toast('Escribe la razón social.', 'mal'); return null; }
        extra.factura = true;
        extra.ruc = ruc;
        extra.razonSocial = razon;
      }
      return extra;
    }

    function etiquetaDoc(extra, vv) {
      return (extra && extra.factura) ? 'Factura' : 'Boleta';
    }

    document.getElementById('guardar-venta').addEventListener('click', async () => {
      const dsc = totalVenta();
      if (items.length === 0) { JZAC.ui.toast('Agrega al menos un producto.', 'mal'); return; }
      const cli = document.getElementById('sel-cliente').value;
      const metodo = document.getElementById('sel-metodo').value;
      const factura = document.getElementById('chk-factura').checked;
      const extra = leeDocFiscal(factura, cli, metodo, dsc);
      if (extra === null) return;
      const btn = document.getElementById('guardar-venta');
      btn.disabled = true;
      try {
        const res = await guardarVenta(u, items, cli, metodo, dsc.dsc, extra);
        const vv = {
          boleta: res.boleta,
          esFactura: !!extra.factura,
          ruc: extra.ruc || '',
          razonSocial: extra.razonSocial || '',
          fecha: Date.now(),
          cliente: cli,
          metodoPago: extra.factura ? metodo : (metodo === 'Mixto' ? `Mixto (Efectivo+${extra.metodo2})` : metodo),
          recibido: extra.recibido,
          vuelto: extra.vuelto,
          pagoEfectivo: extra.pagoEfectivo,
          pagoSaldo: extra.pagoSaldo,
          metodo2: extra.metodo2,
          subtotal: Math.round(dsc.sub * 100) / 100,
          descuento: Math.round(dsc.dsc * 100) / 100,
          total: res.total
        };
        const detP = items.map((it) => ({ producto: it.nombre, cantidad: it.cantidad, precio: it.precio, total: Math.round(it.precio * it.cantidad * 100) / 100, esPeso: it.esPeso }));
        const m = JZAC.ui.modal(
          `<div class="modal-hdr"><h3>Venta registrada</h3><button class="cierre" data-cerrar>×</button></div>
           <p style="margin:0">${etiquetaDoc(extra, vv)} <b>${JZAC.ui.esc(res.boleta)}</b><br>Total: <b style="font-size:18px">${JZAC.ui.dinero(res.total)}</b>${extra.vuelto != null ? `<br>Vuelto: <b>${JZAC.ui.dinero(extra.vuelto)}</b>` : ''}</p>`,
          `<button class="btn btn-primario" id="cont-luego">Continuar</button>
           <button class="btn btn-dorado" id="imp-ahora">Imprimir ${etiquetaDoc(extra, vv)}</button>`);
        m.raiz.querySelector('#imp-ahora').addEventListener('click', () => imprimirBoleta(u, vv, detP));
        m.raiz.querySelector('#cont-luego').addEventListener('click', () => { m.cerrar(); JZAC.ir('ventas'); });
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