const fs = require('fs');
const path = require('path');
const files = [
  'frontend/crypto/cryptotracking.html',
  'frontend/login.html',
  'frontend/register.html',
  'frontend/index.html',
  'frontend/reset-password.html'
];
for (const f of files) {
  if (!fs.existsSync(f)) continue;
  const content = fs.readFileSync(f, 'utf8');
  
  // Дублирующиеся id
  const ids = Array.from(content.matchAll(/\bid="([^"]+)"/g)).map(m => m[1]);
  const idCount = {};
  ids.forEach(id => { idCount[id] = (idCount[id] || 0) + 1; });
  const dups = Object.keys(idCount).filter(k => idCount[k] > 1);
  if (dups.length) console.log(path.basename(f) + ': ДУБЛИ ID — ' + dups.join(', '));

  // input/select/textarea без id и name
  const fieldRe = /<(input|select|textarea)([^>]*?)>/g;
  let m;
  while ((m = fieldRe.exec(content)) !== null) {
    const attrs = m[2];
    const type = (attrs.match(/type="([^"]+)"/) || [])[1] || '';
    if (['hidden','submit','button','reset','image'].includes(type)) continue;
    if (!/\bid=/.test(attrs) && !/\bname=/.test(attrs)) {
      console.log(path.basename(f) + ': БЕЗ id/name — <' + m[1] + attrs.trim().slice(0,80) + '>');
    }
  }
}
console.log('Done');
