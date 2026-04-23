import admin from 'firebase-admin';

// 初始化 Firebase
const rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT;
if (rawConfig && !admin.apps.length) {
  const serviceAccount = JSON.parse(rawConfig);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided' });

  try {
    // 1. 簡單的分詞 (未來可以升級為 Kuromoji)
    // 這裡先抓出所有的漢字、平假名、片假名區塊
    const potentialWords = [...new Set(text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g) || [])];

    // 2. 分批從 Firestore 查詢 (Firestore 'in' 限制一次最多 30 個項目)
    const results = [];
    const chunks = [];
    for (let i = 0; i < potentialWords.length; i += 30) {
      chunks.push(potentialWords.slice(i, i + 30));
    }

    for (const chunk of chunks) {
      const snapshot = await db.collection('dictionary') // 確保你的 collection 名字是 'dictionary'
        .where('word', 'in', chunk)
        .get();
      
      snapshot.forEach(doc => results.push(doc.data()));
    }

    // 3. 回傳查詢到的單字資料
    return res.status(200).json({ 
      success: true,
      words: results 
    });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}