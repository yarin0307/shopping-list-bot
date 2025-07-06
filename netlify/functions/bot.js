const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, Timestamp } = require("firebase/firestore/lite");
require("dotenv").config(); // מוסיף את התמיכה ב-.env

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};
console.log("FIREBASE CONFIG:", firebaseConfig);

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const message = body.message;

    if (!message || !message.text) {
      return {
        statusCode: 200,
        body: "No valid message received."
      };
    }

    const lines = message.text.trim().split('\n');
    const items = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length !== 4) continue;

      const [name, category, quantity, note] = parts.map(p => p.trim());
      items.push({
        name,
        category,
        quantity: parseInt(quantity),
        note,
        taken: false,
        file: null,
        pic: ''
      });
    }

    await addDoc(collection(db, "grocery-list"), {
      grocery_items: items,
      grocery_date: Timestamp.now(),
      grocery_amount: "",
      grocery_invoice: ""
    });

    return {
      statusCode: 200,
      body: "✅ List saved"
    };

  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: "Error saving list"
    };
  }
};
