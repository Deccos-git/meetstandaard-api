import "dotenv/config";
import functions from "firebase-functions";
import admin from "firebase-admin";
import cors from "cors";
import serviceAccount from "./serviceAcountSecretKey.json" with { type: "json" };
import benchmarks from "./benchmarks.js";
import { handleArbeidsparticipatie } from "./arbeidsparticipatie.js";
import { handleMonetarisering } from "./monetarisering.js";
import { handleMeetstandaard } from "./meetstandaard.js";
import { enforceRateLimit } from "./rateLimit.js";

// Initialize firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Initialize firestore
const firestore = admin.firestore();
const settings = { timestampsInSnapshots: true };
firestore.settings(settings);

// CORS handler
const corsHandler = cors({
  origin: [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://impactdashboard.deccos.nl",
    "http://staging.deccos.nl",
    "http://app.deccos.nl",
    "http://test.deccos.nl",
    "http://deccos.nl",
    "https://alexanderimpactdashboard.nl",
    /\.deccos\.nl$/,
  ],
});

// Database endpoint
export const database = functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    try {
      if (request.method !== "GET") {
        return response.status(405).send("Method Not Allowed");
      }

      // Fetch all categories
      const getCategories = async () => {
        const categoriesSnapshot = await firestore.collection("categories").get();

        const categoriesPromises = categoriesSnapshot.docs.map(async (d) => {
          const effects = await getEffects(d.data().id);
          return {
            id: d.data().id,
            name: d.data().name,
            effects,
          };
        });

        return Promise.all(categoriesPromises);
      };

      // Fetch all effects for category, INCLUDING sectors
      const getEffects = async (categoryId) => {
        const effectsSnapshot = await firestore
          .collection("effects")
          .where("categorie", "==", categoryId)
          .get();

        const effectsArray = await Promise.all(
          effectsSnapshot.docs.map(async (d) => {
            const effectData = d.data();
            const questions = await getQuestions(effectData.id);

            return {
              id: effectData.id,
              name: effectData.name,
              description: effectData.description || "",

              // ✅ include sectors on effect-level (multiselect)
              sectors: Array.isArray(effectData.sectors) ? effectData.sectors : [],

              // ✅ monetarisering: per-score situation + monetary value
              // (columns "Score afgerond", "Situatieomschrijving per score",
              //  "Monetaire waarde", "Onderbouwing monetarisering")
              scores: Array.isArray(effectData.scores) ? effectData.scores : [],

              questions,
            };
          })
        );

        return effectsArray;
      };

      // Fetch all questions for effect, INCLUDING targetgroups logic
      const getQuestions = async (effectId) => {
        const questionsSnapshot = await firestore
          .collection("questions")
          .where("effectId", "==", effectId)
          .get();

        const questionsArray = questionsSnapshot.docs.map((d) => {
          const q = d.data();

          const targetGroupsMode = q.targetGroupsMode === "custom" ? "custom" : "all";
          const targetGroups =
            targetGroupsMode === "custom" && Array.isArray(q.targetGroups) ? q.targetGroups : [];

          return {
            id: q.id,
            name: q.name,
            scale: "1-5",
            posNeg: q.posNeg,

            // ✅ include targetgroup selection info
            targetGroupsMode,
            targetGroups,
          };
        });

        return questionsArray;
      };

      const categories = await getCategories();
      return response.status(200).json(categories);
    } catch (error) {
      console.log(error);
      return response.status(500).send("Error fetching data");
    }
  });
});

// Open CORS for the public, read-only reference-data endpoint. No credentials are
// involved, so `*` is safe and avoids app-origin whitelist gaps (e.g. apex domains).
// This guarantees Access-Control-Allow-Origin is present on the actual GET response,
// not just the OPTIONS preflight.
const publicCorsHandler = cors({ origin: "*" });

// Every endpoint here is an unauthenticated read. `maxInstances` is the hard
// ceiling on what the project can serve at once, and so on what a flood can
// cost, regardless of where it comes from; the per-IP limiter on top of it stops
// the ordinary case of one client looping. Raise this if legitimate traffic ever
// warrants it — it is a cost bound, not a capacity estimate.
const publicEndpoint = (corsMiddleware, label, handler) =>
  functions.runWith({ maxInstances: 10 }).https.onRequest((request, response) => {
    corsMiddleware(request, response, async () => {
      try {
        if (request.method !== "GET") {
          return response.status(405).send("Method Not Allowed");
        }
        if (!enforceRateLimit(request, response)) {
          return;
        }

        await handler(request, response);
      } catch (error) {
        console.error(`Error in ${label}:`, error);
        return response.status(500).send("Error fetching data");
      }
    });
  });

// Arbeidsparticipatie (participatieladder) parameters endpoint.
// Read-only, public, versioned reference data. Routes:
//   GET .../api/v1/arbeidsparticipatie/parameters            (latest)
//   GET .../api/v1/arbeidsparticipatie/parameters/{version}  (pinned)
//   GET .../api/v1/arbeidsparticipatie/versions              (list)
export const arbeidsparticipatie = publicEndpoint(
  publicCorsHandler,
  "arbeidsparticipatie",
  (request, response) => handleArbeidsparticipatie(firestore, request, response)
);

// Monetarisering onderbouwing endpoint.
// Read-only, public, versioned reference data: per effect en per score de
// volledige onderbouwing van de monetaire waardering (literatuur, financiële
// opbouw per kostencomponent, aannames en bronnen). Routes:
//   GET .../api/v1/monetarisering/onderbouwing            (latest)
//   GET .../api/v1/monetarisering/onderbouwing/{version}  (pinned)
//   GET .../api/v1/monetarisering/versions                (list)
export const monetarisering = publicEndpoint(
  publicCorsHandler,
  "monetarisering",
  (request, response) => handleMonetarisering(firestore, request, response)
);

// Meetstandaard endpoint: the full sector meetstandaard as one versioned
// document (effecten, stellingen, situatieschetsen, monetarisering per niveau
// met stakeholder-proxywaarden, bronnen, parameters, aggregatiemodel,
// gevoeligheidsanalyse en audittrail). Read-only, public. Routes:
//   GET .../api/v1/meetstandaard                     (index of sectoren)
//   GET .../api/v1/meetstandaard/{sector}            (latest)
//   GET .../api/v1/meetstandaard/{sector}/versions   (list)
//   GET .../api/v1/meetstandaard/{sector}/{version}  (pinned, e.g. /0.9)
export const meetstandaard = publicEndpoint(
  publicCorsHandler,
  "meetstandaard",
  (request, response) => handleMeetstandaard(firestore, request, response)
);

// Benchmark endpoint
export const benchmark = publicEndpoint(corsHandler, "benchmark", async (request, response) => {
  const benchmarksData = await benchmarks({ firestore });

  if (!benchmarksData) {
    return response.status(404).json({ error: "No datasets found" });
  }

  return response.status(200).json(benchmarksData);
});
