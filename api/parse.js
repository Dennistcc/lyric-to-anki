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
  if (!text) return res.json({ success: true, words: [] });

  try {
    const tokenizer = await getTokenizer();
    
    // 1. 先用 Kuromoji 拿到初步分詞 (作為基礎)
    const tokens = tokenizer.tokenize(text);
    
    // 2. 找出歌詞中所有可能的「長組合」 (2到5個字)
    const candidateWords = [];
    for (let i = 0; i < text.length; i++) {
      for (let len = 5; len >= 2; len--) {
        if (i + len <= text.length) {
          candidateWords.push(text.substring(i, i + len));
        }
      }
    }
    const uniqueCandidates = [...new Set(candidateWords)];

    // 3. 去 Firestore 批次檢查這些「長組合」是否存在於字典中
    const snapshot = await db.collection('dictionary')
      .where('word', 'in', uniqueCandidates.slice(0, 30)) // 限制前30個最可能的
      .get();
    
    const foundLongWords = {};
    snapshot.forEach(doc => {
      const data = doc.data();
      foundLongWords[data.word] = data;
    });

    // 4. 【核心】最長匹配合併邏輯
    const finalWords = [];
    let i = 0;
    while (i < text.length) {
      let matched = false;
      // 從最長的長度開始嘗試匹配
      for (let len = 5; len >= 2; len--) {
        const sub = text.substring(i, i + len);
        if (foundLongWords[sub]) {
          const data = foundLongWords[sub];
          finalWords.push({
            id: Math.random().toString(36).substr(2, 9),
            surface: sub,
            base: sub,
            reading: data.reading || '',
            pos: '複合詞',
            meaning: data.meaning || ''
          });
          i += len; // 成功匹配，跳過這些字
          matched = true;
          break;
        }
      }

      if (!matched) {
        // 如果長詞沒匹配到，就用原本 Kuromoji 拆出來的單個詞
        const token = tokens.find(t => t.word_position === i + 1);
        if (token) {
          const base = token.basic_form === '*' ? token.surface_form : token.basic_form;
          // 過濾噪音邏輯依然保留
          const noise = ['する', 'なる', 'いる', 'ある', 'れる', 'られる', 'ない'];
          if (['名詞', '動詞', '形容詞', '副詞'].includes(token.pos) && !noise.includes(base)) {
            // 此處可再補一個單個詞的 Firestore 查詢
            finalWords.push({
              id: Math.random().toString(36).substr(2, 9),
              surface: token.surface_form,
              base: base,
              reading: token.reading,
              pos: token.pos,
              meaning: '' // 單個詞的解釋可從 snapshot 裡拿
            });
          }
          i += token.surface_form.length;
        } else {
          i++;
        }
      }
    }

    res.status(200).json({ 
      success: true, 
      words: finalWords.filter((v, i, a) => a.findIndex(t => t.base === v.base) === i) 
    });

  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}