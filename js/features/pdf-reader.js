/**
 * Extrai o texto de um PDF preservando as linhas visuais: o pdf.js devolve
 * fragmentos soltos, então agrupamos por coordenada Y e ordenamos por X para
 * reconstruir cada linha como ela aparece no relatório impresso.
 */
export async function extractPdfText(arrayBuffer) {
  if (typeof pdfjsLib === 'undefined') {
    throw new Error('Leitor de PDF não carregado');
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const lines = new Map();

    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lines.has(y)) lines.set(y, []);
      lines.get(y).push({ str: item.str, x: item.transform[4] });
    });

    [...lines.keys()].sort((a, b) => b - a).forEach(y => {
      fullText += lines.get(y).sort((a, b) => a.x - b.x).map(item => item.str).join(' ') + '\n';
    });
  }

  return fullText;
}
