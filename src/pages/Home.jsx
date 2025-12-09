import { useNavigate } from "react-router-dom";
import { auth } from '../firebase/config';
import { useEffect, useState } from 'react';

const Home = () => {
   const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setIsAuth(!!user);
    });

    return () => unsubscribe();
  }, [auth]);

  // Hooks
  const navigate = useNavigate();

  return (
    <div id='home-container'>
      <h1>Welkom bij het Meetstandaard adminpanel</h1>
      {isAuth &&
        <div>
          <button onClick={() => navigate(`/standard`)}>Standaard</button>
          <button onClick={() => navigate(`/data`)}>Data</button>
        </div>
      } 
    </div>
  );
};

export default Home;
