import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import Home from './pages/Home';
import React from 'react';
import Layout from './components/layout/Layout';
import './index.css';
import Login from './pages/Login';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="login" element={<Login />} />
        </Route>
      </Routes>
    </Router>
  </React.StrictMode>
);
