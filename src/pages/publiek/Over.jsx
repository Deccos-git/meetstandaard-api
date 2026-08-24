import { API_BASE } from '../../api/client';

// Written for the people the standaard is for: organisations measuring their
// impact, financiers judging it, sector partners building on it. The technical
// half is real and stays, but it sits at the end under its own heading instead
// of setting the tone of the page.
const Over = () => (
  <section className="publiek-sectie">
    <div className="publiek-breed publiek-smal">
      <p className="publiek-eyebrow">Over de meetstandaard</p>
      <h1>Samen één manier van meten.</h1>

      <p>
        Een meetstandaard beschrijft per thema welke maatschappelijke effecten ertoe doen, welke
        vragen je stelt om ze te meten, en wat een uitkomst maatschappelijk waard is. Organisaties
        die hetzelfde meten kunnen hun resultaten naast elkaar leggen, en financiers kunnen zien
        waar een bedrag op rust.
      </p>

      <h2>Bij elk bedrag staat waar het vandaan komt</h2>
      <p>
        Achter elke waardering staat wie er baat bij heeft, hoe het bedrag is berekend, welke
        aannames daarbij zijn gedaan en uit welke bron het komt. Waar een bedrag nog niet is
        vastgesteld, staat dat er — geen nul die een echte nul lijkt.
      </p>

      <h2>Een versie verandert nooit meer</h2>
      <p>
        Zodra een versie is gepubliceerd blijft hij bestaan zoals hij is. Verbeteringen komen uit
        als nieuwe versie. Daardoor blijft een meting die je vorig jaar deed uit te leggen, ook als
        de standaard sindsdien is doorontwikkeld.
      </p>
      <p>Noteer daarom bij elke meting welke versie je gebruikte. Die staat bovenaan elke standaard.</p>

      <h2>Meedenken</h2>
      <p>
        Deze standaarden zijn in ontwikkeling en worden beter van gebruik. Bij elke standaard kun je
        reageren — op het geheel of op één effect. Wat er met een reactie is besloten staat er
        publiek bij, ook als het antwoord &quot;hier doen we niets mee&quot; is.
      </p>

      <h2>Voor ontwikkelaars</h2>
      <p>
        Alle standaarden zijn ook machineleesbaar op te halen. Openbaar, zonder sleutel; deze site
        gebruikt precies dezelfde ingang.
      </p>
      <p className="publiek-notitie">
        <code>{API_BASE}/meetstandaard/api/v1/meetstandaard</code>
        <br />
        Pin een versie met <code>/{'{standaard}'}/{'{versie}'}</code> en bewaar{' '}
        <code>meta.version</code> bij wat je registreert.
      </p>
    </div>
  </section>
);

export default Over;
