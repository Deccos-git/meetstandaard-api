import Logo from '../../assets/logo-meetstandaard-alt.svg'
import { useNavigate } from "react-router-dom";
import { auth } from '../../firebase/config';
import { useEffect, useState } from 'react';

const Topbar = () => {
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsAuth(!!user);
    });

    return () => unsubscribe();
  }, [auth]);

  // Hooks
  const navigate = useNavigate();

  const logout = async () => {
    await auth.signOut()
    navigate(`/login`)
  }
  
  console.log(auth.currentUser);

  return (
    <div id='topbar-container'>
        <img id='logo-topbar' src={Logo} alt='logo meetstandaard'/>
        <div id='navigation-links'>
          <p onClick={() => navigate(`/standard`)}>Standaard</p>
          <p onClick={() => navigate(`/data`)}>Datasets</p>
        </div>
        {auth.currentUser ? 
          <div id='login-button-container' onClick={logout}>
              <p>Logout</p>
          </div>
        :
          <div id='login-button-container' onClick={() => navigate(`/login`)}>
              <p>Login</p>
          </div>
        }
    </div>
  )
}

export default Topbar