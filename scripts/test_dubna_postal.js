const fs = require('fs');
const path = require('path');

const rDir = 'e:/STORM ADDRESSES/gar_data/extracted/50';
const files = fs.readdirSync(rDir);
const hFile = files.find(f => (f.startsWith('AS_HOUSES_2026') || f.startsWith('AS_HOUSES_2025') || f.startsWith('AS_HOUSES_')) && !f.includes('PARAMS'));
const hpFile = files.find(f => f.startsWith('AS_HOUSES_PARAMS'));

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
  const postalMap = {};
  await processXmlFileByStream(path.join(rDir, hpFile), tag => {
    if (tag.startsWith('<PARAM ') && tag.includes('TYPEID="5"') && tag.includes('ISACTIVE="1"')) {
      const objIdMatch = tag.match(/OBJECTID="([^"]+)"/);
      const valMatch = tag.match(/VALUE="([^"]+)"/);
      if (objIdMatch && valMatch) {
        postalMap[objIdMatch[1]] = valMatch[1];
      }
    }
  });

  console.log('Total House Postal Codes found in region 50:', Object.keys(postalMap).length);

  // Find Dubna houses
  const dubnaHouses = [];
  await processXmlFileByStream(path.join(rDir, hFile), tag => {
    if (tag.startsWith('<HOUSE ') && tag.includes('ISACTIVE="1"') && tag.includes('ISACTUAL="1"')) {
      const objIdMatch = tag.match(/OBJECTID="([^"]+)"/);
      const houseNumMatch = tag.match(/HOUSENUM="([^"]+)"/);
      if (objIdMatch && houseNumMatch) {
        const objId = objIdMatch[1];
        const postCode = postalMap[objId];
        if (postCode) {
          dubnaHouses.push({
            objId,
            houseNum: houseNumMatch[1],
            postCode
          });
        }
      }
    }
  });

  console.log('Sample Dubna/Region 50 Houses with Postal Code:', dubnaHouses.slice(0, 10));
}

run().catch(console.error);
