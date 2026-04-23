export default async function handler(req, res) {
  const { text } = req.body;
  try {
    const tokenizer = await getTokenizer();
    const tokens = tokenizer.tokenize(text);
    
    // 1. 找出所有可能的長詞組合 (2~5字)
    const candidates = [];
    for (let len = 5; len >= 2; len--) {
      for (let i = 0; i <= text.length - len; i++) {
        candidates.push(text.substring(i, i + len));
      }
    }

    // 2. 批次查詢 Firestore
    const uniqueCandidates = [...new Set(candidates)];
    const foundDict = {};
    const chunks = [];
    for (let i = 0; i < uniqueCandidates.length; i += 30) chunks.push(uniqueCandidates.slice(i, i + 30));
    
    for (const chunk of chunks) {
      const snap = await db.collection('dictionary').where('word', 'in', chunk).get();
      snap.forEach(doc => {
        const d = doc.data();
        foundDict[d.word] = d;
      });
    }

    // 3. 建立佔位陣列 (true 代表該位置已被長詞佔用)
    const occupied = new Array(text.length).fill(false);
    const finalResults = [];

    // 4. 【優先】匹配長詞 (從長到短)
    const sortedLongWords = Object.keys(foundDict).sort((a, b) => b.length - a.length);
    
    for (const word of sortedLongWords) {
      let pos = text.indexOf(word);
      while (pos !== -1) {
        // 檢查該區間是否完全未被佔用
        const isFree = occupied.slice(pos, pos + word.length).every(v => v === false);
        if (isFree) {
          const data = foundDict[word];
          finalResults.push({
            id: Math.random().toString(36).substr(2, 9),
            surface: word,
            base: word,
            reading: data.reading || '',
            // 修正詞性：如果字典沒寫，長詞通常是名詞
            pos: data.pos || '名詞', 
            meaning: data.meaning || '',
            index: pos
          });
          // 標記佔用
          for (let k = 0; k < word.length; k++) occupied[pos + k] = true;
        }
        pos = text.indexOf(word, pos + 1);
      }
    }

    // 5. 【剩餘】處理 Kuromoji 的 tokens
    tokens.forEach(t => {
      const startIdx = t.word_position - 1;
      const base = t.basic_form === '*' ? t.surface_form : t.basic_form;
      
      // 檢查此 token 的第一個字是否已被長詞佔用
      if (!occupied[startIdx]) {
        const noise = ['する', 'なる', 'いる', 'ある', 'れる', 'られる', 'せる', 'させる', 'ない'];
        if (['名詞', '動詞', '形容詞', '副詞'].includes(t.pos) && !noise.includes(base)) {
          // 過濾單個非漢字
          if (base.length > 1 || /[\u4e00-\u9faf]/.test(base)) {
            finalResults.push({
              id: Math.random().toString(36).substr(2, 9),
              surface: t.surface_form,
              base: base, // 這裡確保 浮かんで 會還原成 浮かぶ
              reading: t.reading,
              pos: t.pos,
              meaning: '', 
              index: startIdx
            });
          }
        }
      }
    });

    // 6. 排序並去重 (按辭書型去重)
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
    res.status(500).json({ success: false, error: e.message });
  }
}