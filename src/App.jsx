import React, { useState, useEffect, useCallback, useMemo } from 'react';

// 輔助函式：全角片假名轉平假名
const toHiragana = (str) => {
  if (!str) return '';
  return str.replace(/[\u30a1-\u30f6]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0x60));
};

const App = () => {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [tokenizer, setTokenizer] = useState(null);
  const [status, setStatus] = useState('⏳ 正在初始化...');

  // 1. 初始化 Kuromoji 分詞器
  useEffect(() => {
    const initTokenizer = () => {
      if (window.kuromoji) {
        window.kuromoji.builder({ dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" }).build((err, _tokenizer) => {
          if (err) {
            console.error("Tokenizer Error:", err);
            setStatus('❌ 分詞器載入失敗');
          } else {
            setTokenizer(_tokenizer);
            setStatus('✅ 系統就緒');
          }
        });
      } else {
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js";
        script.async = true;
        script.onload = initTokenizer;
        document.body.appendChild(script);
      }
    };
    initTokenizer();
  }, []);

  // 2. 解析邏輯 (結合 Kuromoji 與 Firestore API)
  const handleParse = useCallback(async () => {
    if (!tokenizer || !inputText.trim()) return;
    setLoading(true);
    setStatus('🔍 正在分析歌詞結構...');

    try {
      // 使用 Kuromoji 進行初步分詞
      const tokens = tokenizer.tokenize(inputText);
      
      // 向你的 Vercel API 請求 Firestore 資料
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });
      const apiData = await response.json();
      
      if (!apiData.success) throw new Error(apiData.error);

      // 建立字典 Map 方便快速查詢
      const dictMap = {};
      apiData.words.forEach(w => { dictMap[w.word] = w; });

      // 處理 Tokens 並匹配字典資料
      const processed = tokens
        .filter(t => ['名詞', '動詞', '形容詞', '副詞'].includes(t.pos))
        .map((t, idx) => {
          const base = t.basic_form === '*' ? t.surface_form : t.basic_form;
          const entry = dictMap[base] || dictMap[t.surface_form];
          return {
            id: idx,
            surface: t.surface_form,
            base: base,
            reading: entry?.reading || toHiragana(t.reading),
            meaning: entry?.meaning || '無查詢結果',
            pos: entry?.pos || t.pos,
          };
        });

      // 去重
      const uniqueList = Array.from(new Map(processed.map(item => [item.base, item])).values());

      setWords(uniqueList);
      setSelectedIds(new Set(uniqueList.map(w => w.id)));
      setShowResult(true);
      setStatus('✅ 解析完成');
    } catch (e) {
      console.error(e);
      setStatus('❌ 解析出錯: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [tokenizer, inputText]);

  // 3. 歌詞高亮渲染
  const highlightedLyrics = useMemo(() => {
    if (!showResult || !inputText) return null;
    const activeWords = words.filter(w => selectedIds.has(w.id));
    if (activeWords.length === 0) return inputText;

    const sortedSurfaces = [...activeWords].sort((a, b) => b.surface.length - a.surface.length);
    const regex = new RegExp(`(${sortedSurfaces.map(s => s.surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');

    return inputText.split(regex).map((part, i) => {
      const info = activeWords.find(w => w.surface === part);
      return info ? (
        <span key={i} className="highlighted-word">
          {part}
          <span className="tooltip">{info.reading} · {info.meaning}</span>
        </span>
      ) : part;
    });
  }, [showResult, inputText, words, selectedIds]);

  return (
    <div className="container">
      <style>{`
        :root { --muji-text: #55606b; --muji-border: #d1d9e0; --accent-blue: #94a3b8; }
        body { background-color: #f7f6f3; margin: 0; font-family: "Helvetica Neue", Arial, sans-serif; color: var(--muji-text); }
        .container { padding: 40px 20px; max-width: 800px; margin: 0 auto; min-height: 100vh; }
        .status-tag { text-align: center; font-size: 11px; color: var(--accent-blue); letter-spacing: 2px; margin-bottom: 20px; text-transform: uppercase; }
        h1 { text-align: center; font-weight: 200; letter-spacing: 8px; margin-bottom: 40px; color: #7f7f7f; }
        h1 span { font-weight: 600; color: var(--accent-blue); }
        textarea { width: 100%; height: 250px; padding: 20px; border-radius: 4px; border: 1px solid var(--muji-border); font-size: 16px; resize: none; outline: none; background: white; box-shadow: inset 0 1px 3px rgba(0,0,0,0.02); }
        .btn-main { width: 100%; padding: 16px; margin-top: 20px; background: var(--muji-text); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; letter-spacing: 4px; transition: 0.3s; }
        .btn-main:disabled { background: #cbd5e1; }
        .lyrics-box { white-space: pre-wrap; line-height: 2.8; padding: 30px; background: white; border-radius: 4px; border: 1px solid var(--muji-border); font-size: 18px; }
        .highlighted-word { border-bottom: 2px solid var(--accent-blue); position: relative; cursor: help; padding: 0 2px; transition: all 0.2s; }
        .highlighted-word:hover { background: #f0f4f8; }
        .tooltip { visibility: hidden; position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%); background: #334155; color: white; padding: 6px 12px; border-radius: 4px; font-size: 12px; z-index: 100; white-space: nowrap; opacity: 0; pointer-events: none; }
        .highlighted-word:hover .tooltip { visibility: visible; opacity: 1; }
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin-top: 30px; }
        .card { padding: 16px; background: white; border: 1px solid var(--muji-border); border-radius: 4px; cursor: pointer; transition: 0.2s; }
        .card.selected { border-left: 4px solid var(--accent-blue); background: #fafafa; }
        .back-btn { margin-bottom: 20px; padding: 8px 20px; background: none; border: 1px solid var(--muji-border); color: var(--muji-text); border-radius: 4px; cursor: pointer; font-size: 12px; }
      `}</style>

      <div className="status-tag">{status}</div>
      <h1>LANGLAB <span>PRO</span></h1>

      {!showResult ? (
        <div>
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="輸入歌詞，探索日文..."
            disabled={!tokenizer || loading}
          />
          <button className="btn-main" onClick={handleParse} disabled={!tokenizer || loading || !inputText.trim()}>
            {loading ? 'ANALYZING...' : '歌詞解析'}
          </button>
        </div>
      ) : (
        <div>
          <button className="back-btn" onClick={() => setShowResult(false)}>← BACK</button>
          <div className="lyrics-box">{highlightedLyrics}</div>
          <div className="card-grid">
            {words.map(w => (
              <div key={w.id} className={`card ${selectedIds.has(w.id) ? 'selected' : ''}`} onClick={() => {
                const n = new Set(selectedIds);
                n.has(w.id) ? n.delete(w.id) : n.add(w.id);
                setSelectedIds(n);
              }}>
                <strong style={{ display: 'block', fontSize: '1rem', marginBottom: '4px' }}>{w.base}</strong>
                <div style={{ color: 'var(--accent-blue)', fontSize: '12px', marginBottom: '8px' }}>{w.reading}</div>
                <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.4' }}>{w.meaning}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;