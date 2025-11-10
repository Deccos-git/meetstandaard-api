import { useState } from 'react'

const Data = () => {
    // State
    const [data, setDatabase] = useState([])
    const [loading, setLoading] = useState(false)

    // Fetch data function
    const fetchData = () => {
      setLoading(true);
      fetch('https://us-central1-deccos-app.cloudfunctions.net/benchmarkEndpoint')
        .then(res => {
            if (!res.ok) {
                throw new Error('Network response was not ok');
            }
            return res.json(); // Return the result of res.json()
        })
        .then(data => {
            setDatabase(data);
            setLoading(false);
        })
        .catch(error => {
            console.error('There has been a problem with your fetch operation:', error);
            setLoading(false);
        });
    };

    console.log(data);

    // Save data function
    const saveData = () => {
    }

  return (
    <div>
      <h1>Data</h1>
        {data.length === 0 && !loading &&
            <button onClick={fetchData}>Data ophalen</button>
        }
        {data.length > 0 &&
            <button onClick={saveData}>Data opslaan</button>
        }
        {loading ? 
        <p>Laden...</p>
        :
        <div>
            {data && data.map((item, index) => (
                <div key={item.id}>
                    <p>{item.name}</p>
                    <div>
                        {/* {item.effects && item.effects.map((effect, idx) => (
                            <div key={idx} >
                                <p>{effect.name}</p>
                            </div>
                        ))} */}
                    </div>
                   
                </div>
            ))}
        </div>
        }
    </div>
  )
}

export default Data