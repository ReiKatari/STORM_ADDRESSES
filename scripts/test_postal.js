const fs = require('fs');
const path = require('path');

const rDir = 'e:/STORM ADDRESSES/gar_data/extracted/50';
const files = fs.readdirSync(rDir);
const hpFile = files.find(f => f.startsWith('AS_HOUSES_PARAMS'));
const apFile = files.find(f => f.startsWith('AS_ADDR_OBJ_PARAMS'));

function processXmlFileByStream(filePath, callback) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
    let buffer = '';

    stream.on('data', chunk => {
      buffer += chunk.toString('utf8');
      let startPos = 0;

      while (true) {
        const openTagPos = buffer.indexOf('<', startPos);
        if (openTagPos === -1) {
          buffer = '';
          break;
        }

        const closeTagPos = buffer.indexOf('>', openTagPos);
        if (closeTagPos === -1) {
          buffer = buffer.slice(openTagPos);
          break;
        }

        const tag = buffer.slice(openTagPos, closeTagPos + 1);
        callback(tag);
        startPos = closeTagPos + 1;
      }
    });

    stream.on('end', () => resolve());
    stream.on('error', err => reject(err));
  });
}

async function run() {
  const housePostalMap = {};
  let count = 0;

  await processXmlFileByStream(path.join(rDir, hpFile), tag => {
    if (tag.startsWith('<PARAM ') && tag.includes('TYPEID="5"')) {
      // Check if CHANGEIDEND="0" or ENDDATE="2079-06-06" or ISACTIVE="true" / "1"
      if (tag.includes('CHANGEIDEND="0"') || tag.includes('ENDDATE="2079-06-06"') || tag.includes('ISACTIVE="true"') || tag.includes('ISACTIVE="1"')) {
        const objIdMatch = tag.match(/OBJECTID="([^"]+)"/);
        const valMatch = tag.match(/VALUE="([^"]+)"/);
        if (objIdMatch && valMatch && /^\d{6}$/.test(valMatch[1])) {
          housePostalMap[objIdMatch[1]] = valMatch[1];
          count++;
        }
      }
    }
  });

  console.log('Total House Postal Codes mapped for region 50:', count);
  console.log('Sample entries:', Object.entries(housePostalMap).slice(0, 10));
}

run().catch(console.error);
