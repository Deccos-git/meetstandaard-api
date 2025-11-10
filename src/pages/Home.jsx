import { useNavigate } from "react-router-dom";
import { auth } from '../firebase/config';

const Home = () => {
  const navigate = useNavigate();

  return (
    <div>
      <h1>Welkom bij het Meetstandaard adminpanel</h1>
      {auth.currentUser &&
        <div>
          <button onClick={() => navigate(`/standard`)}>Standaard</button>
          <button onClick={() => navigate(`/data`)}>Data</button>
        </div>
      } 
    </div>
  );
};

export default Home;
