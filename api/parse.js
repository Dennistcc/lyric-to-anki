import admin from 'firebase-admin';

if (!admin.apps.length) {
  const rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (rawConfig) {
    const serviceAccount = JSON.parse(rawConfig);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { text } = req.body;
  if (!text) return res.status(200).json({ success: true, words: [] });

  try {
    // 提取日文字符塊
    const potentialWords = [...new Set(text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g) || [])];
    
    const results = [];
    // 分批查詢 (每 30 個一組)
    const chunks = [];
    for (let i = 0; i < potentialWords.length; i += 30) {
      chunks.push(potentialWords.slice(i, i + 30));
    }

    for (const chunk of chunks) {
      const snapshot = await db.collection('dictionary')
        .where('word', 'in', chunk)
        .get();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        results.push({
          word: data.word || data.base || '',
          reading: data.reading || data.r || '',
          meaning: data.meaning || data.m || ''
        });
      });
    }

    return res.status(200).json({ success: true, words: results });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}