// ============================================================
// JZAC ERP - Clientes
// ============================================================
(function () {
  async function render(cont) {
    const clientes = (await JZAC.db.listar('clientes')).sort((a, b) => a.nombre.localeCompare(b.nombre));
    const fiados = await JZAC.db.listar('fiados');

    const deudas = {};
    fiados.filter((f) => f.estado === 'Pendiente').forEach((f) => {
      const saldo = Number(f.montoTotal || 0) - Number(f.montoPagado || 0);
      deudas[f.cliente] = (deudas[f.cliente] || 0) + saldo;
    });

    cont.innerHTML = `
      <div class="panel-hdr">
        <div><div class="seccion-titulo" style="margin:0">Clientes</div>
        <div class="texto-suave" style="font-size:13px">${clientes.length} cliente(s)</div></div>
        <button class="btn btn-primario" id="nuevo-cliente">+ Nuevo cliente</button>
      </div>
      ${clientes.length === 0
        ? JZAC.ui.vacio('Sin clientes aún', 'Agrega tus primeros clientes.', '<button class="btn btn-primario mt16" id="nuevo-cliente2">+ Nuevo cliente</button>')
        : `<div class="tabla-wrap"><table>
            <tr><th>Cliente</th><th>WhatsApp</th><th>Teléfono</th><th class="monto">Deuda</th><th></th></tr>
            ${clientes.map((c) => {
              const deuda = deudas[c.nombre] || 0;
              return `<tr>
                <td class="negrita">${JZAC.ui.esc(c.nombre)}</td>
                <td>${c.whatsapp ? `<a target="_blank" rel="noopener" href="https://wa.me/${String(c.whatsapp).replace(/[^0-9]/g, '')}">${JZAC.ui.esc(c.whatsapp)}</a>` : '—'}</td>
                <td>${JZAC.ui.esc(c.telefono || '—')}</td>
                <td class="monto">${deuda > 0 ? `<span class="badge badge-rojo">${JZAC.ui.dinero(deuda)}</span>` : JZAC.ui.dinero(0)}</td>
                <td><div class="acciones">
                  <button class="btn btn-sm" data-editar="${c.id}">Editar</button>
                  <button class="btn btn-sm btn-peligro" data-borrar="${c.id}">Eliminar</button>
                </div></td>
              </tr>`;
            }).join('')}
          </table></div>`}`;

    if (document.getElementById('nuevo-cliente2')) {
      document.getElementById('nuevo-cliente2').addEventListener('click', () => modalCliente(null, () => render(cont)));
    }
    document.getElementById('nuevo-cliente').addEventListener('click', () => modalCliente(null, () => render(cont)));
    cont.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
      const c = clientes.find((x) => x.id === Number(b.dataset.editar));
      modalCliente(c, () => render(cont));
    }));
    cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      const c = clientes.find((x) => x.id === Number(b.dataset.borrar));
      if (await JZAC.ui.confirmar(`¿Eliminar el cliente <b>${c.nombre}</b>?`)) {
        await JZAC.db.borrar('clientes', c.id);
        JZAC.ui.toast('Cliente eliminado.', 'bien');
        render(cont);
      }
    }));
  }

  function modalCliente(c, refrescar) {
    const edicion = !!c;
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>${edicion ? 'Editar cliente' : 'Nuevo cliente'}</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="campo"><label>Nombre completo</label><input id="c-nombre" value="${JZAC.ui.esc(c ? c.nombre : '')}"></div>
      <div class="fila">
        <div class="campo"><label>WhatsApp (con código)</label><input id="c-wha" placeholder="51 999 000 000" value="${JZAC.ui.esc(c ? (c.whatsapp || '') : '')}"></div>
        <div class="campo"><label>Teléfono</label><input id="c-tel" value="${JZAC.ui.esc(c ? (c.telefono || '') : '')}"></div>
      </div>
      <div class="campo"><label>Dirección</label><input id="c-direc" value="${JZAC.ui.esc(c ? (c.direccion || '') : '')}"></div>
      <div class="campo"><label>Notas</label><textarea rows="2" id="c-notas">${JZAC.ui.esc(c ? (c.notas || '') : '')}</textarea></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-cli">${edicion ? 'Guardar cambios' : 'Agregar cliente'}</button>`);

    m.raiz.querySelector('#guardar-cli').addEventListener('click', async () => {
      const nombre = document.getElementById('c-nombre').value.trim();
      if (!nombre) { JZAC.ui.toast('Escribe el nombre del cliente.', 'mal'); return; }
      const obj = {
        nombre,
        whatsapp: document.getElementById('c-wha').value.trim(),
        telefono: document.getElementById('c-tel').value.trim(),
        direccion: document.getElementById('c-direc').value.trim(),
        notas: document.getElementById('c-notas').value.trim(),
        creado: Date.now()
      };
      if (edicion) obj.id = c.id;
      await JZAC.db.guardar('clientes', obj);
      JZAC.ui.toast(edicion ? 'Cliente actualizado.' : 'Cliente agregado.', 'bien');
      m.cerrar();
      refrescar();
    });
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.clientes = { render };
})();