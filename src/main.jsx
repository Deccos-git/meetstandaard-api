import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import React from 'react';
import './index.css';

import PubliekeLayout from './public/PubliekeLayout';
import Overzicht from './pages/publiek/Overzicht';
import StandaardDetail from './pages/publiek/StandaardDetail';

import Inloggen from './pages/publiek/Inloggen';
import Beheer from './pages/Beheer';
import AdminRoute from './components/auth/AdminRoute';

// Eén site, één vormtaal, twee soorten pagina's:
//
// - `/`         openbaar. Geen login — lezen en reageren gaan allebei over de
//               HTTP API zonder account.
// - `/beheer`   de feedbackwachtrij. Admin-claim vereist.
//
// Het paneel had een eigen schil met eigen topbar en footer; die is weg. Het is
// dezelfde site achter een claim, dus het hangt onder dezelfde layout.
//
// The separate URL is for clarity, not for security — what keeps a visitor out
// is the claim AdminRoute checks and the Firestore rules that demand the same
// one. A route can be guessed; a rule cannot be talked around.
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<PubliekeLayout />}>
          <Route index element={<Overzicht />} />
          <Route path="standaard/:key" element={<StandaardDetail />} />
          {/* Alleen nog voor beheerders: feedback geven kan zonder account. */}
          <Route path="inloggen" element={<Inloggen />} />

          <Route path="beheer" element={<AdminRoute />}>
            <Route index element={<Beheer />} />
          </Route>
        </Route>

        {/* The panel used to live at / and log in at /login. */}
        <Route path="/login" element={<Navigate to="/inloggen" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  </React.StrictMode>
);
