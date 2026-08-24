import { useMemo, useState } from 'react';
import { euro } from '../../standaarden';

// An interventiebibliotheek is a catalogue you scan and compare, so it renders
// as one table per domein rather than as a list of detail pages.

const getal = n => (typeof n === 'number' ? n.toLocaleString('nl-NL') : null);

// A missing kengetal is a real state in this data — 42 of 114 interventies have
// none. It must read as "not quantified", never as zero.
const leeg = <span className="publiek-notitie">niet bepaald</span>;
const toon = (waarde, render) => (waarde === null || waarde === undefined ? leeg : render(waarde));

const InterventiesPubliek = ({ doc }) => {
  const [domein, setDomein] = useState(doc.domeinen[0]);
  const [zoek, setZoek] = useState('');

  const rijen = useMemo(() => {
    const term = zoek.trim().toLowerCase();
    return doc.interventies
      .filter(i => i.domein === domein)
      .filter(i => !term || i.interventie.toLowerCase().includes(term));
  }, [doc, domein, zoek]);

  // Only the Klimaat & Energie rows carry per-year figures; for the other
  // domeinen those columns would be empty for every row.
  const jaarcijfers = rijen.some(i => i.berekend.co2eKgPerJaar !== null);

  return (
    <>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        {doc.domeinen.map(d => (
          <button
            key={d}
            type="button"
            className={`publiek-knop publiek-knop-klein ${
              d === domein ? 'publiek-knop-zwart' : 'publiek-knop-licht'
            }`}
            onClick={() => setDomein(d)}
          >
            {d} ({doc.interventies.filter(i => i.domein === d).length})
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
        <input
          className="publiek-zoek"
          type="search"
          placeholder="Zoek een interventie"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
        />
        <span className="publiek-notitie">{rijen.length} interventies</span>
      </div>

      <div className="publiek-tabelwrap">
        <table className="publiek-tabel">
          <thead>
            <tr>
              <th>Interventie</th>
              <th>Eenheid</th>
              {jaarcijfers ? (
                <>
                  <th className="num">Energie / jaar</th>
                  <th className="num">CO₂e / jaar</th>
                  <th className="num">Besparing huishouden</th>
                  <th className="num">Maatschappelijk</th>
                  <th className="num">Totale waarde</th>
                </>
              ) : (
                <>
                  <th className="num">CO₂e / eenheid</th>
                  <th className="num">Maatschappelijk / eenheid</th>
                </>
              )}
              <th>Bewijskracht</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map(i => (
              <tr key={i.id}>
                <td>
                  {i.interventie}
                  {/* Where the figure is monetised from. For this audience that
                      is the question behind every number in the row. */}
                  {i.monetarisatiebron && (
                    <div className="publiek-notitie">Bron: {i.monetarisatiebron}</div>
                  )}
                </td>
                <td>{i.eenheid}</td>
                {jaarcijfers ? (
                  <>
                    <td className="num">{toon(i.berekend.energieKwhPerJaar, n => `${getal(n)} kWh`)}</td>
                    <td className="num">{toon(i.berekend.co2eKgPerJaar, n => `${getal(n)} kg`)}</td>
                    <td className="num">{toon(i.berekend.besparingHuishoudenEurPerJaar, euro)}</td>
                    <td className="num">{toon(i.berekend.maatschappelijkeBesparingEurPerJaar, euro)}</td>
                    {/* The total is the sum of the two columns beside it, and
                        never appears without them — see ADR-007. */}
                    <td className="num">
                      <strong>{toon(i.berekend.totaleWaardeEurPerJaar, euro)}</strong>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="num">{toon(i.berekend.co2eKgPerEenheid, n => `${getal(n)} kg`)}</td>
                    <td className="num">
                      {toon(i.berekend.maatschappelijkeBesparingEurPerEenheid, euro)}
                    </td>
                  </>
                )}
                <td>{i.bewijssterkte || i.bewijskracht || leeg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {doc.berekening?.waarschuwing && (
        <div className="publiek-waarschuwing">
          <p>{doc.berekening.waarschuwing}</p>
        </div>
      )}
    </>
  );
};

export default InterventiesPubliek;
