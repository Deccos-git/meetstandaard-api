import { euro } from '../../standaarden';

// The participatieladder parameters: no effecten or stellingen, but the
// parameter set the ladder is monetised with. Its own layout, for that reason.
const ParametersPubliek = ({ doc }) => {
  const bronnen = doc.bronnen || {};

  const bronLinks = ids => {
    const items = (ids || []).map(id => bronnen[id]).filter(Boolean);
    if (items.length === 0) return null;
    return items.map((b, i) => (
      <span key={b.id}>
        {i > 0 && ', '}
        {b.url ? (
          <a href={b.url} target="_blank" rel="noopener noreferrer">
            {b.publisher}
          </a>
        ) : (
          <span title={b.note || ''}>{b.publisher}</span>
        )}
      </span>
    ));
  };

  return (
    <>
      <h3>Treden van de participatieladder</h3>
      <div className="publiek-tabelwrap">
        <table className="publiek-tabel">
          <thead>
            <tr>
              <th>Trede</th>
              <th>Niveau</th>
              <th>Omschrijving</th>
              <th className="num">Waardering / jaar</th>
              <th>Bronnen</th>
            </tr>
          </thead>
          <tbody>
            {(doc.ladderLevels || []).map(lvl => (
              <tr key={lvl.trede}>
                <td>{lvl.trede}</td>
                <td>{lvl.label}</td>
                <td>
                  {lvl.description}
                  {lvl.rationale && <div className="publiek-notitie">{lvl.rationale}</div>}
                </td>
                <td className="num">{euro(lvl.valuePerYear)}</td>
                <td>{bronLinks(lvl.sources)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Bruto jaarinkomen per opleiding en uren per week</h3>
      <p className="publiek-notitie">
        Bron: {bronLinks(doc.sourceRefs?.incomeByEducationAndHoursBand)}
      </p>
      <div className="publiek-tabelwrap">
        <table className="publiek-tabel">
          <thead>
            <tr>
              <th>Opleidingsniveau</th>
              {(doc.options?.hoursBand || []).map(band => (
                <th key={band} className="num">
                  {band}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(doc.incomeByEducationAndHoursBand || {}).map(([opleiding, perBand]) => (
              <tr key={opleiding}>
                <td>{opleiding}</td>
                {(doc.options?.hoursBand || []).map(band => (
                  <td key={band} className="num">
                    {euro(perBand[band])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export default ParametersPubliek;
