import { Link, useParams } from 'react-router-dom';
import { standaardVoorKey } from '../../standaarden';
import { useApiStandaard } from '../../public/useApiStandaard';
import EffectenPubliek from '../../public/renderers/EffectenPubliek';
import InterventiesPubliek from '../../public/renderers/InterventiesPubliek';
import ParametersPubliek from '../../public/renderers/ParametersPubliek';
import ControleBlok from '../../public/ControleBlok';

// Which renderer a document gets is decided by `meta.kind` — the field the API
// publishes exactly so a consumer does not have to know in advance what shape
// it is about to parse. The participatieladder parameters predate that field,
// so the registry supplies the fallback.
const rendererVoor = (doc, standaard) => {
  const kind = doc.meta?.kind || (standaard.render === 'parameters' ? 'parameters' : 'meetstandaard');
  if (kind === 'interventiebibliotheek') return InterventiesPubliek;
  if (kind === 'parameters') return ParametersPubliek;
  return EffectenPubliek;
};

const StandaardDetail = () => {
  const { key } = useParams();
  const standaard = standaardVoorKey(key);

  if (!standaard) {
    return (
      <section className="publiek-sectie">
        <div className="publiek-breed">
          <h1>Onbekende meetstandaard</h1>
          <p>
            <Link to="/">Terug naar het overzicht</Link>
          </p>
        </div>
      </section>
    );
  }

  return <Inhoud standaard={standaard} />;
};

const Inhoud = ({ standaard }) => {
  const { versies, versie, setVersie, doc, laden, fout } = useApiStandaard(standaard.api);
  const Renderer = doc ? rendererVoor(doc, standaard) : null;

  return (
    <>
      <section className="publiek-sectie publiek-sectie-creme" style={{ paddingBottom: 40 }}>
        <div className="publiek-breed">
          <p className="publiek-eyebrow">Meetstandaard</p>
          <h1 style={{ marginBottom: 12 }}>{standaard.label}</h1>
          <p className="publiek-smal">{standaard.omschrijving}</p>
        </div>
      </section>

      <section className="publiek-sectie" style={{ paddingTop: 0 }}>
        <div className="publiek-breed">
          <div className="publiek-versiebalk">
            <label htmlFor="versie">Versie</label>
            <select
              id="versie"
              value={versie ?? ''}
              onChange={e => setVersie(e.target.value)}
              disabled={versies.length === 0}
            >
              {versies.map(v => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            {doc?.meta?.releasedAt && (
              <span className="publiek-badge">gepubliceerd {doc.meta.releasedAt}</span>
            )}
            <span className="publiek-badge">alleen-lezen</span>

            {/* A published version is immutable, so the exact URL that produced
                what is on screen is worth showing — it is what a consumer pins. */}
            {versie && (
              <span className="publiek-notitie" style={{ marginLeft: 'auto' }}>
                Rechtstreeks uit de API:{' '}
                <code>
                  /api/v1/{standaard.api.functie}/{standaard.api.resource}/{versie}
                </code>
              </span>
            )}
          </div>

          {fout && (
            <div className="publiek-fout">
              <p>De standaard kon niet worden opgehaald. {fout}</p>
            </div>
          )}
          {laden && !fout && <p>Laden…</p>}

          {doc && !laden && (
            <>
              {/* The toelichting explains what the version is; it is not a
                  warning. Giving it the warning styling would make the real
                  warnings — the ones that change how a number may be used —
                  indistinguishable from an introduction. */}
              {doc.meta?.toelichting && (
                <p className="publiek-smal publiek-notitie" style={{ marginBottom: 28 }}>
                  {doc.meta.toelichting}
                </p>
              )}

              <Renderer doc={doc} />

              <ControleBlok controle={doc.controle} />
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default StandaardDetail;
