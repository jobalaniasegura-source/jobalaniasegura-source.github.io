// ============================================================
// JZAC ERP - Reportes (utilidad real, ranking, export CSV)
// ============================================================
(function () {
  async function cargar(desde, hasta) {
    const ventas = (await JZAC.db.listar('ventas')).filter((v) => v.fecha >= desde && v.fecha <= hasta);
    const detv = (await JZAC.db.listar('detalle_venta')).filter((d) => ventas.some((v) => v.id === d.ventaId));
    const gastos = (await JZAC.db.listar('gastos')).filter((g) => g.fecha >= desde && g.fecha <= hasta);
    const ingresos = ventas.reduce((a, v) => a + Number(v.total || 0), 0);
    const costo = detv.reduce((a, d) => a + Number(d.costo || 0) * Number(d.cantidad || 0), 0);
    const gastoTotal = gastos.reduce((a, g) => a + Number(g.monto || 0), 0);
    const ganancia = ingresos - costo - gastoTotal;

    const porProducto = {};
    detv.forEach((d) => {
      porProducto[d.producto] = porProducto[d.producto] || { cantidad: 0, venta: 0, costo: 0 };
      porProducto[d.producto].cantidad += Number(d.cantidad);
      porProducto[d.producto].venta += Number(d.precio) * Number(d.cantidad);
      porProducto[d.producto].costo += Number(d.costo) * Number(d.cantidad);
    });
    const top = Object.entries(porProducto).map(([n, v]) => ({ producto: n, ...v }))
      .sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);

    const porCliente = {};
    ventas.forEach((v) => {
      const c = v.cliente || 'Sin cliente';
      porCliente[c] = porCliente[c] || { ventas: 0, total: 0 };
      porCliente[c].ventas++;
      porCliente[c].total += Number(v.total);
    });
    const clientes = Object.entries(porCliente).map(([n, v]) => ({ cliente: n, ...v }))
      .sort((a, b) => b.total - a.total);

    return {
      ventas, detv, gastos, ingresos, costo, gastoTotal, ganancia, top, clientes,
      nVentas: ventas.length, ticketProm: ventas.length ? ingresos / ventas.length : 0
    };
  }

  async function render(cont) {
    const fin = new Date(); fin.setHours(23, 59, 59, 999);
    const ini = new Date(fin.getFullYear(), fin.getMonth(), 1);

    cont.innerHTML = `
      <div class="card">
        <div class="seccion-titulo" style="margin-top:0">Período del reporte</div>
        <div class="fila" style="align-items:flex-end">
          <div class="campo" style="margin:0"><label>Desde</label><input type="date" id="r-desde" value="${JZAC.ui.fechaInput(ini.getTime())}"></div>
          <div class="campo" style="margin:0"><label>Hasta</label><input type="date" id="r-hasta" value="${JZAC.ui.fechaInput(fin.getTime())}"></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primario" id="r-aplicar">Aplicar</button>
            <button class="btn" id="r-csv">Exportar CSV</button>
          </div>
        </div>
      </div>
      <div id="r-cuerpo"></div>`;

    const desde = () => JZAC.ui.fechaDesdeInput(document.getElementById('r-desde').value);
    const hasta = () => {
      const d = JZAC.ui.fechaDesdeInput(document.getElementById('r-hasta').value);
      return d == null ? d : d + 86399999;
    };

    document.getElementById('r-aplicar').addEventListener('click', () => pintaCuerpo(desde(), hasta()));
    document.getElementById('r-csv').addEventListener('click', async () => {
      const r = await cargar(desde(), hasta());
      exportarCsv(r);
    });
    pintaCuerpo(desde(), hasta());
  }

  async function pintaCuerpo(desde, hasta) {
    const r = await cargar(desde, hasta);
    const c = document.getElementById('r-cuerpo');
    c.innerHTML = `
      <div class="grid grid-4 mt16">
        <div class="card stat verde"><div class="stat-titulo">Ingresos</div><div class="stat-valor">${JZAC.ui.dinero(r.ingresos)}</div></div>
        <div class="card stat rojo"><div class="stat-titulo">Costo vendido</div><div class="stat-valor">${JZAC.ui.dinero(r.costo)}</div></div>
        <div class="card stat dorado"><div class="stat-titulo">Gastos</div><div class="stat-valor">${JZAC.ui.dinero(r.gastoTotal)}</div></div>
        <div class="card stat azul"><div class="stat-titulo">Ganancia real</div><div class="stat-valor">${JZAC.ui.dinero(r.ganancia)}</div></div>
      </div>
      <div class="grid grid-3 mt16">
        <div class="card"><div class="stat-titulo">Ventas realizadas</div><div class="stat-valor" style="font-size:20px">${r.nVentas}</div></div>
        <div class="card"><div class="stat-titulo">Ticket promedio</div><div class="stat-valor" style="font-size:20px">${JZAC.ui.dinero(r.ticketProm)}</div></div>
        <div class="card"><div class="stat-titulo">Unidades vendidas</div><div class="stat-valor" style="font-size:20px">${r.detv.reduce((a, d) => a + Number(d.cantidad || 0), 0)}</div></div>
      </div>

      <div class="grid grid-2 mt16">
        <div class="card">
          <div class="seccion-titulo" style="margin-top:0">Top productos vendidos</div>
          ${r.top.length === 0 ? '<div class="texto-suave">Sin ventas en el período.</div>' : `<div class="tabla-wrap"><table>
            <tr><th>#</th><th>Producto</th><th class="center">Unid.</th><th class="monto">Venta</th><th class="monto">Utilidad</th></tr>
            ${r.top.map((t, i) => `<tr><td>${i + 1}</td><td class="negrita">${JZAC.ui.esc(t.producto)}</td><td class="center">${JZAC.ui.n(t.cantidad)}</td><td class="monto">${JZAC.ui.dinero(t.venta)}</td><td class="monto">${JZAC.ui.dinero(t.venta - t.costo)}</td></tr>`).join('')}
          </table></div>`}
        </div>
        <div class="card">
          <div class="seccion-titulo" style="margin-top:0">Ventas por cliente</div>
          ${r.clientes.length === 0 ? '<div class="texto-suave">Sin ventas en el período.</div>' : `<div class="tabla-wrap"><table>
            <tr><th>Cliente</th><th class="center">N°</th><th class="monto">Total</th></tr>
            ${r.clientes.map((c) => `<tr><td>${JZAC.ui.esc(c.cliente)}</td><td class="center">${c.ventas}</td><td class="monto">${JZAC.ui.dinero(c.total)}</td></tr>`).join('')}
          </table></div>`}
        </div>
      </div>

      ${r.gastos.length ? `<div class="card mt16">
        <div class="seccion-titulo" style="margin-top:0">Gastos del período</div>
        <div class="tabla-wrap"><table>
          <tr><th>Fecha</th><th>Concepto</th><th class="monto">Monto</th></tr>
          ${r.gastos.map((g) => `<tr><td>${JZAC.ui.fe(g.fecha)}</td><td>${JZAC.ui.esc(g.concepto)}</td><td class="monto">${JZAC.ui.dinero(g.monto)}</td></tr>`).join('')}
        </table></div>
      </div>` : ''}

      ${r.ventas.length ? `<div class="card mt16">
        <div class="seccion-titulo" style="margin-top:0">Detalle de ventas</div>
        <div class="tabla-wrap"><table>
          <tr><th>Boleta</th><th>Fecha</th><th>Cliente</th><th>Pago</th><th class="monto">Total</th></tr>
          ${r.ventas.sort((a, b) => a.fecha - b.fecha).map((v) => `<tr><td>${JZAC.ui.esc(v.boleta)}</td><td>${JZAC.ui.fh(v.fecha)}</td><td>${JZAC.ui.esc(v.cliente || '—')}</td><td>${JZAC.ui.esc(v.metodoPago)}</td><td class="monto">${JZAC.ui.dinero(v.total)}</td></tr>`).join('')}
        </table></div>
      </div>` : ''}`;
  }

  function exportarCsv(r) {
    const lineas = [
      ['Boleta', 'Fecha', 'Cliente', 'Metodo', 'Descuento', 'Total']
    ];
    r.ventas.sort((a, b) => a.fecha - b.fecha).forEach((v) => {
      lineas.push([v.boleta, new Date(v.fecha).toLocaleString('es-PE'), v.cliente || '', v.metodoPago, Number(v.descuento || 0), Number(v.total)]);
    });
    const csv = '\uFEFF' + lineas.map((l) => l.map((x) => '"' + String(x).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reporte_ventas_' + JZAC.ui.fechaInput(r.ventas[0] ? r.ventas[0].fecha : Date.now()).replace(/-/g, '') + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    JZAC.ui.toast('CSV exportado.', 'bien');
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.reportes = { render };
})();