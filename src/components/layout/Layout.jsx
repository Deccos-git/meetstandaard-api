import { Outlet } from 'react-router-dom';
import Topbar from './Topbar';
import Footer from './Footer';

const Layout = () => {
  return (
    <div id='page-container'>
      <Topbar />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  );
};

export default Layout;