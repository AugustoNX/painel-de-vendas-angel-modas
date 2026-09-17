export async function extractPdfText(arrayBuffer){
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  let fullText = '';
  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines = {};
    content.items.forEach(it=>{
      const y = Math.round(it.transform[5]);
      if (!lines[y]) lines[y] = [];
      lines[y].push({ str: it.str, x: it.transform[4] });
    });
    const sortedYs = Object.keys(lines).map(Number).sort((a,b)=> b-a);
    sortedYs.forEach(y=>{
      const lineItems = lines[y].sort((a,b)=> a.x-b.x);
      fullText += lineItems.map(it=>it.str).join(' ') + '\n';
    });
  }
  return fullText;
}
