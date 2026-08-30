/**
 * Search & Suggestion Engine (DaData Compatible)
 * Performs order-independent multi-token search, region filtering, fuzzy matching, re-ranking, and GAR field mapping.
 * Connects directly to the full GAR SQLite Database (data/gar_database.sqlite)
 * with complete parent hierarchy resolution (locality_name, district_name, postal_code)
 * and REAL house numbers and 6-digit postal codes directly from official FNS GAR AS_HOUSES XML dataset.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { addressDatabase, companiesDatabase, banksDatabase } = require('./db');
const { standardizeAddress } = require('./standardizer');
const { formatGarAddressString, createGarAddressRecord, formatMunicipalDistrict } = require('./gar_schema');

const DB_PATH = path.join(__dirname, '../data/gar_database.sqlite');
let sqliteDb = null;

function getSqliteDb() {
  if (!sqliteDb && fs.existsSync(DB_PATH)) {
    try {
      sqliteDb = new DatabaseSync(DB_PATH);
    } catch (e) {
      console.error(`[SearchEngine] SQLite connect error:`, e);
    }
  }
  return sqliteDb;
}

const REGION_NAMES = {
  "01": "Республика Адыгея",
  "02": "Республика Башкортостан",
  "03": "Республика Бурятия",
  "04": "Республика Алтай",
  "05": "Республика Дагестан",
  "06": "Республика Ингушетия",
  "07": "Кабардино-Балкарская Республика",
  "08": "Республика Калмыкия",
  "09": "Карачаево-Черкесская Республика",
  "10": "Республика Карелия",
  "11": "Республика Коми",
  "12": "Республика Марий Эл",
  "13": "Республика Мордовия",
  "14": "Республика Саха (Якутия)",
  "15": "Республика Северная Осетия - Алания",
  "16": "Республика Татарстан",
  "17": "Республика Тыва",
  "18": "Удмуртская Республика",
  "19": "Республика Хакасия",
  "20": "Чеченская Республика",
  "21": "Чувашская Республика",
  "22": "Алтайский край",
  "23": "Краснодарский край",
  "24": "Красноярский край",
  "25": "Приморский край",
  "26": "Ставропольский край",
  "27": "Хабаровский край",
  "28": "Амурская область",
  "29": "Архангельская область",
  "30": "Астраханская область",
  "31": "Белгородская область",
  "32": "Брянская область",
  "33": "Владимирская область",
  "34": "Волгоградская область",
  "35": "Вологодская область",
  "36": "Воронежская область",
  "37": "Ивановская область",
  "38": "Иркутская область",
  "39": "Калининградская область",
  "40": "Калужская область",
  "41": "Камчатский край",
  "42": "Кемеровская область",
  "43": "Кировская область",
  "44": "Костромская область",
  "45": "Курганская область",
  "46": "Курская область",
  "47": "Ленинградская область",
  "48": "Липецкая область",
  "49": "Магаданская область",
  "50": "Московская область",
  "51": "Мурманская область",
  "52": "Нижегородская область",
  "53": "Новгородская область",
  "54": "Новосибирская область",
  "55": "Омская область",
  "56": "Оренбургская область",
  "57": "Орловская область",
  "58": "Пензенская область",
  "59": "Пермский край",
  "60": "Псковская область",
  "61": "Ростовская область",
  "62": "Рязанская область",
  "63": "Самарская область",
  "64": "Саратовская область",
  "65": "Сахалинская область",
  "66": "Свердловская область",
  "67": "Смоленская область",
  "68": "Тамбовская область",
  "69": "Тверская область",
  "70": "Томская область",
  "71": "Тульская область",
  "72": "Тюменская область",
  "73": "Ульяновская область",
  "74": "Челябинская область",
  "75": "Забайкальский край",
  "76": "Ярославская область",
  "77": "г. Москва",
  "78": "г. Санкт-Петербург",
  "79": "Еврейская автономная область",
  "86": "Ханты-Мансийский автономный округ - Югра",
  "87": "Чукотский автономный округ",
  "89": "Ямало-Ненецкий автономный округ",
  "92": "г. Севастополь",
  "99": "г. Байконур"
};

const REGION_KEYWORDS_MAP = {
  "бурятия": "03",
  "химки": "50",
  "дубна": "50",
  "люберцы": "50",
  "подмосковье": "50",
  "московская": "50",
  "москва": "77",
  "петербург": "78",
  "спб": "78",
  "татарстан": "16",
  "казань": "16",
  "сочи": "23",
  "краснодар": "23",
  "екатеринбург": "66",
  "новосибирск": "54",
  "самара": "63",
  "челябинск": "74",
  "уфа": "02",
  "майкоп": "01",
  "махачкала": "05",
  "петрозаводск": "10",
  "сыктывкар": "11",
  "саранск": "13",
  "якутск": "14",
  "ижевск": "18",
  "абакан": "19",
  "грозный": "20",
  "чебоксары": "21",
  "барнаул": "22",
  "красноярск": "24",
  "владивосток": "25",
  "ставрополь": "26",
  "хабаровск": "27",
  "тверь": "69",
  "пермь": "59",
  "тула": "71",
  "тюмень": "72",
  "ярославль": "76",
  "севастополь": "92"
};

const STRUCT_STOP_WORDS = new Set([
  "ул", "улица", "пер", "переулок", "пр", "просп", "проспект", "ш", "шоссе", "д", "дом", "корп", "корпус", "стр", "строение", "кв", "квартира", "оф", "офис", "г", "город", "мкр", "микрорайон", "обл", "область", "край", "рф", "россия", "российская", "федерация",
  "республика", "район", "округ", "поселение", "городской", "муниципальный", "автономный", "автономная", "внутригородская", "территория"
]);

/**
 * Queries real official GAR house numbers and postal codes for a street from SQLite gar_houses table
 */
