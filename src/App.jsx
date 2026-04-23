import React, { useState } from 'react';

const App = () => {
  const [inputText, setInputText] = useState('');
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(false);

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
      }
    } catch (error) {
      console.error("解析失敗", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F3] text-[#333] font-sans p-6 md:p-12">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <header className="mb-12 text-center">
          <h1 className="text-2xl font-light tracking-widest text-[#7F7F7F] uppercase mb-2">
            LangLab Pro
          </h1>
          <div className="h-0.5 w-12 bg-[#D1D1D1] mx-auto"></div>
        </header>

        {/* Input Section */}
        <section className="mb-12">
          <textarea
            className="w-full h-40 p-4 bg-white border border-[#E5E5E5] rounded-sm shadow-sm focus:outline-none focus:border-[#BCBCBC] transition-colors resize-none placeholder-[#BCBCBC]"
            placeholder="請輸入日文歌詞..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <button
            onClick={handleParse}
            disabled={loading}
            className="mt-4 w-full py-3 bg-[#7F7F7F] text-white tracking-widest hover:bg-[#666] transition-colors rounded-sm disabled:bg-[#D1D1D1]"
          >
            {loading ? '解析中...' : '歌詞解析'}
          </button>
        </section>

        {/* Results Section */}
        <section className="space-y-6">
          {words.length > 0 && (
            <h2 className="text-sm font-medium text-[#999] mb-4">發現單字 ({words.length})</h2>
          )}
          {words.map((item, index) => (
            <div 
              key={index} 
              className="bg-white p-6 border border-[#E5E5E5] rounded-sm shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex justify-between items-baseline mb-2">
                <h3 className="text-xl font-medium text-[#333]">{item.word}</h3>
                <span className="text-xs text-[#BCBCBC] tracking-tighter">{item.pos || '未分類'}</span>
              </div>
              <p className="text-sm text-[#7F7F7F] mb-3">{item.reading}</p>
              <p className="text-sm leading-relaxed text-[#555] border-t border-[#F0F0F0] pt-3">
                {item.meaning}
              </p>
            </div>
          ))}
        </section>

        {words.length === 0 && !loading && (
          <p className="text-center text-[#BCBCBC] text-sm mt-20 italic">
            暫無解析資料，開始你的語言探索。
          </p>
        )}
      </div>
    </div>
  );
};

export default App;