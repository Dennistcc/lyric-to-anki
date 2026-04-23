import React, { useState, useEffect, useCallback } from 'react';

const App = () => {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [dictionary, setDictionary] = useState(null);
  const [tokenizer, setTokenizer] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const loadResources = async () => {
      try {
        const initTokenizer = () => new Promise((resolve) => {
          if (window.kuromoji) {
            window.kuromoji.builder({ dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" }).build((err, _t) => resolve(_t));
          } else {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js";
            script.onload = () => window.kuromoji.builder({ dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" }).build((err, _t) => resolve(_t));
            document.body.appendChild(script);
          }
        });
        const loadDict = async () => {
          const url = "https://firebasestorage.googleapis.com/v0/b/lyric-to-anki.firebasestorage.app/o/processed_dict.json?alt=media&token=d989a236-bb03-4681-a1f0-64212fd3afb8";
          const res = await fetch(url);
          return await res.json();
        };
        const [t, d] = await Promise.all([initTokenizer(), loadDict()]);
        setTokenizer(t);
        setDictionary(d);
        setIsReady(true);
      } catch (err) { console.error("Resource load error:", err); }
    };
    loadResources();
  }, []);

  const handleParse = useCallback(() => {
    if (!tokenizer || !dictionary || !inputText.trim()) return;
    const tokens = tokenizer.tokenize(inputText);
    const results = [];
    tokens.forEach(t => {
      if (['名詞', '動詞', '形容詞'].includes(t.pos)) {
        const base = t.basic_form === '*' ? t.surface_form : t.basic_form;
        const entry = dictionary[base] || dictionary[t.surface_form];
        if (entry) results.push({ word: base, reading: entry.r || '', meaning: entry.m || '' });
      }
    });
    const unique = Array.from(new Map(results.map(item => [item.word, item])).values());
    setWords(unique);
  }, [tokenizer, dictionary, inputText]);

  return (
    <div style={styles.container}>
      <main style={styles.main}>
        <textarea
          style={styles.textarea}
          placeholder={isReady ? "貼上歌詞..." : "系統準備中..."}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
        />
        
        <button 
          style={{...styles.button, opacity: (!isReady || !inputText.trim()) ? 0.3 : 1}} 
          onClick={handleParse} 
          disabled={!isReady}
        >
          {isReady ? '解析' : '...'}
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