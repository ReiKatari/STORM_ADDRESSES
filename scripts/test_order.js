const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('e:/STORM ADDRESSES/data/gar_database.sqlite');

const sql = `
  SELECT name, typename, region_code, locality_name, district_name 
  FROM gar_objects 
  WHERE (name_lower LIKE '%тверская%' OR locality_name LIKE '%тверская%' OR district_name LIKE '%тверская%' OR full_title LIKE '%тверская%')
    AND (name_lower LIKE '%игли%' OR locality_name LIKE '%игли%' OR district_name LIKE '%игли%' OR full_title LIKE '%игли%')
`;

const rows = db.prepare(sql).all();
console.log('Order-Independent Query Results for "Тверская Игли":', rows);
