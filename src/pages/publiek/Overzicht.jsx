import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { STANDAARDEN } from '../../standaarden';
import { haalVersies } from '../../api/client';

// The version badge on a card comes from the API, not from a constant: one
// request per standaard against /versions, which returns {versions, latest} and
// nothing else. Cheap enough to do for all five, and it means a card can never
// advertise a version that is not actually being served.
const useNieuwsteVersies = () => {
  const [versies, setVersies] = useState({});

  useEffect(() => {
    let afgebroken = false;

    Promise.all(
      STANDAARDEN.map(s =>
        haalVersies(s.api)
          .then(({ latest }) => [s.key, { latest }])
          // One standaard that fails to answer must not blank the other four,
          // so the failure is recorded per card instead of thrown.
          .catch(() => [s.key, { fout: true }])
      )
    ).then(paren => !afgebroken && setVersies(Object.fromEntries(paren)));

    return () => {
      afgebroken = true;
    };
  }, []);

  return versies;
};

const Overzicht = () => {
  const versies = useNieuwsteVersies();

  return (
    <>
      <section className="publiek-sectie publiek-sectie-creme">
        <div className="publiek-breed">
          <div className="publiek-smal">
            <h1>
              Impact meten op een
              <br />
              eenduidige en onderbouwde manier.
            </h1>
            <p>
              Elke meetstandaard beschrijft welke effecten je meet, met welke stellingen, en wat een
              score maatschappelijk waard is — met de berekening, de aannames en de bron zichtbaar
              achter elk cijfer.
            </p>
            <p>
              <a className="publiek-knop publiek-knop-zwart" href="#standaarden">
                Bekijk meetstandaarden
              </a>
            </p>
          </div>
        </div>
      </section>

      <section className="publiek-sectie" id="standaarden">
        <div className="publiek-breed">
          <p className="publiek-eyebrow">Overzicht meetstandaarden</p>
          <h2>Vijf standaarden, elk met een eigen versie.</h2>
          <p className="publiek-smal publiek-notitie">
            Een gepubliceerde versie verandert nooit meer. Corrigeren gebeurt door een nieuwe versie
            uit te brengen, zodat een meting altijd terug te leiden is naar de methodiek waarmee hij
            is gedaan.
          </p>

          <div className="publiek-kaarten" style={{ marginTop: 28 }}>
            {STANDAARDEN.map(s => {
              const versie = versies[s.key];
              return (
                <Link className="publiek-kaart" key={s.key} to={`/standaard/${s.key}`}>
                  <h3>{s.label}</h3>
                  <p>{s.omschrijving}</p>
                  <div className="publiek-kaart-voet">
                    {!versie && <span className="publiek-badge">versie laden…</span>}
                    {versie?.fout && <span className="publiek-badge publiek-badge-let-op">niet bereikbaar</span>}
                    {versie?.latest && (
                      <span className="publiek-badge publiek-badge-versie">versie {versie.latest}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
};

export default Overzicht;
