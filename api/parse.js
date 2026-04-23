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
  if (req.method !== 'POST') return res.status(405).end();
  const { text } = req.body;

  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    
    // --- 噪音過濾名單 ---
    const noiseBlacklist = ['する', 'なる', 'いる', 'ある', 'れる', 'られる', 'せる', 'させる', 'ない', 'た', 'だ'];

    const wordsToQuery = tokens
      .filter(t => {
        const base = t.basic_form === '*' ? t.surface_form : t.basic_form;
        
        // 1. 只留名、動、形、副
        if (!['名詞', '動詞', '形容詞', '副詞'].includes(t.pos)) return false;
        
        // 2. 過濾黑名單裡的基礎詞與語法碎片
        if (noiseBlacklist.includes(base)) return false;
        
        // 3. 過濾長度為 1 的非漢字 (如 'に', 'を', 'て')
        if (base.length === 1 && !/[\u4e00-\u9faf]/.test(base)) return false;

        return true;
      })
      .map(t => ({
        surface: t.surface_form,
        base: t.basic_form === '*' ? t.surface_form : t.basic_form,
        pos: t.pos,
        reading: t.reading
      }));

    const uniqueBases = [...new Set(wordsToQuery.map(w => w.base))];
    if (uniqueBases.length === 0) return res.json({ success: true, words: [] });

    const results = [];
    // Firestore 查詢限制一次最多 30 個 IN
    const snapshot = await db.collection('dictionary')
      .where('word', 'in', uniqueBases.slice(0, 30))
      .get();
    
    snapshot.forEach(doc => {
      const data = doc.data();
      const original = wordsToQuery.find(w => w.base === data.word);
      results.push({
        id: Math.random().toString(36).substr(2, 9),
        surface: original?.surface || data.word,
        base: data.word,
        reading: data.reading || original?.reading || '',
        pos: original?.pos || '單字',
        meaning: data.meaning || ''
      });
    });

    // 依據歌詞出現順序排序，而不是依據資料庫搜尋結果
    const sortedResults = uniqueBases
      .map(base => results.find(r => r.base === base))
      .filter(Boolean);

    res.status(200).json({ success: true, words: sortedResults });
  } catch (e) { 
    res.status(500).json({ success: false, error: e.message }); 
  }
}