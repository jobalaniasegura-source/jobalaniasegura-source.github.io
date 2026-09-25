// ============================================================
// JZAC ERP - Fiados (cuenta corriente: productos por día y pagos)
// ============================================================
(function () {
  function hm(ms) {
    if (!ms) return '—';
    const d = new Date(ms);
    const p = (x) => String(x).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function numW(w) {
    let n = String(w || '').replace(/[^0-9]/g, '');
    if (/^9\d{8}$/.test(n)) n = '51' + n;
    return n;
  }

  function sumaItems(f) {
    return (f.items || []).reduce((a, it) => a + Number(it.subtotal || 0), 0);
  }

  function saldoDe(f) {
    return Math.round((Number(f.montoTotal || 0) - Number(f.montoPagado || 0)) * 100) / 100;
  }

  async function render(cont) {
    const fiados = (await JZAC.db.listar('fiados')).sort((a, b) => {
      const oa = a.estado === 'Pendiente' ? 0 : 1;
      const ob = b.estado === 'Pendiente' ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return saldoDe(b) - saldoDe(a);
    });
    const clientes = await JZAC.db.listar('clientes');
    const productos = await JZAC.db.listar('productos');
    const pagos = await JZAC.db.listar('pagos_fiado');

    const totalDeuda = fiados.filter((f) => f.estado === 'Pendiente')
      .reduce((a, f) => a + saldoDe(f), 0);
    const cobrado = fiados.reduce((a, f) => a + Number(f.montoPagado || 0), 0);

    cont.innerHTML = `
      <div class="grid grid-3">
        <div class="card stat rojo"><div class="stat-titulo">Deuda por cobrar</div><div class="stat-valor">${JZAC.ui.dinero(totalDeuda)}</div></div>
        <div class="card stat verde"><div class="stat-titulo">Total cobrado</div><div class="stat-valor">${JZAC.ui.dinero(cobrado)}</div></div>
        <div class="card stat azul"><div class="stat-titulo">Fiados</div><div class="stat-valor">${fiados.length}</div></div>
      </div>

      <div class="panel-hdr mt16">
        <button class="btn" id="ver-clientes">Ir a clientes</button>
        <button class="btn btn-primario" id="nuevo-fiado">+ Nuevo fiado</button>
      </div>

      ${fiados.length === 0
        ? JZAC.ui.vacio('Sin fiados', 'Registra un fiado para controlar las deudas de tus clientes.', '<button class="btn btn-primario mt16" id="nuevo-fiado2">+ Nuevo fiado</button>')
        : `<div class="tabla-wrap"><table>
            <tr><th>Cliente</th><th>Fecha</th><th class="monto">Total</th><th class="monto">Pagado</th><th class="monto">Saldo</th><th>Estado</th><th></th></tr>
            ${fiados.map((f) => {
              const saldo = saldoDe(f);
              const np = pagos.filter((x) => x.fiadoId === f.id).length;
              const nItems = (f.items || []).length;
              const ult = nItems ? Math.max(...f.items.map((x) => x.fecha || 0)) : 0;
              return `<tr>
                <td class="negrita">${JZAC.ui.esc(f.cliente)}
                  ${nItems ? `<div class="texto-suave" style="font-size:12px;font-weight:400">${JZAC.ui.n(nItems)} producto(s) · último ${JZAC.ui.fe(ult)}</div>` : ''}
                </td>
                <td>${JZAC.ui.fe(f.fecha)}</td>
                <td class="monto">${JZAC.ui.dinero(f.montoTotal)}</td>
                <td class="monto">${JZAC.ui.dinero(f.montoPagado)}</td>
                <td class="monto">${saldo > 0 ? `<b style="color:var(--rojo)">${JZAC.ui.dinero(saldo)}</b>` : JZAC.ui.dinero(0)}</td>
                <td>${f.estado === 'Pagado' ? '<span class="badge badge-verde">Pagado</span>' : '<span class="badge badge-rojo">Pendiente</span>'}</td>
                <td><div class="acciones">
                  <button class="btn btn-sm" data-detalle="${f.id}">Detalle (${np})</button>
                  ${saldo > 0 ? `<button class="btn btn-sm" data-agregar="${f.id}">+ Agregar</button>` : ''}
                  ${saldo > 0 ? `<button class="btn btn-sm btn-primario" data-pago="${f.id}">+ Pago</button>` : ''}
                </div></td>
              </tr>`;
            }).join('')}
          </table></div>`}`;

    if (document.getElementById('nuevo-fiado2')) {
      document.getElementById('nuevo-fiado2').addEventListener('click', () => modalNuevoFiado(clientes, fiados, productos, () => render(cont)));
    }
    document.getElementById('ver-clientes').addEventListener('click', () => JZAC.ir('clientes'));
    document.getElementById('nuevo-fiado').addEventListener('click', () => modalNuevoFiado(clientes, fiados, productos, () => render(cont)));
    cont.querySelectorAll('[data-detalle]').forEach((b) => b.addEventListener('click', () => modalDetalle(
      fiados.find((x) => x.id === Number(b.dataset.detalle)), pagos, clientes, () => render(cont))));
    cont.querySelectorAll('[data-pago]').forEach((b) => b.addEventListener('click', () => modalPago(
      fiados.find((x) => x.id === Number(b.dataset.pago)), () => render(cont))));
    cont.querySelectorAll('[data-agregar]').forEach((b) => b.addEventListener('click', () => modalAgregar(
      fiados.find((x) => x.id === Number(b.dataset.agregar)), productos, () => render(cont))));
  }

  // picker de productos compartido por los modales de fiado
  function crearPicker(raiz, productos) {
    const items = [];
    const caja = raiz.querySelector('#f-items');
    const dl = raiz.querySelector('#dl-fiado-prod');
    if (dl) dl.innerHTML = productos.map((p) => `<option value="${JZAC.ui.esc(p.nombre)}">`).join('');

    const sub = () => items.reduce((a, x) => a + Number(x.subtotal || 0), 0);

    function pintaItems() {
      caja.innerHTML = items.length ? `
        <div class="tabla-wrap" style="margin-top:8px"><table>
          <tr><th>Fecha</th><th>Hora</th><th>Producto</th><th class="center">Cant.</th><th class="monto">Precio</th><th class="monto">Subtotal</th><th></th></tr>
          ${items.map((it, i) => `<tr>
            <td style="white-space:nowrap">${JZAC.ui.fe(it.fecha)}</td>
            <td style="white-space:nowrap">${hm(it.fecha)}</td>
            <td>${JZAC.ui.esc(it.producto)}</td>
            <td class="center">${JZAC.ui.n(it.cantidad)}</td>
            <td class="monto">${JZAC.ui.dinero(it.precio)}</td>
            <td class="monto">${JZAC.ui.dinero(it.subtotal)}</td>
            <td class="derecha"><button class="btn btn-sm btn-peligro" data-q="${i}">×</button></td>
          </tr>`).join('')}
        </table></div>
        <div class="derecha" style="margin-top:6px">Subtotal productos: <b>${JZAC.ui.dinero(sub())}</b></div>` : '';
      caja.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
        items.splice(Number(b.dataset.q), 1);
        pintaItems();
      }));
    }

    function agregar() {
      const nombre = raiz.querySelector('#f-prod').value.trim();
      const cant = Number(raiz.querySelector('#f-cant').value || 0);
      const precio = Number(raiz.querySelector('#f-precio').value || 0);
      if (!nombre) { JZAC.ui.toast('Escribe o elige el producto.', 'mal'); return; }
      if (!(cant > 0)) { JZAC.ui.toast('La cantidad debe ser mayor a 0.', 'mal'); return; }
      if (!(precio > 0)) { JZAC.ui.toast('El precio debe ser mayor a 0.', 'mal'); return; }
      const k = JZAC.negocio.nombreClave(nombre);
      const ex = items.find((x) => JZAC.negocio.nombreClave(x.producto) === k && Number(x.precio) === precio);
      if (ex) ex.cantidad = Math.round((Number(ex.cantidad) + cant) * 1000) / 1000;
      else items.push({
        fecha: Date.now(), producto: nombre, cantidad: cant, precio,
        subtotal: Math.round(cant * precio * 100) / 100
      });
      raiz.querySelector('#f-prod').value = '';
      raiz.querySelector('#f-cant').value = '1';
      raiz.querySelector('#f-precio').value = '0';
      pintaItems();
      raiz.querySelector('#f-prod').focus();
    }

    raiz.querySelector('#f-add').addEventListener('click', agregar);
    raiz.querySelector('#f-prod').addEventListener('input', () => {
      const v = raiz.querySelector('#f-prod').value;
      const p = productos.find((x) => JZAC.negocio.nombreClave(x.nombre) === JZAC.negocio.nombreClave(v));
      if (p) {
        raiz.querySelector('#f-precio').value = p.precioVenta;
        raiz.querySelector('#f-cant').step = p.ventaPeso ? 0.001 : 1;
      }
    });
    ['#f-prod', '#f-cant', '#f-precio'].forEach((sel) => {
      raiz.querySelector(sel).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); agregar(); }
      });
    });

    pintaItems();
    return { items, sub };
  }

  function modalNuevoFiado(clientes, fiados, productos, refrescar) {
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Nuevo fiado</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="campo"><label>Cliente</label>
        <select id="f-cliente">
          <option value="">Selecciona un cliente...</option>
          ${clientes.map((c) => `<option>${JZAC.ui.esc(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div id="f-aviso" class="aviso-cuenta" style="display:none"></div>
      <div class="seccion-titulo">Productos que lleva</div>
      <div class="fila">
        <div class="campo" style="margin:0"><label>Producto</label><input id="f-prod" list="dl-fiado-prod" placeholder="Escribe o elige..."></div>
        <div class="campo" style="margin:0;max-width:86px"><label>Cant.</label><input type="number" id="f-cant" min="0.001" step="1" value="1"></div>
        <div class="campo" style="margin:0;max-width:104px"><label>Precio (S/)</label><input type="number" id="f-precio" min="0" step="0.01" value="0"></div>
        <div style="align-self:end"><button type="button" class="btn btn-primario" id="f-add">+ Agregar</button></div>
      </div>
      <datalist id="dl-fiado-prod"></datalist>
      <div id="f-items"></div>
      <div class="campo" style="margin-top:12px"><label>Monto adicional (S/) — opcional, solo si no lleva productos</label>
        <input type="number" step="0.01" min="0" id="f-monto"></div>
      <div class="campo"><label>Notas (opcional)</label><textarea rows="2" id="f-notas"></textarea></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-f">Registrar fiado</button>`);

    const raiz = m.raiz;
    const picker = crearPicker(raiz, productos);
    const selCli = raiz.querySelector('#f-cliente');
    const aviso = raiz.querySelector('#f-aviso');
    let abierto = null;

    function revisaAviso() {
      const cli = selCli.value;
      abierto = cli ? fiados.find((f) => f.estado === 'Pendiente'
        && JZAC.negocio.nombreClave(f.cliente) === JZAC.negocio.nombreClave(cli)) : null;
      if (abierto) {
        aviso.style.display = 'block';
        aviso.innerHTML = `
          <b>⚠ ${JZAC.ui.esc(cli)} ya tiene deuda abierta: ${JZAC.ui.dinero(saldoDe(abierto))} (desde ${JZAC.ui.fe(abierto.fecha)})</b>
          <div class="texto-suave" style="font-size:13px">Los productos se sumarán a esa misma cuenta.</div>
          <label style="font-size:13px;display:flex;gap:6px;align-items:center;margin-top:8px">
            <input type="checkbox" id="f-nueva" style="width:16px;height:16px"> Empezar cuenta nueva
          </label>`;
      } else {
        aviso.style.display = 'none';
        aviso.innerHTML = '';
      }
    }
    selCli.addEventListener('change', revisaAviso);

    raiz.querySelector('#guardar-f').addEventListener('click', async () => {
      const cliente = selCli.value;
      const montoExtra = Math.round(Number(raiz.querySelector('#f-monto').value || 0) * 100) / 100;
      if (!cliente) { JZAC.ui.toast('Selecciona el cliente.', 'mal'); return; }
      if (!picker.items.length && !(montoExtra > 0)) {
        JZAC.ui.toast('Agrega al menos un producto o escribe un monto.', 'mal');
        return;
      }
      const monto = Math.round((picker.sub() + montoExtra) * 100) / 100;
      const notas = raiz.querySelector('#f-notas').value.trim();
      const nueva = !!(raiz.querySelector('#f-nueva') && raiz.querySelector('#f-nueva').checked);

      if (abierto && !nueva) {
        await JZAC.db.ready;
        await new Promise((res, rej) => {
          const t = DB.db.transaction(['fiados'], 'readwrite');
          const st = t.objectStore('fiados');
          const g = st.get(abierto.id);
          g.onsuccess = () => {
            const f = g.result;
            f.items = (f.items || []).concat(picker.items);
            f.montoTotal = Math.round((Number(f.montoTotal || 0) + monto) * 100) / 100;
            f.ultimaActividad = Date.now();
            if (notas) f.notas = f.notas ? f.notas + ' / ' + notas : notas;
            if (Number(f.montoPagado || 0) < Number(f.montoTotal)) f.estado = 'Pendiente';
            st.put(f);
          };
          t.oncomplete = res;
          t.onerror = () => rej(t.error);
        });
        JZAC.ui.toast(`Productos sumados a la cuenta de ${cliente}.`, 'bien');
      } else {
        await JZAC.db.guardar('fiados', {
          cliente, montoTotal: monto, montoPagado: 0,
          estado: 'Pendiente', fecha: Date.now(), notas,
          items: picker.items, ultimaActividad: Date.now()
        });
        JZAC.ui.toast('Fiado registrado.', 'bien');
      }
      m.cerrar();
      refrescar();
    });
  }

  function modalAgregar(f, productos, refrescar) {
    const saldo = saldoDe(f);
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Agregar productos · ${JZAC.ui.esc(f.cliente)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:12px">Deuda actual: <b style="color:var(--rojo)">${JZAC.ui.dinero(saldo)}</b> · cuenta abierta desde ${JZAC.ui.fe(f.fecha)}</div>
      <div class="seccion-titulo">Productos que lleva hoy</div>
      <div class="fila">
        <div class="campo" style="margin:0"><label>Producto</label><input id="f-prod" list="dl-fiado-prod" placeholder="Escribe o elige..."></div>
        <div class="campo" style="margin:0;max-width:86px"><label>Cant.</label><input type="number" id="f-cant" min="0.001" step="1" value="1"></div>
        <div class="campo" style="margin:0;max-width:104px"><label>Precio (S/)</label><input type="number" id="f-precio" min="0" step="0.01" value="0"></div>
        <div style="align-self:end"><button type="button" class="btn btn-primario" id="f-add">+ Agregar</button></div>
      </div>
      <datalist id="dl-fiado-prod"></datalist>
      <div id="f-items"></div>
      <div class="campo" style="margin-top:12px"><label>Monto adicional (S/) — opcional</label>
        <input type="number" step="0.01" min="0" id="f-monto"></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-f">Agregar a la cuenta</button>`);

    const raiz = m.raiz;
    const picker = crearPicker(raiz, productos);

    raiz.querySelector('#guardar-f').addEventListener('click', async () => {
      const montoExtra = Math.round(Number(raiz.querySelector('#f-monto').value || 0) * 100) / 100;
      if (!picker.items.length && !(montoExtra > 0)) {
        JZAC.ui.toast('Agrega al menos un producto o escribe un monto.', 'mal');
        return;
      }
      const monto = Math.round((picker.sub() + montoExtra) * 100) / 100;
      await JZAC.db.ready;
      await new Promise((res, rej) => {
        const t = DB.db.transaction(['fiados'], 'readwrite');
        const st = t.objectStore('fiados');
        const g = st.get(f.id);
        g.onsuccess = () => {
          const f2 = g.result;
          f2.items = (f2.items || []).concat(picker.items);
          f2.montoTotal = Math.round((Number(f2.montoTotal || 0) + monto) * 100) / 100;
          f2.ultimaActividad = Date.now();
          if (Number(f2.montoPagado || 0) < Number(f2.montoTotal)) f2.estado = 'Pendiente';
          st.put(f2);
        };
        t.oncomplete = res;
        t.onerror = () => rej(t.error);
      });
      JZAC.ui.toast('Productos agregados a la cuenta.', 'bien');
      m.cerrar();
      refrescar();
    });
  }

  function modalPago(f, refrescar) {
    const saldo = saldoDe(f);
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Registrar pago · ${JZAC.ui.esc(f.cliente)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:10px">Saldo pendiente: <b style="color:var(--rojo)">${JZAC.ui.dinero(saldo)}</b></div>
      <div class="fila">
        <div class="campo"><label>Monto (S/)</label><input type="number" step="0.01" min="0.01" id="p-monto" value="${saldo}"></div>
        <div class="campo"><label>Método</label>
          <select id="p-metodo"><option>Efectivo</option><option>Yape</option><option>Plin</option><option>Transferencia</option><option>Tarjeta</option></select>
        </div>
      </div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-pago">Registrar pago</button>`);

    m.raiz.querySelector('#guardar-pago').addEventListener('click', async () => {
      const monto = Math.min(saldo, Math.max(0.01, Number(document.getElementById('p-monto').value || 0)));
      const metodo = document.getElementById('p-metodo').value;
      await JZAC.db.ready;
      const t = DB.db.transaction(['fiados', 'pagos_fiado'], 'readwrite');
      const fs = t.objectStore('fiados');
      const ps = t.objectStore('pagos_fiado');
      const gf = fs.get(f.id);
      gf.onsuccess = () => {
        const f2 = gf.result;
        f2.montoPagado = Math.round((Number(f2.montoPagado || 0) + monto) * 100) / 100;
        if (Number(f2.montoPagado) >= Number(f2.montoTotal)) { f2.estado = 'Pagado'; f2.fechaPago = Date.now(); }
        fs.put(f2);
      };
      ps.add({ fiadoId: f.id, monto, metodo: metodo || 'Efectivo', fecha: Date.now() });
      t.oncomplete = () => {
        JZAC.ui.toast('Pago registrado.', 'bien');
        m.cerrar();
        refrescar();
      };
      t.onerror = () => JZAC.ui.toast('Error al registrar el pago.', 'mal');
    });
  }

  function modalDetalle(f, pagos, clientes, refrescar) {
    const misPagos = pagos.filter((x) => x.fiadoId === f.id).sort((a, b) => b.fecha - a.fecha);
    const saldo = saldoDe(f);
    const items = [...(f.items || [])].sort((a, b) => a.fecha - b.fecha);
    const otrosCargos = items.length ? Math.round((Number(f.montoTotal || 0) - sumaItems(f)) * 100) / 100 : 0;
    const filasPagos = misPagos.length
      ? misPagos.map((x) => `<tr><td>${JZAC.ui.fh(x.fecha)}</td><td>${JZAC.ui.esc(x.metodo || 'Efectivo')}</td><td class="monto">${JZAC.ui.dinero(x.monto)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="center">Sin pagos registrados.</td></tr>';
    const filasItems = items.length
      ? items.map((it) => `<tr>
          <td style="white-space:nowrap">${JZAC.ui.fe(it.fecha)}</td>
          <td style="white-space:nowrap">${hm(it.fecha)}</td>
          <td>${JZAC.ui.esc(it.producto)}</td>
          <td class="center">${JZAC.ui.n(it.cantidad)}</td>
          <td class="monto">${JZAC.ui.dinero(it.precio)}</td>
          <td class="monto">${JZAC.ui.dinero(it.subtotal)}</td>
        </tr>`).join('')
      : '';
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Fiado · ${JZAC.ui.esc(f.cliente)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:12px">Registrado: ${JZAC.ui.fh(f.fecha)}${f.notas ? '<br>Notas: ' + JZAC.ui.esc(f.notas) : ''}</div>
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="card"><div class="stat-titulo">Total</div><b>${JZAC.ui.dinero(f.montoTotal)}</b></div>
        <div class="card"><div class="stat-titulo">Pagado</div><b>${JZAC.ui.dinero(f.montoPagado)}</b></div>
        <div class="card"><div class="stat-titulo">Saldo</div><b style="color:${saldo > 0 ? 'var(--rojo)' : 'var(--verde)'}">${JZAC.ui.dinero(saldo)}</b></div>
      </div>
      ${items.length ? `
        <div class="seccion-titulo">Productos llevados (${JZAC.ui.n(items.length)})</div>
        <div class="tabla-wrap"><table>
          <tr><th>Fecha</th><th>Hora</th><th>Producto</th><th class="center">Cant.</th><th class="monto">Precio</th><th class="monto">Subtotal</th></tr>
          ${filasItems}
        </table></div>
        <div class="derecha" style="margin-top:6px">Suma productos: <b>${JZAC.ui.dinero(sumaItems(f))}</b></div>
        ${Math.abs(otrosCargos) > 0.01 ? `<div class="derecha texto-suave" style="font-size:13px">Otros cargos: ${JZAC.ui.dinero(otrosCargos)}</div>` : ''}
      ` : ''}
      <div class="seccion-titulo">Historial de pagos</div>
      <div class="tabla-wrap"><table>
        <tr><th>Fecha</th><th>Método</th><th class="monto">Monto</th></tr>${filasPagos}
      </table></div>`,
      `<button class="btn btn-whatsapp" id="fiado-recordatorio"> Recordatorio</button>
       <button class="btn" data-cerrar>Cerrar</button>
       ${saldo > 0 ? '<button class="btn btn-primario" id="pagar-ahora">+ Registrar pago</button>' : ''}`);

    if (m.raiz.querySelector('#pagar-ahora')) {
      m.raiz.querySelector('#pagar-ahora').addEventListener('click', () => { m.cerrar(); modalPago(f, refrescar); });
    }
    m.raiz.querySelector('#fiado-recordatorio').addEventListener('click', async () => {
      if (saldo <= 0) { JZAC.ui.toast('Esta cuenta ya está pagada.', 'bien'); return; }
      const c = clientes.find((x) => JZAC.negocio.nombreClave(x.nombre) === JZAC.negocio.nombreClave(f.cliente));
      const num = numW(c && c.whatsapp);
      if (!num) { JZAC.ui.toast('Este cliente no tiene WhatsApp guardado. Agrégaselo en Clientes.', 'mal'); return; }
      let negocio = 'nuestro negocio';
      try { const u = await JZAC.auth.usuarioActual(); if (u && u.nombreNegocio) negocio = u.nombreNegocio; } catch (e) { /* sin usuario */ }
      const ult = items.length ? items[items.length - 1] : null;
      const txt = [
        `Hola ${f.cliente} 👋`,
        `Te recordamos tu deuda en ${negocio}: ${JZAC.ui.dinero(saldo)} pendiente.`,
        ult ? `Llevas ${JZAC.ui.n(items.length)} producto(s); el último fue el ${JZAC.ui.fh(ult.fecha)}.` : '',
        'Gracias por su preferencia 🙏'
      ].filter(Boolean).join('\n');
      JZAC.ui.abrirWha('https://wa.me/' + num + '?text=' + encodeURIComponent(txt));
    });
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.fiados = { render };
})();
