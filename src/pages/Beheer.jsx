import FeedbackBeheer from '../components/beheer/FeedbackBeheer';

// Het paneel is nog één ding: de feedbackwachtrij.
//
// De tabs met de gepubliceerde standaarden zijn eruit. Ze toonden alleen-lezen
// wat de publieke site ook toont, alleen dan achter een login — een tweede
// weergave van hetzelfde document die uit de pas kon lopen met de eerste. Wat
// hier hoort te staan is wat nergens anders staat: wat er binnenkomt en nog
// niemand heeft gezien.
const Beheer = () => (
  <section className="publiek-sectie">
    <div className="publiek-breed">
      <p className="publiek-eyebrow">Beheer</p>
      <h1>Feedback</h1>

      <FeedbackBeheer />
    </div>
  </section>
);

export default Beheer;