function getRealGarHouses(db, streetObjectId, houseDigitPrefix) {
  if (!db || !streetObjectId) return [];
  try {
    let stmt;
    if (houseDigitPrefix) {
      stmt = db.prepare(`
        SELECT DISTINCT full_house_title, postal_code 
        FROM gar_houses 
        WHERE street_objectid = ? AND house_num LIKE ? 
        ORDER BY CAST(house_num AS INTEGER) ASC 
        LIMIT 10
      `);
      return stmt.all(streetObjectId, `${houseDigitPrefix}%`);
    } else {
      stmt = db.prepare(`
        SELECT DISTINCT full_house_title, postal_code 
        FROM gar_houses 
        WHERE street_objectid = ? 
        ORDER BY CAST(house_num AS INTEGER) ASC 
        LIMIT 5
      `);
      return stmt.all(streetObjectId);
    }
  } catch (e) {
    return [];
  }
}

/**
 * Searches addresses and returns autocomplete suggestions formatted strictly
 * in the 10-level GAR structure with order-independent multi-token matching,
 * resolved parent locality, municipal district, REAL house numbers and 6-digit postal codes.
 */
function suggestAddress(query, count = 10) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { suggestions: [] };
  }

  const q = query.trim().toLowerCase();
  const rawTokens = q.split(/[\s,]+/).filter(Boolean);
  
  // Detect target region code from query tokens
  let detectedRegionCode = null;
  for (const t of rawTokens) {
    const cleanT = t.replace(/[^а-яяa-z0-9-]/gi, '').toLowerCase();
    if (REGION_KEYWORDS_MAP[cleanT]) {
      detectedRegionCode = REGION_KEYWORDS_MAP[cleanT];
      break;
    }
  }

  // Detect numeric token (house prefix/number e.g. "2" or "25")
  const numericToken = rawTokens.find(t => /^\d+$/.test(t.replace(/[^0-9]/g, '')));
  const houseDigitPrefix = numericToken ? numericToken.replace(/[^0-9]/g, '') : null;

  // Content tokens (clean punctuation, exclude structural/administrative words & pure numbers)
  const contentTokens = rawTokens
    .map(t => t.replace(/[^а-яяa-z0-9-]/gi, '').toLowerCase())
    .filter(t => t.length > 0 && !STRUCT_STOP_WORDS.has(t) && !/^\d+$/.test(t) && !REGION_KEYWORDS_MAP[t]);

  // Standardize full query to extract house/room numbers if present
  const stdQuery = standardizeAddress(query);

  const candidateList = [];
  const seenValues = new Set();

  // 1. Direct matches from in-memory addressDatabase
  addressDatabase.forEach(item => {
    const fullText = item.formatted.toLowerCase();
    if (contentTokens.length > 0 && contentTokens.every(t => fullText.includes(t.toLowerCase()))) {
      candidateList.push({
        value: item.formatted,
        gar: item.gar,
        score: 200
      });
    }
  });

  // 2. Query full GAR SQLite Database across all 96 RF regions with Order-Independent Multi-Token Search
  const db = getSqliteDb();
  if (db && contentTokens.length > 0) {
    try {
      let sql = `
        SELECT objectid, name, name_lower, typename, full_title, level, region_code, locality_name, district_name, postal_code 
        FROM gar_objects 
        WHERE 1=1
      `;
      const sqlParams = [];

      if (detectedRegionCode) {
        sql += ` AND region_code = ?`;
        sqlParams.push(detectedRegionCode);
      }

      // Order-independent token matching: EVERY token must match somewhere in name, locality, district, or full_title
      for (const token of contentTokens) {
        const cleanT = token.replace(/[^а-яяa-z0-9-]/gi, '').toLowerCase();
        if (cleanT.length > 0) {
          sql += ` AND (name_lower LIKE ? OR locality_name LIKE ? OR district_name LIKE ? OR full_title LIKE ?)`;
          const paramPattern = `%${cleanT}%`;
          sqlParams.push(paramPattern, paramPattern, paramPattern, paramPattern);
        }
      }

      sql += ` ORDER BY CASE WHEN region_code = '77' THEN 1 WHEN region_code = '50' THEN 2 WHEN region_code = '78' THEN 3 WHEN region_code = '16' THEN 4 ELSE 5 END, level ASC LIMIT 50`;

      const stmt = db.prepare(sql);
      const rows = stmt.all(...sqlParams);

      for (const row of rows) {
        const regName = REGION_NAMES[row.region_code] || `Регион ${row.region_code}`;
        const isFederalCity = row.region_code === "77" || row.region_code === "78" || row.region_code === "92" || row.region_code === "99";

        const typePrefix = row.typename.endsWith('.') ? row.typename : `${row.typename}.`;
        const itemTitle = `${typePrefix} ${row.name}`;

        // Fetch REAL house numbers and postal codes for this street from gar_houses table
        const realHouses = getRealGarHouses(db, row.objectid, houseDigitPrefix);
        const targetHouseItems = realHouses.length > 0 ? realHouses : (stdQuery.gar_object?.house_building ? [{ full_house_title: stdQuery.gar_object.house_building, postal_code: null }] : [{ full_house_title: null, postal_code: null }]);

        for (const hItem of targetHouseItems) {
          const hBuilding = hItem.full_house_title;
          const housePostal = hItem.postal_code;

          const garObj = createGarAddressRecord();
          garObj.country = "Российская Федерация";
          garObj.region = regName;
          garObj.locality = row.locality_name || (isFederalCity ? regName : null);
          garObj.municipal_district = formatMunicipalDistrict(row.district_name) || null;
          garObj.postal_code = housePostal || row.postal_code || null;

          if (row.level === 8) {
            garObj.street = itemTitle;
          } else if (row.level === 7) {
            garObj.planning_structure = itemTitle;
          } else if (row.level === 6 || row.level === 5) {
            if (!garObj.locality) garObj.locality = itemTitle;
          }

          if (hBuilding) garObj.house_building = hBuilding;
          if (stdQuery.gar_object?.room_flat) garObj.room_flat = stdQuery.gar_object.room_flat;

          let fullDisplay = formatGarAddressString(garObj);
          if (!isFederalCity && garObj.region && !fullDisplay.includes(garObj.region)) {
            const postPrefix = garObj.postal_code ? `${garObj.postal_code}, ` : '';
            fullDisplay = `${postPrefix}Российская Федерация, ${garObj.region}, ${garObj.municipal_district ? garObj.municipal_district + ', ' : ''}${garObj.locality ? garObj.locality + ', ' : ''}${itemTitle}${hBuilding ? `, ${hBuilding}` : ''}`;
          }

          // Calculate match score
          const lowerDisplay = fullDisplay.toLowerCase();
          let score = 0;
          rawTokens.forEach(t => {
            if (lowerDisplay.includes(t.toLowerCase())) score += 50;
          });

          // Priority bonuses
          if (row.region_code === '77') score += 90;
          if (row.region_code === '50') score += 80;
          if (row.region_code === '78') score += 70;
          if (row.region_code === '16') score += 60;

          if (contentTokens.every(t => lowerDisplay.includes(t.toLowerCase()))) {
            score += 200;
          }

          candidateList.push({
            value: fullDisplay,
            gar: garObj,
            score: score
          });
        }
      }
    } catch (err) {
      console.error("[SearchEngine] GAR SQLite Query Error:", err);
    }
  }

  // 3. Dynamic Standardization Engine fallback for any query
  if (stdQuery.formatted && stdQuery.formatted.trim().length > 0) {
    let score = 140;
    if (contentTokens.length > 0 && contentTokens.every(t => stdQuery.formatted.toLowerCase().includes(t.toLowerCase()))) {
      score = 300;
    }
    candidateList.push({
      value: stdQuery.formatted,
      gar: stdQuery.gar_object,
      score: score
    });
  }

  // Sort candidate suggestions by score DESC
  candidateList.sort((a, b) => b.score - a.score);

  const suggestions = [];
  for (const item of candidateList) {
    if (!seenValues.has(item.value)) {
      seenValues.add(item.value);
      suggestions.push({
        value: item.value,
        unrestricted_value: item.value,
        data: item.gar
      });
    }
    if (suggestions.length >= count) break;
  }

  return {
    suggestions
  };
}

