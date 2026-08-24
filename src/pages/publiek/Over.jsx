import { API_BASE } from '../../api/client';

// The public site is one consumer of the API among others. Saying so, and
// showing the exact URLs, is what makes "controleerbaar" more than a claim.
const Over = () => (
  <section className="publiek-sectie">
    <div className="publiek-breed publiek-smal">
      <p className="publiek-eyebrow">Over de standaard</p>
      <h1>Elk cijfer is terug te leiden.</h1>

      <p>
        Een meetstandaard beschrijft welke effecten je meet, met welke stellingen, en wat een score
        maatschappelijk waard is. Bij elk bedrag horen de berekening, de aannames en de bron.
      </p>

      <h2>Een versie verandert nooit</h2>
      <p>
        Een gepubliceerde versie blijft bestaan en blijft geserveerd worden. Een correctie komt uit
        als nieuwe versie. Daardoor is een meting van vandaag over jaren nog uit te leggen tegen
        precies de methodiek waarmee hij is gedaan.
      </p>
      <p>
        Leg daarom de versie vast bij alles wat je meet — die staat in elk antwoord in{' '}
        <code>meta.version</code>.
      </p>

      <h2>Wat een standaard niet weet</h2>
      <p>
        Elke standaard publiceert ook zijn gaten. Ontbreekt een cijfer, dan staat er geen nul maar
        een lege waarde met de brontekst erbij, en wordt hij genoemd onder <em>Controle</em>. Een
        waarde die is afgeleid in plaats van vastgelegd staat als afgeleid gemarkeerd.
      </p>

      <h2>De API</h2>
      <p>
        Openbaar, alleen-lezen, zonder sleutel. Deze pagina gebruikt precies dezelfde endpoints als
        elke andere consument.
      </p>
      <div className="publiek-tabelwrap">
        <table className="publiek-tabel">
          <thead>
            <tr>
              <th>Wat</th>
              <th>Pad</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Alle standaarden</td>
              <td>
                <code>/meetstandaard/api/v1/meetstandaard</code>
              </td>
            </tr>
            <tr>
              <td>Welke versies bestaan</td>
              <td>
                <code>/meetstandaard/api/v1/meetstandaard/{'{standaard}'}/versions</code>
              </td>
            </tr>
            <tr>
              <td>Eén versie, vastgepind</td>
              <td>
                <code>/meetstandaard/api/v1/meetstandaard/{'{standaard}'}/{'{versie}'}</code>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="publiek-notitie">
        Basis: <code>{API_BASE}</code>
      </p>
    </div>
  </section>
);

export default Over;
