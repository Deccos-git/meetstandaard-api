// The history of a standaard, which by definition cannot live inside the
// versions it describes: those are immutable.
//
// It is shown next to the standaard rather than tucked away, because the most
// useful thing to know about a figure you are about to rely on is whether it has
// been corrected before, and why.
const SOORT_LABEL = {
  publicatie: 'publicatie',
  'correctie-in-plaats': 'correctie op een al gepubliceerde versie',
};

const Changelog = ({ entries, fout, versie }) => {
  if (fout) {
    return (
      <section style={{ marginTop: 56 }}>
        <p className="publiek-eyebrow">Wijzigingen</p>
        <div className="publiek-fout">
          <p>De changelog kon niet worden opgehaald. {fout}</p>
        </div>
      </section>
    );
  }

  if (!entries) return null;

  return (
    <section style={{ marginTop: 56 }}>
      <p className="publiek-eyebrow">Wijzigingen</p>
      <h2>Wat er aan deze standaard is veranderd.</h2>
      <p className="publiek-smal publiek-notitie">
        Een gepubliceerde versie verandert niet meer, dus deze lijst staat er los van en groeit wel.
        Elke regel noemt de commit waarin de wijziging landde.
      </p>

      {/* Several entries can share a version — a correction to an already
          published one is exactly that. Marking every one of them "nu getoond"
          says nothing, so only the newest entry of that version carries it. */}
      {entries.map((entry, i) => (
        <div
          className="publiek-niveau"
          key={`${entry.versie}-${entry.commit}-${i}`}
          style={{ marginBottom: 14 }}
        >
          <div className="publiek-niveau-kop">
            <strong>Versie {entry.versie}</strong>
            {entries.findIndex(e => e.versie === versie) === i && (
              <span className="publiek-badge publiek-badge-versie">nu getoond</span>
            )}
            <span className="publiek-badge">{entry.datum}</span>
            <span
              className={`publiek-badge ${
                entry.soort === 'correctie-in-plaats' ? 'publiek-badge-let-op' : ''
              }`}
            >
              {SOORT_LABEL[entry.soort] || entry.soort}
            </span>
          </div>

          <p style={{ fontSize: 16, marginTop: 0 }}>{entry.samenvatting}</p>

          <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
            {entry.wijzigingen.map((w, j) => (
              <li key={j} style={{ fontSize: 15, marginBottom: 4 }}>
                {w}
              </li>
            ))}
          </ul>

          <p className="publiek-notitie" style={{ marginTop: 10 }}>
            commit <code>{entry.commit}</code>
            {entry.besluiten.length > 0 && ` · besluit ${entry.besluiten.join(', ')}`}
            {entry.feedback.length > 0 && ` · naar aanleiding van ${entry.feedback.length} reactie(s)`}
          </p>
        </div>
      ))}
    </section>
  );
};

export default Changelog;
