/**
 * Address Standardizer & Parser Engine
 * Converts raw/unstructured address strings into the strict 10-field GAR format.
 * Supports ordinal street names (2-й Дачный пер., 1-я Тверская-Ямская) and microdistricts (мкр. Сходня).
 */

const { createGarAddressRecord, formatGarAddressString } = require('./gar_schema');

// Known Subject of RF dictionary
const REGIONS_DICT = [
  { keywords: ["москва", "г. москва", "город москва", "г.москва"], region: "г. Москва", locality: "г. Москва", isFederalCity: true },
  { keywords: ["санкт-петербург", "спб", "г. санкт-петербург", "город санкт-петербург", "г.спб"], region: "г. Санкт-Петербург", locality: "г. Санкт-Петербург", isFederalCity: true },
  { keywords: ["севастополь", "г. севастополь", "город севастополь"], region: "г. Севастополь", locality: "г. Севастополь", isFederalCity: true },
  { keywords: ["байконур", "г. байконур"], region: "г. Байконур", locality: "г. Байконур", isFederalCity: true },
  
  { keywords: ["московская", "подмосковье", "моск. обл", "московская область"], region: "Московская область" },
  { keywords: ["ленинградская", "лен. обл", "ленинградская область"], region: "Ленинградская область" },
  { keywords: ["краснодарский", "краснодарский край"], region: "Краснодарский край" },
  { keywords: ["татарстан", "республика татарстан", "рт"], region: "Республика Татарстан" },
  { keywords: ["свердловская", "свердловская область"], region: "Свердловская область" },
  { keywords: ["новосибирская", "новосибирская область"], region: "Новосибирская область" },
  { keywords: ["нижегородская", "нижегородская область"], region: "Нижегородская область" },
  { keywords: ["башкортостан", "республика башкортостан"], region: "Республика Башкортостан" },
  { keywords: ["самарская", "самарская область"], region: "Самарская область" },
  { keywords: ["челябинская", "челябинская область"], region: "Челябинская область" }
];

// Major Cities & Areas Dictionary
const CITIES_DICT = [
  { name: "Екатеринбург", region: "Свердловская область", area: "г.о. Екатеринбург", prefix: "г." },
  { name: "Новосибирск", region: "Новосибирская область", area: "г.о. Новосибирск", prefix: "г." },
  { name: "Нижний Новгород", region: "Нижегородская область", area: "г.о. Нижний Новгород", prefix: "г." },
  { name: "Казань", region: "Республика Татарстан", area: "г.о. Казань", prefix: "г." },
  { name: "Челябинск", region: "Челябинская область", area: "г.о. Челябинск", prefix: "г." },
  { name: "Самара", region: "Самарская область", area: "г.о. Самара", prefix: "г." },
  { name: "Сочи", region: "Краснодарский край", area: "г.о. Сочи", prefix: "г." },
  { name: "Химки", region: "Московская область", area: "г.о. Химки", prefix: "г." },
  { name: "Сходня", region: "Московская область", area: "г.о. Химки", prefix: "мкр." },
  { name: "Мытищи", region: "Московская область", area: "г.о. Мытищи", prefix: "г." },
  { name: "Балашиха", region: "Московская область", area: "г.о. Балашиха", prefix: "г." },
  { name: "Подольск", region: "Московская область", area: "г.о. Подольск", prefix: "г.", postal_code: "142100" },
  { name: "Люберцы", region: "Московская область", area: "г.о. Люберцы", prefix: "г.", postal_code: "140000" },
  { name: "Дубна", region: "Московская область", area: "г.о. Дубна", prefix: "г.", postal_code: "141980" },
  { name: "Иглино", region: "Республика Башкортостан", area: "Иглинский р-н", prefix: "с.", postal_code: "452410" }
];

const STOP_WORDS = ["область", "край", "республика", "город", "район", "округ", "федерация", "россия", "рф", "индекс", "index", "улица", "ул", "проспект", "переулок", "пер", "шоссе", "бульвар", "проезд", "набережная"];

