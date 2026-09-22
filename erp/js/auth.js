// ============================================================
// JZAC ERP - Usuarios y sesion
// ============================================================
const SESION_KEY = 'jzac_sesion';

async function hashPassword(correo, pass) {
  const datos = `${pass}|${(correo || '').trim().toLowerCase()}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(datos));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function usuarioPorCorreo(correo) {
  const usuarios = await JZAC.db.listar('usuarios');
  const c = (correo || '').trim().toLowerCase();
  return usuarios.find((u) => (u.correo || '').trim().toLowerCase() === c) || null;
}

async function registrar(nombre, nombreNegocio, correo, pass) {
  if (!nombre || !correo || !pass) throw new Error('Completa todos los campos.');
  if (pass.length < 4) throw new Error('La contraseña debe tener al menos 4 caracteres.');
  if (await usuarioPorCorreo(correo)) throw new Error('Ese correo ya está registrado.');
  const usuario = {
    nombre: nombre.trim(),
    nombreNegocio: (nombreNegocio || '').trim() || 'Mi Bodega',
    correo: correo.trim().toLowerCase(),
    passwordHash: await hashPassword(correo, pass),
    serieBoleta: 'B001',
    correlativoBoleta: 1000,
    creado: Date.now()
  };
  const id = await JZAC.db.guardar('usuarios', usuario);
  usuario.id = id;
  return usuario;
}

async function login(correo, pass) {
  const u = await usuarioPorCorreo(correo);
  if (!u) throw new Error('Correo no registrado.');
  const h = await hashPassword(correo, pass);
  if (h !== u.passwordHash) throw new Error('Contraseña incorrecta.');
  return u;
}

function guardarSesion(usuario) {
  localStorage.setItem(SESION_KEY, JSON.stringify({ usuarioId: usuario.id }));
}

function borrarSesion() {
  localStorage.removeItem(SESION_KEY);
}

async function usuarioActual() {
  try {
    const s = JSON.parse(localStorage.getItem(SESION_KEY) || 'null');
    if (!s) return null;
    return await JZAC.db.obtener('usuarios', s.usuarioId) || null;
  } catch (e) { return null; }
}

window.JZAC = window.JZAC || {};
window.JZAC.auth = { registrar, login, guardarSesion, borrarSesion, usuarioActual, hashPassword };