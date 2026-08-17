import { euro } from '../../standaarden';
import { note, tableStyle, tableWrap, td, tdNum, th } from './SharedStyles';

// Read-only view of the participatieladder parameters. This standaard has no
// effecten or stellingen — it is the parameter set the ladder is monetised
// with (incomes per education level and hours band, tax brackets, benefit
// amounts) — so it gets its own layout rather than the effect list.
const ParametersStandaard = ({ doc }) => {
  const bands = doc.options?.hoursBand || [];
  const bronnenById = doc.bronnen || {};

  // Render bron-id's as links, or as plain text where a bron has no public URL.
  const bronLinks = ids => {
    const items = (ids || []).map(id => bronnenById[id]).filter(Boolean);
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
    <div>
      <p style={note}>
        Monetariseringsparameters voor arbeidsparticipatie (belastingjaar {doc.meta?.taxYear}).
        Bron: {doc.meta?.source}. Bijgewerkt: {doc.meta?.updatedAt}.
      </p>

      <h3>Treden van de participatieladder</h3>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Trede</th>
              <th style={th}>Niveau</th>
              <th style={th}>Omschrijving</th>
              <th style={{ ...th, textAlign: 'right' }}>Waardering / jaar</th>
              <th style={th}>Bronnen</th>
            </tr>
          </thead>
          <tbody>
            {(doc.ladderLevels || []).map(lvl => (
              <tr key={lvl.trede}>
                <td style={td}>{lvl.trede}</td>
                <td style={td}>{lvl.label}</td>
                <td style={td}>
                  {lvl.description}
                  {lvl.rationale && (
                    <div style={{ color: '#666', fontSize: 13, marginTop: 4 }}>{lvl.rationale}</div>
                  )}
                </td>
                <td style={tdNum}>{euro(lvl.valuePerYear)}</td>
                <td style={td}>{bronLinks(lvl.sources)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Bruto jaarinkomen per opleiding en uren per week</h3>
      <p style={note}>Bron: {bronLinks(doc.sourceRefs?.incomeByEducationAndHoursBand)}</p>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Opleidingsniveau</th>
              {bands.map(b => (
                <th key={b} style={{ ...th, textAlign: 'right' }}>
                  {b}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(doc.incomeByEducationAndHoursBand || {}).map(([edu, row]) => (
              <tr key={edu}>
                <td style={td}>{edu}</td>
                {bands.map(b => (
                  <td key={b} style={tdNum}>
                    {euro(row[b])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Belastingschijven</h3>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Tot en met</th>
              <th style={{ ...th, textAlign: 'right' }}>Tarief</th>
            </tr>
          </thead>
          <tbody>
            {(doc.taxBrackets || []).map((b, i) => (
              <tr key={i}>
                <td style={td}>{b.upTo === null ? 'Geen plafond' : euro(b.upTo)}</td>
                <td style={tdNum}>{(b.rate * 100).toLocaleString('nl-NL')}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>Uitkeringen en overige bedragen (per jaar)</h3>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Post</th>
              <th style={{ ...th, textAlign: 'right' }}>Bedrag</th>
              <th style={th}>Bron</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(doc.benefitAmountPerYear || {}).map(([k, v]) => (
              <tr key={k}>
                <td style={td}>{k}</td>
                <td style={tdNum}>{euro(v)}</td>
                <td style={td}>{bronLinks(doc.sourceRefs?.benefitAmountPerYear?.[k])}</td>
              </tr>
            ))}
            <tr>
              <td style={td}>Uitvoeringskosten bijstand</td>
              <td style={tdNum}>{euro(doc.bijstandUitvoeringskostenPerYear)}</td>
              <td style={td}>{bronLinks(doc.sourceRefs?.bijstandUitvoeringskostenPerYear)}</td>
            </tr>
            <tr>
              <td style={td}>Vrijwilligerswaarde per uur</td>
              <td style={tdNum}>{euro(doc.volunteerValuePerHour)}</td>
              <td style={td} />
            </tr>
            <tr>
              <td style={td}>Weken per jaar</td>
              <td style={tdNum}>{doc.weeksPerYear}</td>
              <td style={td} />
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Bronnen</h3>
      <div style={tableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={th}>Bron</th>
              <th style={th}>Uitgever</th>
              <th style={th}>Jaar</th>
              <th style={th}>Link</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(bronnenById).map(b => (
              <tr key={b.id}>
                <td style={td}>
                  {b.title}
                  {b.dataset && <span style={{ color: '#888' }}> (dataset {b.dataset})</span>}
                  {b.note && <div style={{ color: '#888', fontSize: 13 }}>{b.note}</div>}
                </td>
                <td style={td}>{b.publisher}</td>
                <td style={td}>{b.year || ''}</td>
                <td style={td}>
                  {b.url ? (
                    <a href={b.url} target="_blank" rel="noopener noreferrer">
                      Open
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ParametersStandaard;
