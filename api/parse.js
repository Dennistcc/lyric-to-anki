export default async function handler(req, res) {
  const { text } = req.body;
  try {
    const tokenizer = await getTokenizer();
    
    // 1. 生成所有長度 2~5 的組合來查字典
    const candidates = [];
    for (let len = 5; len >= 2; len--) {
      for (let i = 0; i <= text.length - len; i++) {
        candidates.push(text.substring(i, i + len));
      }
    }

    // 2. 批次從 Firestore 抓取這些長詞
    const foundLongWords = [];
    const chunks = [];
    const uniqueCandidates = [...new Set(candidates)];
    for (let i = 0; i < uniqueCandidates.length; i += 30) {
      chunks.push(uniqueCandidates.slice(i, i + 30));
    }

    for (const chunk of chunks) {
      const snap = await db.collection('dictionary').where('word', 'in', chunk).get();
      snap.forEach(doc => foundLongWords.push(doc.data()));
    }

    // 3. 按長度由長到短排序 (最長匹配關鍵)
    foundLongWords.sort((a, b) => b.word.length - a.word.length);

    let remainingText = text;
    const finalResults = [];

    // 4. 【核心步驟】先在歌詞中找出這些長詞並「鎖定」
    foundLongWords.forEach(wordData => {
      if (remainingText.includes(wordData.word)) {
        finalResults.push({
          id: Math.random().toString(36).substr(2, 9),
          surface: wordData.word,
          base: wordData.word,
          reading: wordData.reading,
          pos: '複合詞',
          meaning: wordData.meaning,
          index: text.indexOf(wordData.word) // 紀錄位置以便排序
        });
        // 將已匹配的長詞從剩餘文本中用特殊符號替換，避免 Kuromoji 重複處理
        remainingText = remainingText.replace(new RegExp(wordData.word, 'g'), ' '.repeat(wordData.word.length));
      }
    });

    // 5. 剩下沒匹配到長詞的部分，再給 Kuromoji 處理
    const tokens = tokenizer.tokenize(text);
    tokens.forEach(t => {
      const base = t.basic_form === '*' ? t.surface_form : t.basic_form;
      // 如果這個位置已經被長詞佔據了，就跳過
      const isAlreadyMatched = finalResults.some(r => text.substring(t.word_position - 1, t.word_position - 1 + t.surface_form.length).includes(r.surface));
      
      const noise = ['する', 'なる', 'いる', 'ある', 'れる', 'られる', 'せる', 'させる', 'ない'];
      if (!isAlreadyMatched && ['名詞', '動詞', '形容詞', '副詞'].includes(t.pos) && !noise.includes(base)) {
        if (base.length > 1 || /[\u4e00-\u9faf]/.test(base)) {
          finalResults.push({
            id: Math.random().toString(36).substr(2, 9),
            surface: t.surface_form,
            base: base,
            reading: t.reading,
            pos: t.pos,
            meaning: '', // 短詞意思可視需求補查
            index: t.word_position - 1
          });
        }
      }
    });

    // 6. 最後依照在歌詞出現的順序排序
    const sorted = finalResults.sort((a, b) => a.index - b.index);

    res.status(200).json({ success: true, words: sorted });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
}