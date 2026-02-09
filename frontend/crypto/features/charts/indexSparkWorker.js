self.onmessage = function(e) {
  const { id, values, w = 180, h = 48, pad = 8 } = e.data;
  
  const catmullRom2bezier = (points, tension = 0.5) => {
    const d = [];
    for (let i = 0; i < points.length; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1] || p1;
      const p3 = points[i + 2] || p2;
      if (i === 0) d.push(`M${p1[0]}, ${p1[1]}`);
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6 * tension * 2;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6 * tension * 2;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6 * tension * 2;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6 * tension * 2;
      d.push(`C${cp1x}, ${cp1y} ${cp2x}, ${cp2y} ${p2[0]}, ${p2[1]}`);
    }
    return d.join(' ');
  };
  
  try {
    if (!values || values.length === 0) {
      postMessage({ id, path: '', area: '' });
      return;
    }
    
    const len = values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = (max - min) || 1;
    const step = (w - pad * 2) / Math.max(len - 1, 1);
    
    const points = values.map((v, i) => {
      const x = pad + i * step;
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return [x, y];
    });
    
    const path = catmullRom2bezier(points);
    const area = path + ` L ${w - pad}, ${h - pad} L ${pad}, ${h - pad} Z`;
    postMessage({ id, path, area });
  } catch (err) {
    postMessage({ id, path: '', area: '' });
  }
};
