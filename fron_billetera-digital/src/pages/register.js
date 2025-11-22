import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/register.css';
import logo from '../assets/logo.png';

function Register() {
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');

    // Validaciones básicas
    if (!email || !telefono || !dni || password.length < 8 || password !== confirmar) {
      setError('Verifica los campos y que las contraseñas coincidan');
      return;
    }

    try {
      const authResponse = await fetch("https://authmicroservice-production.up.railway.app/api/v1/auth/register", { //CAMBIAR RUTA
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dni,
          password,
        }),
      });

      const authResult = await authResponse.json();

      if (!authResponse.ok) {
        setError(authResult.message || "Error al registrar usuario");
        return;
      }

      const token = authResult.data?.access_token;
      if (!token) {
        setError("El servidor no devolvió un token");
        return;
      }

      localStorage.setItem("token", token);


      await fetch("https://userservicesanti.onrender.com/users", { //CAMBIAR RUTA
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          dni,
          email,
          phone: telefono,
        }),
      });

      alert("Cuenta creada correctamente");
      navigate("/");

    } catch (err) {
      console.error(err);
      setError("Error en el servidor");
    }
  };

  return (
    <div className="register-wrapper">
      <div className="register-box">

        <img src={logo} alt="Logo Luca" className="logo-luca" />
        <h2>Crear Cuenta</h2>
        <p className="subtext">Únete a Luca hoy</p>

        <form onSubmit={handleRegister}>

          {/* Correo Electrónico */}
          <div className="form-group-register">
            <label>Correo Electrónico</label>
            <input
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Teléfono */}
          <div className="form-group-register">
            <label>Teléfono</label>
            <input
              type="text"
              placeholder="987654321"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </div>

          {/* DNI */}
          <div className="form-group-register">
            <label>DNI</label>
            <input
              type="text"
              placeholder="12345678"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
            />
          </div>

          {/* Contraseña */}
          <div className="form-group-register">
            <label>Contraseña</label>
            <input
              type="password"
              placeholder="********"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="password-note">Mínimo 8 caracteres</p>
          </div>

          {/* Confirmar */}
          <div className="form-group-register">
            <label>Confirmar Contraseña</label>
            <input
              type="password"
              placeholder="********"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
            />
          </div>

          <button type="submit" className="btn-register-primary">
            Crear Cuenta
          </button>
        </form>

        {error && <p className="error">{error}</p>}

        <div className="login-prompt">
          <p>¿Ya tienes cuenta?</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn-register-secondary"
          >
            Iniciar Sesión
          </button>
        </div>

      </div>
    </div>
  );
}

export default Register;