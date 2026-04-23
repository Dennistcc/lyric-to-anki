import admin from 'firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const rawConfig = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!rawConfig) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is missing in environment variables');
    }

    if (!admin.apps.length) {
      // 1. 先解析 JSON
      const serviceAccount = JSON.parse(rawConfig);
      
      // 2. 關鍵修正：修復私鑰中的換行符號問題
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();
    const { text } = req.body;

    // 簡單測試：嘗試從資料庫抓一筆資料
    const snapshot = await db.collection('dictionary').limit(1).get();
    
    return res.status(200).json({ 
      success: true,
      message: 'Firestore connected!',
      dataCount: snapshot.size,
      inputLength: text ? text.length : 0
    });

  } catch (error) {
    console.error('Final API Error:', error.message);
    return res.status(500).json({ 
      error: 'Server error occurred',
      message: error.message 
    });
  }
}