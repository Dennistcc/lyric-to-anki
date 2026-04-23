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
    // 1. 提取日文字符塊 (例如: "沈むように" -> ["沈むように"])
    const blocks = text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g) || [];
    
    // 2. 暴力拆解邏輯 (N-Gram)
    // 我們把每個塊拆成可能的長度 (2~8 個字)
    let potentialWords = [];
    blocks.forEach(block => {
      for (let i = 0; i < block.length; i++) {
        // 嘗試抓取長度為 1 到 8 的子字串
        for (let len = 1; len <= 8; len++) {
          if (i + len <= block.length) {
            potentialWords.push(block.substring(i, i + len));
          }
        }
      }
    });
    
    // 去除重複以節省查詢次數
    const uniquePotentials = [...new Set(potentialWords)];

    const results = [];
    // 3. Firestore 'in' 查詢限制一次最多 30 個，我們需要分批
    const chunks = [];
    for (let i = 0; i < uniquePotentials.length; i += 30) {
      chunks.push(uniquePotentials.slice(i, i + 30));
    }

    // 4. 執行所有分批查詢
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

    // 5. 按單字長度排序 (長的在前)，並去除重複的結果
    const finalWords = Array.from(new Map(results.map(item => [item.word, item])).values())
      .sort((a, b) => b.word.length - a.word.length);

    return res.status(200).json({ 
      success: true, 
      count: finalWords.length,
      words: finalWords 
    });

  } catch (error) {
    console.error("API Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}