// ============================================================
// JZAC ERP - Boot: splash -> licencia -> login/registro -> app
// ============================================================
(function () {
  const app = document.getElementById('app');

  function dibujar(html) {
    app.innerHTML = html;
  }

  function o(id) { return document.getElementById(id); }

  // ---------- login / registro ----------
  function vistaAuth() {
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hidden');
    dibujar(`
      <div class="auth">
        <div class="auth-caja">
          <div class="auth-logo"><img src="./icons/icon-192.png" alt="JZAC ERP"></div>
          <div class="auth-titulo">JZAC ERP</div>
          <div class="auth-sub">Software que trabaja por tu negocio</div>
          <div id="auth-form"></div>
        </div>
      </div>`);

    function formLogin() {
      o('auth-form').innerHTML = `
        <form id="frm">
          <div class="campo"><label>Correo electrónico</label><input type="email" id="a-correo" autocomplete="username"></div>
          <div class="campo"><label>Contraseña</label><input type="password" id="a-password" autocomplete="current-password"></div>
          <button class="btn btn-primario btn-bloco" type="submit">Ingresar</button>
        </form>
        <div class="auth-enlace">¿No tienes cuenta? <a id="a-ir-reg">Regístrate gratis</a></div>
        <div class="auth-enlace"><a id="a-ir-wha" style="color:#128C7E">¿Problemas para entrar? Escríbenos</a></div>`;
      o('frm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const u = await JZAC.auth.login(o('a-correo').value, o('a-password').value);
          JZAC.auth.guardarSesion(u);
          continuarLicencia(u);
        } catch (err) { JZAC.ui.toast(err.message, 'mal'); }
      });
      o('a-ir-reg').addEventListener('click', formRegistro);
      o('a-ir-wha').addEventListener('click', () => JZAC.negocio.wha('Hola, tengo un problema para ingresar a JZAC ERP.'));
    }

    function formRegistro() {
      o('auth-form').innerHTML = `
        <form id="frm">
          <div class="campo"><label>Nombre del negocio</label><input id="r-negocio" placeholder="Ej. Mi Bodega"></div>
          <div class="campo"><label>Tu nombre</label><input id="r-nombre"></div>
          <div class="campo"><label>Correo electrónico</label><input type="email" id="r-correo"></div>
          <div class="campo"><label>Contraseña (mínimo 4 caracteres)</label><input type="password" id="r-password"></div>
          <button class="btn btn-primario btn-bloco" type="submit">Crear mi cuenta</button>
        </form>
        <div class="auth-enlace">¿Ya tienes cuenta? <a id="a-ir-login">Inicia sesión</a></div>`;
      o('frm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const u = await JZAC.auth.registrar(o('r-nombre').value, o('r-negocio').value, o('r-correo').value, o('r-password').value);
          JZAC.auth.guardarSesion(u);
          continuarLicencia(u);
        } catch (err) { JZAC.ui.toast(err.message, 'mal'); }
      });
      o('a-ir-login').addEventListener('click', formLogin);
    }

    formLogin();
  }

  // ---------- vista licencia ----------
  function vistaIniciarPrueba(u) {
    const splash = document.getElementById('splash');
    dibujar(`
      <div class="auth">
        <div class="auth-caja">
          <div class="auth-logo"><img src="./icons/icon-192.png" alt="JZAC ERP"></div>
          <div class="auth-titulo">Bienvenido a JZAC ERP</div>
          <div class="auth-sub">${JZAC.ui.esc(u.nombreNegocio)}</div>
          <div class="card" style="border:1px solid var(--borde);box-shadow:none">
            <div style="font-size:38px;text-align:center">S</div>
            <h3 class="center" style="margin:4px 0">Prueba gratis por 7 días</h3>
            <p class="texto-suave center" style="font-size:14px">Prueba el sistema completo. Cuando termine la prueba, activa tu licencia para seguir usando JZAC ERP de por vida.</p>
          </div>
          <button class="btn btn-primario btn-bloco mt16" id="p-iniciar">Iniciar prueba de 7 días</button>
          <button class="btn btn-bloco mt16" id="p-codigo">Ya tengo un código de activación</button>
        </div>
      </div>`);

    o('p-iniciar').addEventListener('click', () => {
      if (!localStorage.getItem('jzac_trial_inicio')) localStorage.setItem('jzac_trial_inicio', String(Date.now()));
      JZAC.mostrarApp(u);
    });
    o('p-codigo').addEventListener('click', () => modalActivacion(u, true));
    if (splash) splash.classList.add('hidden');
  }

  function vistaBloqueada(u) {
    const splash = document.getElementById('splash');
    dibujar(`
      <div class="auth">
        <div class="auth-caja bloqueada">
          <div class="auth-logo"><img src="./icons/icon-192.png" alt="JZAC ERP"></div>
          <div class="gran">!</div>
          <h2>Tu prueba ha terminado</h2>
          <p>Activa tu licencia con el código que te entregó tu vendedor para seguir usando JZAC ERP. Es un pago único, de por vida.</p>
          <button class="btn btn-primario btn-bloco mt16" id="b-activar">Activar licencia</button>
          <button class="btn btn-whatsapp btn-bloco mt16" id="b-wha">Hablar con el vendedor</button>
        </div>
      </div>`);
    o('b-activar').addEventListener('click', () => modalActivacion(u, false));
    o('b-wha').addEventListener('click', () => JZAC.negocio.wha('Hola, quiero activar la licencia de JZAC ERP.'));
    if (splash) splash.classList.add('hidden');
  }

  async function continuarLicencia(u) {
    const lic = await JZAC.lic.validar();
    const splash = document.getElementById('splash');
    if (splash) splash.classList.add('hidden');
    if (lic.tipo === 'activada' && lic.valido) { JZAC.mostrarApp(u); return; }
    if (lic.tipo === 'prueba') {
      if (!JZAC.lic.inicioPrueba()) { vistaIniciarPrueba(u); return; }
      JZAC.mostrarApp(u);
      return;
    }
    vistaBloqueada(u);
  }

  // ---------- modal activacion ----------
  function modalActivacion(u, reInicia) {
    const m = JZAC.ui.modal(`
      <div class="modal-hdr"><h3>Activar licencia</h3><button class="cierre" data-cerrar>×</button></div>
      <div class="texto-suave" style="font-size:13px;margin-bottom:10px">El código es personal de tu negocio (<b>${JZAC.ui.esc(u.nombreNegocio)}</b>). Ingresa el formato XXXX-XXXX-XXXX.</div>
      <div class="campo"><label>Código de activación</label><input id="lc-codigo" placeholder="XXXX-XXXX-XXXX" autocomplete="off" style="text-transform:uppercase;letter-spacing:2px"></div>`,
      `<button class="btn" data-cerrar>Cancelar</button>
       <button class="btn btn-primario" id="lc-activar">Activar</button>`,
      true);

    m.raiz.querySelector('#lc-activar').addEventListener('click', async () => {
      const codigo = o('lc-codigo').value.trim().toUpperCase();
      if (!codigo) { JZAC.ui.toast('Ingresa tu código.', 'mal'); return; }
      const valido = await JZAC.lic.esValido(u.nombreNegocio, codigo);
      if (!valido) {
        JZAC.ui.toast('Código no válido para este negocio.', 'mal');
        return;
      }
      JZAC.lic.guardarActivacion(u.nombreNegocio, codigo);
      JZAC.ui.toast('Licencia activada. Gracias por confiar en JZAC.', 'bien');
      m.cerrar();
      continuarLicencia(u);
    });
    // PIN de vendedor para generar codigo
    const piso = document.createElement('div');
    piso.innerHTML = `<hr style="margin:14px 0;border:none;border-top:1px solid var(--borde)">
      <div class="texto-suave" style="font-size:12px;margin-bottom:6px">Solo el vendedor: genera el código con el PIN.</div>
      <div style="display:flex;gap:8px">
        <input type="password" id="lc-pin" placeholder="PIN (4 dígitos)" maxlength="4" style="flex:1;padding:8px;border:1px solid var(--borde);border-radius:8px">
        <button class="btn btn-sm" id="lc-gen">Generar</button>
      </div>
      <div id="lc-result" style="margin-top:10px"></div>`;
    m.raiz.querySelector('.modal-pie').appendChild(piso);

    m.raiz.querySelector('#lc-gen').addEventListener('click', async () => {
      if (o('lc-pin').value !== JZAC.lic.PIN) { JZAC.ui.toast('PIN incorrecto.', 'mal'); return; }
      const codigo = await JZAC.lic.codigo(u.nombreNegocio);
      o('lc-result').innerHTML = `
        <div class="card" style="background:var(--bg)">
          <div class="negrita center" style="letter-spacing:3px;font-size:18px">${codigo}</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <button class="btn btn-sm btn-bloco" id="lc-copiar">Copiar</button>
            <button class="btn btn-sm btn-whatsapp btn-bloco" id="lc-enviar">Enviar al cliente</button>
          </div>
        </div>`;
      o('lc-copiar').addEventListener('click', () => {
        navigator.clipboard.writeText(codigo).then(() => JZAC.ui.toast('Código copiado.'));
      });
      o('lc-enviar').addEventListener('click', () => JZAC.negocio.wha(`Hola, tu código de activación de JZAC ERP es: ${codigo}`));
    });
  }

  // exponer para config/dashboard
  window.JZAC.mostrarEstadoLicencia = async function () {
    const u = await JZAC.auth.usuarioActual();
    if (!u) return;
    const est = JZAC.lic.estado();
    if (est.tipo === 'activada') {
      JZAC.ui.toast('Tu licencia está activa.', 'bien');
      return;
    }
    if (!est.inicio) { vistaIniciarPrueba(u); return; }
    modalActivacion(u, false);
  };

  async function boot() {
    await DB.ready;
    if ('serviceWorker' in navigator) {
      try { navigator.serviceWorker.register('./sw.js'); } catch (e) { /* sin SW */ }
    }
    const u = await JZAC.auth.usuarioActual();
    if (!u) { vistaAuth(); return; }
    continuarLicencia(u);
  }

  boot();
})();