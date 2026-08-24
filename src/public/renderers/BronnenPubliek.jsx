// The sources behind the figures. For a financier or a sector partner this is
// often the first thing they want to see, so it gets its own section instead of
// being folded away in a footnote.
//
// Two documents shape their source list differently — one is keyed by id with a
// full citation, the other is a list of named sources — so both are handled
// here rather than each renderer growing its own version.
// Some source titles are authored as "Specifieke bronnen EFF-03: …". The code
// is meaningful in the workbook and meaningless to a reader, so it is swapped
// for the effect it names. The document itself is untouched — this is a display
// choice, and the original text stays available through the API.
const zonderCodes = (tekst, effecten) =>
  typeof tekst !== 'string'
    ? tekst
    : tekst.replace(/EFF-\d+/g, code => {
        const effect = effecten.find(e => e.id === code);
        return effect ? effect.effect : code;
      });

const BronnenPubliek = ({ doc }) => {
  const bronnen = doc.bronnen;
  if (!bronnen) return null;

  const effecten = doc.effecten || [];

  const items = Array.isArray(bronnen)
    ? bronnen.map(b => ({
        titel: b.bron || b.id,
        detail: [b.domein, b.toegang].filter(Boolean).join(' · '),
        betrouwbaarheid: null,
      }))
    : Object.values(bronnen).map(b => ({
        titel: zonderCodes(b.apaReferentie || b.publisher || b.id, effecten),
        detail: zonderCodes(
          [b.typeBron, b.pagina, b.opmerkingen].filter(Boolean).join(' · '),
          effecten
        ),
        betrouwbaarheid: b.betrouwbaarheid || null,
      }));

  if (items.length === 0) return null;

  return (
    <section style={{ marginTop: 56 }}>
      <p className="publiek-eyebrow">Bronnen</p>
      <h2>Waar de bedragen vandaan komen.</h2>
      <p className="publiek-smal publiek-notitie">
        Elk bedrag in deze standaard is terug te voeren op een van deze bronnen.
      </p>

      <div className="publiek-tabelwrap">
        <table className="publiek-tabel">
          <thead>
            <tr>
              <th>Bron</th>
              <th>Toelichting</th>
              {items.some(i => i.betrouwbaarheid) && <th>Betrouwbaarheid</th>}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i}>
                <td>{item.titel}</td>
                <td className="publiek-notitie">{item.detail}</td>
                {items.some(x => x.betrouwbaarheid) && <td>{item.betrouwbaarheid || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default BronnenPubliek;