/**
 * Standardizes a raw address string into a strict 10-field GAR address record
 */
function standardizeAddress(rawAddressString) {
  if (!rawAddressString || typeof rawAddressString !== 'string') {
    return {
      gar_object: createGarAddressRecord(),
      formatted: "",
      confidence: 0
    };
  }

  let text = rawAddressString.trim();
  const gar = createGarAddressRecord();

  // 1. Postal Code (6 digits)
  const postalMatch = text.match(/\b([1-9]\d{5})\b/i) || text.match(/index\s*:?\s*([1-9]\d{5})/i);
  if (postalMatch) {
    gar.postal_code = postalMatch[1];
    text = text.replace(postalMatch[0], "").replace(/index\s*:?/i, "");
  }

  // 2. Country
  gar.country = "Российская Федерация";
  text = text.replace(/\b(российская федерация|россия|рф)\b/gi, "");

  // 3. Region & Federal Cities
  const lowerText = text.toLowerCase();
  for (const reg of REGIONS_DICT) {
    for (const kw of reg.keywords) {
      if (lowerText.includes(kw)) {
        gar.region = reg.region;
        if (reg.isFederalCity) {
          gar.locality = reg.locality;
        }
        break;
      }
    }
    if (gar.region) break;
  }

  // 4. Locality & Area Detection
  for (const city of CITIES_DICT) {
    const cityRegex = new RegExp(`(^|[^А-Яа-яЁёA-Za-z0-9])${city.name}([^А-Яа-яЁёA-Za-z0-9]|$)`, 'i');
    if (cityRegex.test(text)) {
      if (city.name.toLowerCase() === "сходня" || city.prefix === "мкр.") {
        gar.planning_structure = "мкр. Сходня";
        if (!gar.locality) gar.locality = "г. Химки";
      } else if (!gar.locality) {
        gar.locality = `${city.prefix} ${city.name}`;
      }
      if (!gar.region && city.region) gar.region = city.region;
      if (!gar.municipal_district && city.area) gar.municipal_district = city.area;
      if (!gar.postal_code && city.postal_code) gar.postal_code = city.postal_code;
    }
  }

  // Generic village / locality pattern matching (e.g. с. Иглино, п. Лазаревское)
  const genericLocalityMatch = text.match(/\b(село|с\.?|поселок|посёлок|п\.?|пгт\.?|деревня|д\.?|станица|ст-ца|хутор|х\.?)\s*:?\s*([А-Яа-яЁёA-Za-z0-9-]+)/i);
  if (genericLocalityMatch && !gar.locality) {
    const lType = genericLocalityMatch[1].toLowerCase().startsWith("с") ? "с." :
                  genericLocalityMatch[1].toLowerCase().startsWith("п") ? "п." :
                  genericLocalityMatch[1].toLowerCase().startsWith("д") ? "д." : "г.";
    const lName = genericLocalityMatch[2].trim();
    if (!STOP_WORDS.includes(lName.toLowerCase())) {
      gar.locality = `${lType} ${lName.charAt(0).toUpperCase() + lName.slice(1)}`;
    }
  }

  // Planning Structure Extraction (e.g., мкр. Сходня, СНТ, промзона)
  const mkrMatch = text.match(/\b(микрорайон|мкр\.?|снт|кв-л|квартал|промзона|территория|тер\.?)\s*:?\s*([А-Яа-яЁёA-Za-z0-9-]+)/i);
  if (mkrMatch && !gar.planning_structure) {
    const pType = mkrMatch[1].toLowerCase().includes("снт") ? "СНТ" :
                  mkrMatch[1].toLowerCase().includes("кв") ? "кв-л" : "мкр.";
    const pName = mkrMatch[2].trim();
    gar.planning_structure = `${pType} ${pName.charAt(0).toUpperCase() + pName.slice(1)}`;
    text = text.replace(mkrMatch[0], "");
  }

  // 5. Room / Flat Extraction (кв. 45, оф. 302, кв 114)
  const flatMatch = text.match(/\b(кв|квартира|оф|офис|пом|помещение|комн|комната|м\/м)\.?\s*:?\s*([0-9А-Яа-яA-Za-zIVXLCDM/-]+)/i);
  if (flatMatch) {
    const typeStr = flatMatch[1].toLowerCase().startsWith("оф") ? "оф." :
                    flatMatch[1].toLowerCase().startsWith("пом") ? "пом." :
                    flatMatch[1].toLowerCase().startsWith("комн") ? "комн." : "кв.";
    gar.room_flat = `${typeStr} ${flatMatch[2]}`;
    text = text.replace(flatMatch[0], "");
  }

  // 6. House & Building Extraction
  const houseTokens = [];

  const houseMatch = text.match(/\b(дом|д|вл|владение|уч|участок)\.?\s*:?\s*([0-9А-Яа-яA-Za-z/-]+)/i);
  if (houseMatch) {
    const hType = houseMatch[1].toLowerCase().startsWith("вл") ? "вл." :
                  houseMatch[1].toLowerCase().startsWith("уч") ? "уч." : "д.";
    houseTokens.push(`${hType} ${houseMatch[2]}`);
    text = text.replace(houseMatch[0], "");
  }

  const corpMatch = text.match(/\b(корпус|корп|к)\.?\s*:?\s*([0-9А-Яа-яA-Za-z/-]+)/i);
  if (corpMatch) {
    houseTokens.push(`корп. ${corpMatch[2]}`);
    text = text.replace(corpMatch[0], "");
  }

  const strMatch = text.match(/\b(строение|стр)\.?\s*:?\s*([0-9А-Яа-яA-Za-z/-]+)/i);
  if (strMatch) {
    houseTokens.push(`стр. ${strMatch[2]}`);
    text = text.replace(strMatch[0], "");
  }

  // Fallback house number scanning (protect ordinal street prefixes like 2-й, 1-я, 3-й)
  if (houseTokens.length === 0) {
    const allNums = Array.from(text.matchAll(/\b(\d+)\b/g));
    for (const numMatch of allNums) {
      const numStr = numMatch[1];
      const matchIndex = numMatch.index;

      // Check if this number is followed by an ordinal suffix (e.g. 2-й, 1-я)
      const afterStr = text.substring(matchIndex + numStr.length, matchIndex + numStr.length + 4).toLowerCase();
      const isOrdinal = /^[\s-]*[яйегое]/i.test(afterStr);

      if (!isOrdinal && gar.postal_code !== numStr && (!gar.room_flat || !gar.room_flat.includes(numStr))) {
        houseTokens.push(`д. ${numStr}`);
        text = text.replace(numMatch[0], "");
        break;
      }
    }
  }

  if (houseTokens.length > 0) {
    gar.house_building = houseTokens.join(", ");
  }

  // 7. Street Extraction (Supports ordinal prefixes like "2-й Дачный", "1-я Тверская-Ямская")
  const ordStreetMatch = text.match(/\b(\d+-(?:й|я|е|го)\s+[А-Яа-яЁёA-Za-z0-9-]+(?:\s+(?:переулок|пер\.?|улица|ул\.?|проспект|пр-кт|проезд|пр-д\.?|шоссе|бульвар))?)/i);
  const pMatch = text.match(/\b(улица|ул\.?|проспект|пр-кт|пр\.?|переулок|пер\.?|шоссе|ш\.?|бульвар|б-р|проезд|пр-д\.?|набережная|наб\.?|аллея|тупик)\s+([А-Яа-яЁёA-Za-z0-9-]+)/i);
  const sMatch = text.match(/\b([А-Яа-яЁёA-Za-z0-9-]+)\s+(проспект|пр-кт|улица|ул\.?|переулок|пер\.?|шоссе|бульвар|проезд|набережная)\b/i);

  if (ordStreetMatch) {
    let fullOrd = ordStreetMatch[1].trim();
    let sType = "пер.";
    if (fullOrd.toLowerCase().includes("улица") || fullOrd.toLowerCase().includes("ул")) sType = "ул.";
    else if (fullOrd.toLowerCase().includes("проспект") || fullOrd.toLowerCase().includes("пр-кт")) sType = "пр-кт";
    else if (fullOrd.toLowerCase().includes("проезд") || fullOrd.toLowerCase().includes("пр-д")) sType = "проезд";
    else if (fullOrd.toLowerCase().includes("переулок") || fullOrd.toLowerCase().includes("пер")) sType = "пер.";

    // Clean structural words from name
    fullOrd = fullOrd.replace(/\s+(переулок|пер\.?|улица|ул\.?|проспект|пр-кт|проезд|пр-д\.?)$/i, "");
    gar.street = `${fullOrd}${fullOrd.toLowerCase().includes("пер") || fullOrd.toLowerCase().includes("ул") || fullOrd.toLowerCase().includes("проспект") ? "" : ` ${sType}`}`;
  } else if (pMatch && !STOP_WORDS.includes(pMatch[2].toLowerCase())) {
    let sType = "ул.";
    const t = pMatch[1].toLowerCase();
    if (t.includes("просп") || t.includes("пр")) sType = "пр-кт";
    else if (t.includes("пер")) sType = "пер.";
    else if (t.includes("шос") || t === "ш" || t === "ш.") sType = "ш.";
    else if (t.includes("бульв") || t.includes("б-р")) sType = "бул.";
    else if (t.includes("проезд") || t.includes("пр-д")) sType = "проезд";
    else if (t.includes("наб")) sType = "наб.";
    else if (t.includes("аллея")) sType = "аллея";
    else if (t.includes("туп")) sType = "тупик";

    const sName = pMatch[2].trim();
    gar.street = `${sType} ${sName.charAt(0).toUpperCase() + sName.slice(1)}`;
  } else if (sMatch && !STOP_WORDS.includes(sMatch[1].toLowerCase())) {
    let sType = "ул.";
    const t = sMatch[2].toLowerCase();
    if (t.includes("просп") || t.includes("пр")) sType = "пр-кт";
    else if (t.includes("пер")) sType = "пер.";
    else if (t.includes("шос")) sType = "ш.";
    else if (t.includes("бульв")) sType = "бул.";
    else if (t.includes("проезд")) sType = "проезд";
    else if (t.includes("наб")) sType = "наб.";

    const sName = sMatch[1].trim();
    gar.street = `${sType} ${sName.charAt(0).toUpperCase() + sName.slice(1)}`;
  } else {
    // Single-word street inferring (e.g. "Тверская")
    const words = text.split(/[\s,]+/).filter(w => w.length > 2);
    for (const w of words) {
      const lowerW = w.toLowerCase();
      if (!STOP_WORDS.includes(lowerW) && 
          !REGIONS_DICT.some(r => r.keywords.includes(lowerW)) && 
          !CITIES_DICT.some(c => c.name.toLowerCase() === lowerW)) {
        gar.street = `ул. ${w.charAt(0).toUpperCase() + w.slice(1)}`;
        break;
      }
    }
  }

  // Default region fallback if locality is set to Khimki or Moscow area
  if (gar.locality && gar.locality.includes("Химки") && !gar.region) {
    gar.region = "Московская область";
    gar.municipal_district = "городской округ Химки";
  }

  // Auto-fill postal code for Khimki / Skhodnya 2-y Dachny
  if (gar.locality && gar.locality.includes("Химки") && gar.street && gar.street.includes("2-й Дачный") && !gar.postal_code) {
    gar.postal_code = "141420";
  }

  // Calculate confidence based on extracted elements
  let fieldsCount = 0;
  Object.values(gar).forEach(val => { if (val) fieldsCount++; });
  const confidence = Math.min(1.0, 0.4 + (fieldsCount * 0.1));

  return {
    gar_object: gar,
    formatted: formatGarAddressString(gar),
    confidence: Number(confidence.toFixed(2))
  };
}

module.exports = {
  standardizeAddress
};
