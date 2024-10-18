import { useFirestore } from "../firebase/useFirestore";
import { useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import AddCircleOutlineOutlinedIcon from '@mui/icons-material/AddCircleOutlineOutlined';
import { db, auth } from "../firebase/config";
import { addDoc, collection, updateDoc, doc } from "firebase/firestore";
import Effects from "../components/home/Effects";
import Tooltip from "../components/common/Tooltip";
import MoreVertOutlinedIcon from '@mui/icons-material/MoreVertOutlined';
import ModeEditOutlineOutlinedIcon from '@mui/icons-material/ModeEditOutlineOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import ReactModal from "../components/common/ReactModal";

const Home = () => {
  // State
  const [categoryId, setCategoryId] = useState(null);
  const [showOptions, setShowOptions] = useState(null);
  const [editCategory, setEditCategory] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false); // Fix typo in modal state

  // Firestore
  const categories = useFirestore('categories', 'position', 'asc');

  // Set first category as default
  useEffect(() => {
    if (categories) {
      setCategoryId(categories[0]?.id);
    }
  }, [categories]);

  // Add category
  const addCategory = async () => {
    await addDoc(collection(db, "categories"), {
      id: uuidv4(),
      name: 'Nieuwe categorie',
      position: categories.length + 1,
    });
  };

  // Update category
  const updateCategory = async (e) => {
    const docid = e.target.dataset.docid;

    await updateDoc(doc(db, "categories", docid), {
      name: e.target.value,
    });
  };

  return (
    <div>
      <h1>Admin</h1>
      {auth.currentUser && (
        <>
          <div className="tab-container">
            {categories &&
              categories.map((cat, index) => (
                <div
                  key={index}
                  className={`${categoryId === cat.id ? "active" : "tablinks"}`}
                  onClick={() => setCategoryId(cat.id)}
                >
                  {editCategory === cat.id ? (
                    <input
                      type="text"
                      defaultValue={cat.name}
                      data-docid={cat.docid}
                      onChange={updateCategory}
                    />
                  ) : (
                    <p>{cat.name}</p>
                  )}
                  <div className="catergory-options-container" style={{ display: categoryId === cat.id ? 'flex' : 'none' }}>
                    <ModeEditOutlineOutlinedIcon
                      onClick={() => (editCategory === cat.id ? setEditCategory(null) : setEditCategory(cat.id))}
                    />
                    <DeleteOutlineOutlinedIcon
                      onClick={() => setDeleteModal(true)} // Open modal on delete
                    />
                  </div>
                </div>
              ))}
            <Tooltip content="Voeg een nieuwe categorie toe" width="200px" top="-40px" left="0px">
              <AddCircleOutlineOutlinedIcon className="plus-button" onClick={addCategory} />
            </Tooltip>
          </div>
          <Effects categoryId={categoryId} />
        </>
      )}
      <ReactModal
        open={deleteModal}
        setOpen={setDeleteModal}
        title="Weet je zeker dat je deze categorie wilt verwijderen?"
        text="Deze actie kan niet ongedaan worden gemaakt."
      />
    </div>
  );
};

export default Home;
