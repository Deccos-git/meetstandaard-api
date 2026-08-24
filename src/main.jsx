import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import React from 'react';
import './index.css';

import PubliekeLayout from './public/PubliekeLayout';
import Overzicht from './pages/publiek/Overzicht';
import StandaardDetail from './pages/publiek/StandaardDetail';
import Over from './pages/publiek/Over';

import Layout from './components/layout/Layout';
import Home from './pages/Home';
import Login from './pages/Login';
import AdminRoute from './components/auth/AdminRoute';

// Two front-ends on one build, deliberately kept apart:
//
// - `/`         the public site. No login, everything over the HTTP API.
// - `/beheer`   the panel. Admin claim required, reads Firestore directly.
//
// The separate URL is for clarity, not for security — the panel's data is
// protected by the Firestore rules, which demand the same claim AdminRoute
// checks. A route can be guessed; a rule cannot be talked around.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<PubliekeLayout />}>
          <Route index element={<Overzicht />} />
          <Route path="standaard/:key" element={<StandaardDetail />} />
          <Route path="over" element={<Over />} />
          <Route path="inloggen" element={<Login />} />
        </Route>

        <Route path="/beheer" element={<Layout />}>
          <Route element={<AdminRoute />}>
            <Route index element={<Home />} />
          </Route>
        </Route>

        {/* The panel used to live at / and log in at /login. */}
        <Route path="/login" element={<Navigate to="/inloggen" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  </React.StrictMode>
);
