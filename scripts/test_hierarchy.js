const fs = require('fs');
const path = require('path');

const rDir = 'e:/STORM ADDRESSES/gar_data/extracted/03';
const files = fs.readdirSync(rDir);
const paramFile = files.find(f => f.startsWith('AS_ADDR_OBJ_PARAMS'));

if (paramFile) {
  const content = fs.readFileSync(path.join(rDir, paramFile), 'utf8');
  const matches = (content.match(/<PARAM\s+[^>]+>/g) || []).slice(0, 10);
  console.log(matches);
}
