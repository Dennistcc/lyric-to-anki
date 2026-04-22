/* global kuromoji */
import React, { useState, useEffect, useCallback, useMemo } from 'react';

// --- 工具函式 ---
const toHiragana = (str) => {
  if (!str) return '';
  return str.replace(/[\u30a1-\u30f6]/g, (m) => String.fromCharCode(m.charCodeAt(0) - 0x60));
};

const extractMeaning = (m) => {
  if (!m) return "無釋義資料";
  const recursiveExtract = (val) => {
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(recursiveExtract).join(' ');
    if (typeof val === 'object' && val !== null) return val.content || val.text || val.gloss || "";
    return String(val);
  };
  const text = recursiveExtract(m);
  const englishOnly = text.split(/[;/、\n]/).map(p => p.trim()).filter(p => /[a-zA-Z]/.test(p) && !/[\u4e00-\u9faf\u3040-\u309f]/.test(p) && p.length > 1);
  return englishOnly.length > 0 ? [...new Set(englishOnly)].slice(0, 3).join(' / ') : text.substring(0, 50);
};

function App() {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [status, setStatus] = useState('🔍 正在初始化...');
  const [resourcesReady, setResourcesReady] = useState({ dict: false, tokenizer: false });
  const [tokenizer, setTokenizer] = useState(null);
  const [dictionary, setDictionary] = useState(null);
  const [showResult, setShowResult] = useState(false);

  // --- 初始化資源 (從雲端獲取) ---
  useEffect(() => {
    // 1. 從 Firebase 載入字典
    const loadDictionary = async () => {
      try {
        setStatus('⏳ 正在從雲端下載字典...');
        // 重要：請將下方的引號內容替換為你的 Firebase Download URL
        const firebaseURL = "YOUR_FIREBASE_URL_HERE"; 
        
        const response = await fetch(firebaseURL);
        if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
        
        const data = await response.json();
        setDictionary(data);
        setResourcesReady(prev => ({ ...prev, dict: true }));
        console.log("✅ 字典載入成功");
      } catch (err) {
        console.error(err);
        setStatus(`⚠️ 字典載入失敗: ${err.message}`);
      }
    };

    loadDictionary();

    // 2. 載入 Tokenizer (使用 CDN 動態注入防止腳本遺失)
    const initTokenizer = () => {
      if (window.kuromoji) {
        window.kuromoji.builder({ 
          dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" 
        }).build((err, _tokenizer) => {
          if (!err && _tokenizer) {
            setTokenizer(_tokenizer);
            setResourcesReady(prev => ({ ...prev, tokenizer: true }));
            console.log("✅ Tokenizer 就緒");
          } else {
            setStatus('❌ 分詞器建構失敗');
          }
        });
      } else {
        // 如果 index.html 沒載入到，這裡嘗試手動插入腳本
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js";
        script.async = true;
        script.onload = () => initTokenizer();
        document.head.appendChild(script);
      }
    };
    
    initTokenizer();
  }, []);

  // 監聽狀態更新
  useEffect(() => {
    if (resourcesReady.dict && resourcesReady.tokenizer) {
      setStatus('✅ 系統就緒');
    }
  }, [resourcesReady]);

  // --- 解析邏輯 ---
  const handleParse = useCallback(() => {
    if (!tokenizer || !dictionary || !inputText.trim()) return;
    try {
      setStatus('🔍 正在分析歌詞...');
      const tokens = tokenizer.tokenize(inputText);
      const processed = [];
      
      for (let i = 0; i < tokens.length; i++) {
        let current = tokens[i];
        let next = tokens[i + 1];
        
        // 處理サ變動詞 (例如：勉強 + する)
        const isSaven = current.pos === '名詞' && next && (next.pos === '動詞' || next.pos === '助動詞') && /^[さしすせそじずぜぞ]/.test(next.surface_form);
        
        if (isSaven) {
          let surface = current.surface_form;
          while (tokens[i + 1] && (['動詞', '助動詞'].includes(tokens[i + 1].pos) || tokens[i+1].pos_detail_1 === '接尾')) {
            i++;
            surface += tokens[i].surface_form;
          }
          processed.push({ surface, base: current.surface_form + 'する', reading: toHiragana(current.reading) + 'する', pos: 'サ變動詞' });
        } else {
          processed.push({
            surface: current.surface_form,
            base: current.basic_form === '*' ? current.surface_form : current.basic_form,
            reading: toHiragana(current.reading),
            pos: current.pos
          });
        }
      }

      // 過濾重要詞性
      const filtered = processed.filter(t => ['名詞', '動詞', '形容詞', '副詞', '連體詞', 'サ變動詞'].includes(t.pos));
      
      // 結合字典資料
      const finalized = [];
      for (let i = 0; i < filtered.length; i++) {
        const cur = filtered[i];
        const nxt = filtered[i + 1];
        const combinedStr = nxt ? cur.surface + nxt.surface : null;
        
        if (combinedStr && dictionary[combinedStr]) {
          const entry = dictionary[combinedStr];
          finalized.push({ surface: combinedStr, base: combinedStr, reading: entry.r ? toHiragana(entry.r) : (cur.reading + nxt.reading), english: extractMeaning(entry.m), pos: '複合詞', id: i });
          i++;
        } else {
          const entry = dictionary[cur.base] || dictionary[cur.surface];
          finalized.push({ ...cur, reading: (entry && entry.r) ? toHiragana(entry.r) : cur.reading, english: extractMeaning(entry?.m), id: i });
        }
      }

      const uniqueMap = new Map();
      finalized.forEach(f => { if (!uniqueMap.has(f.base)) uniqueMap.set(f.base, f); });
      const uniqueList = Array.from(uniqueMap.values());
      
      setWords(uniqueList);
      setSelectedIds(new Set(uniqueList.map(w => w.id)));
      setShowResult(true);
      setStatus('✅ 解析完成');
    } catch (e) {
      console.error(e);
      setStatus('❌ 解析出錯');
    }
  }, [tokenizer, dictionary, inputText]);

  // --- 高亮顯示 ---
  const highlightedLyrics = useMemo(() => {
    if (!showResult || !inputText) return null;
    const activeWords = words.filter(w => selectedIds.has(w.id));
    const sortedSurfaces = activeWords.map(w => w.surface).sort((a, b) => b.length - a.length);
    if (sortedSurfaces.length === 0) return inputText;

    const regex = new RegExp(`(${sortedSurfaces.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return inputText.split(regex).map((part, i) => {
      const info = activeWords.find(w => w.surface === part);
      return info ? (
        <span key={i} className="highlighted-word">
          {part}
          <span className="tooltip">{info.reading} · {info.english}</span>
        </span>
      ) : part;
    });
  }, [showResult, inputText, words, selectedIds]);

  return (
    <div className="container">
      <style>{`
        :root { --muji-text: #55606b; --muji-border: #d1d9e0; --accent-blue: #94a3b8; }
        body { background-color: #f1f5f9; margin: 0; font-family: sans-serif; color: var(--muji-text); }
        .container { padding: 40px 20px; max-width: 900px; margin: 0 auto; }
        .status-tag { text-align: center; font-size: 12px; color: var(--accent-blue); margin-bottom: 12px; font-weight: bold; }
        h1 { text-align: center; font-weight: 300; letter-spacing: 4px; margin-bottom: 40px; }
        h1 span { font-weight: 600; color: var(--accent-blue); }
        textarea { width: 100%; height: 280px; padding: 20px; border-radius: 12px; border: 1px solid var(--muji-border); font-size: 18px; outline: none; }
        .btn-main { width: 100%; padding: 18px; margin-top: 20px; background: var(--muji-text); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 16px; }
        .btn-main:disabled { background: #cbd5e1; cursor: not-allowed; }
        .lyrics-box { white-space: pre-wrap; line-height: 2.5; padding: 30px; background: white; border-radius: 12px; border: 1px solid var(--muji-border); font-size: 20px; }
        .highlighted-word { border-bottom: 2px solid var(--accent-blue); position: relative; cursor: help; }
        .tooltip { visibility: hidden; position: absolute; bottom: 120%; left: 50%; transform: translateX(-50%); background: #334155; color: white; padding: 6px 12px; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; transition: 0.2s; z-index: 10; }
        .highlighted-word:hover .tooltip { visibility: visible; opacity: 1; }
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; margin-top: 30px; }
        .card { padding: 16px; background: white; border: 1px solid var(--muji-border); border-radius: 10px; cursor: pointer; }
        .card.selected { border-left: 5px solid var(--accent-blue); background: #f8fafc; }
      `}</style>

      <div className="status-tag">{status}</div>
      <h1>LANGLAB <span>PRO</span></h1>

      {!showResult ? (
        <div>
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="在此貼上日文歌詞，開始製作 Anki 卡片..."
          />
          <button 
            className="btn-main" 
            onClick={handleParse}
            disabled={!resourcesReady.tokenizer || !resourcesReady.dict || !inputText.trim()}
          >
            {resourcesReady.tokenizer && resourcesReady.dict ? '開始解析歌詞' : '正在準備資源...'}
          </button>
        </div>
      ) : (
        <div>
          <button onClick={() => setShowResult(false)} style={{ marginBottom: '20px', padding: '10px 15px', borderRadius: '8px', border: '1px solid #ccc', cursor: 'pointer' }}>← 返回輸入</button>
          <div className="lyrics-box">{highlightedLyrics}</div>
          <div className="card-grid">
            {words.map(w => (
              <div key={w.id} className={`card ${selectedIds.has(w.id) ? 'selected' : ''}`} onClick={() => {
                const n = new Set(selectedIds);
                n.has(w.id) ? n.delete(w.id) : n.add(w.id);
                setSelectedIds(n);
              }}>
                <strong style={{ fontSize: '1.1rem' }}>{w.base}</strong>
                <div style={{ color: '#64748b', fontSize: '14px' }}>{w.reading}</div>
                <div style={{ marginTop: '5px', fontSize: '13px' }}>{w.english}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;