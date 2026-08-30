/**
 * GAR Full Database Indexer Script
 * Parses extracted FNS GAR XML dataset into an indexed SQLite database (data/gar_database.sqlite)
 * with complete parent hierarchy resolution (Locality, Municipal District, Postal Code)
 * and REAL official FNS house numbers and 6-digit Postal Codes from AS_HOUSES_PARAMS_*.XML across all 96 RF regions.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const EXTRACTED_DIR = path.join(__dirname, '../gar_data/extracted');
const DB_PATH = path.join(__dirname, '../data/gar_database.sqlite');

/**
 * Stream XML tags safely without hitting V8 string length limit
 */
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

async function buildGarIndex() {
  console.log("==================================================");
  console.log("⚡ Streaming GAR SQLite Database Builder (Objects + Real Houses + 6-digit Postal Codes) Starting...");
  console.log("==================================================");

  if (!fs.existsSync(EXTRACTED_DIR)) {
    console.error(`❌ Extracted GAR directory not found at: ${EXTRACTED_DIR}`);
    process.exit(1);
  }

  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  const db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for maximum performance
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Create tables with hierarchy resolution columns, real houses, and postal codes
  db.exec(`
    CREATE TABLE IF NOT EXISTS gar_objects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      objectid INTEGER,
      name TEXT NOT NULL,
      name_lower TEXT NOT NULL,
      typename TEXT NOT NULL,
      full_title TEXT NOT NULL,
      level INTEGER NOT NULL,
      region_code TEXT NOT NULL,
      locality_name TEXT,
      district_name TEXT,
      postal_code TEXT
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS gar_houses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      street_objectid INTEGER,
      house_num TEXT NOT NULL,
      full_house_title TEXT NOT NULL,
      postal_code TEXT,
      region_code TEXT NOT NULL
    );
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_gar_obj_lower ON gar_objects(name_lower);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gar_obj_region ON gar_objects(region_code);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gar_obj_id ON gar_objects(objectid);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gar_houses_street ON gar_houses(street_objectid);');
  db.exec('CREATE INDEX IF NOT EXISTS idx_gar_houses_num ON gar_houses(house_num);');

  const insertObjStmt = db.prepare(`
    INSERT INTO gar_objects (objectid, name, name_lower, typename, full_title, level, region_code, locality_name, district_name, postal_code)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHouseStmt = db.prepare(`
    INSERT INTO gar_houses (street_objectid, house_num, full_house_title, postal_code, region_code)
    VALUES (?, ?, ?, ?, ?)
  `);

  const regions = fs.readdirSync(EXTRACTED_DIR).filter(r => {
    return fs.statSync(path.join(EXTRACTED_DIR, r)).isDirectory();
  });

  console.log(`[GAR Indexer] Found ${regions.length} RF region directories.`);

  let totalObjects = 0;
  let totalHouses = 0;
  const startTime = Date.now();

  for (const region of regions) {
    db.exec('BEGIN TRANSACTION;');
    const regionDir = path.join(EXTRACTED_DIR, region);
    const files = fs.readdirSync(regionDir);
    const addrObjFiles = files.filter(f => f.startsWith('AS_ADDR_OBJ_2026') || f.startsWith('AS_ADDR_OBJ_2025') || f.startsWith('AS_ADDR_OBJ_'));
    const hierFiles = files.filter(f => f.startsWith('AS_ADM_HIERARCHY') || f.startsWith('AS_MUN_HIERARCHY'));
    const houseFiles = files.filter(f => (f.startsWith('AS_HOUSES_2026') || f.startsWith('AS_HOUSES_2025') || f.startsWith('AS_HOUSES_')) && !f.includes('PARAMS'));
    const houseParamFiles = files.filter(f => f.startsWith('AS_HOUSES_PARAMS'));
    const addrParamFiles = files.filter(f => f.startsWith('AS_ADDR_OBJ_PARAMS'));

    // 1. Map Postal Codes (TYPEID="5") for Houses
    const housePostalMap = {};
    for (const file of houseParamFiles) {
      const filePath = path.join(regionDir, file);
      await processXmlFileByStream(filePath, tag => {
        if (tag.startsWith('<PARAM ') && tag.includes('TYPEID="5"')) {
          if (tag.includes('CHANGEIDEND="0"') || tag.includes('ENDDATE="2079-06-06"') || tag.includes('ISACTIVE="true"') || tag.includes('ISACTIVE="1"')) {
            const objIdMatch = tag.match(/OBJECTID="([^"]+)"/);
            const valMatch = tag.match(/VALUE="([^"]+)"/);
            if (objIdMatch && valMatch && /^\d{6}$/.test(valMatch[1])) {
              housePostalMap[objIdMatch[1]] = valMatch[1];
            }
          }
        }
      });
    }

    // 2. Map Postal Codes (TYPEID="5") for Addr Objects
    const addrPostalMap = {};
    for (const file of addrParamFiles) {
      const filePath = path.join(regionDir, file);
      await processXmlFileByStream(filePath, tag => {
        if (tag.startsWith('<PARAM ') && tag.includes('TYPEID="5"')) {
          if (tag.includes('CHANGEIDEND="0"') || tag.includes('ENDDATE="2079-06-06"') || tag.includes('ISACTIVE="true"') || tag.includes('ISACTIVE="1"')) {
            const objIdMatch = tag.match(/OBJECTID="([^"]+)"/);
            const valMatch = tag.match(/VALUE="([^"]+)"/);
            if (objIdMatch && valMatch && /^\d{6}$/.test(valMatch[1])) {
              addrPostalMap[objIdMatch[1]] = valMatch[1];
            }
          }
        }
      });
    }

    // 3. Load Addr Objects
    const objMap = {};
    for (const file of addrObjFiles) {
      const filePath = path.join(regionDir, file);
      await processXmlFileByStream(filePath, tag => {
        if (tag.startsWith('<OBJECT ') && tag.includes('ISACTIVE="1"') && tag.includes('ISACTUAL="1"')) {
          const nameMatch = tag.match(/NAME="([^"]+)"/);
          const typeMatch = tag.match(/TYPENAME="([^"]+)"/);
          const levelMatch = tag.match(/LEVEL="([^"]+)"/);
          const objIdMatch = tag.match(/OBJECTID="([^"]+)"/);

          if (objIdMatch && nameMatch && typeMatch) {
            const objId = objIdMatch[1];
            objMap[objId] = {
              objectid: parseInt(objId, 10),
              name: nameMatch[1],
              typename: typeMatch[1],
              level: levelMatch ? parseInt(levelMatch[1], 10) : 8
            };
          }
        }
      });
    }

    // 4. Load Parent Hierarchy Links
    const parentMap = {};
    for (const file of hierFiles) {
      const filePath = path.join(regionDir, file);
      await processXmlFileByStream(filePath, tag => {
        if (tag.startsWith('<ITEM ') && tag.includes('ISACTIVE="1"')) {
          const idMatch = tag.match(/OBJECTID="([^"]+)"/);
          const pidMatch = tag.match(/PARENTOBJID="([^"]+)"/);
          if (idMatch && pidMatch) {
            parentMap[idMatch[1]] = pidMatch[1];
          }
        }
      });
    }

    // 5. Process and insert enriched objects with resolved parent chain & postal code
    for (const [objId, obj] of Object.entries(objMap)) {
      let localityName = null;
      let districtName = null;

      let currId = objId;
      let depth = 0;
      while (currId && parentMap[currId] && depth < 8) {
        currId = parentMap[currId];
        const parentObj = objMap[currId];
        if (parentObj) {
          const pPrefix = parentObj.typename.endsWith('.') ? parentObj.typename : `${parentObj.typename}.`;
          const pTitle = `${pPrefix} ${parentObj.name}`;

          if ((parentObj.level === 5 || parentObj.level === 6) && !localityName) {
            localityName = pTitle;
          } else if ((parentObj.level === 2 || parentObj.level === 3 || parentObj.level === 4) && !districtName) {
            districtName = pTitle;
          }
        }
        depth++;
      }

      const fullTitle = `${obj.typename} ${obj.name}`;
      const postalCode = addrPostalMap[objId] || null;

      insertObjStmt.run(
        obj.objectid,
        obj.name,
        obj.name.toLowerCase(),
        obj.typename,
        fullTitle,
        obj.level,
        region,
        localityName,
        districtName,
        postalCode
      );
      totalObjects++;
    }

    // 6. Index real GAR houses for this region with 6-digit postal code
    for (const file of houseFiles) {
      const filePath = path.join(regionDir, file);
      await processXmlFileByStream(filePath, tag => {
        if (tag.startsWith('<HOUSE ') && tag.includes('ISACTIVE="1"') && tag.includes('ISACTUAL="1"')) {
          const houseNumMatch = tag.match(/HOUSENUM="([^"]+)"/);
          const buildNumMatch = tag.match(/BUILDNUM="([^"]+)"/);
          const structNumMatch = tag.match(/STROENUM="([^"]+)"/);
          const objIdMatch = tag.match(/OBJECTID="([^"]+)"/);

          if (objIdMatch && houseNumMatch) {
            const houseObjId = objIdMatch[1];
            const parentStreetId = parentMap[houseObjId];

            if (parentStreetId) {
              const hNum = houseNumMatch[1];
              let title = `д. ${hNum}`;
              if (buildNumMatch) title += ` к. ${buildNumMatch[1]}`;
              if (structNumMatch) title += ` стр. ${structNumMatch[1]}`;

              const postalCode = housePostalMap[houseObjId] || addrPostalMap[parentStreetId] || null;

              insertHouseStmt.run(
                parseInt(parentStreetId, 10),
                hNum,
                title,
                postalCode,
                region
              );
              totalHouses++;
            }
          }
        }
      });
    }

    db.exec('COMMIT;');
    console.log(`[GAR Indexer] Region ${region} indexed. Total objects: ${totalObjects.toLocaleString()}, Total real houses: ${totalHouses.toLocaleString()}`);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`==================================================`);
  console.log(`✅ Indexed ${totalObjects.toLocaleString()} active GAR objects and ${totalHouses.toLocaleString()} REAL houses with postal codes in ${elapsed}s!`);
  console.log(`💾 SQLite Database saved to: ${DB_PATH}`);
  console.log(`==================================================`);
}

if (require.main === module) {
  buildGarIndex().catch(console.error);
}

module.exports = {
  buildGarIndex,
  DB_PATH
};
