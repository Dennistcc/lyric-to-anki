import React, { useState, useEffect } from 'react';

const App = () => {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('Ready');

  const handleParse = async () => {
    if (!inputText.trim()) return;
    setLoading(true);
    setStatus('Parsing...');
    setWords([]);

    try {
      const response = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
      });
      const data = await response.json();
      
      if (data.success) {
        // 自動適應不同的欄位名稱並去重
        const formattedWords = (data.words || []).map(item => ({
          word: item.word || item.base || item.kanji || '',
          reading: item.reading || item.r || '',
          meaning: item.meaning || item.m || ''
        }));
        
        setWords(formattedWords);
        setStatus(formattedWords.length > 0 ? 'Completed' : 'No matches found');
      }
    } catch (error) {
      console.error("Error:", error);
      setStatus('Error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <main style={styles.main}>
        <textarea
          style={styles.textarea}
          placeholder="貼上歌詞..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        
        <button 
          style={{...styles.button, opacity: loading ? 0.3 : 1}} 
          onClick={handleParse} 
          disabled={loading}
        >
          {loading ? '...' : '解析'}
        </button>

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
      </main>
    </div>
  );
};

const styles = {
  container: { 
    maxWidth: '500px', 
    margin: '0 auto', 
    padding: '40px 25px', 
    backgroundColor: '#F9F9F7', 
    minHeight: '100vh', 
    fontFamily: '"Helvetica Neue", "Hiragino Sans", sans-serif',
    color: '#444' 
  },
  main: { display: 'flex', flexDirection: 'column' },
  textarea: { 
    width: '100%', height: '140px', padding: '10px 0', 
    border: 'none', borderBottom: '1px solid #E0E0E0', 
    backgroundColor: 'transparent', fontSize: '16px', 
    outline: 'none', resize: 'none', lineHeight: '1.8' 
  },
  button: { 
    alignSelf: 'flex-end', marginTop: '15px', padding: '8px 25px',
    backgroundColor: 'transparent', color: '#888', border: '1px solid #CCC',
    borderRadius: '2px', cursor: 'pointer', fontSize: '13px', letterSpacing: '2px'
  },
  resultList: { marginTop: '50px' },
  wordRow: { padding: '20px 0', borderBottom: '0.5px solid #EFEFEF' },
  wordHeader: { display: 'flex', alignItems: 'baseline', gap: '10px' },
  kanji: { fontSize: '19px', fontWeight: '400' },
  reading: { fontSize: '12px', color: '#AAA' },
  meaning: { fontSize: '14px', color: '#777', marginTop: '6px', lineHeight: '1.6' }
};

export default App;