import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import '../styles/sidebar.css';

const logo = "https://cdn-icons-png.flaticon.com/512/2534/2534183.png"; 

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  
  const isHomeActive = location.pathname === '/home' || location.pathname === '/'; 

  const handleLogout = () => {
    // Opcional: Preguntar antes de salir
    if (window.confirm("¿Cerrar sesión en Luca?")) {
      localStorage.clear();
      navigate("/"); 
    }
  };

  return (
    <div className="sidebar-container">
      
      <div className="sidebar-header">
        <img src={logo} alt="Logo Luca" className="sidebar-logo-img" /> 
        <h3 className="sidebar-title">Luca</h3>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-list">

          {/* ITEMS NORMALES */}
          <li className={`nav-item ${isHomeActive ? 'active' : ''}`}>
            <Link to="/home" className="nav-link">
              <span className="icon">🏠</span> 
              <span>Inicio</span>
            </Link>
          </li>

          <li className={`nav-item ${location.pathname === '/billetera' ? 'active' : ''}`}>
            <Link to="/billetera" className="nav-link">
              <span className="icon">💳</span> 
              <span>Billetera</span>
            </Link>
          </li>

          <li className={`nav-item ${location.pathname === '/enviar' ? 'active' : ''}`}>
            <Link to="/enviar" className="nav-link">
              <span className="icon">✉️</span> 
              <span>Enviar</span>
            </Link>
          </li>

          {/* 🔴 NUEVO: BOTÓN SALIR (SOLO VISIBLE EN MÓVIL) */}
          <li className="nav-item mobile-only" onClick={handleLogout}>
            <div className="nav-link" style={{ cursor: 'pointer' }}>
              <span className="icon">🚪</span> 
              <span>Salir</span>
            </div>
          </li>

        </ul>
      </nav>

      {/* FOOTER (SOLO VISIBLE EN PC) */}
      <div className="sidebar-footer">
        <button className="btn-logout" onClick={handleLogout}>
          <span className="icon">🚪</span> Cerrar Sesión
        </button>
      </div>
    </div>
  );
}

export default Sidebar;