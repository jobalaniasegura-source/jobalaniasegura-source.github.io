// ============================================================
// JZAC ERP - Licencia (mismo algoritmo que la app Android)
// prueba 7 dias · activacion HMAC-SHA256
// ============================================================
const LIC = {
  CLAVE: 'JZAC-ERP-2026-KEY',
  PIN: '7531',
  DIAS_PRUEBA: 7,
  PREFS: 'jzac_licencia',
  TRIAL: 'jzac_trial_inicio'
};

function licNormalizar(nombre) {
  return (nombre || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

async function licHmacHex(datos) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(LIC.CLAVE), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(datos));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function licCodigo(nombre) {
  const norm = licNormalizar(nombre);
  const hex = await licHmacHex(norm);
  const corto = hex.slice(0, 12).toUpperCase();
  return corto.slice(0, 4) + '-' + corto.slice(4, 8) + '-' + corto.slice(8, 12);
}

async function licEsValido(nombre, codigo) {
  const esperado = await licCodigo(nombre);
  return esperado === (codigo || '').trim().toUpperCase();
}

function licGuardarActivacion(nombre, codigo) {
  localStorage.setItem(LIC.PREFS, JSON.stringify({ nombre, codigo }));
  const trialStart = localStorage.getItem(LIC.TRIAL);
  if (!trialStart) localStorage.setItem(LIC.TRIAL, String(Date.now()));
}

function licDatosActivacion() {
  try { return JSON.parse(localStorage.getItem(LIC.PREFS) || 'null'); } catch (e) { return null; }
}

function licInicioPrueba() {
  const t = localStorage.getItem(LIC.TRIAL);
  return t ? parseInt(t, 10) : null;
}

function licEstado() {
  const act = licDatosActivacion();
  if (act && act.codigo) return { tipo: 'activada', nombre: act.nombre, codigo: act.codigo };
  const inicio = licInicioPrueba();
  if (inicio) {
    const fin = inicio + LIC.DIAS_PRUEBA * 86400000;
    if (Date.now() <= fin) {
      return { tipo: 'prueba', inicio, fin, diasRestantes: Math.max(0, Math.ceil((fin - Date.now()) / 86400000)) };
    }
    return { tipo: 'vencida', inicio, fin };
  }
  return { tipo: 'prueba', inicio: null, fin: null, diasRestantes: LIC.DIAS_PRUEBA };
}

async function licValidarAlmacenada() {
  const estado = licEstado();
  if (estado.tipo === 'activada') {
    const valido = await licEsValido(estado.nombre, estado.codigo);
    return valido ? { ...estado, valido: true } : { ...estado, valido: false };
  }
  return estado;
}

window.JZAC = window.JZAC || {};
window.JZAC.lic = {
  CLAVE: LIC.CLAVE,
  PIN: LIC.PIN,
  normalizar: licNormalizar,
  codigo: licCodigo,
  esValido: licEsValido,
  guardarActivacion: licGuardarActivacion,
  estado: licEstado,
  validar: licValidarAlmacenada,
  inicioPrueba: licInicioPrueba
};