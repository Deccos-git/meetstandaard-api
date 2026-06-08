import { useNavigate } from "react-router-dom";

const Home = () => {
  // Hooks
  const navigate = useNavigate();

  return (
    <div id='home-container'>
      <h1>Welkom bij het Meetstandaard adminpanel</h1>
      <div>
        <button onClick={() => navigate(`/standard`)}>Standaard</button>
        <button onClick={() => navigate(`/data`)}>Data</button>
      </div>
    </div>
  );
};

export default Home;
