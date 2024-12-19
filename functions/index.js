import 'dotenv/config';  // You don't need to import anything from dotenv, just load it
import functions from "firebase-functions";
import admin from 'firebase-admin';
import cors from 'cors';
import serviceAccount from './serviceAcountSecretKey.json' assert { type: 'json' };

// Initialize firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Initialize firestore
const firestore = admin.firestore();
const settings = { timestampsInSnapshots: true };
firestore.settings(settings);

// CORS handler
const corsHandler = cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://impactdashboard.deccos.nl',
    'http://staging.deccos.nl',
    'http://deccos.nl',
    /\.deccos\.nl$/,
  ]
});

// Database endpoint
export const database = functions.https.onRequest((request, response) => {
  corsHandler(request, response, async () => {
    try {
      // Controleer of het verzoek een GET-verzoek is
      if (request.method !== 'GET') {
        return response.status(405).send('Method Not Allowed');
      }

      // Functie om alle categorieën op te halen
      const getCategories = async () => {
        const categoriesSnapshot = await firestore.collection('categories').get();
        const categoriesPromises = categoriesSnapshot.docs.map(async (doc) => {
          const effects = await getEffects(doc.data().id);
          return {
            id: doc.data().id,
            name: doc.data().name,
            effects
          };
        });
        const categories = await Promise.all(categoriesPromises);
        return categories;
      };

      // Functie om alle effecten op te halen
      const getEffects = async (categoryId) => {
        const effectsSnapshot = await firestore.collection('effects').where('categorie', '==', categoryId).get();
      
        const effectsArray = await Promise.all(
          effectsSnapshot.docs.map(async (doc) => {
            const questions = await getQuestions(doc.data().id);
            return {
              id: doc.data().id,
              name: doc.data().name,
              questions
            };
          })
        );
      
        console.log('effectsArray', effectsArray);
        return effectsArray;
      };

      // Functie om alle vragen op te halen
      const getQuestions = async (effectId) => {
        const questionsSnapshot = await firestore.collection('questions').where('effectId', '==', effectId).get();

        const questionsArray = await Promise.all(
          questionsSnapshot.docs.map(doc => {

            return {
              id: doc.data().id,
              name: doc.data().name,
              scale: '1-5',
              posNeg: doc.data().posNeg
            };
          })
        );
        console.log('questionsArray', questionsArray);
        return questionsArray;
      };

      // Haal de categorieën op
      const categories = await getCategories();

      // Stuur de data terug
      response.status(200).json(categories);
    } catch (error) {
      console.log(error);
      response.status(500).send('Error fetching data');
    }
  });
});
