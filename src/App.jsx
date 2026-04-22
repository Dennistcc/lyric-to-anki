import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';

function App() {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [status, setStatus] = useState('系統就緒');
  const [tokenizer, setTokenizer] = useState(null);
  const [dictionary, setDictionary] = useState(null); 
  const [showResult, setShowResult] = useState(false);

  const toHiragana = (str) => {
    if (!str) return '';
    return str.replace(/[\u30a1-\u30f6]/g, (match) => {
      const chr = match.charCodeAt(0) - 0x60;
      return String.fromCharCode(chr);
    });
  };

  useEffect(() => {
    fetch('./processed_dict.json')
      .then(res => res.json())
      .then(data => setDictionary(data))
      .catch(() => setStatus('字典載入失敗'));

    if (window.kuromoji) {
      window.kuromoji.builder({ 
        dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" 
      }).build((err, _tokenizer) => {
        if (!err) setTokenizer(_tokenizer);
      });
    }
  }, []);

  const handleParse = () => {
    if (!tokenizer || !inputText || !dictionary) return;
    setShowResult(true);

    try {
      const tokens = tokenizer.tokenize(inputText);
      
      const filteredRawTokens = tokens.filter(t => {
        const isSingleKana = /^[ぁ-んァ-ン]$/.test(t.surface_form);
        const isParticle = t.pos === '助詞' || t.pos === '助動詞' || t.surface_form === 'ん';
        return !(isSingleKana && isParticle);
      });

      const processedTokens = [];
      for (let i = 0; i < filteredRawTokens.length; i++) {
        let current = filteredRawTokens[i];
        const next = filteredRawTokens[i+1];
        
        const isSaven = current.pos === '名詞' && next && 
                       (next.pos === '動詞' || next.pos === '助動詞') &&
                       /^[さしすせそじずぜぞ]/.test(next.surface_form);

        if (isSaven) {
          let combinedSurface = current.surface_form;
          let combinedBase = current.surface_form + 'する'; 
          let combinedReading = toHiragana(current.reading) + 'する';
          while (filteredRawTokens[i+1] && (['動詞', '助動詞'].includes(filteredRawTokens[i+1].pos) || filteredRawTokens[i+1].pos_detail_1 === '接尾')) {
            i++;
            combinedSurface += filteredRawTokens[i].surface_form;
          }
          processedTokens.push({
            surface: combinedSurface, base: combinedBase, reading: combinedReading, pos: 'サ變動詞'
          });
        } else {
          processedTokens.push({
            surface: current.surface_form,
            base: current.basic_form === '*' ? current.surface_form : current.basic_form,
            reading: toHiragana(current.reading),
            pos: current.pos
          });
        }
      }

      // 1. 初步提取單字並從字典抓取基本釋義
      const rawFiltered = processedTokens
        .filter(t => ['名詞', '動詞', '形容詞', '副詞', '連體詞', 'サ變動詞'].includes(t.pos))
        .map(t => {
          const dictEntry = dictionary[t.base] || dictionary[t.surface] || dictionary[t.surface.replace(/する$/, '')];
          let finalReading = t.reading;
          if (dictEntry && dictEntry.r) finalReading = toHiragana(dictEntry.r);

          let meaning = "無釋義資料";
          if (dictEntry && dictEntry.m) {
            const extract = (val) => {
              if (typeof val === 'string') return val;
              if (Array.isArray(val)) return val.map(extract).join(' ');
              if (typeof val === 'object' && val !== null) return val.content || val.text || val.gloss || "";
              return String(val);
            };

            const fullText = extract(dictEntry.m);
            const parts = fullText.split(/[;/、\n]/);
            const englishOnly = parts.map(p => p.trim()).filter(p => /[a-zA-Z]/.test(p) && !/[\u4e00-\u9faf\u3040-\u309f]/.test(p) && p.length > 1);
            meaning = englishOnly.length > 0 ? [...new Set(englishOnly)].slice(0, 3).join(' / ') : fullText.substring(0, 50).replace(/[{} "[\]]|content:|text:/g, '');
          }

          let vType = "";
          if (dictEntry) {
            vType = dictEntry.t || "";
            if (!vType) {
              const rawTags = Array.isArray(dictEntry.p) ? dictEntry.p.join(' ') : String(dictEntry.p);
              if (rawTags.includes('vi')) vType = "自動詞";
              else if (rawTags.includes('vt')) vType = "他動詞";
            }
          }
          return { ...t, reading: finalReading, english: meaning, verbType: vType };
        });

      // 2. 核心：長詞優先合併邏輯 (例如將 "目" + "蓋" 合併為 "目蓋")
      const finalWords = [];
      for (let i = 0; i < rawFiltered.length; i++) {
        let current = rawFiltered[i];
        let next = rawFiltered[i + 1];

        if (next) {
          const combined = current.surface + next.surface;
          // 檢查組合後的詞是否存在於字典
          if (dictionary[combined]) {
            const entry = dictionary[combined];
            // 處理合併後的釋義
            const extract = (val) => {
              if (typeof val === 'string') return val;
              if (Array.isArray(val)) return val.map(extract).join(' ');
              if (typeof val === 'object' && val !== null) return val.content || val.text || val.gloss || "";
              return String(val);
            };
            const fullText = extract(entry.m || "");
            const parts = fullText.split(/[;/、\n]/);
            const englishOnly = parts.map(p => p.trim()).filter(p => /[a-zA-Z]/.test(p) && !/[\u4e00-\u9faf\u3040-\u309f]/.test(p) && p.length > 1);
            const combinedMeaning = englishOnly.length > 0 ? [...new Set(englishOnly)].slice(0, 3).join(' / ') : fullText.substring(0, 50).replace(/[{} "[\]]|content:|text:/g, '');

            finalWords.push({
              surface: combined,
              base: combined,
              reading: entry.r ? toHiragana(entry.r) : (current.reading + next.reading),
              pos: '複合詞',
              english: combinedMeaning,
              verbType: entry.t || ""
            });
            i++; // 跳過下一個零件
            continue;
          }
        }
        finalWords.push(current);
      }
      
      const uniqueMap = new Map();
      finalWords.forEach(item => { if (!uniqueMap.has(item.base)) uniqueMap.set(item.base, item); });
      const uniqueList = Array.from(uniqueMap.values()).map((item, index) => ({ ...item, id: index }));

      setWords(uniqueList);
      setSelectedIds(new Set(uniqueList.map(w => w.id)));
    } catch (e) {
      console.error(e);
    }
  };

  const renderHighlightedLyrics = () => {
    const activeWordsMap = new Map();
    words.forEach(w => { if (selectedIds.has(w.id)) activeWordsMap.set(w.surface, w); });
    const allSurfaces = Array.from(activeWordsMap.keys()).sort((a, b) => b.length - a.length);
    if (allSurfaces.length === 0) return <div className="lyrics-box">{inputText}</div>;

    const regex = new RegExp(`(${allSurfaces.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    const parts = inputText.split(regex);

    return (
      <div className="lyrics-box">
        {parts.map((part, i) => {
          const info = activeWordsMap.get(part);
          return info ? (
            <span key={i} className="highlighted-word">
              {part}
              <span className="tooltip">{info.reading} · {info.english}</span>
            </span>
          ) : <span key={i}>{part}</span>;
        })}
      </div>
    );
  };

  return (
    <div className="container">
      <style>{`
        :root {
          --muji-blue: #eef2f6;
          --muji-text: #55606b;
          --muji-border: #d1d9e0;
          --accent-blue: #94a3b8;
          --white: #ffffff;
        }
        body { background-color: #f1f5f9; color: var(--muji-text); margin: 0; display: flex; justify-content: center; align-items: flex-start; min-height: 100vh; }
        .container { padding: 40px 60px; font-family: "PingFang TC", "Microsoft JhengHei", sans-serif; width: 95vw; max-width: 1200px; margin: 40px auto; background: #f8fafc; box-shadow: 0 20px 40px rgba(0,0,0,0.05); border-radius: 12px; min-height: 700px; }
        h1 { font-weight: 300; letter-spacing: 8px; text-align: center; color: var(--muji-text); margin-bottom: 50px; font-size: 2.5rem; }
        h1 span { font-weight: 600; color: var(--accent-blue); }
        .status-tag { display: block; text-align: center; font-size: 11px; color: #94a3b8; margin-bottom: 10px; letter-spacing: 2px; text-transform: uppercase; }
        textarea { width: 100%; height: 350px; padding: 30px; border-radius: 8px; border: 1px solid var(--muji-border); background-color: var(--white); font-size: 18px; outline: none; transition: all 0.3s; color: var(--muji-text); box-sizing: border-box; line-height: 1.8; resize: none; }
        textarea:focus { border-color: var(--accent-blue); box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.1); }
        .btn-main { width: 100%; padding: 18px; margin-top: 30px; background-color: var(--muji-text); color: #fff; border: none; border-radius: 8px; cursor: pointer; letter-spacing: 4px; transition: all 0.3s; font-size: 16px; }
        .btn-main:hover { background-color: #3f4a54; transform: translateY(-2px); }
        .lyrics-box { white-space: pre-wrap; line-height: 2.5; padding: 40px; background: var(--white); border: 1px solid var(--muji-border); border-radius: 8px; font-size: 20px; color: #334155; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02); }
        .highlighted-word { border-bottom: 2px solid var(--accent-blue); position: relative; cursor: default; padding: 0 2px; transition: background 0.2s; }
        .highlighted-word:hover { background: rgba(148, 163, 184, 0.1); }
        .tooltip { visibility: hidden; position: absolute; bottom: 140%; left: 50%; transform: translateX(-50%); background: #334155; color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 13px; white-space: normal; z-index: 100; opacity: 0; transition: 0.3s; min-width: 180px; text-align: center; box-shadow: 0 10px 15px rgba(0,0,0,0.1); }
        .highlighted-word:hover .tooltip { visibility: visible; opacity: 1; }
        .card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px; margin-top: 40px; }
        .card { padding: 24px; background: var(--white); border: 1px solid var(--muji-border); border-radius: 8px; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; position: relative; }
        .card:hover { transform: translateY(-5px); box-shadow: 0 12px 20px rgba(0,0,0,0.05); }
        .card.selected { border-top: 4px solid var(--accent-blue); background: var(--muji-blue); }
        .card-base { font-size: 1.4rem; font-weight: 500; display: block; margin-bottom: 6px; color: #1e293b; }
        .card-reading { font-size: 15px; color: var(--accent-blue); margin-bottom: 12px; }
        .card-meaning { font-size: 14px; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 12px; line-height: 1.6; }
        .badge-vi { background-color: #e0f2fe; color: #0369a1; padding: 2px 8px; font-size: 10px; margin-left: 6px; border-radius: 4px; font-weight: 600; }
        .badge-vt { background-color: #fee2e2; color: #b91c1c; padding: 2px 8px; font-size: 10px; margin-left: 6px; border-radius: 4px; font-weight: 600; }
        .export-btn { padding: 10px 24px; background: var(--white); border: 1px solid var(--muji-border); border-radius: 6px; font-size: 14px; color: var(--muji-text); cursor: pointer; transition: all 0.2s; }
        .export-btn:hover { background: var(--muji-text); color: var(--white); }
      `}</style>

      <div className="status-tag">— {status} —</div>
      <h1>LANGLAB <span>PRO</span></h1>
      
      {!showResult ? (
        <>
          <textarea 
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="請在此輸入日文歌詞..."
          />
          <button className="btn-main" onClick={handleParse}>解析歌詞</button>
        </>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '13px' }}>歌詞分析結果</span>
            <button 
              onClick={() => {
                setShowResult(false);
                setWords([]);           
                setSelectedIds(new Set());
              }} 
              style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}
            >
              ← 返回重新輸入
            </button>
          </div>
          {renderHighlightedLyrics()}
        </div>
      )}

      {words.length > 0 && (
        <div style={{ marginTop: '60px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '400' }}>單字卡 ({selectedIds.size})</h2>
            <button className="export-btn" onClick={() => {
              const exportData = words
                .filter(w => selectedIds.has(w.id))
                .map(w => ({
                  "生字": w.surface,
                  "發音": w.reading,
                  "詞性": w.verbType || w.pos,
                  "英文意思": w.english
                }));
              const csv = Papa.unparse(exportData);
              const blob = new Blob(["\ufeff", csv], { type: 'text/csv;charset=utf-8;' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = 'langlab_vocab_list.csv';
              link.click();
            }}>匯出 Anki CSV</button>
          </div>
          
          <div className="card-grid">
            {words.map(w => (
              <div 
                key={w.id} 
                className={`card ${selectedIds.has(w.id) ? 'selected' : ''}`}
                onClick={() => {
                  const next = new Set(selectedIds);
                  next.has(w.id) ? next.delete(w.id) : next.add(w.id);
                  setSelectedIds(next);
                }}
              >
                <span className="card-base">
                  {w.base}
                  {w.verbType && w.verbType.split(' / ').map((type, idx) => (
                    <span key={idx} className={type === '自動詞' ? 'badge-vi' : 'badge-vt'}>
                      {type}
                    </span>
                  ))}
                </span>
                <div className="card-reading">{w.reading}</div>
                <div className="card-meaning">{w.english}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;