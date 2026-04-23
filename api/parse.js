import admin from 'firebase-admin';

export default async function handler(req, res) {
  try {
    const rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!rawConfig) {
      console.error("❌ 找不到環境變數 FIREBASE_SERVICE_ACCOUNT");
      return res.status(500).json({ error: "Environment variable missing" });
    }

    // 處理可能存在的換行符號問題
    const serviceAccount = JSON.parse(rawConfig);

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

if (!admin.apps.length) {
  // 這裡建議將 serviceAccount 內容放入 Vercel 的 Environment Variables
  // 暫時測試可以先用讀取檔案的方式
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { text } = req.body; // 使用者輸入的歌詞
  
  try {
    // 1. 這裡需要一個分詞邏輯，把歌詞拆成單字列表
    // 暫時先用一個簡單的示範：假設我們拆出了幾個關鍵字
    // 實際上建議之後加入 kuromoji 進行精準分詞
    const potentialWords = extractPotentialWords(text); 

    // 2. 去 Firestore 查詢 (注意：where 'in' 最多支援 30 個單字)
    // 如果歌詞很長，需要分批查詢
    const results = [];
    const chunks = chunkArray(potentialWords, 30);

    for (const chunk of chunks) {
      const snapshot = await db.collection('dictionary')
        .where('word', 'in', chunk)
        .get();
      
      snapshot.forEach(doc => results.push(doc.data()));
    }

    res.status(200).json({ words: results });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

// 輔助函式：切割陣列
function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

// 輔助函式：簡單提取漢字與假名（這部分未來可優化）
function extractPotentialWords(text) {
  // 這裡先回傳一個簡單的 Regex 匹配結果作為範例
  return text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]+/g) || [];
}