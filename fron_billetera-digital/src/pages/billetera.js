import React, { useState, useEffect } from 'react';
import Sidebar from '../components/sidebar';
import '../styles/billetera.css';

// --- CONFIGURACIÓN ---
const API_URL = 'https://billetera-production.up.railway.app/api/v1/wallets';
const URL_USERS_SERVICE = 'https://userservicesanti.onrender.com/users';

function Billetera() {
  const [saldo, setSaldo] = useState(0.00);
  const [transacciones, setTransacciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      const token = localStorage.getItem('token');
      const userData = JSON.parse(localStorage.getItem("userData"));

      const userId = userData?.user_id;
      const phone = userData.phone;

      setPhone(phone || '');

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };

      const response = await fetch(`${API_URL}/${userId}/balance`, { headers });

      if (!response.ok) {
        if (response.status === 404) throw new Error("Este usuario no tiene una billetera creada.");
        if (response.status === 401) throw new Error("Sesión expirada o token inválido.");
      }

      const data = await response.json();
      const walletId = data.wallet_id;

      // Validación de seguridad: Si no hay token, redirigir al Login
      if (!token) {
        window.location.href = '/';
        return;
      }
      try {
        setLoading(true);
        setError(null);

        const [response, resLedger] = await Promise.all([
          fetch(`${API_URL}/${userId}/balance`, { headers }),
          fetch(`${API_URL}/${walletId}/ledger`, { headers })
        ]);

        if (!response.ok || !resLedger.ok) {
          throw new Error(`Error del servidor: ${response.status} / ${resLedger.status}`);
        }

        const data = await response.json();
        const dataLedger = await resLedger.json();

        // Obtenemos IDs únicos de las contrapartes para no hacer llamadas repetidas
        const uniqueWalletCounterpartyIds = [...new Set(dataLedger
          .map(tx => tx.counterparty_id)
          .filter(id => id) // Filtramos nulos
        )];

        // Mapa para guardar la info de usuarios
        const userMap = {};

        // Consultamos en paralelo
        await Promise.all(uniqueWalletCounterpartyIds.map(async (counterpartyWalletId) => {
          try {
            // --- SALTO 1: Wallet Service (¿De quién es esta wallet?) ---
            // Llamamos al endpoint nuevo que creamos: GET /api/v1/wallets/:walletId
            const resWalletInfo = await fetch(`${API_URL}/${counterpartyWalletId}`, { headers });

            if (!resWalletInfo.ok) return; // Si falla, lo dejamos como desconocido

            const walletInfo = await resWalletInfo.json();
            const targetUserId = walletInfo.user_id; // ¡Aquí tenemos el ID del usuario!

            // --- SALTO 2: User Service (¿Quién es este usuario?) ---
            const resUserInfo = await fetch(`${URL_USERS_SERVICE}/${targetUserId}`, { headers });

            if (resUserInfo.ok) {
              const userData = await resUserInfo.json();
              userMap[counterpartyWalletId] = {
                nombre: userData.email.split("@")[0] || 'Usuario',
                telefono: userData.phone || 'N/A'
              };
            }
          } catch (e) {
            console.warn(`No se pudo cargar usuario ${counterpartyWalletId}`, e);
          }
        }));

        processData(data, dataLedger, userMap);

      } catch (err) {
        console.error("Error de conexión:", err);
        setError("No se pudo conectar con el servidor. Intenta nuevamente.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const processData = (data, dataLedger, userMap = {}) => {
    setSaldo(parseFloat(data.balance || 0));

    const txnsFormateadas = Array.isArray(dataLedger) ? dataLedger.map(tx => {
      const isDebit = tx.type === 'DEBIT';
      const amountNum = parseFloat(tx.amount);

      // Buscamos la info de la contraparte en el mapa que creamos
      const counterpartyData = userMap[tx.counterparty_id] || { nombre: 'Desconocido', telefono: 'N/A' };

      return {
        id: tx.ledger_id,
        descripcion: tx.description || `Transacción ${tx.external_transaction_id || 'N/A'}`,
        contacto: counterpartyData.nombre || 'Desconocido',
        telefono: counterpartyData.telefono || 'N/A',
        fecha: tx.created_at ? new Date(tx.created_at).toLocaleDateString('es-PE', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : 'Fecha inválida',
        monto: isDebit ? -amountNum : amountNum
      };
    }) : [];

    setTransacciones(txnsFormateadas);

  };
  // Función para formatear el monto en la tabla
  const formatMonto = (monto) => {
    const absMonto = Math.abs(monto).toFixed(2);
    return monto > 0 ? `+S/ ${absMonto}` : `-S/ ${absMonto}`;
  };

  if (loading) return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">Cargando tu billetera...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="flex h-screen w-full items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="app-layout">
      <Sidebar />
      <div className="main-content-area">
        <div className="billetera-container">

          {/* Bloque: Tarjetas de Resumen */}
          <div className="summary-grid">

            {/* 1. Monto de Ahorros */}
            <div className="summary-card savings-card">
              <p className="card-title">Monto de Ahorros</p>
              <h3 className="card-value">${saldo.toFixed(2)}</h3>
              <p className="card-subtitle">Balance disponible</p>
            </div>

            {/* 2. Gastos Este Mes */}
            {/* <div className="summary-card expenses-card">
              <p className="card-title">Gastos Este Mes</p>
              <h3 className="card-value">${billetera.gastosMes.toFixed(2)}</h3>
              <p className="card-subtitle">Últimos 30 días</p>
            </div> */}

            {/* 3. Ingresos Este Mes */}
            {/* <div className="summary-card incomes-card">
              <p className="card-title">Ingresos Este Mes</p>
              <h3 className="card-value">${billetera.ingresosMes.toFixed(2)}</h3>
              <p className="card-subtitle">Últimos 30 días</p>
            </div> */}

          </div>

          {/* Bloque: Historial de Transacciones */}
          <div className="transactions-history-card">
            <div className="history-header">
              <h2>Últimas transacciones</h2>
            </div>

            {/* RENDERIZADO CONDICIONAL DE LA TABLA */}
            {transacciones.length > 0 ? (
              <table className="tabla-transacciones">
                <thead>
                  <tr>
                    <th>Contacto</th>
                    <th>Teléfono</th>
                    <th>Fecha</th>
                    <th className="text-right">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {transacciones.map((txn, index) => (
                    <tr key={txn.id || index}>
                      {/* Celda de Descripción con Ícono */}
                      <td className="txn-description-cell">
                        <div className="txn-text-details">
                          <p className="txn-description-text">{txn.contacto}</p>
                        </div>
                      </td>

                      <td>{txn.telefono}</td>
                      <td>{txn.fecha}</td>

                      {/* Celda de Monto */}
                      <td className={`txn-monto-cell text-right ${txn.monto < 0 ? 'negativo' : 'positivo'}`}>
                        {formatMonto(txn.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="no-transactions-message">Aún no tienes transacciones registradas en Luca.</p>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}

export default Billetera;