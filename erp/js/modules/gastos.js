// ============================================================
// JZAC ERP - Gastos
// ============================================================
(function () {
  async function render(cont) {
    const gastos = (await JZAC.db.listar('gastos')).sort((a, b) => b.fecha - a.fecha);
    const hoy = JZAC.ui.hoyRango();
    const inMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const gHoy = gastos.filter((g) => g.fecha >= hoy.desde && g.fecha <= hoy.hasta).reduce((a, g) => a + Number(g.monto || 0), 0);
    const gMes = gastos.filter((g) => g.fecha >= inMes).reduce((a, g) => a + Number(g.monto || 0), 0);
    const gTotal = gastos.reduce((a, g) => a + Number(g.monto || 0), 0);

    cont.innerHTML = `
      <div class="grid grid-3">
        <div class="card stat dorado"><div class="stat-titulo">Gastos hoy</div><div class="stat-valor">${JZAC.ui.dinero(gHoy)}</div></div>
        <div class="card stat rojo"><div class="stat-titulo">Gastos del mes</div><div class="stat-valor">${JZAC.ui.dinero(gMes)}</div></div>
        <div class="card stat azul"><div class="stat-titulo">Gastos totales</div><div class="stat-valor">${JZAC.ui.dinero(gTotal)}</div></div>
      </div>

      <div class="panel-hdr mt16">
        <button class="btn btn-primario" id="nuevo-gasto">+ Registrar gasto</button>
      </div>

      ${gastos.length === 0
        ? JZAC.ui.vacio('Sin gastos', 'Registra tus gastos para conocer tu ganancia real.')
        : `<div class="tabla-wrap"><table>
            <tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th class="monto">Monto</th><th></th></tr>
            ${gastos.map((g) => `<tr>
              <td>${JZAC.ui.fh(g.fecha)}</td>
              <td class="negrita">${JZAC.ui.esc(g.concepto)}</td>
              <td>${g.categoria ? `<span class="badge badge-gris">${JZAC.ui.esc(g.categoria)}</span>` : '—'}</td>
              <td class="monto">${JZAC.ui.dinero(g.monto)}</td>
              <td class="derecha"><button class="btn btn-sm btn-peligro" data-borrar="${g.id}">Eliminar</button></td>
            </tr>`).join('')}
          </table></div>`}`;

    document.getElementById('nuevo-gasto').addEventListener('click', () => modalGasto(() => render(cont)));
    cont.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      const g = gastos.find((x) => x.id === Number(b.dataset.borrar));
      if (await JZAC.ui.confirmar(`¿Eliminar el gasto <b>${g.concepto}</b> por ${JZAC.ui.dinero(g.monto)}?`)) {
        await JZAC.db.borrar('gastos', g.id);
        JZAC.ui.toast('Gasto eliminado.', 'bien');
        render(cont);
      }
    }));
  }

  function modalGasto(refrescar) {
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Registrar gasto</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="campo"><label>Concepto</label><input id="g-concepto" placeholder="Ej. Pasaje, luz, reposición..."></div>
      <div class="fila">
        <div class="campo"><label>Monto (S/)</label><input type="number" step="0.01" min="0.01" id="g-monto"></div>
        <div class="campo"><label>Categoría</label>
          <select id="g-cat"><option>Varios</option><option>Servicios</option><option>Transporte</option><option>Alquiler</option><option>Compra</option></select>
        </div>
      </div>
      <div class="campo"><label>Fecha</label><input type="date" id="g-fecha" value="${JZAC.ui.fechaInput(Date.now())}"></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="guardar-gasto">Guardar gasto</button>`);

    m.raiz.querySelector('#guardar-gasto').addEventListener('click', async () => {
      const concepto = document.getElementById('g-concepto').value.trim();
      const monto = Number(document.getElementById('g-monto').value || 0);
      if (!concepto) { JZAC.ui.toast('Escribe el concepto.', 'mal'); return; }
      if (monto <= 0) { JZAC.ui.toast('Ingresa un monto válido.', 'mal'); return; }
      const fechav = document.getElementById('g-fecha').value;
      await JZAC.db.guardar('gastos', {
        concepto,
        monto: Math.round(monto * 100) / 100,
        categoria: document.getElementById('g-cat').value,
        fecha: JZAC.ui.fechaDesdeInput(fechav) || Date.now()
      });
      JZAC.ui.toast('Gasto registrado.', 'bien');
      m.cerrar();
      refrescar();
    });
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.gastos = { render };
})();