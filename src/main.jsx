import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import React from 'react';
import Layout from './components/layout/Layout';
import './index.css';
import Login from './pages/Login';
import ProtectedRoute from './components/auth/ProtectedRoute';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route path="login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            {/* Home is the panel: every standaard is a tab there. */}
            <Route index element={<Home />} />
          </Route>
        </Route>
      </Routes>
    </Router>
  </React.StrictMode>
);
