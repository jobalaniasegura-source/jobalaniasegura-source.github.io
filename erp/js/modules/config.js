// ============================================================
// JZAC ERP - Configuracion: negocio, licencia y respaldo
// ============================================================
(function () {
  const TABLAS = ['usuarios', 'clientes', 'productos', 'proveedores', 'pedidos_proveedor', 'detalle_pedido', 'ventas', 'detalle_venta', 'fiados', 'pagos_fiado', 'mermas', 'gastos'];

  async function render(cont) {
    const u = await JZAC.auth.usuarioActual();
    const lic = JZAC.lic.estado();

    cont.innerHTML = `
      <div class="grid grid-2">
        <div class="card">
          <div class="seccion-titulo" style="margin-top:0">Datos del negocio</div>
          <div class="campo"><label>Nombre del negocio</label><input id="cf-negocio" value="${JZAC.ui.esc(u.nombreNegocio)}"></div>
          <div class="campo"><label>Tu nombre</label><input id="cf-nombre" value="${JZAC.ui.esc(u.nombre)}"></div>
          <div class="fila">
            <div class="campo"><label>Serie de boleta</label><input id="cf-serie" value="${JZAC.ui.esc(u.serieBoleta || 'B001')}"></div>
            <div class="campo"><label>Correlativo</label><input type="number" id="cf-correl" value="${Number(u.correlativoBoleta || 1000)}"></div>
          </div>
          <button class="btn btn-primario" id="cf-guardar">Guardar cambios</button>

          <div class="seccion-titulo">Licencia</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            ${lic.tipo === 'activada'
              ? '<span class="badge badge-verde">Licencia activa</span>'
              : lic.tipo === 'prueba'
                ? `<span class="badge badge-dorado">Prueba · ${lic.diasRestantes} día(s)</span>`
                : '<span class="badge badge-rojo">Licencia vencida</span>'}
            <button class="btn btn-sm" id="cf-licencia">Ver / activar licencia</button>
          </div>
        </div>

        <div>
          <div class="card">
            <div class="seccion-titulo" style="margin-top:0">Respaldo de datos</div>
            <div class="texto-suave" style="font-size:13px;margin-bottom:12px">Tu información vive solo en este dispositivo. Descarga respaldos periódicos.</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn" id="cf-exportar">Descargar respaldo (.json)</button>
              <button class="btn" id="cf-importar">Restaurar respaldo</button>
              <input type="file" id="cf-file" accept=".json" style="display:none">
            </div>
          </div>

          <div class="card mt16">
            <div class="seccion-titulo" style="margin-top:0">Acerca de</div>
            <div style="font-size:14px;line-height:1.7;color:var(--texto-suave)">
              <b style="color:var(--texto)">JZAC ERP</b> · versión web 1.0<br>
              Ventas, inventario, fiados y reportes para tu negocio.<br>
              JZAC · Software que trabaja por tu negocio.
            </div>
            <div class="mt16" style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-whatsapp" id="cf-contacto">Contactar al vendedor</button>
            </div>
          </div>
        </div>
      </div>`;

    document.getElementById('cf-guardar').addEventListener('click', async () => {
      const negocio = document.getElementById('cf-negocio').value.trim();
      const nombre = document.getElementById('cf-nombre').value.trim();
      const serie = document.getElementById('cf-serie').value.trim().toUpperCase();
      const correl = Math.max(1000, Number(document.getElementById('cf-correl').value || 1000));
      if (!negocio || !nombre) { JZAC.ui.toast('Completa el nombre del negocio y tu nombre.', 'mal'); return; }
      const nuevo = { ...u, nombreNegocio: negocio, nombre, serieBoleta: serie || 'B001', correlativoBoleta: correl };
      await JZAC.db.guardar('usuarios', nuevo);
      JZAC.ui.toast('Cambios guardados.', 'bien');
      render(cont);
    });

    document.getElementById('cf-licencia').addEventListener('click', () => JZAC.mostrarEstadoLicencia());

    document.getElementById('cf-exportar').addEventListener('click', async () => {
      const data = {};
      for (const t of TABLAS) data[t] = await JZAC.db.listar(t);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'JZAC_ERP_respaldo_' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
      JZAC.ui.toast('Respaldo descargado.', 'bien');
    });

    document.getElementById('cf-importar').addEventListener('click', () => document.getElementById('cf-file').click());
    document.getElementById('cf-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        if (typeof data !== 'object' || !Array.isArray(data.ventas)) throw new Error('Formato');
        if (!await JZAC.ui.confirmar('Restaurar este respaldo reemplazará TODOS los datos actuales de este dispositivo. ¿Continuar?', 'Restaurar respaldo')) return;
        for (const t of TABLAS) {
          await JZAC.db.limpiar(t);
          for (const item of data[t] || []) await JZAC.db.guardar(t, item);
        }
        JZAC.ui.toast('Respaldo restaurado.', 'bien');
        render(cont);
      } catch (err) {
        JZAC.ui.toast('Archivo de respaldo no válido.', 'mal');
      }
      e.target.value = '';
    });

    document.getElementById('cf-contacto').addEventListener('click', () =>
      JZAC.negocio.wha('Hola, soy usuario de JZAC ERP. Necesito ayuda.'));
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.modulos = window.JZAC.modulos || {};
  window.JZAC.modulos.config = { render };
})();