import admin from 'firebase-admin';
import kuromoji from 'kuromoji';
import path from 'path';

// 1. Firebase 初始化
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// 2. Kuromoji 初始化器
const getTokenizer = () => new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath: path.join(process.cwd(), "node_modules/kuromoji/dict") })
    .build((err, t) => err ? reject(err) : resolve(t));
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { text } = req.body;
  if (!text) return res.json({ success: true, words: [] });

  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    
    // --- 第一階段：長詞匹配 ---
    
    // 生成所有長度 2~5 的組合來查字典
    const candidates = [];
    for (let len = 5; len >= 2; len--) {
      for (let i = 0; i <= text.length - len; i++) {
        candidates.push(text.substring(i, i + len));
      }
    }

    const uniqueCandidates = [...new Set(candidates)];
    const foundDict = {};
    const chunks = [];
    for (let i = 0; i < uniqueCandidates.length; i += 30) chunks.push(uniqueCandidates.slice(i, i + 30));
    
    // 批次查詢長詞
    for (const chunk of chunks) {
      const snap = await db.collection('dictionary').where('word', 'in', chunk).get();
      snap.forEach(doc => {
        const d = doc.data();
        foundDict[d.word] = d;
      });
    }

    const occupied = new Array(text.length).fill(false);
    const finalResults = [];

    // 最長匹配優先 (Longest Matching)
    const sortedLongWords = Object.keys(foundDict).sort((a, b) => b.length - a.length);
    
    for (const word of sortedLongWords) {
      let pos = text.indexOf(word);
      while (pos !== -1) {
        const isFree = occupied.slice(pos, pos + word.length).every(v => v === false);
        if (isFree) {
          const data = foundDict[word];
          finalResults.push({
            id: Math.random().toString(36).substr(2, 9),
            surface: word,
            base: word,
            reading: data.reading || '',
            pos: data.pos || '名詞', 
            meaning: data.meaning || '',
            index: pos
          });
          for (let k = 0; k < word.length; k++) occupied[pos + k] = true;
        }
        pos = text.indexOf(word, pos + 1);
      }
    }

    // --- 第二階段：Kuromoji 補位 ---

    const missingBases = [];

    tokens.forEach(t => {
      const startIdx = t.word_position - 1;
      const base = t.basic_form === '*' ? t.surface_form : t.basic_form;
      
      // 只有當該位置完全沒被長詞佔用時，才處理短詞
      const isPartiallyOccupied = occupied.slice(startIdx, startIdx + t.surface_form.length).some(v => v === true);
      
      if (!isPartiallyOccupied) {
        const noise = ['する', 'なる', 'いる', 'ある', 'れる', 'られる', 'せる', 'させる', 'ない', 'だ', 'た', 'の'];
        if (['名詞', '動詞', '形容詞', '副詞'].includes(t.pos) && !noise.includes(base)) {
          // 過濾掉非漢字的單個假名 (例如 'に', 'を')
          if (base.length > 1 || /[\u4e00-\u9faf]/.test(base)) {
            finalResults.push({
              id: Math.random().toString(36).substr(2, 9),
              surface: t.surface_form,
              base: base,
              reading: t.reading,
              pos: t.pos,
              meaning: '', // 暫時空白，下一階段補齊
              index: startIdx
            });
            missingBases.push(base);
          }
        }
      }
    });

    // --- 第三階段：二次查表 (補齊短詞的解釋) ---

    if (missingBases.length > 0) {
      const uniqueMissing = [...new Set(missingBases)];
      const missingSnap = await db.collection('dictionary').where('word', 'in', uniqueMissing.slice(0, 30)).get();
      const missingDataMap = {};
      missingSnap.forEach(doc => {
        const d = doc.data();
        missingDataMap[d.word] = d;
      });

      finalResults.forEach(item => {
        if (item.meaning === '' && missingDataMap[item.base]) {
          item.meaning = missingDataMap[item.base].meaning;
          if (!item.reading) item.reading = missingDataMap[item.base].reading;
        }
      });
    }

    // --- 第四階段：最終排序與去重 ---

    const seenBase = new Set();
    const sorted = finalResults
      .sort((a, b) => a.index - b.index)
      .filter(item => {
        if (seenBase.has(item.base)) return false;
        seenBase.add(item.base);
        return true;
      });

    res.status(200).json({ success: true, words: sorted });

  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, error: e.message });
  }
}