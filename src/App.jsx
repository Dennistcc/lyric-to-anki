import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Papa from 'papaparse';

// --- 外部工具函式 ---
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
  const englishOnly = text.split(/[;/、\n]/)
    .map(p => p.trim())
    .filter(p => /[a-zA-Z]/.test(p) && !/[\u4e00-\u9faf\u3040-\u309f]/.test(p) && p.length > 1);
  return englishOnly.length > 0 ? [...new Set(englishOnly)].slice(0, 3).join(' / ') : text.substring(0, 50);
};

function App() {
  // --- State ---
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [status, setStatus] = useState('初始化中...');
  const [resourcesReady, setResourcesReady] = useState({ dict: false, tokenizer: false });
  const [tokenizer, setTokenizer] = useState(null);
  const [dictionary, setDictionary] = useState(null);
  const [showResult, setShowResult] = useState(false);

  // --- 初始化資源 ---
  useEffect(() => {
    // 載入字典
    fetch('./processed_dict.json')
      .then(res => res.json())
      .then(data => {
        setDictionary(data);
        setResourcesReady(prev => ({ ...prev, dict: true }));
      })
      .catch(err => {
        console.error("Dict Load Error:", err);
        setStatus('⚠️ 字典載入失敗，請確認 public 目錄');
      });

    // 載入 Tokenizer
    const initTokenizer = () => {
      if (window.kuromoji) {
        window.kuromoji.builder({ 
          dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" 
        }).build((err, _tokenizer) => {
          if (!err && _tokenizer) {
            setTokenizer(_tokenizer);
            setResourcesReady(prev => ({ ...prev, tokenizer: true }));
          } else {
            setStatus('❌ 分詞器初始化失敗');
          }
        });
      } else {
        // 如果 script 還沒載入完，過一秒再試
        setTimeout(initTokenizer, 1000);
      }
    };
    initTokenizer();
  }, []);

  // 更新系統狀態文字
  useEffect(() => {
    if (resourcesReady.dict && resourcesReady.tokenizer) {
      setStatus('✅ 系統就緒');
    }
  }, [resourcesReady]);

  // --- 解析邏輯 ---
  const handleParse = useCallback(() => {
    if (!tokenizer || !dictionary || !inputText.trim()) return;

    try {
      setStatus('🔍 正在解析...');
      const tokens = tokenizer.tokenize(inputText);
      
      // 1. 初步處理 Tokens (處理サ變動詞)
      const processed = [];
      for (let i = 0; i < tokens.length; i++) {
        let current = tokens[i];
        let next = tokens[i + 1];
        const isSaven = current.pos === '名詞' && next && 
                        (next.pos === '動詞' || next.pos === '助動詞') &&
                        /^[さしすせそじずぜぞ]/.test(next.surface_form);

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

      // 2. 過濾與字典匹配 (長詞優先)
      const filtered = processed.filter(t => ['名詞', '動詞', '形容詞', '副詞', '連體詞', 'サ變動詞'].includes(t.pos));
      const finalized = [];
      for (let i = 0; i < filtered.length; i++) {
        const cur = filtered[i];
        const nxt = filtered[i + 1];
        const combinedStr = nxt ? cur.surface + nxt.surface : null;

        if (combinedStr && dictionary[combinedStr]) {
          const entry = dictionary[combinedStr];
          finalized.push({
            surface: combinedStr, base: combinedStr,
            reading: entry.r ? toHiragana(entry.r) : (cur.reading + nxt.reading),
            english: extractMeaning(entry.m),
            pos: '複合詞', id: i
          });
          i++;
        } else {
          const entry = dictionary[cur.base] || dictionary[cur.surface];
          finalized.push({
            ...cur,
            reading: (entry && entry.r) ? toHiragana(entry.r) : cur.reading,
            english: extractMeaning(entry?.m),
            verbType: entry?.t || (entry?.p?.includes('vi') ? '自動詞' : entry?.p?.includes('vt') ? '他動詞' : ''),
            id: i
          });
        }
      }

      // 3. 去重
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

  // --- 歌詞高亮渲染 ---
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
        :root { --muji-blue: #eef2f6; --muji-text: #55606b; --muji-border: #d1d9e0; --accent-blue: #94a3b8; }
        body { background-color: #f1f5f9; margin: 0; font-family: sans-serif; }
        .container { padding: 40px; max-width: 900px; margin: 0 auto; position: relative; z-index: 1; }
        .status-tag { text-align: center; font-size: 12px; color: var(--accent-blue); letter-spacing: 2px; margin-bottom: 8px; }
        h1 { text-align: center; font-weight: 300; letter-spacing: 4px; margin-bottom: 40px; pointer-events: none; }
        textarea { width: 100%; height: 300px; padding: 20px; border-radius: 8px; border: 1px solid var(--muji-border); font-size: 18px; resize: none; box-sizing: border-box; }
        .btn-main { width: 100%; padding: 15px; margin-top: 20px; background: var(--muji-text); color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 16px; transition: 0.3s; }
        .btn-main:disabled { background: #ccc; cursor: not-allowed; }
        .lyrics-box { white-space: pre-wrap; line-height: 2.2; padding: 30px; background: white; border-radius: 8px; border: 1px solid var(--muji-border); font-size: 19px; }
        .highlighted-word { border-bottom: 2px solid var(--accent-blue); position: relative; cursor: help; }
        .tooltip { visibility: hidden; position: absolute; bottom: 120%; left: 50%; transform: translateX(-50%); background: #334155; color: white; padding: 5px 12px; border-radius: 4px; font-size: 12px; z-index: 100; white-space: nowrap; }
        .highlighted-word:hover .tooltip { visibility: visible; }
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 15px; margin-top: 30px; }
        .card { padding: 20px; background: white; border: 1px solid var(--muji-border); border-radius: 8px; cursor: pointer; }
        .card.selected { border-left: 5px solid var(--accent-blue); background: #f8fafc; }
      `}</style>

      <div className="status-tag">{status}</div>
      <h1>LANGLAB <span>PRO</span></h1>

      {!showResult ? (
        <div style={{ position: 'relative', z-index: 10 }}>
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="在此貼上日文歌詞..."
            disabled={!resourcesReady.tokenizer}
          />
          <button 
            className="btn-main" 
            onClick={handleParse}
            disabled={!resourcesReady.tokenizer || !inputText.trim()}
          >
            {resourcesReady.tokenizer ? '解析歌詞' : '正在載入系統...'}
          </button>
        </div>
      ) : (
        <div>
          <button onClick={() => setShowResult(false)} style={{ marginBottom: '10px', cursor: 'pointer' }}>← 返回修改</button>
          <div className="lyrics-box">{highlightedLyrics}</div>
          
          <div className="card-grid">
            {words.map(w => (
              <div 
                key={w.id} 
                className={`card ${selectedIds.has(w.id) ? 'selected' : ''}`}
                onClick={() => {
                  const n = new Set(selectedIds);
                  n.has(w.id) ? n.delete(w.id) : n.add(w.id);
                  setSelectedIds(n);
                }}
              >
                <strong>{w.base}</strong> {w.verbType && <small>{w.verbType}</small>}
                <div style={{ color: 'var(--accent-blue)', fontSize: '14px' }}>{w.reading}</div>
                <div style={{ marginTop: '8px', fontSize: '13px' }}>{w.english}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;