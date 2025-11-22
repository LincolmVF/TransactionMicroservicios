// src/services/api.js
import usuarioData from '../data/usuario.json';

export const loginUsuario = async (email, password) => {
  const usuario = usuarioData.usuario;
  if (email === usuario.email && password === usuario.password) {
    return { success: true, data: usuario };
  } else {
    return { success: false, error: 'Credenciales inválidas' };
  }
};

export const registrarUsuario = async (datos) => {
  console.log('Simulación de registro:', datos);
  return { success: true };
};

export const obtenerBilletera = async () => {
  return usuarioData.usuario.billetera;
};