/**
 * Searches official active companies by INN, OGRN, or Name
 */
function suggestParty(query, count = 10) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { suggestions: [] };
  }

  const q = query.trim().toLowerCase();

  const matched = companiesDatabase.filter(comp => {
    const innMatch = comp.inn.includes(q);
    const ogrnMatch = comp.ogrn.includes(q);
    const nameMatch = comp.name.toLowerCase().includes(q);
    const fullNameMatch = comp.full_name.toLowerCase().includes(q);
    const aliasMatch = comp.aliases ? comp.aliases.toLowerCase().includes(q) : false;
    return innMatch || ogrnMatch || nameMatch || fullNameMatch || aliasMatch;
  });

  return {
    suggestions: matched.slice(0, count).map(comp => ({
      value: `${comp.name} (ИНН ${comp.inn}, ОГРН ${comp.ogrn})`,
      unrestricted_value: comp.full_name,
      data: {
        inn: comp.inn,
        ogrn: comp.ogrn,
        name: comp.name,
        full_name: comp.full_name,
        address: comp.address,
        status: comp.status,
        okved: comp.okved,
        management: comp.management
      }
    }))
  };
}

/**
 * Searches official CBR BIK banks
 */
function suggestBank(query, count = 10) {
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return { suggestions: [] };
  }

  const q = query.trim().toLowerCase();

  const matched = banksDatabase.filter(bank => {
    const bikMatch = bank.bik.includes(q);
    const nameMatch = bank.name.toLowerCase().includes(q);
    const cityMatch = bank.city.toLowerCase().includes(q);
    return bikMatch || nameMatch || cityMatch;
  });

  return {
    suggestions: matched.slice(0, count).map(bank => ({
      value: `${bank.name} (БИК ${bank.bik})`,
      unrestricted_value: bank.name,
      data: {
        bik: bank.bik,
        name: bank.name,
        correspondent_account: bank.correspondent_account,
        city: bank.city,
        address: bank.address,
        swift: bank.swift
      }
    }))
  };
}

module.exports = {
  suggestAddress,
  suggestParty,
  suggestBank
};
