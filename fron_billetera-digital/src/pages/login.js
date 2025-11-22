import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";
import logo from "../assets/logo.png";

function Login() {
  const [dni, setDni] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const response = await fetch("https://authmicroservice-production.up.railway.app/api/v1/auth/login", {  //CAMBIAR RUTA
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dni,
          password,
        }),
      });

      const result = await response.json();
      console.log(result)

      if (!response.ok) {
        setError(result.message || "Credenciales inválidas");
        return;
      }

      const token = result.data?.access_token;
      console.log(token)
      if (!token) {
        setError("Error: el servidor no devolvió un token");
        return;
      }

      localStorage.setItem("token", token);

      const userResponse = await fetch(
        `https://userservicesanti.onrender.com/users/dni/${dni}`,  //CAMBIAR RUTA
        {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const userData = await userResponse.json();

      if (!userResponse.ok) {
        setError("No se pudieron obtener los datos del usuario");
        return;
      }

      localStorage.setItem("userData", JSON.stringify(userData));

      navigate("/home");

    } catch (err) {
      console.error(err);
      setError("Error en el servidor");
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-box">
        <img src={logo} alt="Logo Luca" className="logo-luca" />
        <h2>Iniciar Sesión</h2>
        <p className="subtext">Acceso seguro a tu billetera Luca</p>

        <form onSubmit={handleLogin}>
          <label>DNI</label>
          <input
            type="text"
            placeholder="87654321"
            value={dni}
            onChange={(e) => setDni(e.target.value)}
          />

          <label>Contraseña</label>
          <input
            type="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button type="submit">Iniciar Sesión</button>
        </form>

        {error && <p className="error">{error}</p>}

        <div className="register-prompt">
          <p>¿No tienes cuenta?</p>
          <a href="/registro">Crear Cuenta</a>
        </div>

        <p className="security-note">
          Tu billetera está protegida con encriptación de nivel bancario
        </p>
      </div>
    </div>
  );
}

export default Login;