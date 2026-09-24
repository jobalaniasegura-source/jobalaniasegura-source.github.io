// ============================================================
// JZAC ERP - Dashboard (resumen del dia)
// ============================================================
(function () {
  async function render(cont) {
    const u = await JZAC.auth.usuarioActual();
    const hoy = JZAC.ui.hoyRango();
    const ventas = await JZAC.db.listar('ventas');
    const detv = await JZAC.db.listar('detalle_venta');
    const gastos = await JZAC.db.listar('gastos');
    const productos = await JZAC.db.listar('productos');
    const fiados = await JZAC.db.listar('fiados');

    const ventasHoy = ventas.filter((v) => v.fecha >= hoy.desde && v.fecha <= hoy.hasta);
    const idsHoy = new Set(ventasHoy.map((v) => v.id));
    const ingresosHoy = ventasHoy.reduce((a, v) => a + Number(v.total || 0), 0);
    const costoHoy = detv.filter((d) => idsHoy.has(d.ventaId))
      .reduce((a, d) => a + Number(d.costo || 0) * Number(d.cantidad || 0), 0);
    const gastosHoy = gastos.filter((g) => g.fecha >= hoy.desde && g.fecha <= hoy.hasta)
      .reduce((a, g) => a + Number(g.monto || 0), 0);
    const gananciaNeta = ingresosHoy - costoHoy - gastosHoy;
    const fiadosPendientes = fiados.filter((f) => f.estado === 'Pendiente')
      .reduce((a, f) => a + (Number(f.montoTotal || 0) - Number(f.montoPagado || 0)), 0);
    const valorInventario = productos.reduce((a, p) => a + Number(p.stock || 0) * Number(p.precioCompra || 0), 0);
    const stockBajo = productos
      .filter((p) => Number(p.stock || 0) <= Number(p.stockMin || 0))
      .sort((a, b) => a.stock - b.stock)
      .slice(0, 6);
    const diasDia = 86400000;
    const porVencer = productos
      .filter((p) => p.fechaVencimiento && Number(p.stock || 0) > 0 &&
        Math.ceil((p.fechaVencimiento - Date.now()) / diasDia) <= 30)
      .map((p) => ({ p, dias: Math.ceil((p.fechaVencimiento - Date.now()) / diasDia) }))
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 6);
    const textoDias = (d) => d < 0 ? 'VENCIDO' : (d === 0 ? 'Hoy' : (d === 1 ? '1 día' : `${d} días`));
    const claseDias = (d) => d < 0 ? 'badge-rojo' : (d <= 3 ? 'badge-rojo' : (d <= 7 ? 'badge-dorado' : 'badge-gris'));

    const saludo = new Date().getHours() < 12 ? 'Buenos días' : new Date().getHours() < 19 ? 'Buenas tardes' : 'Buenas noches';
    const fec = new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

    const ticketProm = ventasHoy.length ? ingresosHoy / ventasHoy.length : 0;
    const efectivoHoy = ventasHoy.reduce((a, v) => a + (v.pagoEfectivo != null ? Number(v.pagoEfectivo) : (v.metodoPago === 'Efectivo' ? Number(v.total || 0) : 0)), 0);
    const itemsVendidosHoy = detv.filter((d) => idsHoy.has(d.ventaId)).reduce((a, d) => a + Number(d.cantidad || 0), 0);
    const porMetodo = {};
    ventasHoy.forEach((v) => { const k = v.metodoPago || 'Efectivo'; porMetodo[k] = (porMetodo[k] || 0) + Number(v.total || 0); });
    const topProd = {};
    detv.filter((d) => idsHoy.has(d.ventaId)).forEach((d) => { topProd[d.producto] = (topProd[d.producto] || 0) + Number(d.total || 0); });
    const topArr = Object.entries(topProd).sort((a, b) => b[1] - a[1]).slice(0, 5);

    cont.innerHTML = `
      <div class="card mt16">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <div class="texto-suave" style="text-transform:capitalize">${fec}</div>
            <h1 style="font-size:22px;margin-top:2px">${saludo}, ${JZAC.ui.esc(u.nombre.split(' ')[0])} </h1>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-whatsapp" data-compartir>Compartir resumen</button>
            <button class="btn btn-sm btn-primario" data-ir="ventas/nueva">+ Nueva venta</button>
          </div>
        </div>
      </div>

      <div class="grid grid-4 mt16">
        <div class="card stat verde"><div class="stat-titulo">Ventas hoy</div><div class="stat-valor">${JZAC.ui.dinero(ingresosHoy)}</div><div class="stat-icono">S</div></div>
        <div class="card stat azul"><div class="stat-titulo">Ganancia neta</div><div class="stat-valor">${JZAC.ui.dinero(gananciaNeta)}</div><div class="stat-icono">G</div></div>
        <div class="card stat dorado"><div class="stat-titulo">Gastos hoy</div><div class="stat-valor">${JZAC.ui.dinero(gastosHoy)}</div><div class="stat-icono">G</div></div>
        <div class="card stat rojo"><div class="stat-titulo">Fiados por cobrar</div><div class="stat-valor">${JZAC.ui.dinero(fiadosPendientes)}</div><div class="stat-icono">F</div></div>
      </div>

      <div class="grid grid-4 mt16">
        <div class="card stat azul"><div class="stat-titulo">Ticket promedio</div><div class="stat-valor">${JZAC.ui.dinero(ticketProm)}</div><div class="stat-icono">T</div></div>
        <div class="card stat verde"><div class="stat-titulo">Ventas (n.º)</div><div class="stat-valor">${ventasHoy.length}</div><div class="stat-icono">N</div></div>
        <div class="card stat dorado"><div class="stat-titulo">Efectivo cobrado</div><div class="stat-valor">${JZAC.ui.dinero(efectivoHoy)}</div><div class="stat-icono">E</div></div>
        <div class="card stat gris"><div class="stat-titulo">Items vendidos</div><div class="stat-valor">${itemsVendidosHoy}</div><div class="stat-icono">I</div></div>
      </div>

      <div class="grid grid-2 mt16">
        <div class="card">
          <div class="seccion-titulo">Pagos de hoy</div>
          ${Object.keys(porMetodo).length === 0
            ? '<div class="texto-suave">Sin ventas registradas hoy.</div>'
            : `<div class="resumen-general">
                ${Object.entries(porMetodo).sort((a, b) => b[1] - a[1]).map(([m, tot]) =>
                  `<div class="resumen-fila"><span><span class="badge badge-gris">${JZAC.ui.esc(m)}</span></span><b>${JZAC.ui.dinero(tot)}</b></div>`).join('')}
              </div>`}
        </div>
        <div class="card">
          <div class="seccion-titulo">Más vendidos hoy</div>
          ${topArr.length === 0
            ? '<div class="texto-suave">Aún no hay ventas hoy.</div>'
            : `<div class="resumen-general">
                ${topArr.map(([prod, tot], i) =>
                  `<div class="resumen-fila"><span>${i + 1}. ${JZAC.ui.esc(prod)}</span><b>${JZAC.ui.dinero(tot)}</b></div>`).join('')}
              </div>`}
        </div>
      </div>

      <div class="grid grid-3 mt16">
        <div class="card">
          <div class="seccion-titulo">Alerta de stock bajo</div>
          ${stockBajo.length === 0
            ? '<div class="texto-suave">Sin productos en alerta. Todo con stock suficiente.</div>'
            : `<div class="tabla-wrap"><table>
                <tr><th>Producto</th><th class="monto">Stock</th><th class="monto">Mínimo</th></tr>
                ${stockBajo.map((p) => `<tr><td>${JZAC.ui.esc(p.nombre)}</td><td class="monto">${JZAC.ui.n(p.stock)}</td><td class="monto">${JZAC.ui.n(p.stockMin)}</td></tr>`).join('')}
              </table></div>`}
          <div class="mt16" style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-primario" data-ir="proveedores/pedido/nuevo">Crear pedido de lo que falta</button>
            <button class="btn btn-sm" data-ir="inventario">Ver inventario</button>
          </div>
        </div>
        <div class="card">
          <div class="seccion-titulo">Próximos a vencer</div>
          ${porVencer.length === 0
            ? '<div class="texto-suave">Sin productos por vencer en los próximos 30 días.</div>'
            : `<div class="tabla-wrap"><table>
                <tr><th>Producto</th><th>Vence</th></tr>
                ${porVencer.map(({ p, dias }) => `<tr><td>${JZAC.ui.esc(p.nombre)}${p.stock > 1 ? ` <span class="texto-suave" style="font-size:12px">x${JZAC.ui.n(p.stock)}</span>` : ''}</td><td>${JZAC.ui.fe(p.fechaVencimiento)} <span class="badge ${claseDias(dias)}">${textoDias(dias)}</span></td></tr>`).join('')}
              </table></div>`}
          ${porVencer.length ? '<div class="mt16"><button class="btn btn-sm btn-whatsapp" data-enviar-venc>¿Avisar por WhatsApp?</button></div>' : ''}
        </div>
        <div class="card">
          <div class="seccion-titulo">A un clic</div>
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn" data-ir="ventas/nueva"> Registrar venta</button>
            <button class="btn" data-ir="inventario/nuevo"> Agregar producto</button>
            <button class="btn" data-ir="fiados"> Cobrar fiado</button>
            <button class="btn" data-ir="reportes"> Ver reportes</button>
          </div>
          <div class="seccion-titulo mt16">Resumen general</div>
          <div class="resumen-general">
            <div class="resumen-fila"><span>Ventas realizadas hoy</span><b>${ventasHoy.length}</b></div>
            <div class="resumen-fila"><span>Valor del inventario</span><b>${JZAC.ui.dinero(valorInventario)}</b></div>
            <div class="resumen-fila"><span>Productos registrados</span><b>${productos.length}</b></div>
          </div>
        </div>
      </div>`;

    cont.querySelectorAll('[data-ir]').forEach((b) =>
      b.addEventListener('click', () => JZAC.ir(b.dataset.ir)));

    cont.querySelector('[data-compartir]').addEventListener('click', () => {
      const texto = [
        '📋 RESUMEN DEL DÍA',
        `Negocio: ${u.nombreNegocio}`,
        ` Ventas: ${JZAC.ui.dinero(ingresosHoy)}`,
        `📈 Ganancia neta: ${JZAC.ui.dinero(gananciaNeta)}`,
        `💸 Gastos: ${JZAC.ui.dinero(gastosHoy)}`,
        ` Fiados por cobrar: ${JZAC.ui.dinero(fiadosPendientes)}`,
        `Generado con JZAC ERP · Software que trabaja por tu negocio`
      ].join('\n');
      JZAC.negocio.wha(texto);
    });

    const bv = cont.querySelector('[data-enviar-venc]');
    if (bv) bv.addEventListener('click', () => {
      const texto = [
        '⏰ ALERTA DE VENCIMIENTOS',
        `Negocio: ${u.nombreNegocio}`,
        porVencer.map(({ p, dias }) => ` ${p.nombre} (x${JZAC.ui.n(p.stock)}) · ${textoDias(dias)} · ${JZAC.ui.fe(p.fechaVencimiento)}`).join('\n'),
        `Generado con JZAC ERP · Software que trabaja por tu negocio`
      ].join('\n');
      JZAC.negocio.wha(texto);
    });
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.dashboard = { render };
})();