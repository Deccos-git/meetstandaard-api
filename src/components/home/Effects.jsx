import { onSnapshot, query, where, collection, orderBy, addDoc, updateDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from 'uuid';
import Questions from "./Questions";
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import ArrowDropDownCircleOutlinedIcon from '@mui/icons-material/ArrowDropDownCircleOutlined';
import Tooltip from "../common/Tooltip";
import ModeEditOutlineOutlinedIcon from '@mui/icons-material/ModeEditOutlineOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ReactModal from "../common/ReactModal";

const Effects = ({ categoryId }) => {
  // State
  const [effects, setEffects] = useState([]);
  const [displayQuestions, setDisplayQuestions] = useState(null);
  const [effectId, setEffectId] = useState(null);
  const [editEffect, setEditEffect] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);

  // Real-time listener for effects
  useEffect(() => {
    if (categoryId) {
      const q = query(
        collection(db, 'effects'),
        where('categorie', '==', categoryId),
        orderBy('position', 'asc')
      );
      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const effectsArray = [];
        querySnapshot.forEach((doc) => {
          effectsArray.push({ ...doc.data(), docid: doc.id });
        });
        setEffects(effectsArray);
      });

      return () => unsubscribe(); // Clean up the listener on unmount
    }
  }, [categoryId]);

  // Add new effect
  const addEffect = async () => {
    await addDoc(collection(db, "effects"), {
      id: uuidv4(),
      name: 'Nieuw effect',
      categorie: categoryId, // Assuming 'categorie' should be 'categoryId'
      position: effects.length + 1,
    });
  };

  // Update effect
  const updateEffect = async (e) => {
    const docid = e.target.dataset.docid;

    await updateDoc(doc(db, "effects", docid), {
      name: e.target.value,
    });
  };

  // Toggle the display of questions for the specific effect
  const toggleQuestions = (effectId) => {
    setDisplayQuestions((prevEffectId) =>
      prevEffectId === effectId ? null : effectId
    );
  };

  return (
    <div className='table-container'>
      {effects && effects.map((effect) => (
        <div 
        key={effect.id} 
        onClick={() => setEffectId(effect.id)}
        >
          <div 
          id='effect-container'
          className={`${effectId === effect.id ? "activeEffect" : ""}`}
          >
            <p>{effect.position}</p>
            {editEffect === effect.id ? 
              <input
                type="text"
                defaultValue={effect.name}
                data-docid={effect.docid}
                onChange={updateEffect}
              />
              : 
              <p className="effect-name-p">{effect.name}</p>
            }
            <div className="catergory-options-container" style={{ display: effectId === effect.id ? 'flex' : 'none' }}>
              <ArrowDropDownCircleOutlinedIcon
                onClick={() => toggleQuestions(effect.id)}
              />
              <ModeEditOutlineOutlinedIcon
                onClick={() => (editEffect === effect.id ? setEditEffect(null) : setEditEffect(effect.id))}
              />
              <DeleteOutlineOutlinedIcon
                onClick={() => setDeleteModal(true)}
              />
            </div>
          </div>
          {displayQuestions === effect.id && <Questions effectId={effect.id} />}
        </div>
      ))}
      <Tooltip content='Voeg een nieuw effect toe' width='200px' top='-40px' left='0px'>
        <AddCircleOutlineOutlinedIcon className="plus-button" onClick={addEffect} />
      </Tooltip>
      <ReactModal
        open={deleteModal}
        setOpen={setDeleteModal}
        title="Weet je zeker dat je dit effect wilt verwijderen?"
        text="Deze actie kan niet ongedaan worden gemaakt."
      />
    </div>
  );
};

export default Effects;
