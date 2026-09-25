// ============================================================
// JZAC ERP - Proveedores y pedidos
// ============================================================
(function () {
  let proveedoresCache = []; // para enviar pedidos por WhatsApp sin esperar (evita popup bloqueado)
  // ---------- proveedores ----------
  async function vistaProveedores(cont) {
    const proveedores = (await JZAC.db.listar('proveedores')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const productos = await JZAC.db.listar('productos');
    const pedidos = await JZAC.db.listar('pedidos_proveedor');
    const porProv = {};
    pedidos.forEach((p) => {
      porProv[p.proveedor] = porProv[p.proveedor] || { total: 0, pendientes: 0 };
      if (p.estado === 'Pendiente') porProv[p.proveedor].pendientes++;
    });
    const cantProd = (nombre) => {
      const k = JZAC.negocio.nombreClave(nombre);
      return productos.filter((x) => x.proveedor && JZAC.negocio.nombreClave(x.proveedor) === k).length;
    };

    cont.innerHTML = `
      <div class="panel-hdr">
        <div><div class="seccion-titulo" style="margin:0">Proveedores</div>
        <div class="texto-suave" style="font-size:13px">${proveedores.length} proveedor(es)</div></div>
        <div style="display:flex;gap:8px">
          <button class="btn" id="ver-pedidos">Ver pedidos</button>
          <button class="btn btn-primario" id="nuevo-sup">+ Nuevo proveedor</button>
        </div>
      </div>
      ${proveedores.length === 0
        ? JZAC.ui.vacio('Sin proveedores', 'Agrega tus proveedores para registrar pedidos.')
        : `<div class="tabla-wrap"><table>
            <tr><th>Proveedor</th><th>WhatsApp</th><th>Teléfono</th><th class="center">Productos</th><th class="center">Pedidos pend.</th><th></th></tr>
            ${proveedores.map((pv) => `<tr>
              <td class="negrita">${JZAC.ui.esc(pv.nombre)}</td>
              <td>${pv.whatsapp ? `<a target="_blank" rel="noopener" href="https://wa.me/${String(pv.whatsapp).replace(/[^0-9]/g, '')}">${JZAC.ui.esc(pv.whatsapp)}</a>` : '—'}</td>
              <td>${JZAC.ui.esc(pv.telefono || '—')}</td>
              <td class="center">${cantProd(pv.nombre) || '—'}</td>
              <td class="center">${(porProv[pv.nombre] || {}).pendientes ? `<span class="badge badge-dorado">${porProv[pv.nombre].pendientes}</span>` : '—'}</td>
              <td><div class="acciones">
                <button class="btn btn-sm" data-editar="${pv.id}">Editar</button>
                <button class="btn btn-sm btn-peligro" data-borrar="${pv.id}">Eliminar</button>
              </div></td>
            </tr>`).join('')}
          </table></div>`}`;

    document.getElementById('ver-pedidos').addEventListener('click', () => JZAC.ir('proveedores/pedidos'));
    document.getElementById('nuevo-sup').addEventListener('click', () => modalProveedor(null, () => vistaProveedores(cont)));
    cont.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
      const p = proveedores.find((x) => x.id === Number(b.dataset.editar));
      modalProveedor(p, () => vistaProveedores(cont));
    }));
    cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      const p = proveedores.find((x) => x.id === Number(b.dataset.borrar));
      if (await JZAC.ui.confirmar(`¿Eliminar el proveedor <b>${p.nombre}</b>?`)) {
        await JZAC.db.borrar('proveedores', p.id);
        JZAC.ui.toast('Proveedor eliminado.', 'bien');
        vistaProveedores(cont);
      }
    }));
  }

  function modalProveedor(pv, refrescar) {
    const edicion = !!pv;
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>${edicion ? 'Editar proveedor' : 'Nuevo proveedor'}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="campo"><label>Nombre (razón social)</label><input id="pv-nombre" value="${JZAC.ui.esc(pv ? pv.nombre : '')}"></div>
      <div class="fila">
        <div class="campo"><label>WhatsApp</label><input id="pv-wha" value="${JZAC.ui.esc(pv ? (pv.whatsapp || '') : '')}"></div>
        <div class="campo"><label>Teléfono</label><input id="pv-tel" value="${JZAC.ui.esc(pv ? (pv.telefono || '') : '')}"></div>
      </div>
      <div class="campo"><label>Dirección</label><input id="pv-direc" value="${JZAC.ui.esc(pv ? (pv.direccion || '') : '')}"></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-pv">${edicion ? 'Guardar cambios' : 'Agregar proveedor'}</button>`);

    m.raiz.querySelector('#guardar-pv').addEventListener('click', async () => {
      const nombre = document.getElementById('pv-nombre').value.trim();
      if (!nombre) { JZAC.ui.toast('Escribe el nombre.', 'mal'); return; }
      const obj = {
        nombre,
        whatsapp: document.getElementById('pv-wha').value.trim(),
        telefono: document.getElementById('pv-tel').value.trim(),
        direccion: document.getElementById('pv-direc').value.trim(),
        creado: Date.now()
      };
      if (edicion) obj.id = pv.id;
      await JZAC.db.guardar('proveedores', obj);
      JZAC.ui.toast(edicion ? 'Proveedor actualizado.' : 'Proveedor agregado.', 'bien');
      m.cerrar();
      refrescar();
    });
  }

  // ---------- pedidos ----------
  async function vistaPedidos(cont) {
    proveedoresCache = await JZAC.db.listar('proveedores');
    const pedidos = (await JZAC.db.listar('pedidos_proveedor')).sort((a, b) => b.fecha - a.fecha);
    const detp = await JZAC.db.listar('detalle_pedido');

    cont.innerHTML = `
      <button class="btn btn-sm" id="volver-sup" style="margin-bottom:14px">← Volver a proveedores</button>
      <div class="panel-hdr">
        <div><div class="seccion-titulo" style="margin:0">Pedidos a proveedores</div>
        <div class="texto-suave" style="font-size:13px">${pedidos.length} pedido(s)</div></div>
        <button class="btn btn-primario" id="nuevo-pedido">+ Nuevo pedido</button>
      </div>
      ${pedidos.length === 0
        ? JZAC.ui.vacio('Sin pedidos', 'Crea un pedido para registrar compras a tus proveedores.', '<button class="btn btn-primario mt16" id="nuevo-pedido2">+ Nuevo pedido</button>')
        : `<div class="tabla-wrap"><table>
            <tr><th>Pedido</th><th>Proveedor</th><th>Fecha</th><th class="center">Items</th><th class="monto">Total</th><th>Estado</th><th></th></tr>
            ${pedidos.map((p) => {
              const items = detp.filter((d) => d.pedidoId === p.id);
              return `<tr>
                <td class="negrita">#${String(p.id).padStart(3, '0')}</td>
                <td>${JZAC.ui.esc(p.proveedor)}</td>
                <td>${JZAC.ui.fe(p.fecha)}${p.fechaProgramada ? '<br><span class="texto-suave" style="font-size:12px">Prog: ' + JZAC.ui.fe(p.fechaProgramada) + '</span>' : ''}</td>
                <td class="center">${items.length}</td>
                <td class="monto">${JZAC.ui.dinero(p.total)}</td>
                <td>${p.estado === 'Pendiente' ? '<span class="badge badge-dorado">Pendiente</span>' : '<span class="badge badge-verde">Recibido</span>'}</td>
                <td><div class="acciones">
                  <button class="btn btn-sm" data-ver="${p.id}">Ver</button>
                  ${p.estado === 'Pendiente' ? `<button class="btn btn-sm btn-primario" data-recibir="${p.id}">Recibir</button>` : ''}
                  <button class="btn btn-sm btn-whatsapp" data-wha="${p.id}">WhatsApp</button>
                  <button class="btn btn-sm btn-peligro" data-borrar="${p.id}">Eliminar</button>
                </div></td>
              </tr>`;
            }).join('')}
          </table></div>`}`;

    document.getElementById('volver-sup').addEventListener('click', () => JZAC.ir('proveedores'));
    const bn = document.getElementById('nuevo-pedido2');
    if (bn) bn.addEventListener('click', () => JZAC.ir('proveedores/pedido/nuevo'));
    document.getElementById('nuevo-pedido').addEventListener('click', () => JZAC.ir('proveedores/pedido/nuevo'));
    cont.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => modalVerPedido(
      pedidos.find((x) => x.id === Number(b.dataset.ver)), detp)));
    cont.querySelectorAll('[data-recibir]').forEach((b) => b.addEventListener('click', async () => {
      const p = pedidos.find((x) => x.id === Number(b.dataset.recibir));
      if (await JZAC.ui.confirmar(`Recibir el pedido <b>#${p.id}</b>?<br>Se sumará ${items_count(detp, p.id)} producto(s) al inventario y se actualizará el costo.`, 'Recibir pedido')) {
        await recibirPedido(p);
        JZAC.ui.toast('Pedido recibido. Stock actualizado.', 'bien');
        vistaPedidos(cont);
      }
    }));
    cont.querySelectorAll('[data-wha]').forEach((b) => b.addEventListener('click', () => {
      const p = pedidos.find((x) => x.id === Number(b.dataset.wha));
      enviarPedidoWha(p, detp.filter((d) => d.pedidoId === p.id));
    }));
    cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      const p = pedidos.find((x) => x.id === Number(b.dataset.borrar));
      if (await JZAC.ui.confirmar(`¿Eliminar el pedido <b>#${p.id}</b>?`)) {
        await JZAC.db.ready;
        const t = DB.db.transaction(['pedidos_proveedor', 'detalle_pedido'], 'readwrite');
        t.objectStore('pedidos_proveedor').delete(p.id);
        const ds = t.objectStore('detalle_pedido');
        (await JZAC.db.listar('detalle_pedido')).filter((d) => d.pedidoId === p.id).forEach((d) => ds.delete(d.id));
        t.oncomplete = () => { JZAC.ui.toast('Pedido eliminado.', 'bien'); vistaPedidos(cont); };
      }
    }));
  }

  function items_count(det, pid) { return det.filter((x) => x.pedidoId === pid).length; }

  function enviarPedidoWha(p, dets) {
    const pv = proveedoresCache.find((x) => JZAC.negocio.nombreNorm(x.nombre) === JZAC.negocio.nombreNorm(p.proveedor));
    let num = pv && pv.whatsapp ? String(pv.whatsapp).replace(/[^0-9]/g, '') : '';
    if (/^9\d{8}$/.test(num)) num = '51' + num;
    if (!num) { JZAC.ui.toast('Este proveedor no tiene WhatsApp guardado. Agrégaselo en Proveedores.', 'mal'); return; }
    const filas = dets.map((d) => `▸ ${d.producto} x${JZAC.ui.n(d.cantidad)} (${JZAC.ui.dinero(d.precio)}) = ${JZAC.ui.dinero(Number(d.cantidad) * Number(d.precio))}`).join('\n');
    const tot = dets.reduce((a, d) => a + Number(d.cantidad) * Number(d.precio), 0);
    const txt = [
      `📦 *PEDIDO #${String(p.id).padStart(3, '0')}* · ${JZAC.ui.fe(p.fecha)}`,
      `Para: ${p.proveedor}`,
      p.fechaProgramada ? `Entrega programada: ${JZAC.ui.fe(p.fechaProgramada)}` : '',
      '',
      filas,
      '',
      `*TOTAL: ${JZAC.ui.dinero(tot)}*`
    ].filter((x) => x !== '').join('\n');
    JZAC.ui.abrirWha('https://wa.me/' + num + '?text=' + encodeURIComponent(txt));
    JZAC.ui.toast('Pedido listo para enviar en WhatsApp.', 'bien');
  }

  async function recibirPedido(p) {
    const dets = (await JZAC.db.listar('detalle_pedido')).filter((d) => d.pedidoId === p.id);
    const productos = await JZAC.db.listar('productos');
    await DB.ready;
    return new Promise((resolve, reject) => {
      const t = DB.db.transaction(['pedidos_proveedor', 'productos'], 'readwrite');
      const ps = t.objectStore('productos');
      dets.forEach((d) => {
        const norm = JZAC.negocio.nombreNorm(d.producto);
        const pv = productos.find((x) => JZAC.negocio.nombreNorm(x.nombre) === norm);
        if (pv) {
          pv.stock = Number(pv.stock || 0) + Number(d.cantidad);
          pv.precioCompra = Number(d.precio);
          if (!pv.proveedor) pv.proveedor = p.proveedor;
          ps.put(pv);
        } else {
          ps.put({ nombre: d.producto, precioCompra: Number(d.precio), precioVenta: Number(d.precio), stock: Number(d.cantidad), stockMin: 0, fechaVencimiento: null, proveedor: p.proveedor, creado: Date.now() });
        }
      });
      const gp = t.objectStore('pedidos_proveedor').get(p.id);
      gp.onsuccess = () => {
        const pp = gp.result;
        if (pp) { pp.estado = 'Recibido'; pp.fechaRecibido = Date.now(); t.objectStore('pedidos_proveedor').put(pp); }
      };
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  }

  function modalVerPedido(p, detp) {
    const dets = detp.filter((d) => d.pedidoId === p.id);
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Pedido #${p.id} · ${JZAC.ui.esc(p.proveedor)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:10px">${JZAC.ui.fe(p.fecha)} · <span class="badge ${p.estado === 'Pendiente' ? 'badge-dorado' : 'badge-verde'}">${p.estado}</span></div>
      <div class="tabla-wrap"><table>
        <tr><th>Producto</th><th class="center">Cant.</th><th class="monto">Precio</th><th class="monto">Total</th></tr>
        ${dets.map((d) => `<tr><td>${JZAC.ui.esc(d.producto)}</td><td class="center">${JZAC.ui.n(d.cantidad)}</td><td class="monto">${JZAC.ui.dinero(d.precio)}</td><td class="monto">${JZAC.ui.dinero(d.precio * d.cantidad)}</td></tr>`).join('')}
      </table></div>
      <div class="derecha negrita mt16" style="font-size:16px">TOTAL: ${JZAC.ui.dinero(dets.reduce((a, d) => a + d.precio * d.cantidad, 0))}</div>`,
      `<button class="btn btn-whatsapp" id="enviar-ped-wha">Enviar por WhatsApp</button>
       <button class="btn" data-cerrar>Cerrar</button>`);
    m.raiz.querySelector('#enviar-ped-wha').addEventListener('click', () => enviarPedidoWha(p, dets));
  }

  // ---------- nuevo pedido ----------
  async function vistaNuevoPedido(cont) {
    const proveedores = (await JZAC.db.listar('proveedores')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const productos = (await JZAC.db.listar('productos')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    let lineas = [{ producto: '', cantidad: 1, precio: 0 }];

    // ---- pedido sugerido automatico: stock minimo + ventas de los ultimos 30 dias ----
    const ventas = await JZAC.db.listar('ventas');
    const dvAll = await JZAC.db.listar('detalle_venta');
    const fVenta = {};
    ventas.forEach((v) => { fVenta[v.id] = v.fecha; });
    const hace30 = Date.now() - 30 * 86400000;
    const unid = {};
    dvAll.forEach((d) => {
      if (!fVenta[d.ventaId] || fVenta[d.ventaId] < hace30) return;
      const k = JZAC.negocio.nombreNorm(d.producto);
      unid[k] = (unid[k] || 0) + Number(d.cantidad);
    });
    const sugerencias = productos
      .map((p) => {
        const stock = Number(p.stock || 0);
        const min = Number(p.stockMin || 0);
        const k = JZAC.negocio.nombreNorm(p.nombre);
        const promSem = Math.round((unid[k] || 0) / 30 * 7 * 10) / 10;
        return { p, stock, min, promSem, sug: 0 };
      })
      .map((s) => {
        const porVentas = Math.ceil(s.promSem);
        const porMin = Math.ceil(Math.max(0, s.min * 2 - s.stock));
        const semana = Math.ceil(s.promSem);
        // Suena cuando ya se pasó del mínimo o el stock solo alcanza ~1 semana de ventas
        const debeReponer = s.stock <= s.min || (semana > 0 && s.stock <= semana);
        s.sug = debeReponer ? Math.max(1, porVentas, porMin) : 0;
        return s;
      })
      .filter((s) => s.sug > 0)
      .sort((a, b) => b.sug - a.sug)
      .slice(0, 10);

    cont.innerHTML = `
      <button class="btn btn-sm" id="volver-ped" style="margin-bottom:14px">← Volver a pedidos</button>
      <div class="card maxw600" style="margin:0 auto">
        <div class="seccion-titulo" style="margin-top:0">Nuevo pedido a proveedor</div>
        <div class="campo"><label>Proveedor</label>
          <select id="p-sup"><option value="">Selecciona...</option>${proveedores.map((pv) => `<option>${JZAC.ui.esc(pv.nombre)}</option>`).join('')}</select>
        </div>
        <div class="campo"><label>Fecha programada de entrega (opcional)</label>
          <input type="date" id="p-fecha">
        </div>
        <div id="cat-sup" class="card" style="background:var(--bg);border:1px dashed var(--borde);padding:10px 12px;margin-bottom:14px"></div>
        ${sugerencias.length ? `
          <div class="card" style="background:var(--bg-sug, #fff7e0);border:1px solid #f0c36d;margin-bottom:14px">
            <b>📦 Pedido sugerido automático</b>
            <div class="texto-suave" style="font-size:13px;margin:2px 0 8px">Cuando el stock llega al mínimo o se agotará pronto según las ventas de los últimos 30 días.</div>
            <div class="tabla-wrap"><table>
              <tr><th></th><th>Producto</th><th class="center">Stock</th><th class="center">Mínimo</th><th class="center">Ventas/sem</th><th class="center">Sugerido</th></tr>
              ${sugerencias.map((s, i) => `<tr>
                <td><input type="checkbox" class="sug-chk" data-i="${i}" checked style="width:18px;height:18px"></td>
                <td>${JZAC.ui.esc(s.p.nombre)}</td>
                <td class="center">${JZAC.ui.n(s.stock)}</td>
                <td class="center">${JZAC.ui.n(s.min)}</td>
                <td class="center">${JZAC.ui.n(s.promSem)}</td>
                <td class="center"><b>${JZAC.ui.n(s.sug)}</b></td>
              </tr>`).join('')}
            </table></div>
            <button class="btn btn-primario mt8" id="cargar-sug">Añadir seleccionadas al pedido</button>
          </div>` : ''}
        <div id="lineas"></div>
        <div class="mt16" style="display:flex;gap:8px">
          <button class="btn" id="agregar-linea">+ Agregar producto</button>
          <div style="flex:1;text-align:right;align-self:center">Total: <b id="p-total">${JZAC.ui.dinero(0)}</b></div>
        </div>
        <button class="btn btn-primario btn-bloco mt16" id="guardar-ped">Guardar pedido</button>
      </div>`;

    const caja = document.getElementById('lineas');
    const selSup = document.getElementById('p-sup');
    let provSel = '';

    function catSup() {
      if (!provSel) return [];
      const k = JZAC.negocio.nombreClave(provSel);
      return productos.filter((p) => p.proveedor && JZAC.negocio.nombreClave(p.proveedor) === k);
    }

    function pintaCatalogo() {
      const c = document.getElementById('cat-sup');
      if (!provSel) {
        c.innerHTML = '<div class="texto-suave" style="font-size:13px">Elige el proveedor y aquí aparecerán sus productos para tocar y agregarlos.</div>';
        return;
      }
      const cat = catSup();
      if (!cat.length) {
        c.innerHTML = `<div class="texto-suave" style="font-size:13px"><b>${JZAC.ui.esc(provSel)}</b> aún no tiene productos asignados. En Inventario → producto → <b>Proveedor</b> se los asignas (o se asignan solos al recibir el pedido). Mientras tanto puedes escribir los productos a mano.</div>`;
        return;
      }
      c.innerHTML = `<div class="negrita" style="font-size:13px;margin-bottom:8px">Productos de ${JZAC.ui.esc(provSel)} · toca para agregar:</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${cat.map((p) => `<button type="button" class="btn btn-sm btn-suave" data-cat="${p.id}">${JZAC.ui.esc(p.nombre)} · ${JZAC.ui.dinero(p.precioCompra || 0)}</button>`).join('')}
        </div>`;
      c.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => {
        const p = productos.find((x) => x.id === Number(b.dataset.cat));
        if (!p) return;
        const nueva = { producto: p.nombre, cantidad: 1, precio: Math.round(Number(p.precioCompra || 0) * 100) / 100 };
        if (lineas.length === 1 && !lineas[0].producto.trim()) lineas[0] = nueva;
        else lineas.push(nueva);
        pinta();
        total();
        JZAC.ui.toast(`${p.nombre} añadido al pedido.`, 'bien');
      }));
    }

    selSup.addEventListener('change', () => { provSel = selSup.value; pintaCatalogo(); pinta(); });

    function pinta() {
      caja.innerHTML = lineas.map((l, i) => `
        <div class="fila" style="margin-bottom:8px">
          <div class="campo" style="margin:0"><label>Producto</label>
            <input type="text" list="prod-list" id="li-nom-${i}" value="${JZAC.ui.esc(l.producto)}" placeholder="Nombre o elige de la lista">
          </div>
          <div class="campo" style="margin:0"><label>Cantidad</label><input type="number" min="1" step="1" id="li-cant-${i}" value="${l.cantidad}"></div>
          <div class="campo" style="margin:0"><label>Precio (S/)</label><input type="number" min="0" step="0.01" id="li-pre-${i}" value="${l.precio}"></div>
          <div style="align-self:end"><button class="btn btn-sm btn-peligro" data-quit="${i}">×</button></div>
        </div>`).join('') + `<datalist id="prod-list">${(catSup().length ? catSup() : productos).map((pp) => `<option value="${JZAC.ui.esc(pp.nombre)}">`).join('')}</datalist>`;

      lineas.forEach((l, i) => {
        document.getElementById(`li-cant-${i}`).addEventListener('input', () => { l.cantidad = Math.max(0, Number(document.getElementById(`li-cant-${i}`).value || 0)); total(); });
        document.getElementById(`li-pre-${i}`).addEventListener('input', () => { l.precio = Math.max(0, Number(document.getElementById(`li-pre-${i}`).value || 0)); total(); });
        document.getElementById(`li-nom-${i}`).addEventListener('input', () => { l.producto = document.getElementById(`li-nom-${i}`).value; });
      });
      caja.querySelectorAll('[data-quit]').forEach((b) => b.addEventListener('click', () => {
        lineas.splice(Number(b.dataset.quit), 1);
        pinta();
      }));
    }

    function total() {
      const t = lineas.reduce((a, l) => a + l.cantidad * l.precio, 0);
      document.getElementById('p-total').textContent = JZAC.ui.dinero(t);
    }

    document.getElementById('volver-ped').addEventListener('click', () => JZAC.ir('proveedores/pedidos'));
    const btnCargar = document.getElementById('cargar-sug');
    if (btnCargar) {
      btnCargar.addEventListener('click', () => {
        const marcadas = [...document.querySelectorAll('.sug-chk:checked')].map((c) => Number(c.dataset.i));
        if (marcadas.length === 0) { JZAC.ui.toast('Marca al menos una sugerencia.', 'mal'); return; }
        lineas.push(...marcadas.map((i) => {
          const s = sugerencias[i];
          return { producto: s.p.nombre, cantidad: s.sug, precio: Math.round(Number(s.p.precioCompra || 0) * 100) / 100 };
        }));
        pinta();
        JZAC.ui.toast(`${marcadas.length} producto(s) añadidos al pedido.`, 'bien');
      });
    }
    document.getElementById('agregar-linea').addEventListener('click', () => {
      lineas.push({ producto: '', cantidad: 1, precio: 0 });
      pinta();
    });

    document.getElementById('guardar-ped').addEventListener('click', async () => {
      const prov = document.getElementById('p-sup').value;
      const fechap = JZAC.ui.fechaDesdeInput(document.getElementById('p-fecha').value);
      const validas = lineas.filter((l) => l.producto.trim() && l.cantidad > 0 && l.precio >= 0);
      if (!prov) { JZAC.ui.toast('Selecciona el proveedor.', 'mal'); return; }
      if (validas.length === 0) { JZAC.ui.toast('Agrega al menos un producto con cantidad.', 'mal'); return; }
      const totalPed = validas.reduce((a, l) => a + l.cantidad * l.precio, 0);
      await JZAC.db.ready;
      const t = DB.db.transaction(['pedidos_proveedor', 'detalle_pedido'], 'readwrite');
      const ps = t.objectStore('pedidos_proveedor');
      const ds = t.objectStore('detalle_pedido');
      ps.add({ proveedor: prov, estado: 'Pendiente', fecha: Date.now(), fechaProgramada: fechap, total: Math.round(totalPed * 100) / 100 }).onsuccess = (e) => {
        const pid = e.target.result;
        validas.forEach((l) => ds.add({ pedidoId: pid, producto: l.producto.trim(), cantidad: l.cantidad, precio: l.precio }));
      };
      t.oncomplete = () => {
        JZAC.ui.toast('Pedido registrado.', 'bien');
        JZAC.ir('proveedores/pedidos');
      };
      t.onerror = () => JZAC.ui.toast('Error al guardar el pedido.', 'mal');
    });

    pintaCatalogo();
    pinta();
  }

  function render(cont) {
    const seg = JZAC.rutaSeg();
    if (seg[1] === 'pedidos') vistaPedidos(cont).catch(() => JZAC.ui.toast('Error al cargar pedidos', 'mal'));
    else if (seg[1] === 'pedido') vistaNuevoPedido(cont).catch(() => JZAC.ui.toast('Error al cargar pedido', 'mal'));
    else vistaProveedores(cont).catch(() => JZAC.ui.toast('Error al cargar proveedores', 'mal'));
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.proveedores = { render };
})();