// utils/exportCsv.js
export const exportToCSV = (selectedWords) => {
  if (!selectedWords || selectedWords.length === 0) {
    alert("請先勾選想要匯出的單字！");
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
  link.setAttribute("download", `LangLab_Selected_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};