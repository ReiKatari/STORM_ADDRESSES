const fs = require('fs');
const path = require('path');

const rDir = 'e:/STORM ADDRESSES/gar_data/extracted/50';
const files = fs.readdirSync(rDir);
const hpFile = files.find(f => f.startsWith('AS_HOUSES_PARAMS'));
const apFile = files.find(f => f.startsWith('AS_ADDR_OBJ_PARAMS'));

const fdH = fs.openSync(path.join(rDir, hpFile), 'r');
const bufH = Buffer.alloc(10 * 1024 * 1024);
fs.readSync(fdH, bufH, 0, bufH.length, 0);
fs.closeSync(fdH);

const textH = bufH.toString('utf8');
const matchesH = textH.match(/TYPEID="(\d+)"/g) || [];
const countsH = {};
matchesH.forEach(m => {
  const tid = m.match(/\d+/)[0];
  countsH[tid] = (countsH[tid] || 0) + 1;
});
console.log('AS_HOUSES_PARAMS TYPEID counts in first 10MB:', countsH);

const fdA = fs.openSync(path.join(rDir, apFile), 'r');
const bufA = Buffer.alloc(10 * 1024 * 1024);
fs.readSync(fdA, bufA, 0, bufA.length, 0);
fs.closeSync(fdA);

const textA = bufA.toString('utf8');
const matchesA = textA.match(/TYPEID="(\d+)"/g) || [];
const countsA = {};
matchesA.forEach(m => {
  const tid = m.match(/\d+/)[0];
  countsA[tid] = (countsA[tid] || 0) + 1;
});
console.log('AS_ADDR_OBJ_PARAMS TYPEID counts in first 10MB:', countsA);

// Find any 6-digit numbers in VALUE attribute
const postCodeMatches = textH.match(/VALUE="(\d{6})"/g) || [];
console.log('6-digit postal code values sample in AS_HOUSES_PARAMS:', postCodeMatches.slice(0, 10));
