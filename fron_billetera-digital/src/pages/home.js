import React from 'react';
import Sidebar from '../components/sidebar';
import '../styles/home.css';

function Home() {
  // Datos de Usuario
  const userData = JSON.parse(localStorage.getItem("userData")) || { email: "Usuario" };
  const usuario = userData.email ? userData.email.split("@")[0] : "Cliente";
  const nombre = usuario.charAt(0).toUpperCase() + usuario.slice(1);

  return (
    <div className="app-layout">
      <Sidebar />
      
      <main className="content-area" style={{ paddingTop: '100px' }}>
        <div className="feed-container">
          
          {/* 1. HEADER BIENVENIDA */}
          <header className="dashboard-header">
            <h2>Hola, {nombre}</h2>
            <p>Resumen de tus beneficios y novedades</p>
          </header>

          {/* 2. PROMO DESTACADA (HOOK VISUAL) */}
          <div className="pro-card">
            <div className="promo-banner">
              <img 
                src="https://images.unsplash.com/photo-1568901346375-23c9450c58cd?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=60" 
                alt="Hamburguesa" 
                className="promo-img"
              />
              <div className="promo-content">
                <span className="promo-badge">Exclusivo Luca</span>
                <h3>30% DSCTO. en Bembos</h3>
                <p style={{ color: '#64748b', margin: 0 }}>
                  Paga con tu código QR desde la app y disfruta de una Mega Hamburguesa con papas.
                </p>
                <button className="btn-promo">Ver Cupón</button>
              </div>
            </div>
          </div>

          {/* 3. SEGURIDAD (TOQUE PROFESIONAL) */}
          <div className="pro-card">
            <div className="card-header-row">
              <div className="card-title">🛡️ Centro de Seguridad</div>
            </div>
            <div className="security-tip">
              <div className="icon-box">🔒</div>
              <div>
                <strong style={{ display: 'block', marginBottom: '0.25rem', color:'#1e293b' }}>
                  Nunca compartas tu clave SMS
                </strong>
                <p style={{ margin: 0, fontSize: '0.95rem', color: '#64748b' }}>
                  Luca jamás te llamará para pedirte códigos de verificación o contraseñas. 
                  Si recibes una llamada sospechosa, cuelga inmediatamente.
                </p>
              </div>
            </div>
          </div>

          {/* 4. ACTUALIZACIONES DE LA APP */}
          <div className="pro-card">
            <div className="card-header-row">
              <div className="card-title">⚡ Novedades Recientes</div>
            </div>
            
            <div className="update-list">
              <div className="update-row">
                <div>
                  <strong>Pagos de Servicios</strong>
                  <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                    Ahora puedes pagar Luz del Sur y Enel sin comisión.
                  </div>
                </div>
                <span className="date-badge">Hace 2 días</span>
              </div>

              <div className="update-row">
                <div>
                  <strong>Sube tu límite diario</strong>
                  <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                    Actualiza tus datos biométricos para enviar hasta S/ 2,000.
                  </div>
                </div>
                <span className="date-badge">Nuevo</span>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}

export default Home;