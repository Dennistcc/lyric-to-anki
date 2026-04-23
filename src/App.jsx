import React, { useState, useMemo } from 'react';

// --- 1. 這裡加入 CSV 匯出邏輯 ---
const exportToCSV = (selectedWords) => {
  if (selectedWords.length === 0) {
    alert("請先選取想要匯出的單字！");
    return;
  }
  const headers = ["單字原形", "讀音", "意思", "詞性", "歌詞原文"];
  const rows = selectedWords.map(w => [
    w.base,
    w.reading,
    `"${w.meaning.replace(/"/g, '""')}"`,
    w.pos,
    w.surface
  ]);
  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `LangLab_Anki_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function App() {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const handleParse = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });
      const data = await response.json();
      if (data.success) {
        setWords(data.words);
        setSelectedIds(new Set(data.words.map(w => w.id)));
        setShowResult(true);
      }
    } catch (e) { alert("解析失敗"); }
    finally { setLoading(false); }
  };

  const highlightedLyrics = useMemo(() => {
    if (!showResult || !inputText) return null;
    const activeWords = words.filter(w => selectedIds.has(w.id));
    const sortedSurfaces = activeWords.map(w => w.surface).sort((a, b) => b.length - a.length);
    if (sortedSurfaces.length === 0) return inputText;
    
    const regex = new RegExp(`(${sortedSurfaces.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
    return inputText.split(regex).map((part, i) => {
      const info = activeWords.find(w => w.surface === part);
      return info ? (
        <span key={i} className="hl">
          {part}
          <span className="tt">{info.reading} · {info.base}</span>
        </span>
      ) : part;
    });
  }, [showResult, inputText, words, selectedIds]);

  return (
    <div className="container">
      <style>{`
        body { background: #f9f9f7; color: #444; font-family: sans-serif; padding: 40px 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { text-align: center; font-weight: 300; letter-spacing: 4px; margin-bottom: 40px; }
        textarea { width: 100%; height: 200px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 18px; outline: none; box-sizing: border-box; }
        .btn { width: 100%; padding: 15px; background: #555; color: white; border: none; border-radius: 4px; margin-top: 20px; cursor: pointer; }
        .btn-export { background: #8c92ac; margin-top: 10px; width: auto; padding: 10px 20px; font-size: 14px; }
        .lyrics-box { background: white; padding: 30px; border-radius: 4px; line-height: 2.2; font-size: 20px; white-space: pre-wrap; border: 1px solid #eee; }
        .hl { border-bottom: 2px solid #8c92ac; position: relative; cursor: help; margin: 0 1px; padding-bottom: 2px; }
        .tt { visibility: hidden; position: absolute; bottom: 120%; left: 50%; transform: translateX(-50%); background: #333; color: white; padding: 5px 10px; border-radius: 4px; font-size: 12px; white-space: nowrap; z-index: 10; }
        .hl:hover .tt { visibility: visible; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 30px; }
        .card { background: white; padding: 15px; border: 1px solid #eee; border-radius: 4px; cursor: pointer; transition: all 0.2s; }
        .card.sel { border-left: 4px solid #8c92ac; background: #fdfdfd; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .base { font-size: 18px; font-weight: bold; display: block; }
        .pos { font-size: 10px; color: #999; border: 1px solid #ddd; padding: 0 4px; float: right; }
        .read { color: #888; font-size: 12px; }
        .mean { font-size: 13px; color: #666; margin-top: 5px; }
        .action-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
      `}</style>

      <h1>LANGLAB <span>PRO</span></h1>
      {!showResult ? (
        <>
          <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder="請貼上日文歌詞..." />
          <button className="btn" onClick={handleParse} disabled={loading}>{loading ? '解析中...' : '開始解析'}</button>
        </>
      ) : (
        <>
          <div className="action-bar">
            <button onClick={() => setShowResult(false)} style={{cursor:'pointer', background:'none', border:'none', color:'#888'}}>← 返回</button>
            <button 
              className="btn btn-export" 
              onClick={() => exportToCSV(words.filter(w => selectedIds.has(w.id)))}
            >
              📥 匯出 Anki CSV ({selectedIds.size})
            </button>
          </div>
          <div className="lyrics-box">{highlightedLyrics}</div>
          <div className="grid">
            {words.map(w => (
              <div key={w.id} className={`card ${selectedIds.has(w.id) ? 'sel' : ''}`} onClick={() => {
                const n = new Set(selectedIds);
                n.has(w.id) ? n.delete(w.id) : n.add(w.id);
                setSelectedIds(n);
              }}>
                <span className="pos">{w.pos}</span>
                <span className="base">{w.base}</span>
                <div className="read">{w.reading}</div>
                <div className="mean">{w.meaning}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default App;