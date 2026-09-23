// ============================================================
// JZAC ERP - Inventario (productos, mermas, alertas)
// ============================================================
(function () {
  // ---------- productos ----------
  async function pintaProductos(cont) {
    const productos = (await JZAC.db.listar('productos')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const stockBajo = productos.filter((p) => Number(p.stock || 0) <= Number(p.stockMin || 0));
    const valor = productos.reduce((a, p) => a + Number(p.stock || 0) * Number(p.precioCompra || 0), 0);

    cont.innerHTML = `
      <div class="grid grid-4">
        <div class="card stat verde"><div class="stat-titulo">Productos</div><div class="stat-valor">${productos.length}</div></div>
        <div class="card stat azul"><div class="stat-titulo">Valor inventario</div><div class="stat-valor">${JZAC.ui.dinero(valor)}</div></div>
        <div class="card stat rojo"><div class="stat-titulo">En alerta</div><div class="stat-valor">${stockBajo.length}</div></div>
        <div class="card stat dorado"><div class="stat-titulo">Sugerencia reposición</div><div class="stat-valor">${stockBajo.filter((p) => Number(p.stockMin || 0) > 0).length}</div></div>
      </div>

      <div class="panel-hdr mt16">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn" id="ver-mermas">Ver mermas</button>
          <button class="btn" id="escanear-inv" title="Escanear código para encontrar un producto"> Escanear</button>
        </div>
        <button class="btn btn-primario" id="nuevo-producto">+ Agregar producto</button>
      </div>

      ${stockBajo.length ? reposicion(stockBajo) : ''}

      ${productos.length === 0
        ? JZAC.ui.vacio('Inventario vacío', 'Agrega tu primer producto.', '<button class="btn btn-primario mt16" id="nuevo-producto2">+ Agregar producto</button>')
        : `<div class="tabla-wrap"><table>
            <tr><th>Producto</th><th>Código</th><th class="monto">Costo</th><th class="monto">Precio</th><th class="monto">Stock</th><th class="monto">Mínimo</th><th>Vence</th><th></th></tr>
            ${productos.map((p) => {
              const alerta = Number(p.stock || 0) <= Number(p.stockMin || 0);
              return `<tr>
                <td class="negrita">${JZAC.ui.esc(p.nombre)}</td>
                <td>${JZAC.ui.esc(p.codigo || p.barra || '—')}</td>
                <td class="monto">${JZAC.ui.dinero(p.precioCompra)}</td>
                <td class="monto">${JZAC.ui.dinero(p.precioVenta)}</td>
                <td class="monto">${alerta ? `<span class="badge badge-rojo">${JZAC.ui.n(p.stock)}</span>` : JZAC.ui.n(p.stock)}</td>
                <td class="monto">${JZAC.ui.n(p.stockMin)}</td>
                <td>${p.fechaVencimiento ? JZAC.ui.fe(p.fechaVencimiento) : '—'}</td>
                <td><div class="acciones">
                  <button class="btn btn-sm" data-editar="${p.id}">Editar</button>
                  <button class="btn btn-sm btn-peligro" data-borrar="${p.id}">Eliminar</button>
                </div></td>
              </tr>`;
            }).join('')}
          </table></div>`}`;

    if (document.getElementById('nuevo-producto2')) {
      document.getElementById('nuevo-producto2').addEventListener('click', () => modalProducto(null, () => pintaProductos(cont)));
    }
    document.getElementById('nuevo-producto').addEventListener('click', () => modalProducto(null, () => pintaProductos(cont)));
    document.getElementById('escanear-inv').addEventListener('click', async () => {
      const res = await JZAC.escanear({ titulo: 'Buscar producto por código' });
      if (!res || !res.texto) return;
      const p = JZAC.productoPorCodigo(productos, res.texto);
      if (!p) { JZAC.ui.toast('No hay producto con ese código.', 'mal'); return; }
      modalProducto(p, () => pintaProductos(cont));
    });
    document.getElementById('ver-mermas').addEventListener('click', () => JZAC.ir('inventario/mermas'));
    cont.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
      const p = productos.find((x) => x.id === Number(b.dataset.editar));
      modalProducto(p, () => pintaProductos(cont));
    }));
    cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      const p = productos.find((x) => x.id === Number(b.dataset.borrar));
      if (await JZAC.ui.confirmar(`¿Eliminar el producto <b>${p.nombre}</b>?`)) {
        await JZAC.db.borrar('productos', p.id);
        JZAC.ui.toast('Producto eliminado.', 'bien');
        pintaProductos(cont);
      }
    }));
  }

  function reposicion(stockBajo) {
    return `<div class="card mt16" style="border-left:4px solid var(--dorado)">
      <div class="seccion-titulo" style="margin-top:0">Sugerencia de reposición</div>
      <div class="tabla-wrap"><table>
        <tr><th>Producto</th><th class="monto">Stock</th><th class="monto">Min.</th><th class="monto">Sugerido reponer</th></tr>
        ${stockBajo.map((p) => `<tr><td>${JZAC.ui.esc(p.nombre)}</td><td class="monto">${JZAC.ui.n(p.stock)}</td><td class="monto">${JZAC.ui.n(p.stockMin)}</td><td class="monto">${JZAC.ui.n(Math.max(0, Number(p.stockMin || 0) - Number(p.stock || 0)))}</td></tr>`).join('')}
      </table></div>
    </div>`;
  }

  function modalProducto(p, refrescar) {
    const edicion = !!p;
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>${edicion ? 'Editar producto' : 'Nuevo producto'}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="campo"><label>Nombre del producto</label><input id="f-nombre" value="${JZAC.ui.esc(p ? p.nombre : '')}"></div>
      <div class="scan-btn-fila">
        <div class="campo"><label>Código / QR del producto (opcional)</label><input id="f-codigo" placeholder="Código de barras o QR" value="${JZAC.ui.esc(p ? (p.codigo || p.barra || '') : '')}"></div>
        <button class="btn" id="escanear-codigo" title="Escanear código de barras o QR"> Escanear</button>
      </div>
      <div class="fila">
        <div class="campo"><label>Precio compra (S/)</label><input type="number" step="0.01" min="0" id="f-compra" value="${p ? p.precioCompra : ''}"></div>
        <div class="campo"><label>Precio venta (S/)</label><input type="number" step="0.01" min="0" id="f-venta" value="${p ? p.precioVenta : ''}"></div>
      </div>
      <div class="fila">
        <div class="campo"><label>Stock actual</label><input type="number" step="1" min="0" id="f-stock" value="${p ? p.stock : ''}"></div>
        <div class="campo"><label>Stock mínimo (alerta)</label><input type="number" step="1" min="0" id="f-stockmin" value="${p ? (p.stockMin || 0) : ''}"></div>
      </div>
      <div class="campo"><label>Fecha de vencimiento (opcional)</label><input type="date" id="f-vence" value="${p && p.fechaVencimiento ? JZAC.ui.fechaInput(p.fechaVencimiento) : ''}"></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-prod">${edicion ? 'Guardar cambios' : 'Agregar producto'}</button>`);

    m.raiz.querySelector('#escanear-codigo').addEventListener('click', async () => {
      const res = await JZAC.escanear({ titulo: 'Escanear código del producto' });
      if (res && res.texto) {
        document.getElementById('f-codigo').value = res.texto;
        JZAC.ui.toast('Código capturado.', 'bien');
      }
    });

    m.raiz.querySelector('#guardar-prod').addEventListener('click', async () => {
      const nombre = document.getElementById('f-nombre').value.trim();
      if (!nombre) { JZAC.ui.toast('Escribe el nombre del producto.', 'mal'); return; }
      const obj = {
        nombre,
        codigo: document.getElementById('f-codigo').value.trim(),
        precioCompra: Math.max(0, Number(document.getElementById('f-compra').value || 0)),
        precioVenta: Math.max(0, Number(document.getElementById('f-venta').value || 0)),
        stock: Math.max(0, Number(document.getElementById('f-stock').value || 0)),
        stockMin: Math.max(0, Number(document.getElementById('f-stockmin').value || 0)),
        fechaVencimiento: document.getElementById('f-vence').value ? new Date(document.getElementById('f-vence').value).getTime() : null,
        creado: Date.now()
      };
      if (edicion) { obj.id = p.id; }
      const key = await JZAC.db.guardar('productos', obj);
      JZAC.ui.toast(edicion ? 'Producto actualizado.' : 'Producto agregado.', 'bien');
      m.cerrar();
      refrescar();
    });
  }

  // ---------- mermas ----------
  async function pintaMermas(cont) {
    const productos = (await JZAC.db.listar('productos')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const mermas = (await JZAC.db.listar('mermas')).sort((a, b) => b.fecha - a.fecha);

    cont.innerHTML = `
      <button class="btn btn-sm" id="volver-inv" style="margin-bottom:14px">← Volver a inventario</button>
      <div class="panel-hdr">
        <div><div class="seccion-titulo" style="margin:0">Registro de mermas</div>
        <div class="texto-suave" style="font-size:13px">${mermas.length} merma(s) registradas</div></div>
        <button class="btn btn-primario" id="nueva-merma">+ Registrar merma</button>
      </div>
      ${productos.length === 0
        ? JZAC.ui.vacio('Sin productos', 'Primero agrega productos al inventario.')
        : mermas.length === 0
          ? JZAC.ui.vacio('Sin mermas', 'Aún no registras mermas.')
          : `<div class="tabla-wrap"><table>
              <tr><th>Fecha</th><th>Producto</th><th class="center">Cant.</th><th>Motivo</th></tr>
              ${mermas.map((x) => `<tr><td>${JZAC.ui.fh(x.fecha)}</td><td>${JZAC.ui.esc(x.producto)}</td><td class="center">${JZAC.ui.n(x.cantidad)}</td><td>${JZAC.ui.esc(x.motivo || '—')}</td></tr>`).join('')}
            </table></div>`}`;

    document.getElementById('volver-inv').addEventListener('click', () => JZAC.ir('inventario'));
    document.getElementById('nueva-merma').addEventListener('click', () => modalMerma(productos, () => pintaMermas(cont)));
  }

  function modalMerma(productos, refrescar) {
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Registrar merma</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="campo"><label>Producto</label>
        <select id="mm-prod"><option value="">Selecciona...</option>${productos.map((p) => `<option value="${p.id}">${JZAC.ui.esc(p.nombre)} (stock: ${JZAC.ui.n(p.stock)})</option>`).join('')}</select>
      </div>
      <div class="campo"><label>Cantidad</label><input type="number" step="1" min="1" id="mm-cant" value="1"></div>
      <div class="campo"><label>Motivo (opcional)</label><input id="mm-motivo" placeholder="Ej. producto vencido, rotura..."></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-merma">Guardar merma</button>`);

    m.raiz.querySelector('#guardar-merma').addEventListener('click', async () => {
      const p = productos.find((x) => x.id === Number(document.getElementById('mm-prod').value));
      if (!p) { JZAC.ui.toast('Selecciona un producto.', 'mal'); return; }
      const cant = Math.max(1, Number(document.getElementById('mm-cant').value || 1));
      const motivo = document.getElementById('mm-motivo').value.trim();
      JZAC.db.guardar('mermas', { producto: p.nombre, cantidad: cant, motivo, fecha: Date.now() });
      await JZAC.db.ready;
      const nuevo = { ...p, stock: Math.max(0, Number(p.stock) - cant) };
      await JZAC.db.guardar('productos', nuevo);
      JZAC.ui.toast('Merma registrada y stock actualizado.', 'bien');
      m.cerrar();
      refrescar();
    });
  }

  function render(cont) {
    const seg = JZAC.rutaSeg();
    if (seg[1] === 'mermas') {
      pintaMermas(cont).catch((e) => JZAC.ui.toast('Error al cargar mermas', 'mal'));
    } else {
      pintaProductos(cont).catch((e) => JZAC.ui.toast('Error al cargar inventario', 'mal'));
    }
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.inventario = { render };
})();