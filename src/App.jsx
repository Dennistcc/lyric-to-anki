import React, { useState, useEffect } from 'react';

const App = () => {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready');

  // --- 簡單的分詞與資料庫查詢 ---
  const handleParse = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setStatus('Parsing...');
    setWords([]); // 開始解析前先清空舊資料

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });
      const data = await response.json();
      
      if (data.success) {
        // 自動適應不同欄位名稱 (word/base, reading/r, meaning/m)
        const formattedWords = (data.words || []).map(item => ({
          word: item.word || item.base || 'Unknown',
          reading: item.reading || item.r || '',
          meaning: item.meaning || item.m || 'No definition found.'
        }));
        
        setWords(formattedWords);
        setStatus(formattedWords.length > 0 ? 'Completed' : 'No matches found');
      } else {
        setStatus('API Error');
      }
    } catch (error) {
      console.error("Error:", error);
      setStatus('Error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* 頂部標題 */}
      <header style={styles.header}>
        <h1 style={styles.title}>LANGLAB PRO</h1>
        <p style={styles.status}>{status}</p>
      </header>

      {/* 輸入區 */}
      <main style={styles.main}>
        <textarea
          style={styles.textarea}
          placeholder="貼上日文歌詞..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        <button 
          style={{...styles.button, opacity: loading ? 0.5 : 1}} 
          onClick={handleParse} 
          disabled={loading}
        >
          {loading ? '...' : '歌詞解析'}
        </button>

        {/* 結果列表 (無印風清單) */}
        {words.length > 0 && (
          <div style={styles.resultList}>
            {words.map((item, index) => (
              <div key={index} style={styles.wordRow}>
                <div style={styles.wordHeader}>
                  <span style={styles.kanji}>{item.word}</span>
                  <span style={styles.reading}>{item.reading}</span>
                </div>
                <p style={styles.meaning}>{item.meaning}</p>
              </div>
            ))}
          </div>
        )}

        {/* 若解析完畢但沒找到單字 */}
        {status === 'No matches found' && (
          <div style={{ textAlign: 'center', marginTop: '40px', color: '#BCBCBC', fontSize: '14px' }}>
            找不到對應單字，請嘗試其他段落。
          </div>
        )}
      </main>
    </div>
  );
};

// --- 無印良品風格樣式 ---
const styles = {
  container: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '60px 20px',
    backgroundColor: '#F7F6F3', // 無印溫潤白
    minHeight: '100vh',
    fontFamily: '"Helvetica Neue", Arial, "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif',
    color: '#333',
  },
  header: {
    textAlign: 'center',
    marginBottom: '40px',
  },
  title: {
    fontSize: '18px',
    fontWeight: '300',
    letterSpacing: '5px',
    color: '#7F7F7F',
    margin: 0,
  },
  status: {
    fontSize: '10px',
    color: '#BCBCBC',
    marginTop: '8px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  textarea: {
    width: '100%',
    height: '180px',
    padding: '15px',
    border: '1px solid #E5E5E5',
    borderRadius: '2px',
    backgroundColor: '#FFF',
    fontSize: '16px',
    outline: 'none',
    boxSizing: 'border-box',
    resize: 'none',
    lineHeight: '1.6',
  },
  button: {
    width: '100%',
    padding: '14px',
    backgroundColor: '#7F7F7F',
    color: '#FFF',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontSize: '14px',
    letterSpacing: '3px',
    transition: 'background 0.2s',
  },
  resultList: {
    marginTop: '20px',
    borderTop: '1px solid #E5E5E5',
  },
  wordRow: {
    padding: '25px 0',
    borderBottom: '1px solid #E5E5E5', // 改用與邊框一致的顏色
  },
  wordHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '12px',
    marginBottom: '10px',
  },
  kanji: {
    fontSize: '22px', // 稍微加大漢字，增加可讀性
    fontWeight: '500',
    color: '#333',
  },
  reading: {
    fontSize: '14px',
    color: '#999',
  },
  meaning: {
    fontSize: '15px',
    color: '#666',
    margin: 0,
    lineHeight: '1.8', // 增加行高，閱讀更舒適
  },
};

export default App;