import admin from 'firebase-admin';
import path from 'path';

// 1. Firebase 初始化 (保持不變)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (serviceAccount.private_key) serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// --- 核心 A：剝洋蔥規則表 (De-inflection Rules) ---
const DEINFLECT_RULES = [
  { from: "させられた", to: "る" }, { from: "された", to: "する" },
  { from: "ました", to: "る" }, { from: "ます", to: "る" },
  { from: "ない", to: "る" }, { from: "れば", to: "る" },
  { from: "られる", to: "る" }, { from: "させる", to: "る" },
  { from: "った", to: "う" }, { from: "いた", to: "く" },
  { from: "いだ", to: "ぐ" }, { from: "した", to: "す" },
  { from: "った", to: "つ" }, { from: "んだ", to: "ぬ" },
  { from: "んだ", to: "ぶ" }, { from: "んだ", to: "む" },
  { from: "った", to: "る" }, { from: "って", to: "う" },
  { from: "いて", to: "く" }, { from: "いで", to: "ぐ" },
  { from: "して", to: "す" }, { from: "んで", to: "む" },
  { from: "て", to: "る" }, { from: "た", to: "る" }
];

const A_TO_U = { 'わ': 'う', 'か': 'く', 'g': 'ぐ', 'さ': 'す', 'た': 'つ', 'な': 'ぬ', 'ば': 'ぶ', 'ま': 'む', 'ら': 'る' };

// --- 核心 B：還原函數 ---
function getBaseCandidates(surface) {
  const candidates = new Set([surface]);
  // 1. 規則還原
  DEINFLECT_RULES.forEach(rule => {
    if (surface.endsWith(rule.from)) {
      candidates.add(surface.slice(0, -rule.from.length) + rule.to);
    }
  });
  // 2. 五段否定還原 (飲ま-ない -> 飲む)
  if (surface.endsWith('ない') && surface.length >= 3) {
    const stem = surface.slice(-3, -2);
    if (A_TO_U[stem]) candidates.add(surface.slice(0, -3) + A_TO_U[stem]);
  }
  return Array.from(candidates);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { text } = req.body;
  if (!text) return res.json({ success: true, words: [] });

  try {
    const occupied = new Array(text.length).fill(false);
    const finalResults = [];

    // --- 階段 1：地毯式字典掃描 (Longest Matching) ---
    // 生成所有長度 2-7 的候選片段
    const fragments = [];
    for (let len = 7; len >= 2; len--) {
      for (let i = 0; i <= text.length - len; i++) {
        fragments.push({ text: text.substring(i, i + len), index: i });
      }
    }

    // 收集所有需要查字典的詞（包含還原後的候選詞）
    let allQueryWords = new Set();
    fragments.forEach(f => {
      getBaseCandidates(f.text).forEach(c => allQueryWords.add(c));
    });

    // 批次查詢 Firestore (每次 30 個)
    const wordList = Array.from(allQueryWords);
    const foundMap = {};
    for (let i = 0; i < wordList.length; i += 30) {
      const chunk = wordList.slice(i, i + 30);
      const snap = await db.collection('dictionary').where('word', 'in', chunk).get();
      snap.forEach(doc => { foundMap[doc.data().word] = doc.data(); });
    }

    // --- 階段 2：座標佔位邏輯 ---
    // 按長度優先排序片段
    const sortedFragments = fragments.sort((a, b) => b.text.length - a.text.length);

    for (const f of sortedFragments) {
      // 檢查該片段是否已被佔用
      const isOccupied = occupied.slice(f.index, f.index + f.text.length).some(v => v === true);
      if (isOccupied) continue;

      // 檢查該片段或其還原形式是否在字典中
      const candidates = getBaseCandidates(f.text);
      const hitBase = candidates.find(c => foundMap[c]);

      if (hitBase) {
        const dictData = foundMap[hitBase];
        finalResults.push({
          id: Math.random().toString(36).substr(2, 9),
          surface: f.text,
          base: hitBase,
          reading: dictData.reading || '',
          meaning: dictData.meaning || '',
          pos: dictData.pos || '名詞',
          index: f.index
        });
        // 標記座標
        for (let k = 0; k < f.text.length; k++) occupied[f.index + k] = true;
      }
    }

    // --- 階段 3：排序與去重 ---
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
    console.error("Parse Error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
}