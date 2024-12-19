import { useFirestoreOneOrderBy } from "../../firebase/useFirestore"
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import { addDoc, collection, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { v4 as uuidv4 } from 'uuid';
import ModeEditOutlineOutlinedIcon from '@mui/icons-material/ModeEditOutlineOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ReactModal from "../common/ReactModal";
import { useState } from "react";

const Questions = ({effectId}) => {
    // State
    const [deleteModal, setDeleteModal] = useState(false);
    const [questionId, setQuestionId] = useState(null);
    const [editQuestion, setEditQuestion] = useState(null);
    const [deleteDocid, setDeleteDocid] = useState('');

    // Firestore
    const questions = useFirestoreOneOrderBy('questions', 'effectId', effectId ? effectId : '', 'position', 'asc')

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

  // Positive or negative handler
  const posNegHandler = async (e) => {
    const docid = e.target.dataset.docid

    await updateDoc(doc(db, "questions", docid), {
      posNeg: e.target.value
    });
  }

  // Delete question
  const deleteQuestion = async (e) => {

    await deleteDoc(doc(db, "questions", deleteDocid))

    setDeleteModal(false)
  }

  return (
    <div id='questions-container'>
        {questions && questions.map((question, index) => (
        <div 
        id='question-container' 
        key={question.id}
        onClick={() => setQuestionId(question.id)}
        className={`${questionId === question.id ? "activeQuestion" : ""}`}
        >
            <p>{question.position}</p>
            {editQuestion === question.id ?
              <input type="text" defaultValue={question.name} data-docid={question.docid} onChange={updateQuestion} />
              :
              <p className="effect-name-p">{question.name}</p>
            }
            <div>
              <select name="" id="" data-docid={question.docid} value={question.posNeg} onChange={posNegHandler}>
                <option value="positive">Positief</option>
                <option value="negative">Negatief</option>
              </select>
            </div>
            <div className="catergory-options-container" style={{ display: questionId === question.id ? 'flex' : 'none' }}>
              <ModeEditOutlineOutlinedIcon
                onClick={() => (editQuestion === question.id ? setEditQuestion(null) : setEditQuestion(question.id))}
              />
              <DeleteOutlineOutlinedIcon
                onClick={() => {
                  setDeleteModal(true);
                  setDeleteDocid(question.docid);
                }} // Open modal on delete
              />
            </div>
        </div>
        ))}
        <div id='question-container'>
          <AddCircleOutlineOutlinedIcon onClick={addQuestion}/>
        </div>
        <ReactModal
        open={deleteModal}
        setOpen={setDeleteModal}
        deleteFunction={deleteQuestion}
        title="Weet je zeker dat je deze vraag wilt verwijderen?"
        text="Deze actie kan niet ongedaan worden gemaakt."
      />
    </div>
  )
}

export default Questions