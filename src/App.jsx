import React, { useState, useEffect, useCallback } from 'react';

const App = () => {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [dictionary, setDictionary] = useState(null);
  const [tokenizer, setTokenizer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('⏳ 正在載入系統資源 (40MB)...');

  // --- 初始化：下載字典與啟動分詞器 ---
  useEffect(() => {
    const loadResources = async () => {
      try {
        // 1. 載入 Kuromoji
        const initTokenizer = () => {
          return new Promise((resolve) => {
            if (window.kuromoji) {
              window.kuromoji.builder({ dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" }).build((err, _t) => {
                resolve(_t);
              });
            } else {
              const script = document.createElement('script');
              script.src = "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/build/kuromoji.js";
              script.onload = () => {
                window.kuromoji.builder({ dicPath: "https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/" }).build((err, _t) => {
                  resolve(_t);
                });
              };
              document.body.appendChild(script);
            }
          });
        };

        // 2. 載入 40MB 字典 (從你的 Firebase Storage)
        const loadDict = async () => {
          const url = "https://firebasestorage.googleapis.com/v0/b/lyric-to-anki.firebasestorage.app/o/processed_dict.json?alt=media&token=d989a236-bb03-4681-a1f0-64212fd3afb8";
          const res = await fetch(url);
          return await res.json();
        };

        const [t, d] = await Promise.all([initTokenizer(), loadDict()]);
        setTokenizer(t);
        setDictionary(d);
        setLoading(false);
        setStatus('Ready');
      } catch (err) {
        console.error(err);
        setStatus('⚠️ 載入失敗，請重新整理');
      }
    };
    loadResources();
  }, []);

  // --- 解析邏輯 (昨天的強大版本) ---
  const handleParse = useCallback(() => {
    if (!tokenizer || !dictionary || !inputText.trim()) return;
    
    setStatus('Parsing...');
    const tokens = tokenizer.tokenize(inputText);
    const results = [];

    tokens.forEach(t => {
      // 只要名詞、動詞、形容詞
      if (['名詞', '動詞', '形容詞', '副詞'].includes(t.pos)) {
        const base = t.basic_form === '*' ? t.surface_form : t.basic_form;
        const entry = dictionary[base] || dictionary[t.surface_form];
        
        if (entry) {
          results.push({
            word: base,
            reading: entry.r || '',
            meaning: entry.m || ''
          });
        }
      }
    });

    // 去重
    const unique = Array.from(new Map(results.map(item => [item.word, item])).values());
    setWords(unique);
    setStatus('Completed');
  }, [tokenizer, dictionary, inputText]);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.title}>LANGLAB PRO <span>(Classic)</span></h1>
        <p style={styles.status}>{status}</p>
      </header>

      <main style={styles.main}>
        <textarea
          style={styles.textarea}
          placeholder="貼上歌詞 (資源載入後可用)..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={loading}
        />
        <button 
          style={{...styles.button, opacity: loading ? 0.5 : 1}} 
          onClick={handleParse} 
          disabled={loading}
        >
          {loading ? 'LOADING...' : '歌詞解析'}
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
  container: { maxWidth: '600px', margin: '0 auto', padding: '60px 20px', backgroundColor: '#F7F6F3', minHeight: '100vh', fontFamily: 'sans-serif', color: '#333' },
  header: { textAlign: 'center', marginBottom: '40px' },
  title: { fontSize: '18px', fontWeight: '300', letterSpacing: '5px', color: '#7F7F7F' },
  status: { fontSize: '10px', color: '#BCBCBC', marginTop: '8px', textTransform: 'uppercase' },
  main: { display: 'flex', flexDirection: 'column', gap: '20px' },
  textarea: { width: '100%', height: '180px', padding: '15px', border: '1px solid #E5E5E5', borderRadius: '2px', backgroundColor: '#FFF', fontSize: '16px', outline: 'none', resize: 'none' },
  button: { width: '100%', padding: '14px', backgroundColor: '#7F7F7F', color: '#FFF', border: 'none', borderRadius: '2px', cursor: 'pointer', fontSize: '14px', letterSpacing: '3px' },
  resultList: { marginTop: '20px', borderTop: '1px solid #E5E5E5' },
  wordRow: { padding: '20px 0', borderBottom: '1px solid #F0F0F0' },
  wordHeader: { display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '8px' },
  kanji: { fontSize: '20px', fontWeight: '500' },
  reading: { fontSize: '13px', color: '#999' },
  meaning: { fontSize: '14px', color: '#666', lineHeight: '1.6' }
};

export default App;