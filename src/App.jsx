import React, { useState } from 'react';

function App() {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [status, setStatus] = useState('✅ 系統就緒');
  const [loading, setLoading] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const handleParse = async () => {
    setLoading(true);
    setStatus('🔍 正在後端解析...');
    
    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setWords(data.words);
      setShowResult(true);
      setStatus('✅ 解析完成');
    } catch (err) {
      alert('解析失敗: ' + err.message);
      setStatus('❌ 發生錯誤');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      {/* 這裡保持原本的 CSS 和 UI 結構，但移除所有下載字典的 useEffect */}
      <h1>LANGLAB <span>PRO</span></h1>
      <div className="status-tag">{status}</div>

      {!showResult ? (
        <div>
          <textarea 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)} 
            placeholder="輸入日文歌詞..." 
          />
          <button className="btn-main" onClick={handleParse} disabled={loading || !inputText}>
            {loading ? '解析中...' : '開始解析'}
          </button>
        </div>
      ) : (
        /* 顯示結果的 UI 保持不變 */
        <div onClick={() => setShowResult(false)}>返回</div>
      )}
    </div>
  );
}

export default App;