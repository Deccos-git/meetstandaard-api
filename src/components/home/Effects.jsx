import {
  onSnapshot,
  query,
  where,
  collection,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useState, useEffect } from "react";
import { v4 as uuidv4 } from "uuid";
import Questions from "./Questions";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import ArrowDropDownCircleOutlinedIcon from "@mui/icons-material/ArrowDropDownCircleOutlined";
import Tooltip from "../common/Tooltip";
import ModeEditOutlineOutlinedIcon from "@mui/icons-material/ModeEditOutlineOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ReactModal from "../common/ReactModal";
import MultiSelectDropdown from "../common/MultiSelectDropdown";

const SECTOR_OPTIONS = [
  { value: "arbeidsparticipatie", label: "Arbeidsparticipatie" },
  { value: "gelijke-kansen", label: "Gelijke kansen" },
];

const Effects = ({ categoryId }) => {
  // State
  const [effects, setEffects] = useState([]);
  const [displayQuestions, setDisplayQuestions] = useState(null);
  const [effectId, setEffectId] = useState(null);
  const [editEffect, setEditEffect] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteDocid, setDeleteDocid] = useState("");

  // Real-time listener for effects
  useEffect(() => {
    if (!categoryId) return;

    const q = query(
      collection(db, "effects"),
      where("categorie", "==", categoryId),
      orderBy("position", "asc")
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const effectsArray = [];
      querySnapshot.forEach((d) => {
        effectsArray.push({ ...d.data(), docid: d.id });
      });
      setEffects(effectsArray);
    });

    return () => unsubscribe();
  }, [categoryId]);

  // Add new effect
  const addEffect = async () => {
    await addDoc(collection(db, "effects"), {
      id: uuidv4(),
      name: "Nieuw effect",
      description: "",
      categorie: categoryId,
      position: effects.length + 1,
      sectors: [], // ✅ sector multiselect lives here
    });
  };

  // Update effect name
  const updateEffect = async (e) => {
    const docid = e.target.dataset.docid;

    await updateDoc(doc(db, "effects", docid), {
      name: e.target.value,
    });
  };

  // Update effect description
  const updateEffectDescription = async (e) => {
    const docid = e.target.dataset.docid;

    await updateDoc(doc(db, "effects", docid), {
      description: e.target.value,
    });
  };

  // Update effect sectors
  const updateEffectSectors = async (docid, sectorsArr) => {
    await updateDoc(doc(db, "effects", docid), {
      sectors: Array.isArray(sectorsArr) ? sectorsArr : [],
    });
  };

  // Delete effect
  const deleteEffect = async () => {
    await deleteDoc(doc(db, "effects", deleteDocid));
    setDeleteModal(false);
  };

  // Toggle the display of questions for the specific effect
  const toggleQuestions = (id) => {
    setDisplayQuestions((prev) => (prev === id ? null : id));
  };

  return (
    <div className="table-container">
      {effects &&
        effects.map((effect) => (
          <div key={effect.id} onClick={() => setEffectId(effect.id)}>
            <div
              id="effect-container"
              className={`${effectId === effect.id ? "activeEffect" : ""}`}
            >
              <p>{effect.position}</p>

              {editEffect === effect.id ? (
                <input
                  type="text"
                  defaultValue={effect.name}
                  data-docid={effect.docid}
                  onChange={updateEffect}
                />
              ) : (
                <p className="effect-name-p">{effect.name}</p>
              )}

              {/* ✅ Description column */}
              <div
                style={{ width: "100%", marginRight: 10 }}
                onClick={(e) => e.stopPropagation()}
              >
                <textarea
                  className="effect-description-textarea"
                  defaultValue={effect.description || ""}
                  data-docid={effect.docid}
                  onBlur={updateEffectDescription}
                  placeholder="Beschrijving"
                  rows={2}
                />
              </div>

              {/* ✅ Sectoren on effect-level (only dropdown) */}
              <div style={{ width: "100%" }} onClick={(e) => e.stopPropagation()}>
                <MultiSelectDropdown
                  options={SECTOR_OPTIONS}
                  value={Array.isArray(effect.sectors) ? effect.sectors : []}
                  placeholder="Kies sectoren"
                  onChange={(arr) => updateEffectSectors(effect.docid, arr)}
                />
              </div>

              <div
                className="catergory-options-container"
                style={{ display: effectId === effect.id ? "flex" : "none" }}
                onClick={(e) => e.stopPropagation()}
              >
                <ArrowDropDownCircleOutlinedIcon onClick={() => toggleQuestions(effect.id)} />
                <ModeEditOutlineOutlinedIcon
                  onClick={() =>
                    editEffect === effect.id ? setEditEffect(null) : setEditEffect(effect.id)
                  }
                />
                <DeleteOutlineOutlinedIcon
                  onClick={() => {
                    setDeleteModal(true);
                    setDeleteDocid(effect.docid);
                  }}
                />
              </div>
            </div>

            {displayQuestions === effect.id && <Questions effectId={effect.id} />}
          </div>
        ))}

      <Tooltip content="Voeg een nieuw effect toe" width="200px" top="-40px" left="0px">
        <AddCircleOutlineOutlinedIcon
          className="plus-button plus-button-effects"
          onClick={addEffect}
        />
      </Tooltip>

      <ReactModal
        open={deleteModal}
        setOpen={setDeleteModal}
        deleteFunction={deleteEffect}
        title="Weet je zeker dat je dit effect wilt verwijderen?"
        text="Deze actie kan niet ongedaan worden gemaakt."
      />
    </div>
  );
};

export default Effects;
