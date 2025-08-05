require("dotenv").config();
const fetch = require("node-fetch");

const { initializeApp } = require("firebase/app");
const { getFirestore, collection, addDoc, Timestamp } = require("firebase/firestore/lite");

// Firebase config
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ✅ Working Gemini API call
async function reformatWithGemini(originalText) {
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

const prompt = `
תיקח את רשימת הקניות הזו ותרשום אותה בפורמט הבא **בלי לכתוב כותרות עמודות בכלל**:
שם מוצר | קטגוריה | כמות | הערות

כאשר הקטגוריה תיבחר מתוך הרשימה הבאה בלבד:
חטיפים וממתקים, משקאות, שימורים, תבלינים ועשבים, מוצרי ניקיון, קפואים, סבון והיגיינה אישית, מוצרים להכנה, כלים חד פעמיים, רטבים, מוצרי חלב, ירקות, פירות, בשר ודגים, לחמים ומאפים, פחמימות ודגנים

אל תחזיר כותרות טבלה, רק את השורות עצמן בפורמט שצוין.

הקלט:
${originalText}
`;


  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    const data = await response.json();

    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text;
    } else {
      console.error("❌ Gemini error:", JSON.stringify(data, null, 2));
      return null;
    }
  } catch (error) {
    console.error("Gemini failed:", error.message);
    return null;
  }
}

exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body);
    const message = body.message;

    if (!message || !message.text || !message.chat || !message.chat.id) {
      return {
        statusCode: 200,
        body: "No valid message received."
      };
    }

    // Step 1: Format with Gemini
    const geminiOutput = await reformatWithGemini(message.text);

    if (!geminiOutput || !geminiOutput.trim()) {
      // Gemini failed → send error to Telegram
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: "❌ לא הצלחתי לעבד את ההודעה עם Gemini. נסה שוב מאוחר יותר."
        })
      });

      return {
        statusCode: 200,
        body: "Gemini failed"
      };
    }

    // Step 2: Parse Gemini output
    const items = geminiOutput
      .trim()
      .split('\n')
      .map(line => {
        const parts = line.split('|');
        if (parts.length !== 4) return null;

        const [name, category, quantity, note] = parts.map(p => p.trim());

        return {
          name,
          category,
          quantity: parseInt(quantity),
          note,
          taken: false,
          file: null,
          pic: ''
        };
      })
      .filter(item => item !== null);

    if (items.length === 0) {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: "❌ התגובה מ-Gemini לא הייתה בפורמט צפוי. נסה שוב."
        })
      });

      return {
        statusCode: 200,
        body: "Gemini response invalid"
      };
    }

    // Step 3: Save to Firestore
    await addDoc(collection(db, "grocery-list"), {
      grocery_items: items,
      grocery_date: Timestamp.now(),
      grocery_amount: "",
      grocery_invoice: ""
    });

    // Step 4: Confirm to Telegram
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: message.chat.id,
        text: "✅ הרשימה נשמרה בהצלחה!"
      })
    });

    return {
      statusCode: 200,
      body: "✅ List saved"
    };

  } catch (err) {
    console.error("Unhandled error:", err);
    return {
      statusCode: 500,
      body: "Internal error"
    };
  }
};
