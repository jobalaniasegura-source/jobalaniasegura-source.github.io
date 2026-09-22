// ============================================================
// JZAC ERP - Fiados (deudas y pagos)
// ============================================================
(function () {
  async function render(cont) {
    const fiados = (await JZAC.db.listar('fiados')).sort((a, b) => {
      const oa = a.estado === 'Pendiente' ? 0 : 1;
      const ob = b.estado === 'Pendiente' ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return (Number(b.montoTotal) - Number(b.montoPagado)) - (Number(a.montoTotal) - Number(a.montoPagado));
    });
    const clientes = await JZAC.db.listar('clientes');
    const pagos = await JZAC.db.listar('pagos_fiado');

    const totalDeuda = fiados.filter((f) => f.estado === 'Pendiente')
      .reduce((a, f) => a + (Number(f.montoTotal || 0) - Number(f.montoPagado || 0)), 0);
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
              const saldo = Number(f.montoTotal) - Number(f.montoPagado);
              const np = pagos.filter((x) => x.fiadoId === f.id).length;
              return `<tr>
                <td class="negrita">${JZAC.ui.esc(f.cliente)}</td>
                <td>${JZAC.ui.fe(f.fecha)}</td>
                <td class="monto">${JZAC.ui.dinero(f.montoTotal)}</td>
                <td class="monto">${JZAC.ui.dinero(f.montoPagado)}</td>
                <td class="monto">${saldo > 0 ? `<b style="color:var(--rojo)">${JZAC.ui.dinero(saldo)}</b>` : JZAC.ui.dinero(0)}</td>
                <td>${f.estado === 'Pagado' ? '<span class="badge badge-verde">Pagado</span>' : '<span class="badge badge-rojo">Pendiente</span>'}</td>
                <td><div class="acciones">
                  <button class="btn btn-sm" data-detalle="${f.id}">Detalle (${np})</button>
                  ${saldo > 0 ? `<button class="btn btn-sm btn-primario" data-pago="${f.id}">+ Pago</button>` : ''}
                </div></td>
              </tr>`;
            }).join('')}
          </table></div>`}`;

    if (document.getElementById('nuevo-fiado2')) {
      document.getElementById('nuevo-fiado2').addEventListener('click', () => modalNuevoFiado(clientes, () => render(cont)));
    }
    document.getElementById('ver-clientes').addEventListener('click', () => JZAC.ir('clientes'));
    document.getElementById('nuevo-fiado').addEventListener('click', () => modalNuevoFiado(clientes, () => render(cont)));
    cont.querySelectorAll('[data-detalle]').forEach((b) => b.addEventListener('click', () => modalDetalle(
      fiados.find((x) => x.id === Number(b.dataset.detalle)), pagos, () => render(cont))));
    cont.querySelectorAll('[data-pago]').forEach((b) => b.addEventListener('click', () => modalPago(
      fiados.find((x) => x.id === Number(b.dataset.pago)), () => render(cont))));
  }

  function modalNuevoFiado(clientes, refrescar) {
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Nuevo fiado</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="campo"><label>Cliente</label>
        <select id="f-cliente">
          <option value="">Selecciona un cliente...</option>
          ${clientes.map((c) => `<option>${JZAC.ui.esc(c.nombre)}</option>`).join('')}
        </select>
      </div>
      <div class="campo"><label>Monto total (S/)</label><input type="number" step="0.01" min="0.1" id="f-monto"></div>
      <div class="campo"><label>Notas (opcional)</label><textarea rows="2" id="f-notas"></textarea></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-f">Registrar fiado</button>`);

    m.raiz.querySelector('#guardar-f').addEventListener('click', async () => {
      const cliente = document.getElementById('f-cliente').value;
      const monto = Number(document.getElementById('f-monto').value || 0);
      const notas = document.getElementById('f-notas').value.trim();
      if (!cliente) { JZAC.ui.toast('Selecciona el cliente.', 'mal'); return; }
      if (monto <= 0) { JZAC.ui.toast('Ingresa un monto válido.', 'mal'); return; }
      await JZAC.db.guardar('fiados', {
        cliente, montoTotal: Math.round(monto * 100) / 100, montoPagado: 0,
        estado: 'Pendiente', fecha: Date.now(), notas
      });
      JZAC.ui.toast('Fiado registrado.', 'bien');
      m.cerrar();
      refrescar();
    });
  }

  function modalPago(f, refrescar) {
    const saldo = Number(f.montoTotal) - Number(f.montoPagado);
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Registrar pago · ${JZAC.ui.esc(f.cliente)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:10px">Saldo pendiente: <b style="color:var(--rojo)">${JZAC.ui.dinero(saldo)}</b></div>
      <div class="fila">
        <div class="campo"><label>Monto (S/)</label><input type="number" step="0.01" min="0.01" id="p-monto" value="${JZAC.ui.n(saldo)}"></div>
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

  function modalDetalle(f, pagos, refrescar) {
    const misPagos = pagos.filter((x) => x.fiadoId === f.id).sort((a, b) => b.fecha - a.fecha);
    const saldo = Number(f.montoTotal) - Number(f.montoPagado);
    const filas = misPagos.length
      ? misPagos.map((x) => `<tr><td>${JZAC.ui.fh(x.fecha)}</td><td>${JZAC.ui.esc(x.metodo || 'Efectivo')}</td><td class="monto">${JZAC.ui.dinero(x.monto)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="center">Sin pagos registrados.</td></tr>';
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Fiado · ${JZAC.ui.esc(f.cliente)}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="margin-bottom:12px">Registrado: ${JZAC.ui.fe(f.fecha)}${f.notas ? '<br>Notas: ' + JZAC.ui.esc(f.notas) : ''}</div>
      <div class="grid grid-3" style="margin-bottom:14px">
        <div class="card"><div class="stat-titulo">Total</div><b>${JZAC.ui.dinero(f.montoTotal)}</b></div>
        <div class="card"><div class="stat-titulo">Pagado</div><b>${JZAC.ui.dinero(f.montoPagado)}</b></div>
        <div class="card"><div class="stat-titulo">Saldo</div><b style="color:${saldo > 0 ? 'var(--rojo)' : 'var(--verde)'}">${JZAC.ui.dinero(saldo)}</b></div>
      </div>
      <div class="seccion-titulo">Historial de pagos</div>
      <div class="tabla-wrap"><table>
        <tr><th>Fecha</th><th>Método</th><th class="monto">Monto</th></tr>${filas}
      </table></div>`,
      `<button class="btn" data-cerrar>Cerrar</button>
       ${saldo > 0 ? '<button class="btn btn-primario" id="pagar-ahora">+ Registrar pago</button>' : ''}`);

    if (m.raiz.querySelector('#pagar-ahora')) {
      m.raiz.querySelector('#pagar-ahora').addEventListener('click', () => { m.cerrar(); modalPago(f, refrescar); });
    }
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.fiados = { render };
})();