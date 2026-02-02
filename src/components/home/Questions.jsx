import { useFirestoreOneOrderBy } from "../../firebase/useFirestore";
import AddCircleOutlineOutlinedIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import ModeEditOutlineOutlinedIcon from "@mui/icons-material/ModeEditOutlineOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import ReactModal from "../common/ReactModal";
import MultiSelectDropdown from "../common/MultiSelectDropdown";
import { addDoc, collection, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { v4 as uuidv4 } from "uuid";
import { useState } from "react";

const DOELGROEP_OPTIONS = [
  { value: "volwassenen", label: "Volwassenen" },
  { value: "kinderen-vanaf-groep-5", label: "Kinderen basisschool vanaf groep 5" },
  { value: "jongeren-vanaf-middelbare-school", label: "Jongeren vanaf middelbare school" },
];

const Questions = ({ effectId }) => {
  // State
  const [deleteModal, setDeleteModal] = useState(false);
  const [questionId, setQuestionId] = useState(null);
  const [editQuestion, setEditQuestion] = useState(null);
  const [deleteDocid, setDeleteDocid] = useState("");

  // Firestore
  const questions = useFirestoreOneOrderBy(
    "questions",
    "effectId",
    effectId ? effectId : "",
    "position",
    "asc"
  );

  // Add question
  const addQuestion = async () => {
    await addDoc(collection(db, "questions"), {
      id: uuidv4(),
      name: "Nieuwe vraag",
      effectId: effectId,
      position: (questions?.length || 0) + 1,
      posNeg: "positive",

      // ✅ doelgroep logic
      targetGroupsMode: "all", // "all" | "custom"
      targetGroups: [],        // only used when mode === "custom"
    });
  };

  // Update question name
  const updateQuestion = async (e) => {
    const docid = e.target.dataset.docid;

    await updateDoc(doc(db, "questions", docid), {
      name: e.target.value,
    });
  };

  // Positive or negative handler
  const posNegHandler = async (e) => {
    const docid = e.target.dataset.docid;

    await updateDoc(doc(db, "questions", docid), {
      posNeg: e.target.value,
    });
  };

  // Update targetGroupsMode
  const updateTargetGroupsMode = async (docid, mode) => {
    const safeMode = mode === "custom" ? "custom" : "all";

    await updateDoc(doc(db, "questions", docid), {
      targetGroupsMode: safeMode,
      targetGroups: safeMode === "custom" ? [] : [], // keep normalized
    });
  };

  // Update targetGroups (only meaningful in custom mode)
  const updateTargetGroups = async (docid, arr) => {
    await updateDoc(doc(db, "questions", docid), {
      targetGroups: Array.isArray(arr) ? arr : [],
      targetGroupsMode: "custom",
    });
  };

  // Delete question
  const deleteQuestion = async () => {
    await deleteDoc(doc(db, "questions", deleteDocid));
    setDeleteModal(false);
  };

  return (
    <div id="questions-container">
      {questions &&
        questions.map((question) => {
          const mode = question.targetGroupsMode || "all";
          const isCustom = mode === "custom";

          return (
            <div
              id="question-container"
              key={question.id}
              onClick={() => setQuestionId(question.id)}
              className={`${questionId === question.id ? "activeQuestion" : ""}`}
            >
              <p>{question.position}</p>

              {editQuestion === question.id ? (
                <input
                  type="text"
                  defaultValue={question.name}
                  data-docid={question.docid}
                  onChange={updateQuestion}
                />
              ) : (
                <p className="effect-name-p">{question.name}</p>
              )}

              <div>
                <select
                  data-docid={question.docid}
                  value={question.posNeg || "positive"}
                  onChange={posNegHandler}
                >
                  <option value="positive">Positief</option>
                  <option value="negative">Negatief</option>
                </select>
              </div>

              {/* ✅ Doelgroep logic: All vs Custom */}
              <div style={{ width: "100%" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* simple toggle without extra libs */}
                  <div style={{ display: "flex", border: "1px solid #e7e7e7", borderRadius: 5 }}>
                    <button
                      type="button"
                      onClick={() => updateTargetGroupsMode(question.docid, "all")}
                      style={{
                        border: "none",
                        background: isCustom ? "#f4f4f4" : "rgba(249, 176, 59, 0.25)",
                        padding: "6px 10px",
                        cursor: "pointer",
                        borderTopLeftRadius: 5,
                        borderBottomLeftRadius: 5,
                        fontSize: 12,
                        fontFamily: "interstate, sans-serif",
                      }}
                    >
                      Alle
                    </button>
                    <button
                      type="button"
                      onClick={() => updateTargetGroupsMode(question.docid, "custom")}
                      style={{
                        border: "none",
                        background: isCustom ? "rgba(249, 176, 59, 0.25)" : "#f4f4f4",
                        padding: "6px 10px",
                        cursor: "pointer",
                        borderTopRightRadius: 5,
                        borderBottomRightRadius: 5,
                        fontSize: 12,
                        fontFamily: "interstate, sans-serif",
                      }}
                    >
                      Specifiek
                    </button>
                  </div>

                  {isCustom ? (
                    <div style={{ width: "100%" }}>
                      <MultiSelectDropdown
                        options={DOELGROEP_OPTIONS}
                        value={Array.isArray(question.targetGroups) ? question.targetGroups : []}
                        placeholder="Kies doelgroepen"
                        onChange={(arr) => updateTargetGroups(question.docid, arr)}
                      />
                    </div>
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.7 }}>
                      Geldt voor alle doelgroepen
                    </span>
                  )}
                </div>
              </div>

              <div
                className="catergory-options-container"
                style={{ display: questionId === question.id ? "flex" : "none" }}
                onClick={(e) => e.stopPropagation()}
              >
                <ModeEditOutlineOutlinedIcon
                  onClick={() =>
                    editQuestion === question.id
                      ? setEditQuestion(null)
                      : setEditQuestion(question.id)
                  }
                />
                <DeleteOutlineOutlinedIcon
                  onClick={() => {
                    setDeleteModal(true);
                    setDeleteDocid(question.docid);
                  }}
                />
              </div>
            </div>
          );
        })}

      <div id="question-container">
        <AddCircleOutlineOutlinedIcon onClick={addQuestion} />
      </div>

      <ReactModal
        open={deleteModal}
        setOpen={setDeleteModal}
        deleteFunction={deleteQuestion}
        title="Weet je zeker dat je deze vraag wilt verwijderen?"
        text="Deze actie kan niet ongedaan worden gemaakt."
      />
    </div>
  );
};

export default Questions;
