/**
 * Official FNS GAR Schema Definition Module (Minstroy RF Decree No. 1221)
 * Defines the strict 10-level hierarchy for address breakdown in the Russian Federation.
 */

const GAR_FIELDS = [
  {
    num: 1,
    id: "postal_code",
    name: "Индекс",
    description: "Почтовый индекс (6 цифр)",
    example: "125009"
  },
  {
    num: 2,
    id: "country",
    name: "Наименование страны",
    description: "Название государства",
    example: "Российская Федерация"
  },
  {
    num: 3,
    id: "region",
    name: "Наименование субъекта РФ",
    description: "Республика, край, область, город федерального значения",
    example: "г. Москва"
  },
  {
    num: 4,
    id: "municipal_district",
    name: "Наименование мун. района/округа",
    description: "Муниципальный район, городской округ, муниципальный округ или внутригородская территория",
    example: "г.о. Химки"
  },
  {
    num: 5,
    id: "settlement_level",
    name: "Наименование мун. поселения",
    description: "Городское или сельское поселение",
    example: "г.п. Сходня"
  },
  {
    num: 6,
    id: "locality",
    name: "Наименование населённого пункта",
    description: "Город, посёлок, село, деревня, станица, хутор",
    example: "г. Химки"
  },
  {
    num: 7,
    id: "planning_structure",
    name: "Планировочная структура",
    description: "Микрорайон, СНТ, промышленная зона, квартал, территория",
    example: "мкр. Сходня"
  },
  {
    num: 8,
    id: "street",
    name: "Наименование элемента улично-дорожной сети",
    description: "Улица, проспект, переулок, шоссе, бульвар, проезд, набережная",
    example: "2-й Дачный пер."
  },
  {
    num: 9,
    id: "house_building",
    name: "Наименование объекта адресации и его номер",
    description: "Дом, владение, корпус, строение, земельный участок",
    example: "д. 10"
  },
  {
    num: 10,
    id: "room_flat",
    name: "Тип и номер помещения",
    description: "Квартира, офис, помещение, комната, машино-место",
    example: "кв. 45"
  }
];

/**
 * Formats municipal district strings using official Minstroy abbreviations
 * e.g. "городской округ Химки" -> "г.о. Химки"
 */
function formatMunicipalDistrict(districtStr) {
  if (!districtStr) return null;
  let str = String(districtStr).trim();
  str = str.replace(/\bгородской\s+округ\b/gi, 'г.о.');
  str = str.replace(/\bмуниципальный\s+район\b/gi, 'м. р-н');
  str = str.replace(/\bмуниципальный\s+округ\b/gi, 'м.о.');
  str = str.replace(/\bвнутригородская\s+территория\b/gi, 'вн.тер.г.');
  str = str.replace(/\bгородское\s+поселение\b/gi, 'г.п.');
  str = str.replace(/\bсельское\s+поселение\b/gi, 'с.п.');
  str = str.replace(/\s+/g, ' ').trim();
  return str;
}

/**
 * Creates a clean 10-field GAR address record object
 */
function createGarAddressRecord(data = {}) {
  return {
    postal_code: data.postal_code || null,
    country: data.country || "Российская Федерация",
    region: data.region || null,
    municipal_district: formatMunicipalDistrict(data.municipal_district) || null,
    settlement_level: data.settlement_level || null,
    locality: data.locality || null,
    planning_structure: data.planning_structure || null,
    street: data.street || null,
    house_building: data.house_building || null,
    room_flat: data.room_flat || null
  };
}

/**
 * Helper to check if region and locality represent the same city/federal subject
 */
function isSameRegionAndLocality(region, locality) {
  if (!region || !locality) return false;
  const normalize = str => String(str).toLowerCase().replace(/^(г\.|город|г\.ф\.з\.)\s*/i, '').trim();
  return normalize(region) === normalize(locality);
}

/**
 * Formats a GAR address object into a single standardized string
 * formatted strictly in order of components 1 through 10.
 * Rule: If Subject of RF (region) matches locality (e.g. г. Москва), region is omitted to avoid duplication.
 */
function formatGarAddressString(garObject) {
  let displayRegion = garObject.region;
  let displayLocality = garObject.locality;

  if (isSameRegionAndLocality(garObject.region, garObject.locality)) {
    // If region and locality are the same (e.g. "г. Москва" & "г. Москва"),
    // display it only once in locality position
    displayRegion = null;
  }

  const formattedDistrict = formatMunicipalDistrict(garObject.municipal_district);

  const fieldsOrder = [
    garObject.postal_code,
    garObject.country || "Российская Федерация",
    displayRegion,
    formattedDistrict,
    garObject.settlement_level,
    displayLocality,
    garObject.planning_structure,
    garObject.street,
    garObject.house_building,
    garObject.room_flat
  ];

  return fieldsOrder.filter(val => val !== null && val !== undefined && String(val).trim() !== "").join(", ");
}

module.exports = {
  GAR_FIELDS,
  createGarAddressRecord,
  formatGarAddressString,
  formatMunicipalDistrict,
  isSameRegionAndLocality
};
