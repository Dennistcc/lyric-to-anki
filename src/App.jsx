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
    const loadDictionary = async () => {
      try {
        setStatus('⏳ 正在連接雲端伺服器...');
        // 請確保此處為帶有 token 的完整長連結
        const firebaseURL = "https://firebasestorage.googleapis.com/v0/b/lyric-to-anki.firebasestorage.app/o/processed_dict.json?alt=media&token=d989a236-bb03-4681-a1f0-64212fd3afb8"; 
        
        const response = await fetch(firebaseURL);
        if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);

        setStatus('⏳ 檔案下載中 (40MB 可能需要較長時間)...');
        console.log("📡 已連線，開始下載 JSON...");

        const data = await response.json();
        
        console.log("✅ 下載完成，開始解析物件結構...");
        setStatus('⏳ 正在優化字典結構...');

        setDictionary(data);
        setResourcesReady(prev => ({ ...prev, dict: true }));
        console.log("🎉 字典就緒，詞條總數：", Object.keys(data).length);
      } catch (err) {
        console.error("🔥 載入失敗：", err);
        setStatus(`⚠️ 字典載入失敗: ${err.message}`);
      }
    };

    const initTokenizer = () => {
      if (window.kuromoji) {
        window.kuromoji.builder({ 
          dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" 
        }).build((err, _tokenizer) => {
          if (!err && _tokenizer) {
            setTokenizer(_tokenizer);
            setResourcesReady(prev => ({ ...prev, tokenizer: true }));
          } else {
            setStatus('❌ 分詞器建構失敗');
          }
        });
      } else {
        // 動態注入腳本防止丟失
        const script = document.createElement('script');
        script.src = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js";
        script.async = true;
        script.onload = () => initTokenizer();
        document.head.appendChild(script);
      }
    };

    loadDictionary();
    initTokenizer();
  }, []);

  useEffect(() => {
    if (resourcesReady.dict && resourcesReady.tokenizer) {
      setStatus('✅ 系統就緒');
    }
  }, [resourcesReady]);

  // --- 解析邏輯 ---
  const handleParse = useCallback(() => {
    if (!tokenizer || !dictionary || !inputText.trim()) return;
    try {
      setStatus('🔍 正在解析日文結構...');
      const tokens = tokenizer.tokenize(inputText);
      const processed = [];
      
      for (let i = 0; i < tokens.length; i++) {
        let current = tokens[i];
        let next = tokens[i + 1];
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

      const filtered = processed.filter(t => ['名詞', '動詞', '形容詞', '副詞', '連體詞', 'サ變動詞'].includes(t.pos));
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
      setStatus('❌ 解析過程出錯');
    }
  }, [tokenizer, dictionary, inputText]);

  // --- 高亮渲染 ---
  const highlightedLyrics = useMemo(() => {
    if (!showResult || !inputText) return null;
    const activeWords = words.filter(w => selectedIds.has(w.id));
    if (activeWords.length === 0) return inputText;
    
    const sortedSurfaces = activeWords.map(w => w.surface).sort((a, b) => b.length - a.length);
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
        body { background-color: #f1f5f9; margin: 0; font-family: -apple-system, sans-serif; color: var(--muji-text); }
        .container { padding: 40px 20px; max-width: 900px; margin: 0 auto; min-height: 100vh; }
        .status-tag { text-align: center; font-size: 12px; color: var(--accent-blue); font-weight: bold; margin-bottom: 12px; }
        h1 { text-align: center; font-weight: 300; letter-spacing: 6px; margin-bottom: 40px; }
        h1 span { font-weight: 600; color: var(--accent-blue); }
        textarea { width: 100%; height: 280px; padding: 25px; border-radius: 12px; border: 1px solid var(--muji-border); font-size: 18px; resize: none; outline: none; line-height: 1.6; }
        .btn-main { width: 100%; padding: 18px; margin-top: 24px; background: var(--muji-text); color: white; border: none; border-radius: 12px; cursor: pointer; font-size: 16px; transition: 0.3s; }
        .btn-main:disabled { background: #cbd5e1; cursor: not-allowed; }
        .lyrics-box { white-space: pre-wrap; line-height: 2.5; padding: 35px; background: white; border-radius: 12px; border: 1px solid var(--muji-border); font-size: 20px; }
        .highlighted-word { border-bottom: 2px solid var(--accent-blue); position: relative; cursor: help; padding: 0 2px; }
        .tooltip { visibility: hidden; position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%); background: #334155; color: white; padding: 8px 14px; border-radius: 6px; font-size: 13px; z-index: 100; white-space: nowrap; opacity: 0; transition: 0.2s; }
        .highlighted-word:hover .tooltip { visibility: visible; opacity: 1; }
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; margin-top: 40px; }
        .card { padding: 20px; background: white; border: 1px solid var(--muji-border); border-radius: 12px; cursor: pointer; }
        .card.selected { border-left: 6px solid var(--accent-blue); background: #f8fafc; }
      `}</style>

      <div className="status-tag">{status}</div>
      <h1>LANGLAB <span>PRO</span></h1>

      {!showResult ? (
        <div>
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="請輸入日文歌詞..."
            disabled={!resourcesReady.tokenizer || !resourcesReady.dict}
          />
          <button 
            className="btn-main" 
            onClick={handleParse}
            disabled={!resourcesReady.tokenizer || !resourcesReady.dict || !inputText.trim()}
          >
            {resourcesReady.tokenizer && resourcesReady.dict ? '開始解析' : '正在準備資源...'}
          </button>
        </div>
      ) : (
        <div>
          <button onClick={() => setShowResult(false)} style={{ marginBottom: '20px', padding: '8px 12px', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ccc' }}>← 返回</button>
          <div className="lyrics-box">{highlightedLyrics}</div>
          <div className="card-grid">
            {words.map(w => (
              <div key={w.id} className={`card ${selectedIds.has(w.id) ? 'selected' : ''}`} onClick={() => {
                const n = new Set(selectedIds);
                n.has(w.id) ? n.delete(w.id) : n.add(w.id);
                setSelectedIds(n);
              }}>
                <strong style={{ display: 'block', fontSize: '1.1rem' }}>{w.base}</strong>
                <div style={{ color: 'var(--accent-blue)', fontSize: '14px' }}>{w.reading}</div>
                <div style={{ marginTop: '8px', fontSize: '13px', color: '#475569' }}>{w.english}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;