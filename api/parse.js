import admin from 'firebase-admin';
import kuromoji from 'kuromoji';
import path from 'path';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

const getTokenizer = () => new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") })
    .build((err, t) => err ? reject(err) : resolve(t));
});

export default async function handler(req, res) {
  const { text } = req.body;
  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    
    // 提取所有可能的單字
    const wordsToQuery = tokens
      .filter(t => ['名詞', '動詞', '形容詞', '副詞'].includes(t.pos))
      .map(t => ({
        surface: t.surface_form,
        base: t.basic_form === '*' ? t.surface_form : t.basic_form,
        pos: t.pos
      }));

    const uniqueBases = [...new Set(wordsToQuery.map(w => w.base))];
    if (uniqueBases.length === 0) return res.json({ success: true, words: [] });

    // 去 Firestore 查英文意思與讀音
    const results = [];
    const snapshot = await db.collection('dictionary').where('word', 'in', uniqueBases.slice(0, 30)).get();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const original = wordsToQuery.find(w => w.base === data.word);
      results.push({
        id: Math.random().toString(36),
        surface: original?.surface || data.word,
        base: data.word,
        reading: data.reading || '',
        pos: original?.pos || '單字',
        meaning: data.meaning || ''
      });
    });

    res.status(200).json({ success: true, words: results });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
}