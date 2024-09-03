import { useFirestore, useFirestoreOne } from "../firebase/useFirestore"
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import ArrowDropDownCircleOutlinedIcon from '@mui/icons-material/ArrowDropDownCircleOutlined';
import Modal from 'react-modal';
import { db } from "../firebase/config";
import { addDoc, collection, updateDoc, doc } from "firebase/firestore";

const Home = () => {
  // State
  const [categorie, setCategorie] = useState(null)
  const [effectId, setEffectId] = useState(null)
  const [isOpen, setIsOpen] = useState(false);
  const [newCategorie, setNewCategorie] = useState('');

  // Firestore
  const categories = useFirestore('categories', 'position', 'asc')
  const effects = useFirestoreOne('effects', 'categorie', categorie ? categorie : '', 'position', 'asc')
  const questions = useFirestoreOne('questions', 'effectId', effectId ? effectId : '', 'position', 'asc')

  // Modal
  const customStyles = {
    content: {
      top: '50%',
      left: '50%',
      right: 'auto',
      bottom: 'auto',
      marginRight: '-50%',
      transform: 'translate(-50%, -50%)',
    },
  };

  Modal.setAppElement('#root');

  // Set first categorie as default
  useEffect(() => {
    if (categories) {
      setCategorie(categories[0]?.id)
    }
  }, [categories])

  // Add categorie
  const addCategorie = async () => {

    await addDoc(collection(db, "categories"), {
      id: uuidv4(),
      name: newCategorie,
      position: categories.length + 1,
    });
    setIsOpen(!isOpen)
  }

  // Add effect
  const addEffect = async () => {
    await addDoc(collection(db, "effects"), {
      id: uuidv4(),
      name: 'Nieuw effect',
      categorie: categorie,
      position: effects.length + 1,
    });
  }


  // Update effect
  const updateEffect = async (e) => {
    const docid = e.target.dataset.docid

    await updateDoc(doc(db, "effects", docid), {
      name: e.target.value
    });
  }

  // Add question
  const addQuestion = async () => {
    await addDoc(collection(db, "questions"), {
      id: uuidv4(),
      name: 'Nieuwe vraag',
      effectId: effectId,
      position: questions.length + 1,
    });
  }

  // Update question
  const updateQuestion = async (e) => {
    const docid = e.target.dataset.docid

    await updateDoc(doc(db, "questions", docid), {
      name: e.target.value
    });
  }


  return (
    <div>
      <h1>Admin</h1>

      <div className="tab-container">
        {categories && categories.map((category, index) => (
          <div 
          key={uuidv4()} 
          className={`${categorie === category.id ? "active" : "tablinks"}`}
          onClick={() => setCategorie(category.id)}
          >
            <input type="text" defaultValue={category.name} />
          </div>
        ))}
        <AddCircleOutlineOutlinedIcon onClick={() => setIsOpen(!isOpen)} />
      </div>
      <div className='table-container'>
          <AddCircleOutlineOutlinedIcon onClick={addEffect}/>
              {effects && effects.map((effect, index) => (

                  <div key={uuidv4()}>
                      <div id='effect-container'>
                        <p>{effect.position}</p>
                        <input type="text" defaultValue={effect.name} data-docid={effect.docid} onChange={updateEffect} />
                        <ArrowDropDownCircleOutlinedIcon onClick={() => setEffectId(effect.id)}/>
                      </div>
                      <div id='questions-container'>
                        <AddCircleOutlineOutlinedIcon onClick={addQuestion}/>
                        {questions && questions.map((question, index) => (
                          <div id='question-container' key={uuidv4()}>
                            <p>{question.position}</p>
                            <input type="text" defaultValue={question.name} data-docid={question.docid} onChange={updateQuestion} />
                          </div>
                        ))}
                      </div>
                  </div>             
              ))}
         
        </div>
        <Modal
        isOpen={isOpen}
        onRequestClose={() => setIsOpen(!isOpen)}
        style={customStyles}
        contentLabel="Example Modal"
      >
        <h2>Voeg categorie toe</h2>
        <button onClick={() => setIsOpen(!isOpen)}>close</button>
        <input type="text" placeholder="Geef categorie een naam" onChange={(e) => setNewCategorie(e.target.value)}/>
        <button onClick={addCategorie}>Voeg categorie toe</button>
      </Modal>
    </div>
    
  )
}

export default Home