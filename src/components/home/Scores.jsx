import { updateDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";

// Per-effect monetarisering scores (1-5). Columns:
//   Score afgerond | Situatieomschrijving per score | Monetaire waarde | Onderbouwing monetarisering
// Stored on the effect document as a `scores` array.
const SCORE_LEVELS = [1, 2, 3, 4, 5];

// Ensure 5 rows always exist (score 1-5), seeded from the effect's stored scores.
const normalizeScores = (scores) => {
  const byScore = new Map(
    (Array.isArray(scores) ? scores : []).map((s) => [Number(s.score), s])
  );

  return SCORE_LEVELS.map((score) => {
    const existing = byScore.get(score) || {};
    return {
      score,
      situation: existing.situation || "",
      monetaryValue:
        existing.monetaryValue === undefined ? null : existing.monetaryValue,
      onderbouwing: existing.onderbouwing || "",
    };
  });
};

const Scores = ({ docid, scores }) => {
  const rows = normalizeScores(scores);

  // Write a single field of a single score row back to Firestore.
  const updateScoreField = async (score, field, value) => {
    const next = normalizeScores(scores).map((row) =>
      row.score === score ? { ...row, [field]: value } : row
    );

    await updateDoc(doc(db, "effects", docid), { scores: next });
  };

  const onMonetaryBlur = (score) => (e) => {
    const raw = e.target.value.trim();
    const parsed = raw === "" ? null : Number(raw);
    updateScoreField(score, "monetaryValue", Number.isNaN(parsed) ? null : parsed);
  };

  return (
    <div id="scores-container" onClick={(e) => e.stopPropagation()}>
      <div className="scores-header">
        <p>Score</p>
        <p>Situatieomschrijving per score</p>
        <p>Monetaire waarde</p>
        <p>Onderbouwing monetarisering</p>
      </div>

      {rows.map((row) => (
        <div id="score-row" key={row.score}>
          <p className="score-number">{row.score}</p>

          <textarea
            className="score-situation-textarea"
            defaultValue={row.situation}
            placeholder="Situatieomschrijving"
            rows={3}
            onBlur={(e) => updateScoreField(row.score, "situation", e.target.value)}
          />

          <input
            type="number"
            className="score-monetary-input"
            defaultValue={row.monetaryValue ?? ""}
            placeholder="€"
            onBlur={onMonetaryBlur(row.score)}
          />

          <textarea
            className="score-onderbouwing-textarea"
            defaultValue={row.onderbouwing}
            placeholder="Onderbouwing monetarisering"
            rows={3}
            onBlur={(e) =>
              updateScoreField(row.score, "onderbouwing", e.target.value)
            }
          />
        </div>
      ))}
    </div>
  );
};

export default Scores;
