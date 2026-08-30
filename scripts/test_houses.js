const fs = require('fs');
const path = require('path');

const rDir = 'e:/STORM ADDRESSES/gar_data/extracted/03';
const files = fs.readdirSync(rDir);
const houseFile = files.find(f => f.startsWith('AS_HOUSES_2026') || f.startsWith('AS_HOUSES_2025') || f.startsWith('AS_HOUSES_'));
const hierFile = files.find(f => f.startsWith('AS_ADM_HIERARCHY') || f.startsWith('AS_MUN_HIERARCHY'));

const parentMap = {};
const hierContent = fs.readFileSync(path.join(rDir, hierFile), 'utf8');
(hierContent.match(/<ITEM\s+[^>]+>/g) || []).forEach(t => {
  if (t.includes('ISACTIVE="1"')) {
    const idMatch = t.match(/OBJECTID="([^"]+)"/);
    const pidMatch = t.match(/PARENTOBJID="([^"]+)"/);
    if (idMatch && pidMatch) parentMap[idMatch[1]] = pidMatch[1];
  }
});

const houseContent = fs.readFileSync(path.join(rDir, houseFile), 'utf8');
const houseMatches = (houseContent.match(/<HOUSE\s+[^>]+>/g) || []).slice(0, 20);

const sampleHouses = [];
for (const tag of houseMatches) {
  if (tag.includes('ISACTIVE="1"') && tag.includes('ISACTUAL="1"')) {
    const objId = (tag.match(/OBJECTID="([^"]+)"/) || [])[1];
    const houseNum = (tag.match(/HOUSENUM="([^"]+)"/) || [])[1];
    const buildNum = (tag.match(/BUILDNUM="([^"]+)"/) || [])[1];
    const structNum = (tag.match(/STROENUM="([^"]+)"/) || [])[1];
    const parentStreetId = parentMap[objId];

    sampleHouses.push({
      objId,
      parentStreetId,
      houseNum,
      buildNum,
      structNum
    });
  }
}

console.log('Sample Real GAR Houses for Region 03:', sampleHouses);
