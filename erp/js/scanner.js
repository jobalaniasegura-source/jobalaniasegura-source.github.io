// ============================================================
// JZAC ERP - Escáner de códigos de barras y QR (cámara)
// BarcodeDetector nativo (Chrome/Android) + jsQR (respaldo)
// ============================================================
(function () {
  const FORMATOS = ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'codabar', 'itf', 'data_matrix'];

  let detectorNativo = null;
  let soporteNativo = null;

  async function preparaNativo() {
    if (soporteNativo !== null) return soporteNativo;
    try {
      if (!('BarcodeDetector' in window)) { soporteNativo = false; return false; }
      const dispo = await BarcodeDetector.getSupportedFormats();
      const usables = (dispo || []).filter((f) => FORMATOS.includes(f));
      if (usables.length === 0) { soporteNativo = false; return false; }
      detectorNativo = new BarcodeDetector({ formats: usables });
      soporteNativo = true;
      return true;
    } catch (e) { soporteNativo = false; return false; }
  }

  function cargarJsQR() {
    if (window.jsQR) return Promise.resolve(true);
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = './lib/jsqr.min.js';
      s.onload = () => resolve(!!window.jsQR);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function pedirCamara() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false
      });
      return stream;
    } catch (e) { return null; }
  }

  // ---------- modal propio (control total de la cámara) ----------
  // Vive en un contenedor aparte (document.body) para NO reemplazar el
  // modal que pudiera estar abierto debajo (ej. el formulario de producto
  // o de nueva venta). Así, al escanear y volver, el formulario sigue ahí.
  function modalPropio(html, pie) {
    const raiz = document.createElement('div');
    raiz.id = 'scan-raiz';
    raiz.innerHTML = `<div class="modal-fondo"><div class="modal amplio">${html}${pie ? `<div class="modal-pie">${pie}</div>` : ''}</div></div>`;
    document.body.appendChild(raiz);
    const fondo = raiz.firstElementChild;
    return { raiz, fondo, cerrar: () => { raiz.remove(); } };
  }

  /**
   * JZAC.escanear({titulo}) -> Promise<{texto, formato} | null>
   * null = el usuario canceló.
   */
  async function escanear(opciones) {
    const titulo = (opciones && opciones.titulo) || 'Escanear código';
    const m = modalPropio(`
      <div class="modal-hdr"><h3>${titulo}</h3><button class="cierre" id="scan-cerrar">×</button></div>
      <div class="scan-caja">
        <video id="scan-video" playsinline muted></video>
        <div class="scan-reticula"></div>
        <div class="scan-aviso" id="scan-aviso">Apunta la cámara al código...</div>
      </div>
      <input id="scan-manual" class="scan-manual" placeholder="O escribe el código a mano..." autocomplete="off">
      <div id="scan-detalle" class="texto-suave" style="font-size:12px;margin-top:6px"></div>`,
      `<button class="btn" id="scan-cancelar">Cancelar</button>
       <button class="btn btn-primario" id="scan-conf">Usar este código</button>`);

    const video = m.raiz.querySelector('#scan-video');
    const aviso = m.raiz.querySelector('#scan-aviso');
    const detalle = m.raiz.querySelector('#scan-detalle');
    const manual = m.raiz.querySelector('#scan-manual');

    let stream = null;
    let parado = false;
    let fin = false;
    let modo = 'nativo';

    function detener() {
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
      if (video) video.srcObject = null;
    }

    function terminar(valor) {
      if (fin) return;
      fin = true;
      parado = true;
      detener();
      m.cerrar();
      resolver(valor);
    }

    let resolver;
    const promesa = new Promise((r) => { resolver = r; });

    const videoListo = new Promise((res) => {
      video.addEventListener('loadedmetadata', res, { once: true });
    });

    async function bucleNativo() {
      if (parado) return;
      try {
        const res = await detectorNativo.detect(video);
        if (res && res.length) {
          terminar({ texto: String(res[0].rawValue || ''), formato: res[0].format || 'desconocido' });
          return;
        }
      } catch (e) { /* frame no listo */ }
      setTimeout(bucleNativo, 220);
    }

    async function bucleJsQR() {
      if (parado) return;
      if (!video.videoWidth) { setTimeout(bucleJsQR, 160); return; }
      const maxW = 680;
      const escala = Math.min(1, maxW / video.videoWidth);
      const w = Math.round(video.videoWidth * escala);
      const h = Math.round(video.videoHeight * escala);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);
      const q = window.jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' });
      if (q && q.data) {
        terminar({ texto: String(q.data), formato: 'qr_code' });
        return;
      }
      setTimeout(bucleJsQR, 160);
    }

    async function iniciarCamara() {
      stream = await pedirCamara();
      if (!stream) {
        aviso.textContent = 'No se pudo abrir la cámara. Escribe el código abajo.';
        detalle.textContent = 'Acepta el permiso de cámara cuando el navegador lo pida, o ingresa el código manualmente.';
        manual.focus();
        return;
      }
      video.srcObject = stream;
      try { await video.play(); } catch (e) { /* autoplay muted ok */ }
      await videoListo;

      if (await preparaNativo()) {
        modo = 'nativo';
        bucleNativo();
      } else if (await cargarJsQR()) {
        modo = 'jsqr';
        bucleJsQR();
      } else {
        aviso.textContent = 'Escribe el código abajo (sin escáner en este navegador).';
        manual.focus();
      }
    }

    m.raiz.querySelector('#scan-cerrar').addEventListener('click', () => terminar(null));
    m.raiz.querySelector('#scan-cancelar').addEventListener('click', () => terminar(null));
    m.fondo.addEventListener('click', (e) => { if (e.target === m.fondo) terminar(null); });
    m.raiz.querySelector('#scan-conf').addEventListener('click', () => {
      const t = manual.value.trim();
      if (!t) { JZAC.ui.toast('Escribe primero un código.', 'mal'); return; }
      terminar({ texto: t, formato: 'manual' });
    });

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      iniciarCamara();
    } else {
      aviso.textContent = 'Este navegador no permite usar la cámara. Escribe el código abajo.';
      manual.focus();
    }

    return promesa;
  }

  /**
   * JZAC.productoPorCodigo(lista, texto) -> producto | null
   * Busca coincidencia exacta por campo codigo o barra.
   */
  function productoPorCodigo(lista, texto) {
    const t = String(texto || '').trim().toLowerCase();
    if (!t) return null;
    return (lista || []).find((p) =>
      [p.codigo, p.barra].some((c) => String(c || '').trim().toLowerCase() === t)) || null;
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.escanear = escanear;
  window.JZAC.productoPorCodigo = productoPorCodigo;
})();