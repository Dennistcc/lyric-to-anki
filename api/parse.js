import admin from 'firebase-admin';
import kuromoji from 'kuromoji';
import path from 'path';

// --- Firebase 初始化 ---
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// --- Kuromoji 初始化封裝 ---
const getTokenizer = () => {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ 
      // 這是關鍵：使用 node_modules 裡的字典
      dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") 
    }).build((err, tokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { text } = req.body;
  if (!text) return res.status(200).json({ success: true, words: [] });

  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    
    // 1. 專業分詞：只提取有意義的「原形」
    const baseWords = [...new Set(
      tokens
        .filter(t => ['名詞', '動詞', '形容詞', '副詞'].includes(t.pos))
        .map(t => t.basic_form === '*' ? t.surface_form : t.basic_form)
    )];

    if (baseWords.length === 0) return res.status(200).json({ success: true, words: [] });

    // 2. 雲端查詢：去 Firestore 拿這些精確單字的解釋
    const results = [];
    const chunks = [];
    for (let i = 0; i < baseWords.length; i += 30) {
      chunks.push(baseWords.slice(i, i + 30));
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
    console.error("API Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}