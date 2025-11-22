import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Login from './pages/login';
import Register from './pages/register';
import Home from './pages/home.js';
import Billetera from './pages/billetera';
import Enviar from './pages/enviar';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/home" element={<Home />} />
        <Route path="/billetera" element={<Billetera />} />
        <Route path="/enviar" element={<Enviar />} />
      </Routes>
    </Router>
  );
}

export default App;