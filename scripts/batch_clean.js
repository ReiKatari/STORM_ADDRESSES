/**
 * CLI Batch Address Standardizer Tool
 * Usage: node scripts/batch_clean.js --input <input_file> --output <output_csv_file>
 */

const fs = require('fs');
const path = require('path');
const { standardizeAddress } = require('../src/standardizer');

const args = process.argv.slice(2);
let inputFile = null;
let outputFile = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--input' || args[i] === '-i') inputFile = args[i + 1];
  if (args[i] === '--output' || args[i] === '-o') outputFile = args[i + 1];
}

if (!inputFile) {
  console.log("==================================================");
  console.log(" DaData GAR Batch Address Cleaner CLI Tool");
  console.log("==================================================");
  console.log("Usage:");
  console.log("  node scripts/batch_clean.js --input <path_to_txt_or_csv> [--output <path_to_output_csv>]");
  console.log("\nExample:");
  console.log("  node scripts/batch_clean.js --input my_addresses.txt --output standardized_gar.csv\n");
  process.exit(0);
}

const absoluteInput = path.resolve(process.cwd(), inputFile);
if (!fs.existsSync(absoluteInput)) {
  console.error(`❌ Input file not found: ${absoluteInput}`);
  process.exit(1);
}

console.log(`[Batch] Reading input file: ${absoluteInput}`);
const content = fs.readFileSync(absoluteInput, 'utf-8');
const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

console.log(`[Batch] Processing ${lines.length} address records...`);
const startTime = Date.now();

const headers = [
  "№", "Исходный адрес", "Индекс", "Страна", "Субъект РФ",
  "Муниципальный район", "Поселение", "Населенный пункт",
  "Планировочная структура", "Улица", "Объект адресации", "Помещение", "Точность", "Форматированный адрес"
];

let csvLines = ["\uFEFF" + headers.join(";")];

lines.forEach((rawAddress, index) => {
  const result = standardizeAddress(rawAddress);
  const g = result.gar_object;

  const row = [
    index + 1,
    `"${rawAddress.replace(/"/g, '""')}"`,
    `"${g.postal_code || ''}"`,
    `"${g.country || 'Российская Федерация'}"`,
    `"${g.region || ''}"`,
    `"${g.municipal_district || ''}"`,
    `"${g.settlement_level || ''}"`,
    `"${g.locality || ''}"`,
    `"${g.planning_structure || ''}"`,
    `"${g.street || ''}"`,
    `"${g.house_building || ''}"`,
    `"${g.room_flat || ''}"`,
    `"${result.confidence}"`,
    `"${result.formatted.replace(/"/g, '""')}"`
  ];

  csvLines.push(row.join(";"));
});

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`✅ Standardized ${lines.length} addresses in ${elapsed}s!`);

const outPath = outputFile ? path.resolve(process.cwd(), outputFile) : path.resolve(process.cwd(), 'gar_standardized_output.csv');
fs.writeFileSync(outPath, csvLines.join("\n"), 'utf-8');
console.log(`📄 Saved output CSV: ${outPath}`);
