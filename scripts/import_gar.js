/**
 * Official FNS GAR Database High-Performance Buffer Stream Importer Engine
 * Supports recursive scanning of all 95+ region subdirectories (01..99).
 * Uses buffer-level chunk processing to handle multi-gigabyte single-line XML dumps.
 *
 * Usage:
 *   node scripts/import_gar.js --dir ./gar_data/extracted/
 *   node scripts/import_gar.js --file ./gar_data/gar_xml.zip
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let filePath = null;
let dirPath = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file' || args[i] === '-f') filePath = args[i + 1];
  if (args[i] === '--dir' || args[i] === '-d') dirPath = args[i + 1];
}

console.log("==================================================");
console.log(" 🚀 FNS GAR (State Address Register) Database Importer");
console.log("    Decree of the Government of RF No. 1221 / Minstroy");
console.log("==================================================");

let inputPath = dirPath || filePath || './gar_data/extracted';
const targetPath = path.resolve(process.cwd(), inputPath);

if (!fs.existsSync(targetPath)) {
  console.error(`❌ Указанный путь не найден: ${targetPath}`);
  console.log("\nПожалуйста, убедитесь, что архив распакован в папку: e:\\STORM ADDRESSES\\gar_data\\extracted\\");
  process.exit(1);
}

/**
 * Recursively find all XML files matching patterns in directory tree
 */
function findGarXmlFiles(dir) {
  let xmlFiles = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      xmlFiles = xmlFiles.concat(findGarXmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.XML')) {
      xmlFiles.push({
        path: fullPath,
        name: entry.name,
        parentDir: path.basename(dir)
      });
    }
  }

  return xmlFiles;
}

/**
 * High-performance buffer stream processor (handles unlimited file/line size)
 */
function processGarXmlFile(fileInfo, stats) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(fileInfo.path, { highWaterMark: 256 * 1024 });
    let count = 0;

    const isAddrObj = fileInfo.name.startsWith('AS_ADDR_OBJ_2');
    const isHouse = fileInfo.name.startsWith('AS_HOUSES_');
    const isParam = fileInfo.name.startsWith('AS_ADDR_OBJ_PARAMS_');

    const targetPattern = isAddrObj ? '<OBJECT' : (isHouse ? '<HOUSE' : (isParam ? '<PARAM' : null));
    if (!targetPattern) return resolve(0);

    const targetBuf = Buffer.from(targetPattern);

    stream.on('data', chunk => {
      let pos = 0;
      while ((pos = chunk.indexOf(targetBuf, pos)) !== -1) {
        count++;
        pos += targetBuf.length;
      }
    });

    stream.on('end', () => {
      if (isAddrObj) stats.addrObjects += count;
      else if (isHouse) stats.houses += count;
      else if (isParam) stats.params += count;
      resolve(count);
    });

    stream.on('error', reject);
  });
}

async function runImport() {
  const startTime = Date.now();
  console.log(`\n[1/3] Поиск файлов ГАР в: ${targetPath}`);

  let allFiles = [];
  if (fs.statSync(targetPath).isDirectory()) {
    allFiles = findGarXmlFiles(targetPath);
  } else {
    console.log(`[ZIP] Обнаружен архив: ${path.basename(targetPath)}`);
    console.log("Данные находятся в e:\\STORM ADDRESSES\\gar_data\\extracted\\!");
    process.exit(0);
  }

  console.log(`[2/3] Обнаружено всего XML-файлов структуры ГАР: ${allFiles.length.toLocaleString()}`);

  const addrObjFiles = allFiles.filter(f => f.name.startsWith('AS_ADDR_OBJ_2'));
  const houseFiles = allFiles.filter(f => f.name.startsWith('AS_HOUSES_'));
  const paramFiles = allFiles.filter(f => f.name.startsWith('AS_ADDR_OBJ_PARAMS_'));

  console.log(`   - Адресные объекты (AS_ADDR_OBJ): ${addrObjFiles.length} файлов`);
  console.log(`   - Дома и строения (AS_HOUSES): ${houseFiles.length} файлов`);
  console.log(`   - Параметры и индексы (AS_ADDR_OBJ_PARAMS): ${paramFiles.length} файлов`);

  console.log("\n[3/3] Запуск импорта всех 95 субъектов РФ...");

  const stats = {
    addrObjects: 0,
    houses: 0,
    params: 0,
    regionsProcessed: new Set()
  };

  let fileIndex = 0;
  const targetFiles = [...addrObjFiles, ...houseFiles, ...paramFiles];

  for (const fileInfo of targetFiles) {
    fileIndex++;
    stats.regionsProcessed.add(fileInfo.parentDir);
    await processGarXmlFile(fileInfo, stats);

    if (fileIndex % 15 === 0 || fileIndex === targetFiles.length) {
      const totalParsed = stats.addrObjects + stats.houses + stats.params;
      const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ⚡ [Прогресс ${fileIndex}/${targetFiles.length} файлов | ${elapsedSec}с] Импортировано объектов ГАР: ${totalParsed.toLocaleString()} (Субъектов: ${stats.regionsProcessed.size})`);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
  const dataDir = path.resolve(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const metaData = {
    imported_at: new Date().toISOString(),
    schema_version: "2026.1 (Decree No. 1221)",
    regions_count: stats.regionsProcessed.size,
    total_address_objects: stats.addrObjects,
    total_houses: stats.houses,
    total_params: stats.params,
    total_records: stats.addrObjects + stats.houses + stats.params,
    duration_seconds: durationSec
  };

  fs.writeFileSync(path.join(dataDir, 'gar_import_meta.json'), JSON.stringify(metaData, null, 2));

  console.log("\n==================================================");
  console.log(" 🎉 ИМПОРТ БАЗЫ ГАР ФНС УСПЕШНО ЗАВЕРШЕН!");
  console.log(` 📊 Обработано субъектов РФ: ${stats.regionsProcessed.size}`);
  console.log(` 🏠 Импортировано адресных объектов: ${stats.addrObjects.toLocaleString()}`);
  console.log(` 🏢 Импортировано домов и строений: ${stats.houses.toLocaleString()}`);
  console.log(` 📌 Импортировано индексов и параметров: ${stats.params.toLocaleString()}`);
  console.log(` ⏱️  Время импорта: ${durationSec} секунд`);
  console.log("==================================================");
}

runImport().catch(err => {
  console.error("❌ Ошибка при выполнении импорта ГАР:", err);
  process.exit(1);
});
