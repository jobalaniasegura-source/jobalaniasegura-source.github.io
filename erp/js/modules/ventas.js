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

  // ---------- boleta termica (58mm / 80mm) ----------
  function cssRecibo(ancho) {
    const es80 = ancho === '80';
    const mm = es80 ? '80mm' : '58mm';
    return `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Courier New', monospace; font-size: ${es80 ? '12px' : '11px'}; color: #000; }
    .rec { width: ${es80 ? '76mm' : '58mm'}; margin: 0 auto; padding: 1mm 0; }
    .cen { text-align: center; }
    .sep { border-top: 1px dashed #000; margin: 2px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-weight: 700; border-bottom: 1px solid #000; }
    td, th { padding: 1px 0; }
    .r { text-align: right; }
    .sum { display: flex; justify-content: space-between; font-weight: 700; }
    .total { font-size: 13px; }
    @media print { @page { size: ${mm} auto; margin: 3mm; } }
  `;
  }
  function getAnchoBoleta() {
    return localStorage.getItem('jzac_ancho_boleta') === '80' ? '80' : '58';
  }

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
    JZAC.ui.imprimirHTML(crearBoletaHTML(u, v, det), cssRecibo(getAnchoBoleta()));
  }

  // ---------- notas de credito / devoluciones ----------
  function crearNotaHTML(u, n, dn) {
    const c = (t) => `<div class="cen">${t}</div>`;
    const filas = dn.map((d) =>
      `<tr><td>${JZAC.ui.esc(d.producto)} x${JZAC.ui.n(d.cantidad)}${d.esPeso ? ' kg' : ''}</td><td class="r">${JZAC.ui.dinero(d.precio)}</td><td class="r">${JZAC.ui.dinero(Number(d.cantidad) * Number(d.precio))}</td></tr>`
    ).join('');
    return `
      <div class="rec">
        ${c(`<b>${JZAC.ui.esc(u.nombreNegocio || u.nombre)}</b>`)}
        ${c(JZAC.ui.esc(u.ruc ? 'RUC: ' + u.ruc : (u.nombre || '')))}
        ${c(JZAC.ui.fh(n.fecha))}
        <div class="sep"></div>
        ${c(`<b>NOTA DE CRÉDITO ${JZAC.ui.esc(n.nota)}</b>`)}
        ${c(n.esFactura ? ('RUC: ' + JZAC.ui.esc(n.ruc || '—')) : ('Cliente: ' + JZAC.ui.esc(n.cliente || '—')))}
        ${c('Boleta de referencia: ' + JZAC.ui.esc(n.boletaRef))}
        ${c('Motivo: ' + JZAC.ui.esc(n.motivo || '—'))}
        <div class="sep"></div>
        <table>
          <tr><th>Producto</th><th class="r">Pcio</th><th class="r">Sub</th></tr>
          ${filas}
        </table>
        <div class="sep"></div>
        <div class="sum total"><span>TOTAL DEVUELTO</span><span>${JZAC.ui.dinero(n.total)}</span></div>
        <div class="sep"></div>
        ${c('Nota de crédito · JZAC ERP')}
      </div>`;
  }

  function imprimirNota(u, n, dn) {
    JZAC.ui.imprimirHTML(crearNotaHTML(u, n, dn), cssRecibo(getAnchoBoleta()));
  }

  // Recompone el stock y crea la nota NC-XXXXXXXX de la devolucion.
  async function registrarDevolucion(u, v, det, motivo) {
    const productos = await JZAC.db.listar('productos');
    await DB.ready;
    return new Promise((resolve, reject) => {
      const t = DB.db.transaction(['usuarios', 'notas_credito', 'detalle_nota', 'productos'], 'readwrite');
      const us = t.objectStore('usuarios');
      const ns = t.objectStore('notas_credito');
      const nds = t.objectStore('detalle_nota');
      const ps = t.objectStore('productos');
      let nota = null;
      const getU = us.get(u.id);
      getU.onsuccess = () => {
        const user = getU.result || u;
        const serie = user.serieNota || 'NC001';
        const numero = Number(user.correlativoNota || 1000);
        user.correlativoNota = numero + 1;
        us.put(user);
        const total = Math.round(det.reduce((a, d) => a + Number(d.cantidad) * Number(d.precio), 0) * 100) / 100;
        nota = {
          serie, numero,
          nota: serie + '-' + String(numero).padStart(8, '0'),
          boletaRef: v.boleta, esFactura: !!v.esFactura,
          cliente: v.cliente || '', ruc: v.ruc || '', razonSocial: v.razonSocial || '',
          motivo: (motivo || '').trim(), total, fecha: Date.now()
        };
        ns.add(nota).onsuccess = (e) => {
          nota.id = e.target.result;
          det.forEach((d) => {
            nds.add({
              notaId: nota.id, producto: d.producto, cantidad: Number(d.cantidad),
              precio: Number(d.precio), total: Math.round(Number(d.cantidad) * Number(d.precio) * 100) / 100,
              esPeso: !!d.esPeso
            });
            const p = productos.find((x) => JZAC.negocio.nombreNorm(x.nombre) === JZAC.negocio.nombreNorm(d.producto));
            if (p) { p.stock = Math.round((Number(p.stock || 0) + Number(d.cantidad)) * 100) / 100; ps.put(p); }
          });
        };
      };
      getU.onerror = () => reject(getU.error);
      t.onerror = () => reject(t.error);
      t.oncomplete = () => resolve(nota);
    });
  }

  // Cantidades aun devolvibles por producto dentro de una boleta.
  async function quedanPorDevolver(v, det) {
    const notas = (await JZAC.db.listar('notas_credito')).filter((n) => n.boletaRef === v.boleta);
    const dnAll = await JZAC.db.listar('detalle_nota');
    const ids = new Set(notas.map((n) => n.id));
    const devuelto = {};
    dnAll.filter((d) => ids.has(d.notaId)).forEach((d) => {
      const k = JZAC.negocio.nombreNorm(d.producto);
      devuelto[k] = (devuelto[k] || 0) + Number(d.cantidad);
    });
    return det.map((d) => ({
      d,
      max: Math.max(0, Math.round((Number(d.cantidad) - (devuelto[JZAC.negocio.nombreNorm(d.producto)] || 0)) * 100) / 100)
    }));
  }

  async function modalDevolucion(u, v, det) {
    const quedo = (await quedanPorDevolver(v, det)).filter((q) => q.max > 0);
    if (quedo.length === 0) { JZAC.ui.toast('Esta boleta ya fue devuelta por completo.', 'mal'); return; }
    const motivos = ['Cliente no satisfecho', 'Producto dañado', 'Error en la venta', 'Otro motivo'];
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Devolución de ${JZAC.ui.esc(v.boleta)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:10px">Marca cuánto devuelves. El stock se repondrá y se imprimirá una nota de crédito.</div>
      <div class="tabla-wrap-devol"><table>
        <tr><th>Producto</th><th class="center">Devuelves</th><th class="center">Máx</th><th class="monto">Total</th></tr>
        ${quedo.map((q, i) => `
          <tr data-q="${i}">
            <td>${JZAC.ui.esc(q.d.producto)}${q.d.esPeso ? ' <span class="badge badge-azul">kg</span>' : ''}</td>
            <td class="center"><input type="number" min="0" step="${q.d.esPeso ? '0.001' : '1'}" max="${q.max}" value="0" class="dev-q" data-i="${i}" style="width:80px"></td>
            <td class="center">${JZAC.ui.n(q.max)}</td>
            <td class="monto" id="dev-tot-${i}">${JZAC.ui.dinero(0)}</td>
          </tr>`).join('')}
      </table></div>
      <div class="campo" style="margin-top:12px">
        <label>Motivo</label>
        <select id="dev-motivo">${motivos.map((mo) => `<option>${mo}</option>`).join('')}</select>
      </div>
      <div class="derecha negrita mt16" style="font-size:16px">TOTAL A DEVOLVER: <span id="dev-total">${JZAC.ui.dinero(0)}</span></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="dev-ok">Registrar devolución</button>`);

    const act = () => {
      let total = 0;
      quedo.forEach((q, i) => {
        const inp = m.raiz.querySelector(`.dev-q[data-i="${i}"]`);
        let val = Math.min(Number(q.max), Math.max(0, Number(inp.value || 0)));
        inp.value = Math.round(val * 1000) / 1000;
        document.getElementById(`dev-tot-${i}`).textContent = JZAC.ui.dinero(val * Number(q.d.precio));
        total += val * Number(q.d.precio);
      });
      document.getElementById('dev-total').textContent = JZAC.ui.dinero(total);
    };
    m.raiz.querySelectorAll('.dev-q').forEach((inp) => inp.addEventListener('input', act));
    m.raiz.querySelector('#dev-ok').addEventListener('click', async () => {
      const motivo = document.getElementById('dev-motivo').value;
      const devolucion = [];
      quedo.forEach((q, i) => {
        const val = Number(m.raiz.querySelector(`.dev-q[data-i="${i}"]`).value || 0);
        if (val > 0) devolucion.push({ producto: q.d.producto, cantidad: val, precio: Number(q.d.precio), esPeso: !!q.d.esPeso });
      });
      if (devolucion.length === 0) { JZAC.ui.toast('Indica cuánto quieres devolver.', 'mal'); return; }
      if (!await JZAC.ui.confirmar(`¿Registrar la devolución por <b>${JZAC.ui.dinero(devolucion.reduce((a, d) => a + d.cantidad * d.precio, 0))}</b>? Se repondrá el stock.`, 'Confirmar devolución')) return;
      try {
        const n = await registrarDevolucion(u, v, devolucion, motivo);
        JZAC.ui.toast(`Nota ${n.nota} registrada y stock repuesto.`, 'bien');
        m.cerrar();
        const m2 = JZAC.ui.modal(
          `<div class="modal-hdr"><h3>Devolución registrada</h3><button class="cierre" data-cerrar>×</button></div>
           <p style="margin:0">Nota de crédito <b>${JZAC.ui.esc(n.nota)}</b><br>Total devuelto: <b style="font-size:18px">${JZAC.ui.dinero(n.total)}</b><br>El stock se repuso automáticamente.</p>`,
          `<button class="btn btn-primario" id="dev-cont">Continuar</button>
           <button class="btn btn-dorado" id="dev-imp">Imprimir nota</button>`);
        m2.raiz.querySelector('#dev-imp').addEventListener('click', () => imprimirNota(u, n, devolucion));
        m2.raiz.querySelector('#dev-cont').addEventListener('click', m2.cerrar);
      } catch (e) { JZAC.ui.toast('Error al registrar la devolución.', 'mal'); console.error(e); }
    });
    m.raiz.querySelector('[data-cerrar]').addEventListener('click', m.cerrar);
  }

  // ---------- vista: notas de credito ----------
  async function vistaNotas(cont, u) {
    const notas = (await JZAC.db.listar('notas_credito')).sort((a, b) => b.fecha - a.fecha);
    const dnAll = await JZAC.db.listar('detalle_nota');
    const dnBy = {};
    dnAll.forEach((d) => { (dnBy[d.notaId] = dnBy[d.notaId] || []).push(d); });

    cont.innerHTML = `
      <button class="btn btn-sm" id="volver-vtas" style="margin-bottom:14px">← Volver a ventas</button>
      <div class="panel-hdr">
        <div><div class="seccion-titulo" style="margin:0">Notas de crédito</div>
        <div class="texto-suave" style="font-size:13px">${notas.length} nota(s) · Devoluciones sobre boletas ya emitidas</div></div>
      </div>
      ${notas.length === 0
        ? JZAC.ui.vacio('Sin notas de crédito', 'Cuando devuelvas productos de una venta se genera una nota aquí.')
        : `<div class="tabla-wrap"><table>
            <tr><th>Nota</th><th>Boleta</th><th>Fecha</th><th>Motivo</th><th class="monto">Total</th><th></th></tr>
            ${notas.map((n) => `
              <tr>
                <td class="negrita">${JZAC.ui.esc(n.nota)}</td>
                <td>${JZAC.ui.esc(n.boletaRef)}</td>
                <td>${JZAC.ui.fh(n.fecha)}</td>
                <td>${JZAC.ui.esc(n.motivo || '—')}</td>
                <td class="monto">${JZAC.ui.dinero(n.total)}</td>
                <td><div class="acciones">
                  <button class="btn btn-sm" data-ver="${n.id}">Ver</button>
                  <button class="btn btn-sm btn-dorado" data-imp="${n.id}">Imprimir</button>
                </div></td>
              </tr>`).join('')}
          </table></div>`}`;

    document.getElementById('volver-vtas').addEventListener('click', () => JZAC.ir('ventas'));
    cont.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => {
      const n = notas.find((x) => x.id === Number(b.dataset.ver));
      JZAC.ui.modal(`
        <div class="modal-hdr"><h3>Nota ${JZAC.ui.esc(n.nota)}</h3><button class="cierre" data-cerrar>×</button></div>
        <div class="texto-suave" style="margin-bottom:10px">${JZAC.ui.fh(n.fecha)} · Boleta ${JZAC.ui.esc(n.boletaRef)} · <b>${JZAC.ui.esc(n.motivo || '—')}</b></div>
        <div class="tabla-wrap"><table>
          <tr><th>Producto</th><th class="center">Cant.</th><th class="monto">Precio</th><th class="monto">Total</th></tr>
          ${(dnBy[n.id] || []).map((d) => `<tr><td>${JZAC.ui.esc(d.producto)}</td><td class="center">${JZAC.ui.n(d.cantidad)}${d.esPeso ? ' kg' : ''}</td><td class="monto">${JZAC.ui.dinero(d.precio)}</td><td class="monto">${JZAC.ui.dinero(d.total)}</td></tr>`).join('')}
        </table></div>
        <div class="derecha negrita mt16" style="font-size:16px">TOTAL DEVUELTO: ${JZAC.ui.dinero(n.total)}</div>`,
        `<button class="btn" data-cerrar>Cerrar</button>
         <button class="btn btn-dorado" id="ver-imp">Imprimir nota</button>`);
    }));
    cont.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', () => {
      const n = notas.find((x) => x.id === Number(b.dataset.imp));
      imprimirNota(u, n, dnBy[n.id] || []);
    }));
  }

  // ---------- vista: listado ----------
  async function vistaLista(cont, u) {
    const ventasAll = await JZAC.db.listar('ventas');
    const detAll = await JZAC.db.listar('detalle_venta');
    ventasAll.sort((a, b) => b.fecha - a.fecha);
    const detvByVenta = {};
    detAll.forEach((d) => { (detvByVenta[d.ventaId] = detvByVenta[d.ventaId] || []).push(d); });
    const totales = {};
    detAll.forEach((d) => { totales[d.ventaId] = (totales[d.ventaId] || 0) + Number(d.cantidad); });

    cont.innerHTML = `
      <div class="panel-hdr">
        <div>
          <div class="seccion-titulo" style="margin:0">Historial de ventas</div>
          <div class="texto-suave" style="font-size:13px" id="lbl-resumen"></div>
        </div>
        <button class="btn btn-dorado" id="notas-btn" title="Devoluciones y notas de crédito">Notas de crédito</button>
        <button class="btn btn-primario" id="nueva-venta">+ Nueva venta</button>
      </div>
      <div class="card mt16">
        <div class="fila" style="align-items:flex-end">
          <div class="campo" style="flex:2;min-width:150px">
            <label>Buscar</label>
            <input id="filtro-ventas" placeholder="Boleta, cliente, RUC, producto...">
          </div>
          <div class="campo"><label>Desde</label><input type="date" id="fecha-desde"></div>
          <div class="campo"><label>Hasta</label><input type="date" id="fecha-hasta"></div>
          <div class="campo"><button class="btn btn-sm" id="limpiar-filtro">Limpiar</button></div>
        </div>
      </div>
      <div id="tabla-ventas"></div>`;

    document.getElementById('nueva-venta').addEventListener('click', () => JZAC.ir('ventas/nueva'));
    document.getElementById('notas-btn').addEventListener('click', () => JZAC.ir('ventas/notas'));

    function pintaTabla() {
      const q = document.getElementById('filtro-ventas').value.trim().toLowerCase();
      const d0 = document.getElementById('fecha-desde').value;
      const d1 = document.getElementById('fecha-hasta').value;
      const desde = d0 ? new Date(d0 + 'T00:00:00').getTime() : null;
      const hasta = d1 ? new Date(d1 + 'T23:59:59.999').getTime() : null;
      const ventas = ventasAll.filter((v) => {
        if (desde != null && v.fecha < desde) return false;
        if (hasta != null && v.fecha > hasta) return false;
        if (!q) return true;
        if (String(v.boleta).toLowerCase().includes(q)) return true;
        if (String(v.cliente || '').toLowerCase().includes(q)) return true;
        if (String(v.ruc || '').toLowerCase().includes(q)) return true;
        if (String(v.razonSocial || '').toLowerCase().includes(q)) return true;
        if (String(v.metodoPago || '').toLowerCase().includes(q)) return true;
        const det = detvByVenta[v.id];
        return !!(det && det.some((d) => String(d.producto).toLowerCase().includes(q)));
      });
      document.getElementById('lbl-resumen').textContent =
        `${ventas.length} de ${ventasAll.length} venta(s) · Boleta ${JZAC.ui.esc(u.serieBoleta || 'B001')} · Factura ${JZAC.ui.esc(u.serieFactura || 'F001')}`;
      document.getElementById('tabla-ventas').innerHTML = ventas.length === 0
        ? JZAC.ui.vacio(q || desde || hasta ? 'Sin resultados' : 'Registra tu primera venta',
            q || desde || hasta ? 'Ninguna venta coincide con la búsqueda o el rango de fechas.' : 'Aún no hay ventas registradas.')
        : `<div class="tabla-wrap"><table>
            <tr><th>Boleta</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th>Items</th><th class="monto">Total</th><th></th></tr>
            ${ventas.map((v) => `
              <tr>
                <td class="negrita">${JZAC.ui.esc(v.boleta)}</td>
                <td>${JZAC.ui.fh(v.fecha)}</td>
                <td>${JZAC.ui.esc(v.esFactura ? (v.razonSocial || v.ruc || v.cliente || '—') : (v.cliente || '—'))}</td>
                <td><span class="badge badge-gris">${JZAC.ui.esc(v.metodoPago || 'Efectivo')}</span></td>
                <td>${totales[v.id] || 0}</td>
                <td class="monto">${JZAC.ui.dinero(v.total)}</td>
                <td>
                  <div class="acciones">
                    <button class="btn btn-sm" data-ver="${v.id}">Ver</button>
                    <button class="btn btn-sm btn-dorado" data-reimp="${v.id}" title="Reimprimir boleta/factura">Imprimir</button>
                    <button class="btn btn-sm btn-peligro" data-anular="${v.id}">Anular</button>
                  </div>
                </td>
              </tr>`).join('')}
          </table></div>`;
      cont.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => {
        const v = ventas.find((x) => x.id === Number(b.dataset.ver));
        detalleModal(u, v, detvByVenta[v.id] || []);
      }));
      cont.querySelectorAll('[data-reimp]').forEach((b) => b.addEventListener('click', () => {
        const v = ventas.find((x) => x.id === Number(b.dataset.reimp));
        imprimirBoleta(u, v, detvByVenta[v.id] || []);
      }));
      cont.querySelectorAll('[data-anular]').forEach((b) => b.addEventListener('click', async () => {
        const v = ventas.find((x) => x.id === Number(b.dataset.anular));
        if (await JZAC.ui.confirmar(`¿Anular la boleta <b>${v.boleta}</b> por ${JZAC.ui.dinero(v.total)}? Se repondrá el stock.`)) {
          await anularVenta(v);
          JZAC.ui.toast('Venta anulada y stock repuesto.', 'bien');
          const i1 = ventas.indexOf(v); if (i1 > -1) ventas.splice(i1, 1);
          const i2 = ventasAll.indexOf(v); if (i2 > -1) ventasAll.splice(i2, 1);
          delete detvByVenta[v.id];
          pintaTabla();
        }
      }));
    }

    document.getElementById('filtro-ventas').addEventListener('input', pintaTabla);
    document.getElementById('fecha-desde').addEventListener('change', pintaTabla);
    document.getElementById('fecha-hasta').addEventListener('change', pintaTabla);
    document.getElementById('limpiar-filtro').addEventListener('click', () => {
      document.getElementById('filtro-ventas').value = '';
      document.getElementById('fecha-desde').value = '';
      document.getElementById('fecha-hasta').value = '';
      pintaTabla();
    });
    pintaTabla();
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
       <button class="btn btn-whatsapp" id="wha-boleta">Enviar por WhatsApp</button>
       <button class="btn btn-dorado" id="imprimir-boleta">Imprimir boleta</button>
       <button class="btn btn-primario" id="devolver">Devolución / nota de crédito</button>`,
      true);
    m.raiz.querySelector('#imprimir-boleta').addEventListener('click', () => imprimirBoleta(u, v, det));
    m.raiz.querySelector('#devolver').addEventListener('click', () => modalDevolucion(u, v, det));
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
    let ultimaAgregacion = 0;
    let pendienteCobro = null;
    const metodos = ['Efectivo', 'Tarjeta', 'Yape', 'Plin', 'Transferencia', 'Mixto'];
    const metodos2 = ['Yape', 'Plin', 'Tarjeta', 'Transferencia'];

    // Más vendidos del último mes + última venta (para repetirla rápido).
    const ventasAll = await JZAC.db.listar('ventas');
    const detAll = await JZAC.db.listar('detalle_venta');
    const fechaVenta = {};
    ventasAll.forEach((v) => { fechaVenta[v.id] = v.fecha || 0; });
    const limiteMes = Date.now() - 30 * 24 * 3600 * 1000;
    const conteo = {};
    detAll.forEach((d) => {
      if ((fechaVenta[d.ventaId] || 0) >= limiteMes) {
        const k = JZAC.negocio.nombreNorm(d.producto);
        conteo[k] = (conteo[k] || 0) + Number(d.cantidad);
      }
    });
    const topSell = Object.keys(conteo)
      .map((k) => ({ k, cant: conteo[k] }))
      .sort((a, b) => b.cant - a.cant)
      .slice(0, 6)
      .map((t) => productos.find((p) => JZAC.negocio.nombreNorm(p.nombre) === t.k))
      .filter(Boolean);
    ventasAll.sort((a, b) => b.fecha - a.fecha);
    const últimaVenta = ventasAll[0];
    const detUltima = últimaVenta ? detAll.filter((d) => d.ventaId === últimaVenta.id) : [];

    const optionesMontaje = () => {
      const opts = productos.map((p) => `<option value="${p.id}">${JZAC.ui.esc(p.nombre)}${p.ventaPeso ? ' (por kg)' : ''}${p.codigo || p.barra ? ` · ${JZAC.ui.esc(p.codigo || p.barra)}` : ''} · S/ ${Number(p.precioVenta).toFixed(2)} · stock: ${JZAC.ui.n(p.stock)}</option>`).join('');
      return `<option value="">Busca y selecciona un producto...</option>${opts}`;
    };
    const opcionesDatalist = () => productos.map((p) =>
      `<option value="${JZAC.ui.esc(p.codigo || p.barra || p.nombre)}">${JZAC.ui.esc(p.nombre)} · S/ ${JZAC.ui.dinero(p.precioVenta)} · stock ${JZAC.ui.n(p.stock)}${p.ventaPeso ? ' (por kg)' : ''}</option>`
    ).join('');

    cont.innerHTML = `
      <button class="btn btn-sm" id="volver" style="margin-bottom:14px">← Volver a ventas</button>
      <div class="grid grid-2">
        <div class="card">
          <div class="seccion-titulo" style="margin-top:0">1 · Productos</div>
          <div id="mas-vendidos" class="mas-vendidos" style="${topSell.length ? '' : 'display:none'}"></div>
          <button class="btn btn-sm" id="repetir-ultima" style="${detUltima.length ? '' : 'display:none'};margin-bottom:12px;border:1px dashed var(--dorado)" title="Vuelve a cargar los productos de la última venta">↻ Repetir última venta</button>
          <div class="scan-btn-fila" style="margin-bottom:13px">
            <div class="campo" style="margin-bottom:0">
              <label>Código / nombre del producto</label>
              <input id="scan-rapido" list="dl-prod" placeholder="Escanea, escribe el código o el nombre y Enter..." autocomplete="off" style="font-size:14px">
              <datalist id="dl-prod"></datalist>
              <div id="preview-prod" class="preview-prod"></div>
            </div>
            <button class="btn" id="escanear-venta" title="Escanear con la cámara del celular"> Escanear cámara</button>
          </div>
          <div id="grilla-venta" style="margin-bottom:14px"></div>
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
            <div class="monto-rapido" style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap">
              <button type="button" class="btn btn-sm" data-monto="exacto" title="Usar el total exacto">Exacto</button>
              <button type="button" class="btn btn-sm" data-monto="20">S/ 20</button>
              <button type="button" class="btn btn-sm" data-monto="50">S/ 50</button>
              <button type="button" class="btn btn-sm" data-monto="100">S/ 100</button>
              <button type="button" class="btn btn-sm" data-monto="200">S/ 200</button>
            </div>
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
          <div style="display:flex;gap:8px">
            <button class="btn btn-bloco" id="btn-gasto" title="Registrar un gasto sin salir de la caja (luz, pasaje, reposición...)">Gasto</button>
            <button class="btn btn-primario btn-bloco" style="flex:2" id="guardar-venta">Registrar venta</button>
          </div>
        </div>
      </div>`;

    function modalGastoRapido() {
      const cats = ['Compra', 'Servicios', 'Transporte', 'Alquiler', 'Varios'];
      const m = JZAC.ui.modal(`
        <div class="modal-hdr"><h3>Gasto rápido</h3><button class="cierre" data-cerrar>×</button></div>
        <div class="texto-suave" style="font-size:13px;margin-bottom:10px">Registra el gasto sin dejar la caja. Elige el monto y la categoría.</div>
        <div class="campo"><label>Monto (S/)</label>
          <div class="monto-rapido" style="display:flex;gap:6px;flex-wrap:wrap">
            <button type="button" class="btn btn-sm" data-mg="5">S/ 5</button>
            <button type="button" class="btn btn-sm" data-mg="10">S/ 10</button>
            <button type="button" class="btn btn-sm" data-mg="20">S/ 20</button>
            <button type="button" class="btn btn-sm" data-mg="50">S/ 50</button>
            <button type="button" class="btn btn-sm" data-mg="100">S/ 100</button>
          </div>
          <input type="number" id="mg-monto" step="0.01" min="0" placeholder="o escribe el monto" style="margin-top:8px">
        </div>
        <div class="fila">
          <div class="campo"><label>Categoría</label>
            <select id="mg-cat">${cats.map((c) => `<option>${c}</option>`).join('')}</select>
          </div>
          <div class="campo"><label>Concepto</label><input id="mg-concepto" placeholder="Ej. Luz, pasaje..." value="Gasto rápido"></div>
        </div>`,
        `<button class="btn" data-cerrar>Cancelar</button>
         <button class="btn btn-primario" id="guardar-gasto-r">Guardar gasto</button>`);

      m.raiz.querySelectorAll('[data-mg]').forEach((b) => b.addEventListener('click', () => {
        document.getElementById('mg-monto').value = b.dataset.mg;
      }));
      m.raiz.querySelector('#guardar-gasto-r').addEventListener('click', async () => {
        const monto = Number(document.getElementById('mg-monto').value || 0);
        if (monto <= 0) { JZAC.ui.toast('Ingresa el monto del gasto.', 'mal'); return; }
        const concepto = document.getElementById('mg-concepto').value.trim() || 'Gasto rápido';
        await JZAC.db.guardar('gastos', {
          concepto,
          monto: Math.round(monto * 100) / 100,
          categoria: document.getElementById('mg-cat').value,
          fecha: Date.now()
        });
        JZAC.ui.toast(`Gasto de ${JZAC.ui.dinero(monto)} registrado.`, 'bien');
        m.cerrar();
      });
    }

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
      const nuevo = Number(cant);
      pendienteCobro = null;
      const existente = items.find((it) => it.productoId === p.id);
      const total = Number(existente ? existente.cantidad : 0) + nuevo;
      if (total > Number(p.stock || 0) + 0.0001) {
        JZAC.ui.toast(`${p.nombre}: solo quedan ${JZAC.ui.n(p.stock)} en stock.`, 'mal');
        return false;
      }
      ultimaAgregacion = Date.now();
      if (existente) { existente.cantidad = Math.round(total * 1000) / 1000; }
      else { items.push({ productoId: p.id, nombre: p.nombre, cantidad: nuevo, precio, costo: Number(p.precioCompra || 0), esPeso: !!p.ventaPeso }); }
      pintaItems();
      return true;
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
      if (!p) return;
      inPrecio.value = p.precioVenta;
      document.getElementById('lb-cant').textContent = p.ventaPeso ? 'Peso (kg)' : 'Cantidad';
      document.getElementById('in-cant').step = p.ventaPeso ? '0.001' : '1';
      // Al elegir un producto se rellena el campo con su código de barras.
      if (scanRapido) {
        scanRapido.value = p.codigo || p.barra || '';
        if (p.codigo || p.barra) muestraPreview(p);
      }
    });

    document.getElementById('agregar-item').addEventListener('click', () => {
      const p = productos.find((x) => x.id === Number(selProd.value));
      if (!p) { JZAC.ui.toast('Selecciona un producto.', 'mal'); return; }
      const limpiaScan = () => { if (scanRapido) { scanRapido.value = ''; scanRapido.focus(); } };
      if (p.ventaPeso) {
        pedirPeso(p, (kg) => {
          agregarItem(p, kg, Number(p.precioVenta));
          JZAC.ui.toast(`${p.nombre}: ${JZAC.ui.n(kg)} kg agregado.`, 'bien');
          limpiaScan();
        });
        return;
      }
      const cant = Math.max(1, Number(document.getElementById('in-cant').value || 1));
      if (cant > Number(p.stock)) { JZAC.ui.toast(`Solo hay ${JZAC.ui.n(p.stock)} en stock.`, 'mal'); return; }
      const precio = Math.max(0, Number(inPrecio.value || 0)) || Number(p.precioVenta);
      if (agregarItem(p, cant, precio)) limpiaScan();
    });

    // ---------- entrada rápida: escanear, escribir código o nombre ----------
    const scanRapido = document.getElementById('scan-rapido');
    const dlProd = document.getElementById('dl-prod');
    const previewProd = document.getElementById('preview-prod');

    function muestraPreview(p) {
      if (!previewProd) return;
      if (!p) { previewProd.innerHTML = ''; return; }
      const rest = Math.max(0, Number(p.stock || 0));
      const alerta = rest <= Number(p.stockMin || 0);
      previewProd.innerHTML =
        `${p.foto ? `<img src="${p.foto}" alt="" class="gp-foto-mini">` : ''}<b>${JZAC.ui.esc(p.nombre)}</b>${p.ventaPeso ? ' <span class="badge badge-azul">por kg</span>' : ''} · ${JZAC.ui.dinero(p.precioVenta)} · stock: <b class="${alerta ? 'txt-rojo' : ''}">${JZAC.ui.n(rest)}</b> ${alerta ? '<span class="badge badge-rojo">¡bajo!</span>' : ''}`;
    }

    // "3=código" · "2x código" · "10 *código" → agrega esa cantidad.
    function extraeCantidad(texto) {
      const m = String(texto || '').match(/^(\d{1,3})\s*[=*xX:]\s*(.+)$/);
      return m ? { cant: Math.max(1, Number(m[1])), resto: m[2].trim() } : null;
    }

    function encuentraProducto(texto) {
      const t = String(texto || '').trim();
      if (!t) return null;
      const porCodigo = JZAC.productoPorCodigo(productos, t);
      if (porCodigo) return porCodigo;
      return productos.find((p) => JZAC.negocio.nombreNorm(p.nombre) === JZAC.negocio.nombreNorm(t)) || null;
    }

    // agrega a la venta. devuelve true si se agregó.
    function agregaEntrada(texto, cantidadFija) {
      const t = String(texto || '').trim();
      if (!t) return false;
      const qty = extraeCantidad(t);
      const buscar = qty ? qty.resto : t;
      const cant = qty ? qty.cant : (cantidadFija != null ? cantidadFija : 1);
      const p = encuentraProducto(buscar);
      if (!p) { JZAC.ui.toast(`No encontré: ${t}`, 'mal'); return false; }
      if (Number(p.stock) < 1) { JZAC.ui.toast(`${p.nombre}: sin stock.`, 'mal'); return false; }
      if (p.ventaPeso) {
        pedirPeso(p, (kg) => {
          agregarItem(p, kg, Number(p.precioVenta));
          JZAC.ui.toast(`${p.nombre}: ${JZAC.ui.n(kg)} kg.`, 'bien');
          muestraPreview(null);
          if (scanRapido) { scanRapido.value = ''; scanRapido.focus(); }
        });
        return true;
      }
      const ok = agregarItem(p, cant, Number(p.precioVenta));
      if (ok) {
        JZAC.ui.toast(`${p.nombre} +${JZAC.ui.n(cant)}`, 'bien');
        if (scanRapido) { scanRapido.value = ''; }
      }
      muestraPreview(null);
      if (scanRapido) scanRapido.focus();
      return ok;
    }

    if (scanRapido) {
      if (dlProd) dlProd.innerHTML = opcionesDatalist();
      scanRapido.focus();
      scanRapido.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        clearTimeout(timerScan);
        const t = scanRapido.value.trim();
        if (t) {
          agregaEntrada(t);
          return;
        }
        // Enter sin texto + hay productos: cobrar (flujo rápido).
        // Con pausa normal (>600ms) cobra de una vez. Si se presiona justo
        // después de agregar un producto (muy común), se pide un segundo Enter
        // como confirmación para que un lector envíe doble Enter por error.
        const hayModal = !!document.getElementById('modal-root').innerHTML;
        if (items.length === 0 || hayModal) return;
        const pausa = Date.now() - ultimaAgregacion;
        if (pausa > 600) { registrarAhora(); return; }
        const ahora = Date.now();
        if (pendienteCobro && ahora - pendienteCobro < 3000) {
          pendienteCobro = null;
          registrarAhora();
          return;
        }
        pendienteCobro = ahora;
        JZAC.ui.toast('Listo para cobrar · presiona Enter otra vez', '');
      });
      // el lector puede no terminar en Enter; agrega tras una pausa breve
      let timerScan = null;
      scanRapido.addEventListener('input', () => {
        clearTimeout(timerScan);
        const t = scanRapido.value.trim();
        const p = t ? encuentraProducto(extraeCantidad(t) ? extraeCantidad(t).resto : t) : null;
        muestraPreview(p);
        timerScan = setTimeout(() => {
          const v = scanRapido.value.trim();
          if (!v) return;
          const soloCodigo = JZAC.productoPorCodigo(productos, (extraeCantidad(v) ? extraeCantidad(v).resto : v));
          if (soloCodigo) agregaEntrada(v); // autoadd solo para códigos exactos
        }, 220);
      });
    }

    document.getElementById('escanear-venta').addEventListener('click', async () => {
      const res = await JZAC.escanear({ titulo: 'Escanear producto' });
      if (!res || !res.texto) return;
      if (scanRapido) scanRapido.value = res.texto;
      agregaEntrada(res.texto);
    });

    // ---------- más vendidos (un toque) ----------
    const conMasVendidos = document.getElementById('mas-vendidos');
    if (conMasVendidos && topSell.length) {
      conMasVendidos.innerHTML = '<span class="mv-titulo">Más vendidos:</span>' + topSell.map((p) => `
        <button type="button" class="chip" data-mv="${p.id}">
          <span>${JZAC.ui.esc(p.nombre)}</span><b>${JZAC.ui.dinero(p.precioVenta)}</b>
        </button>`).join('');
      conMasVendidos.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', () => {
        const p = productos.find((x) => x.id === Number(b.dataset.mv));
        if (!p) return;
        if (p.ventaPeso) { pedirPeso(p, (kg) => { agregarItem(p, kg, Number(p.precioVenta)); }); return; }
        agregaEntrada(p.codigo || p.barra || p.nombre, 1);
      }));
    }

    // ---------- grilla táctil de productos (categorías + foto) ----------
    const conGrilla = document.getElementById('grilla-venta');

    function botonesGrilla(cat) {
      return productos.map((p) => {
        const c = (p.categoria || '').trim() || 'Otros';
        if (cat !== '__todos' && c !== cat) return '';
        const ini = JZAC.ui.esc((p.nombre || 'P')[0].toUpperCase());
        const foto = p.foto
          ? `<img src="${p.foto}" alt="">`
          : `<span class="gp-ini">${ini}</span>`;
        return `<button type="button" class="gp-item" data-id="${p.id}" title="${JZAC.ui.esc(p.nombre)} ${JZAC.ui.dinero(p.precioVenta)}">
          <span class="gp-foto">${foto}</span>
          <span class="gp-nombre">${JZAC.ui.esc(p.nombre)}</span>
          <span class="gp-precio">${JZAC.ui.dinero(p.precioVenta)}</span>
        </button>`;
      }).join('');
    }

    function vincularGrilla() {
      if (!conGrilla) return;
      conGrilla.querySelectorAll('.gp-item').forEach((b) => b.addEventListener('click', () => {
        const p = productos.find((x) => x.id === Number(b.dataset.id));
        if (!p) return;
        if (p.ventaPeso) { pedirPeso(p, (kg) => { agregarItem(p, kg, Number(p.precioVenta)); }); return; }
        agregaEntrada(p.codigo || p.barra || p.nombre, 1);
      }));
    }

    function pintaGrilla() {
      if (!conGrilla) return;
      const cats = [...new Set(productos.map((p) => (p.categoria || '').trim() || 'Otros'))];
      conGrilla.innerHTML = `<div class="gp-cats">
          <button type="button" class="gp-cat activa" data-cat="__todos">Todos</button>
          ${cats.map((c) => `<button type="button" class="gp-cat" data-cat="${JZAC.ui.esc(c)}">${JZAC.ui.esc(c)}</button>`).join('')}
        </div>
        <div class="gp-red" id="gp-red">${botonesGrilla('__todos')}</div>`;
      conGrilla.querySelectorAll('.gp-cat').forEach((b) => b.addEventListener('click', () => {
        conGrilla.querySelectorAll('.gp-cat').forEach((x) => x.classList.remove('activa'));
        b.classList.add('activa');
        document.getElementById('gp-red').innerHTML = botonesGrilla(b.dataset.cat);
        vincularGrilla();
      }));
      vincularGrilla();
    }
    pintaGrilla();

    // ---------- repetir última venta ----------
    const btnRepetir = document.getElementById('repetir-ultima');
    if (btnRepetir && detUltima.length) {
      btnRepetir.addEventListener('click', () => {
        detUltima.forEach((d) => {
          const p = productos.find((x) => JZAC.negocio.nombreNorm(x.nombre) === JZAC.negocio.nombreNorm(d.producto));
          if (!p) return;
          if (p.ventaPeso) { agregarItem(p, Number(d.cantidad), Number(d.precio)); return; }
          agregarItem(p, Number(d.cantidad), Number(d.precio));
        });
        JZAC.ui.toast('Última venta cargada en la caja.', 'bien');
        if (scanRapido) scanRapido.focus();
      });
    }

    // ---------- pago: efectivo / mixto / factura ----------
    const inDescuento = document.getElementById('in-descuento');
    inDescuento.addEventListener('input', actualizaTot);
    let recibidoManual = false;
    function sincPanelPago() {
      const m = document.getElementById('sel-metodo').value;
      document.getElementById('panel-efectivo').style.display = m === 'Efectivo' ? '' : 'none';
      document.getElementById('panel-mixto').style.display = m === 'Mixto' ? '' : 'none';
    }
    const inRecibido = document.getElementById('in-recibido');
    inRecibido.addEventListener('input', () => { recibidoManual = true; actualizaTot(); });
    cont.querySelectorAll('[data-monto]').forEach((b) => b.addEventListener('click', () => {
      recibidoManual = true;
      if (b.dataset.monto === 'exacto') { inRecibido.value = Math.round(totalVenta().tot * 100) / 100; }
      else { inRecibido.value = Number(b.dataset.monto); }
      actualizaTot();
    }));
    document.getElementById('sel-metodo').addEventListener('change', () => {
      const m = document.getElementById('sel-metodo').value;
      sincPanelPago();
      if (m === 'Efectivo') { recibidoManual = false; }
      actualizaTot();
    });
    sincPanelPago(); // default Efectivo: el panel de recibido queda visible desde el inicio
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
        if (rec < dsc.tot) {
          JZAC.ui.toast(`Falta recibir ${JZAC.ui.dinero(dsc.tot - rec)} del total ${JZAC.ui.dinero(dsc.tot)}.`, 'mal');
          return null;
        }
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

    // Limpia el panel para atender al siguiente cliente sin reingresar.
    async function reiniciarFormulario() {
      items = [];
      ultimaAgregacion = 0;
      pendienteCobro = null;
      const btnv = document.getElementById('guardar-venta');
      if (btnv) btnv.disabled = false;
      const nuevos = await JZAC.db.listar('productos');
      productos.splice(0, productos.length, ...nuevos);
      pintaGrilla();
      const sel = document.getElementById('sel-prod');
      sel.innerHTML = optionesMontaje();
      sel.value = '';
      document.getElementById('in-precio').value = '0';
      document.getElementById('in-cant').value = '1';
      document.getElementById('in-descuento').value = '0';
      document.getElementById('in-recibido').value = '0';
      document.getElementById('in-efectivo').value = '0';
      document.getElementById('sel-cliente').value = '';
      const chk = document.getElementById('chk-factura');
      if (chk.checked) { chk.checked = false; document.getElementById('panel-factura').style.display = 'none'; }
      document.getElementById('in-ruc').value = '';
      document.getElementById('in-razon').value = '';
      document.getElementById('sel-metodo').value = 'Efectivo';
      recibidoManual = false;
      sincPanelPago();
      pintaItems();
      actualizaTot();
      if (scanRapido) { scanRapido.value = ''; scanRapido.focus(); }
      if (previewProd) previewProd.innerHTML = '';
    }

    async function registrarAhora() {
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
        // Cajón registrador: se abre cuando hubo pago en efectivo.
        const cobroEnEfectivo = metodo === 'Efectivo' || (Number(extra.pagoEfectivo || 0) > 0);
        if (cobroEnEfectivo && window.JZAC.cajon && JZAC.cajon.soporta()) { try { JZAC.cajon.abrir(); } catch (e) { console.warn(e); } }
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
        if (JZAC.ventaRapida.modoRapido()) {
          // Modo rápido: imprime (si está activado), avisa y atiende al siguiente.
          if (JZAC.ventaRapida.autoImprime()) { imprimirBoleta(u, vv, detP); }
          const info = vv.vuelto != null ? ` · Vuelto: ${JZAC.ui.dinero(vv.vuelto)}` : (vv.pagoSaldo != null ? ` · ${vv.metodo2}: ${JZAC.ui.dinero(vv.pagoSaldo)}` : '');
          JZAC.ui.toast(`${etiquetaDoc(extra, vv)} ${res.boleta} registrada.${info}`, 'bien');
          await reiniciarFormulario();
          return;
        }
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
    }

    document.getElementById('guardar-venta').addEventListener('click', registrarAhora);
    document.getElementById('btn-gasto').addEventListener('click', modalGastoRapido);
  }

  function render(cont) {
    const seg = JZAC.rutaSeg();
    if (seg[1] === 'nueva') {
      JZAC.auth.usuarioActual().then((u) => vistaNueva(cont, u)).catch(() => JZAC.ui.toast('Debes iniciar sesión.', 'mal'));
    } else if (seg[1] === 'notas') {
      JZAC.auth.usuarioActual().then((u) => vistaNotas(cont, u));
    } else {
      JZAC.auth.usuarioActual().then((u) => vistaLista(cont, u));
    }
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  // Boleta de prueba para verificar la impresora antes de vender.
  function boletaTest(u) {
    return crearBoletaHTML(u, {
      boleta: 'B001-TEST', esFactura: false, cliente: 'Cliente de prueba', fecha: Date.now(),
      subtotal: 18.25, descuento: 0, total: 18.25, metodoPago: 'Efectivo', recibido: 20, vuelto: 1.75
    }, [
      { producto: 'Arroz 1kg', cantidad: 2, precio: 4.4, total: 8.8, esPeso: false },
      { producto: 'Tomate', cantidad: 1.5, precio: 3.5, total: 5.25, esPeso: true },
      { producto: 'Aceite 1L', cantidad: 1, precio: 4.2, total: 4.2, esPeso: false }
    ]);
  }
  window.JZAC.impresion = {
    css: (ancho) => cssRecibo(ancho),
    ancho: getAnchoBoleta,
    test: boletaTest
  };
  // Flujo rápido de caja (localStorage): '0' desactiva, cualquier otro valor activa.
  window.JZAC.ventaRapida = {
    modoRapido: () => localStorage.getItem('jzac_modo_rapido') !== '0',
    autoImprime: () => localStorage.getItem('jzac_autoimp') !== '0'
  };
  window.JZAC.modulos.ventas = { render };
})();