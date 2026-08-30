/**
 * REST API Server for DaData Self-Hosted Clone
 * Supports multi-format batch standardization (XLSX, XLS, CSV, TXT, JSON) with export downloads,
 * order-independent autocomplete suggestions, and full 10-level GAR MINSTROY breakdown.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const XLSX = require('xlsx');

const { standardizeAddress } = require('./standardizer');
const { GAR_FIELDS, formatGarAddressString } = require('./gar_schema');
const { suggestAddress, suggestParty, suggestBank } = require('./search_engine');
const { addressDatabase, companiesDatabase, banksDatabase } = require('./db');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const PORT = process.env.PORT || process.argv[2] || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// API Metadata & Schema
app.get('/api/v1/gar/fields', (req, res) => {
  res.json({
    description: "Rules of Russian Address Structure according to Government Decree No. 1221 & Minstroy",
    fields: GAR_FIELDS
  });
});

// API System Stats
app.get('/api/v1/stats', (req, res) => {
  let garMeta = null;
  const metaPath = path.resolve(__dirname, '../data/gar_import_meta.json');
  if (require('fs').existsSync(metaPath)) {
    try {
      garMeta = JSON.parse(require('fs').readFileSync(metaPath, 'utf-8'));
    } catch (e) {}
  }

  res.json({
    status: "online",
    gar_schema_version: "2026.1 (Decree No. 1221)",
    loaded_records: {
      addresses: addressDatabase.length,
      companies: companiesDatabase.length,
      banks: banksDatabase.length
    },
    gar_full_database: garMeta,
    uptime: process.uptime()
  });
});

// Address Standardization (Clean) API - Handles both arrays and objects
app.post('/api/v1/clean/address', (req, res) => {
  try {
    let body = req.body;

    if (Array.isArray(body)) {
      const results = body.map(q => standardizeAddress(typeof q === 'string' ? q : String(q)));
      return res.json(results);
    }

    if (body && typeof body === 'object') {
      const q = body.query || body.address || body.q;

      if (Array.isArray(q)) {
        const results = q.map(item => standardizeAddress(String(item)));
        return res.json(results);
      }

      if (q !== undefined && q !== null) {
        const result = standardizeAddress(String(q));
        return res.json(result);
      }
    }

    return res.json(standardizeAddress("г. Москва"));
  } catch (err) {
    console.error("[Clean API Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Batch File Standardization & File Export API (Supports XLSX, XLS, CSV, TXT, JSON)
app.post('/api/v1/clean/file', upload.single('file'), (req, res) => {
  try {
    let addresses = [];

    if (req.file) {
      const filename = req.file.originalname.toLowerCase();
      const buffer = req.file.buffer;

      if (filename.endsWith('.json')) {
        const text = buffer.toString('utf8');
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          addresses = parsed.map(item => typeof item === 'string' ? item : (item.address || item.raw || item.query || JSON.stringify(item)));
        } else if (parsed.addresses && Array.isArray(parsed.addresses)) {
          addresses = parsed.addresses;
        }
      } else if (filename.endsWith('.txt')) {
        const text = buffer.toString('utf8');
        addresses = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      } else {
        // XLSX, XLS, CSV via XLSX library
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        for (const row of jsonRows) {
          if (Array.isArray(row) && row.length > 0) {
            const cell = row[0];
            if (cell !== undefined && cell !== null && String(cell).trim().length > 0) {
              const strCell = String(cell).trim();
              if (!/^адрес|address|исходный/i.test(strCell)) {
                addresses.push(strCell);
              }
            }
          }
        }
      }
    } else if (req.body && req.body.addresses && Array.isArray(req.body.addresses)) {
      addresses = req.body.addresses;
    }

    if (addresses.length === 0) {
      return res.status(400).json({ error: "В загруженном файле не найдено адресов для обработки." });
    }

    const processedResults = addresses.map(raw => {
      const std = standardizeAddress(raw);
      const gar = std.gar_object || {};
      return {
        raw_address: raw,
        formatted_gar: std.formatted || "",
        postal_code: gar.postal_code || "",
        region: gar.region || "",
        municipal_district: gar.municipal_district || "",
        locality: gar.locality || "",
        street: gar.street || "",
        house_building: gar.house_building || "",
        room_flat: gar.room_flat || "",
        confidence: `${Math.round((std.confidence || 0.8) * 100)}%`
      };
    });

    const exportFormat = (req.query.format || req.body?.format || 'json').toLowerCase();

    if (exportFormat === 'xlsx' || exportFormat === 'excel') {
      const exportData = processedResults.map(r => ({
        "Исходный адрес": r.raw_address,
        "Стандартизованный адрес ГАР": r.formatted_gar,
        "Индекс": r.postal_code,
        "Субъект РФ": r.region,
        "Мун. район/округ": r.municipal_district,
        "Населённый пункт": r.locality,
        "Улица": r.street,
        "Дом": r.house_building,
        "Помещение": r.room_flat,
        "Точность (%)": r.confidence
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(wb, ws, "Стандартизованные адреса");
      const outBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename="storm_addresses_standardized.xlsx"');
      return res.send(outBuffer);
    }

    if (exportFormat === 'csv') {
      let csv = "Исходный адрес;Стандартизованный адрес ГАР;Индекс;Субъект РФ;Мун. район/округ;Населённый пункт;Улица;Дом;Помещение;Точность (%)\n";
      processedResults.forEach(r => {
        csv += `"${r.raw_address}";"${r.formatted_gar}";"${r.postal_code}";"${r.region}";"${r.municipal_district}";"${r.locality}";"${r.street}";"${r.house_building}";"${r.room_flat}";"${r.confidence}"\n`;
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="storm_addresses_standardized.csv"');
      return res.send(Buffer.from('\uFEFF' + csv, 'utf8'));
    }

    return res.json({
      total_processed: processedResults.length,
      results: processedResults
    });
  } catch (err) {
    console.error("[Batch Clean File API Error]", err);
    res.status(500).json({ error: "Ошибка обработки файла: " + err.message });
  }
});

// Address Suggestion (Autocomplete) API
app.post('/api/v1/suggest/address', (req, res) => {
  try {
    const query = req.body?.query || req.body?.address || req.body?.q || "";
    const count = req.body?.count || 10;
    const suggestions = suggestAddress(String(query), count);
    res.json(suggestions);
  } catch (err) {
    console.error("[Suggest Address API Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// DaData Compatible Alias: /suggestions/api/4_1/rs/suggest/address
app.post('/suggestions/api/4_1/rs/suggest/address', (req, res) => {
  try {
    const query = req.body?.query || req.body?.q || "";
    const count = req.body?.count || 10;
    const suggestions = suggestAddress(String(query), count);
    res.json(suggestions);
  } catch (err) {
    console.error("[DaData Suggest API Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Company Suggestion API
app.post('/api/v1/suggest/party', (req, res) => {
  try {
    const query = req.body?.query || req.body?.q || "";
    const count = req.body?.count || 10;
    const suggestions = suggestParty(String(query), count);
    res.json(suggestions);
  } catch (err) {
    console.error("[Suggest Party API Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Bank Suggestion API
app.post('/api/v1/suggest/bank', (req, res) => {
  try {
    const query = req.body?.query || req.body?.q || "";
    const count = req.body?.count || 10;
    const suggestions = suggestBank(String(query), count);
    res.json(suggestions);
  } catch (err) {
    console.error("[Suggest Bank API Error]", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 STORM ADDRESSES Enterprise Server running on http://localhost:${PORT}`);
  console.log(`  - Web Interface: http://localhost:${PORT}`);
  console.log(`  - Clean API:     POST http://localhost:${PORT}/api/v1/clean/address`);
  console.log(`  - File Clean:    POST http://localhost:${PORT}/api/v1/clean/file`);
  console.log(`  - Suggest API:   POST http://localhost:${PORT}/api/v1/suggest/address`);
  console.log(`==================================================`);
});
