import "dotenv/config";
import functions from "firebase-functions";
import admin from "firebase-admin";
import cors from "cors";
import serviceAccount from "./serviceAcountSecretKey.json" assert { type: "json" };
import benchmarks from "./benchmarks.js";

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

// Benchmark endpoint
export const benchmark = functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    try {
      if (request.method !== "GET") {
        return response.status(405).send("Method Not Allowed");
      }

      const benchmarksData = await benchmarks({ firestore });

      if (!benchmarksData) {
        return response.status(404).json({ error: "No datasets found" });
      }

      return response.status(200).json(benchmarksData);
    } catch (error) {
      console.error("Error fetching benchmarks:", error);
      return response.status(500).send("Error fetching data");
    }
  });
});
