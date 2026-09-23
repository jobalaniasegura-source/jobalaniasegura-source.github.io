// ============================================================
// JZAC ERP - Cajón registrador (WebUSB)
// Abre el cajón con un pulso ESC/POS por el puerto USB de la
// impresora térmica al cobrar en efectivo.
// ============================================================
(function () {
  const CLAVE = 'jzac_cajon_dev';
  let dev = null;

  function soporta() {
    return typeof navigator !== 'undefined' && !!(navigator.usb && navigator.usb.requestDevice);
  }

  async function guardarEleccion(d) {
    dev = d;
    localStorage.setItem(CLAVE, JSON.stringify({
      vendorId: d.vendorId,
      productId: d.productId,
      serial: d.serialNumber || ''
    }));
    return d;
  }

  // Recupera el dispositivo autorizado en sesiones anteriores (sin repetir
  // el selector cada vez que se abre el sistema).
  async function conectarPrevia() {
    if (!soporta()) return null;
    const prev = JSON.parse(localStorage.getItem(CLAVE) || 'null');
    if (!prev) return null;
    let lista = [];
    try { lista = await navigator.usb.getDevices(); } catch (e) { lista = []; }
    const match = lista.find((d) =>
      d.vendorId === prev.vendorId && d.productId === prev.productId &&
      (!prev.serial || (d.serialNumber || '') === prev.serial));
    if (match) { dev = match; return match; }
    return null;
  }

  // Pide al usuario elegir la impresora/cajón desde el diálogo de Chrome.
  async function conectar() {
    if (!soporta()) throw new Error('El cajón USB requiere Chrome o Edge (navegador con WebUSB).');
    const d = await navigator.usb.requestDevice({ filters: [] });
    await d.open();
    await d.close();
    return guardarEleccion(d);
  }

  // Envía el pulso de apertura (ESC p) y cierra el dispositivo.
  async function pulso(device) {
    await device.open();
    try {
      if (!device.configuration) {
        try { await device.selectConfiguration(1); } catch (e) { /* usa la actual */ }
      }
      const conf = device.configuration || (device.configurations && device.configurations[0]);
      if (!conf || !conf.interfaces || !conf.interfaces.length) {
        throw new Error('La impresora no expone interfaces USB.');
      }
      const inter = conf.interfaces[0];
      await device.claimInterface(inter.interfaceNumber);
      const alt = inter.alternate || {};
      const eps = (alt.endpoints || []).filter((e) => e.direction === 'out' && e.packetSize > 0);
      const ep = eps.find((e) => e.type === 'bulk') || eps[0];
      if (!ep) throw new Error('No se encontró un puerto de salida en la impresora.');
      await device.transferOut(ep.endpointNumber, new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA]));
      try { await device.releaseInterface(inter.interfaceNumber); } catch (e) { }
    } finally {
      try { await device.close(); } catch (e) { }
    }
  }

  // Abre el cajón si ya hay un dispositivo conectado. Nunca lanza: falla
  // en silencio (registrado en consola) para no frenar la caja.
  async function abrir() {
    if (!soporta()) return false;
    if (!dev) { dev = await conectarPrevia(); }
    if (!dev) return false;
    try { await pulso(dev); return true; } catch (e) {
      console.warn('JZAC · No se pudo abrir el cajón:', e.message || e);
      return false;
    }
  }

  function nombre() {
    return dev ? (dev.productName || 'Impresora USB') : null;
  }

  window.JZAC = window.JZAC || {};
  window.JZAC.cajon = { soporta, conectar, conectarPrevia, abrir, test: abrir, nombre };
})();