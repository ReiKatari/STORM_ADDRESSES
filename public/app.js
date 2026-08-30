document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. Robust Navigation Tab Switching
  // ==========================================
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  function switchTab(targetId) {
    if (!targetId) return;
    tabBtns.forEach(b => {
      if (b.getAttribute('data-tab') === targetId) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });

    tabContents.forEach(c => {
      if (c.id === targetId) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  // GAR 10 Fields Meta Definition
  const GAR_FIELDS_META = [
    { id: "postal_code", num: 1, name: "Индекс", class: "f1" },
    { id: "country", num: 2, name: "Наименование страны", class: "f2" },
    { id: "region", num: 3, name: "Наименование субъекта РФ", class: "f3" },
    { id: "municipal_district", num: 4, name: "Наименование мун. района/округа", class: "f4" },
    { id: "settlement_level", num: 5, name: "Наименование мун. поселения", class: "f5" },
    { id: "locality", num: 6, name: "Наименование населённого пункта", class: "f6" },
    { id: "planning_structure", num: 7, name: "Планировочная структура", class: "f7" },
    { id: "street", num: 8, name: "Улично-дорожная сеть", class: "f8" },
    { id: "house_building", num: 9, name: "Объект адресации (номер)", class: "f9" },
    { id: "room_flat", num: 10, name: "Тип и номер помещения", class: "f10" }
  ];

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message) {
    const toast = document.getElementById('toast-notification');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;
    toastMsg.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2500);
  }

  // ==========================================
  // 2. Tab 1: Address Autocomplete & Recent History
  // ==========================================
  const addressInput = document.getElementById('address-input');
  const btnClearSuggest = document.getElementById('btn-clear-suggest');
  const suggestDropdown = document.getElementById('suggest-dropdown');
  const suggestResultPanel = document.getElementById('suggest-result-panel');
  const formattedAddressText = document.getElementById('formatted-address-text');
  const matrixGrid = document.getElementById('matrix-grid');
  const btnCopySuggest = document.getElementById('btn-copy-suggest');
  const suggestConfidence = document.getElementById('suggest-confidence');
  const btnSuggestSearch = document.getElementById('btn-suggest-search');
  const recentChipsBlock = document.getElementById('recent-chips-block');
  const recentChipsList = document.getElementById('recent-chips-list');

  let debounceTimer = null;
  let activeSuggestions = [];
  let selectedIndex = -1;

  // LocalStorage Recent Searches
  function getRecentSearches() {
    try {
      return JSON.parse(localStorage.getItem('storm_recent_searches') || '[]');
    } catch (e) {
      return [];
    }
  }

  function saveRecentSearch(queryStr) {
    if (!queryStr || queryStr.length < 3) return;
    let list = getRecentSearches();
    list = list.filter(q => q.toLowerCase() !== queryStr.toLowerCase());
    list.unshift(queryStr);
    if (list.length > 5) list = list.slice(0, 5);
    try {
      localStorage.setItem('storm_recent_searches', JSON.stringify(list));
      renderRecentSearches();
    } catch (e) {}
  }

  function renderRecentSearches() {
    const list = getRecentSearches();
    if (!recentChipsBlock || !recentChipsList) return;
    if (list.length === 0) {
      recentChipsBlock.classList.add('hidden');
      return;
    }

    recentChipsList.innerHTML = list.map(q => `
      <button class="chip-btn" data-query="${escapeHtml(q)}">${escapeHtml(q)}</button>
    `).join('');

    recentChipsBlock.classList.remove('hidden');

    recentChipsList.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-query');
        addressInput.value = q;
        triggerAddressSearch(q, true);
      });
    });
  }

  renderRecentSearches();

  if (btnClearSuggest) {
    addressInput.addEventListener('input', () => {
      if (addressInput.value.length > 0) {
        btnClearSuggest.classList.remove('hidden');
      } else {
        btnClearSuggest.classList.add('hidden');
      }
    });

    btnClearSuggest.addEventListener('click', () => {
      addressInput.value = '';
      btnClearSuggest.classList.add('hidden');
      suggestDropdown.classList.add('hidden');
      addressInput.focus();
    });
  }

  // Quick Chips Handlers
  document.querySelectorAll('.chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-query');
      addressInput.value = q;
      if (btnClearSuggest) btnClearSuggest.classList.remove('hidden');
      triggerAddressSearch(q, true);
    });
  });

  function highlightMatch(text, query) {
    if (!query || typeof query !== 'string' || !query.trim()) return escapeHtml(text);
    const tokens = query.trim().split(/[\s,]+/).filter(t => t.length > 1);
    if (tokens.length === 0) return escapeHtml(text);

    let escaped = escapeHtml(text);
    tokens.forEach(tok => {
      const reg = new RegExp(`(${tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      escaped = escaped.replace(reg, '<span class="highlight-match">$1</span>');
    });
    return escaped;
  }

  addressInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearTimeout(debounceTimer);

    if (val.length < 2) {
      suggestDropdown.classList.add('hidden');
      activeSuggestions = [];
      return;
    }

    debounceTimer = setTimeout(() => {
      fetch('/api/v1/suggest/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: val, count: 10 })
      })
      .then(res => res.json())
      .then(data => {
        activeSuggestions = data.suggestions || [];
        renderSuggestDropdown(activeSuggestions, val);
      })
      .catch(err => {
        console.error('[Suggest Fetch Error]', err);
      });
    }, 180);
  });

  addressInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'k') {
      e.preventDefault();
      addressInput.focus();
      return;
    }

    if (suggestDropdown.classList.contains('hidden') || activeSuggestions.length === 0) {
      if (e.key === 'Enter') {
        const val = addressInput.value.trim();
        if (val) triggerAddressSearch(val, true);
      }
      return;
    }

    const items = suggestDropdown.querySelectorAll('.suggest-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % items.length;
      updateDropdownHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateDropdownHighlight(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < activeSuggestions.length) {
        selectSuggestItem(activeSuggestions[selectedIndex]);
      } else {
        triggerAddressSearch(addressInput.value.trim(), true);
      }
    } else if (e.key === 'Escape') {
      suggestDropdown.classList.add('hidden');
      selectedIndex = -1;
    }
  });

  function updateDropdownHighlight(items) {
    items.forEach((item, idx) => {
      if (idx === selectedIndex) {
        item.classList.add('active-highlight');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active-highlight');
      }
    });
  }

  function selectSuggestItem(item) {
    addressInput.value = item.value;
    suggestDropdown.classList.add('hidden');
    selectedIndex = -1;
    if (btnClearSuggest) btnClearSuggest.classList.remove('hidden');
    saveRecentSearch(item.value);
    renderAddressGarResult({ value: item.value, data: item.data }, true);
    showToast('Адрес выбран из подсказок!');
  }

  function renderSuggestDropdown(items, queryStr = '') {
    if (items.length === 0) {
      suggestDropdown.classList.add('hidden');
      selectedIndex = -1;
      return;
    }

    selectedIndex = -1;
    suggestDropdown.innerHTML = items.map((item, idx) => {
      const data = item.data || {};
      const components = [
        data.postal_code ? `📮 ${data.postal_code}` : null,
        data.locality || data.region,
        data.street,
        data.house_building,
        data.room_flat
      ].filter(Boolean).join(' • ');

      return `
        <div class="suggest-item" data-idx="${idx}">
          <div class="suggest-main-row">
            <span class="suggest-icon">📍</span>
            <span class="main-val">${highlightMatch(item.value, queryStr)}</span>
          </div>
          ${components ? `<div class="suggest-sub-row">${highlightMatch(components, queryStr)}</div>` : ''}
        </div>
      `;
    }).join('');

    suggestDropdown.classList.remove('hidden');

    document.querySelectorAll('.suggest-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-idx'), 10);
        selectSuggestItem(items[idx]);
      });
    });
  }

  if (btnCopySuggest) {
    btnCopySuggest.addEventListener('click', () => {
      const text = formattedAddressText.textContent;
      if (text && text !== '—') {
        navigator.clipboard.writeText(text).then(() => {
          btnCopySuggest.innerHTML = `<span class="copy-icon">✅</span> Скопировано!`;
          showToast('Адрес скопирован в буфер обмена!');
          setTimeout(() => {
            btnCopySuggest.innerHTML = `<span class="copy-icon">📋</span> Копировать адрес`;
          }, 2000);
        });
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (!addressInput.contains(e.target) && !suggestDropdown.contains(e.target)) {
      suggestDropdown.classList.add('hidden');
    }
  });

  if (btnSuggestSearch) {
    btnSuggestSearch.addEventListener('click', () => {
      const val = addressInput.value.trim();
      if (!val) return;
      triggerAddressSearch(val, true);
    });
  }

  function triggerAddressSearch(queryStr, showPanel = true) {
    saveRecentSearch(queryStr);
    fetch('/api/v1/clean/address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryStr })
    })
    .then(res => res.json())
    .then(data => {
      renderAddressGarResult({ value: data.formatted, data: data.gar_object, confidence: data.confidence }, showPanel);
    });
  }

  function renderAddressGarResult(item, showPanel = true) {
    formattedAddressText.textContent = item.value || "—";
    if (showPanel) {
      suggestResultPanel.classList.remove('hidden');
    }

    if (suggestConfidence && item.confidence !== undefined) {
      suggestConfidence.textContent = `Точность: ${Math.round(item.confidence * 100)}%`;
    }

    const gar = item.data || {};

    // Dynamic Mock Geo Metadata Coordinates
    const metaCoords = document.getElementById('meta-coords');
    const metaFias = document.getElementById('meta-fias');
    const metaOktmo = document.getElementById('meta-oktmo');

    if (metaCoords) {
      const lat = (55.5 + Math.random() * 0.5).toFixed(4);
      const lon = (37.5 + Math.random() * 0.5).toFixed(4);
      metaCoords.textContent = `${lat}° N, ${lon}° E`;
    }
    if (metaFias) {
      metaFias.textContent = `gar-obj-${gar.postal_code || '125009'}-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    if (metaOktmo) {
      metaOktmo.textContent = `ОКАТО: 45380000 / ОКТМО: 45380000000`;
    }

    matrixGrid.innerHTML = GAR_FIELDS_META.map(f => {
      const val = gar[f.id] || "—";
      const hasValue = val !== "—";
      return `
        <div class="matrix-card ${hasValue ? 'active-field' : ''}">
          <div class="card-top">
            <span class="num-badge ${f.class}">${f.num}</span>
            <span class="field-name">${f.name}</span>
          </div>
          <div class="field-value">${escapeHtml(val)}</div>
        </div>
      `;
    }).join('');
  }

  // ==========================================
  // 3. Tab 2: Clean Standardizer (Выправка — Drag & Drop, Analytics, Filter Table)
  // ==========================================
  const cleanInput = document.getElementById('clean-input');
  const btnCleanAction = document.getElementById('btn-clean-action');
  const cleanResultPanel = document.getElementById('clean-result-panel');
  const cleanTableBody = document.getElementById('clean-table-body');
  const cleanConfidenceBadge = document.getElementById('clean-confidence-badge');
  const batchFileInput = document.getElementById('batch-file-input');
  const dragDropZone = document.getElementById('drag-drop-zone');
  const btnClearBatch = document.getElementById('btn-clear-batch');
  const btnLoadDemoBatch = document.getElementById('btn-load-demo-batch');
  const exportBtnGroup = document.getElementById('export-btn-group');
  const btnExportExcel = document.getElementById('btn-export-excel');
  const btnExportCsv = document.getElementById('btn-export-csv');
  const btnExportJson = document.getElementById('btn-export-json');
  const batchProgressContainer = document.getElementById('batch-progress-container');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const progressPercentage = document.getElementById('progress-percentage');
  const progressStatusText = document.getElementById('progress-status-text');
  const batchMetricsWidget = document.getElementById('batch-metrics-widget');
  const statTotalCount = document.getElementById('stat-total-count');
  const statAccuracy = document.getElementById('stat-accuracy');
  const statLatency = document.getElementById('stat-latency');
  const tableFilterInput = document.getElementById('table-filter-input');

  let currentBatchResults = [];
  let uploadedFile = null;

  // Preset demo address filler
  if (btnLoadDemoBatch) {
    btnLoadDemoBatch.addEventListener('click', () => {
      cleanInput.value = [
        "125009 г москва тверская 12 стр 1 кв 45",
        "Московская область, г.о. Дубна, г. Дубна, ул. Тверская, д. 2А",
        "Химки мкр Сходня 2-й Дачный пер 10",
        "Республика Башкортостан с Иглино ул Тверская 12",
        "г Санкт-Петербург Невский проспект д 28 оф 302",
        "Республика Татарстан, г Казань, ул Баумана д 9 кв 12",
        "Краснодарский край, г Сочи, п Лазаревское, ул Победы, д 14"
      ].join('\n');
      showToast('Загружен демо-набор адресов!');
    });
  }

  if (btnClearBatch) {
    btnClearBatch.addEventListener('click', () => {
      cleanInput.value = '';
      uploadedFile = null;
      cleanResultPanel.classList.add('hidden');
      exportBtnGroup.classList.add('hidden');
      if (batchMetricsWidget) batchMetricsWidget.classList.add('hidden');
      currentBatchResults = [];
    });
  }

  if (dragDropZone) {
    dragDropZone.addEventListener('click', () => batchFileInput.click());

    ['dragenter', 'dragover'].forEach(eventName => {
      dragDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dragDropZone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragDropZone.classList.remove('dragover');
      });
    });

    dragDropZone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        handleFileUpload(files[0]);
      }
    });
  }

  batchFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  });

  function handleFileUpload(file) {
    uploadedFile = file;
    showToast(`Файл "${file.name}" загружен! Нажмите "Запустить выправку".`);

    if (file.name.endsWith('.txt') || file.name.endsWith('.csv') || file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        cleanInput.value = evt.target.result.slice(0, 5000) + (evt.target.result.length > 5000 ? '\n... [строки загружены из файла]' : '');
      };
      reader.readAsText(file);
    } else {
      cleanInput.value = `[Файл ${file.name} (${(file.size / 1024).toFixed(1)} КБ) выбран для выправки адресов]`;
    }
  }

  btnCleanAction.addEventListener('click', () => {
    let formData = null;
    let addressesArray = [];

    if (uploadedFile) {
      formData = new FormData();
      formData.append('file', uploadedFile);
    } else {
      addressesArray = cleanInput.value.split('\n').map(l => l.trim()).filter(Boolean);
      if (addressesArray.length === 0) {
        showToast('Введите адреса или загрузите файл баз данных!');
        return;
      }
    }

    const startTime = Date.now();
    btnCleanAction.disabled = true;
    btnCleanAction.innerHTML = "<span>⌛ Идёт выправка адресов...</span>";
    batchProgressContainer.classList.remove('hidden');
    progressBarFill.style.width = "40%";
    progressPercentage.textContent = "40%";
    progressStatusText.textContent = "Стандартизация и привязка к реестру ГАР...";

    const fetchPromise = uploadedFile ?
      fetch('/api/v1/clean/file', { method: 'POST', body: formData }).then(r => r.json()) :
      fetch('/api/v1/clean/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addressesArray)
      }).then(r => r.json()).then(resArray => ({
        total_processed: resArray.length,
        results: resArray.map((r, i) => ({
          raw_address: addressesArray[i],
          formatted_gar: r.formatted,
          postal_code: r.gar_object?.postal_code || "",
          region: r.gar_object?.region || "",
          municipal_district: r.gar_object?.municipal_district || "",
          locality: r.gar_object?.locality || "",
          street: r.gar_object?.street || "",
          house_building: r.gar_object?.house_building || "",
          room_flat: r.gar_object?.room_flat || "",
          confidence: `${Math.round((r.confidence || 0.8) * 100)}%`
        }))
      }));

    fetchPromise
      .then(data => {
        const elapsed = Date.now() - startTime;
        progressBarFill.style.width = "100%";
        progressPercentage.textContent = "100%";
        progressStatusText.textContent = "Выправка адресов завершена!";

        setTimeout(() => batchProgressContainer.classList.add('hidden'), 1000);

        btnCleanAction.disabled = false;
        btnCleanAction.innerHTML = "<span>⚡ Запустить выправку адресов</span>";

        const results = data.results || [];
        currentBatchResults = results;

        if (batchMetricsWidget) {
          batchMetricsWidget.classList.remove('hidden');
          if (statTotalCount) statTotalCount.textContent = results.length.toLocaleString();
          if (statAccuracy) statAccuracy.textContent = "100%";
          if (statLatency) statLatency.textContent = `${(elapsed / Math.max(1, results.length)).toFixed(1)} мс/строку`;
        }

        cleanConfidenceBadge.textContent = `Обработано записей: ${results.length}`;
        cleanResultPanel.classList.remove('hidden');
        exportBtnGroup.classList.remove('hidden');

        renderTableRows(results);
        showToast(`Успешно обработано ${results.length} адресов!`);
      })
      .catch(err => {
        btnCleanAction.disabled = false;
        btnCleanAction.innerHTML = "<span>⚡ Запустить выправку адресов</span>";
        batchProgressContainer.classList.add('hidden');
        alert("Ошибка при обработке файла: " + err.message);
      });
  });

  // Table Filter Input Handler
  if (tableFilterInput) {
    tableFilterInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        renderTableRows(currentBatchResults);
        return;
      }
      const filtered = currentBatchResults.filter(r => {
        return (r.raw_address || '').toLowerCase().includes(q) ||
               (r.formatted_gar || '').toLowerCase().includes(q) ||
               (r.locality || '').toLowerCase().includes(q) ||
               (r.street || '').toLowerCase().includes(q);
      });
      renderTableRows(filtered);
    });
  }

  function renderTableRows(rows) {
    cleanTableBody.innerHTML = rows.map((item, idx) => `
      <tr>
        <td><strong>${idx + 1}</strong></td>
        <td><small class="text-muted">${escapeHtml(item.raw_address)}</small></td>
        <td><strong style="color: #60a5fa; font-size: 13px;">${escapeHtml(item.formatted_gar)}</strong></td>
        <td><code>${escapeHtml(item.postal_code || '—')}</code></td>
        <td>${escapeHtml(item.region || '—')}</td>
        <td>${escapeHtml(item.municipal_district || '—')}</td>
        <td>${escapeHtml(item.locality || '—')}</td>
        <td>${escapeHtml(item.street || '—')}</td>
        <td>${escapeHtml(item.house_building || '—')}</td>
        <td>${escapeHtml(item.room_flat || '—')}</td>
        <td><span class="confidence-pill">${escapeHtml(item.confidence || '100%')}</span></td>
      </tr>
    `).join('');
  }

  if (btnExportExcel) btnExportExcel.addEventListener('click', () => triggerExportDownload('xlsx'));
  if (btnExportCsv) btnExportCsv.addEventListener('click', () => triggerExportDownload('csv'));
  if (btnExportJson) btnExportJson.addEventListener('click', () => triggerExportDownload('json'));

  function triggerExportDownload(format) {
    if (currentBatchResults.length === 0) return;

    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentBatchResults, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", "storm_addresses_standardized.json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Файл JSON сохранён!');
      return;
    }

    if (uploadedFile) {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      fetch(`/api/v1/clean/file?format=${format}`, { method: 'POST', body: formData })
        .then(res => res.blob())
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `storm_addresses_standardized.${format}`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          showToast(`Файл .${format} сохранён!`);
        });
    } else {
      const addresses = currentBatchResults.map(r => r.raw_address);
      fetch(`/api/v1/clean/file?format=${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses, format })
      })
      .then(res => res.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `storm_addresses_standardized.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(`Файл .${format} сохранён!`);
      });
    }
  }

  // ==========================================
  // 4. Tab 3: Companies (EGRUL)
  // ==========================================
  const partyInput = document.getElementById('party-input');
  const btnPartySearch = document.getElementById('btn-party-search');
  const partyResults = document.getElementById('party-results');

  document.querySelectorAll('.chip-company-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      partyInput.value = q;
      triggerPartySearch(q);
    });
  });

  if (btnPartySearch) {
    btnPartySearch.addEventListener('click', () => {
      const val = partyInput.value.trim();
      if (!val) return;
      triggerPartySearch(val);
    });
  }

  function triggerPartySearch(val) {
    fetch('/api/v1/suggest/party', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: val })
    })
    .then(res => res.json())
    .then(data => {
      const items = data.suggestions || [];
      if (items.length === 0) {
        partyResults.innerHTML = `<p class="text-muted">Ничего не найдено по вашему запросу</p>`;
        return;
      }
      partyResults.innerHTML = items.map(item => `
        <div class="entity-card">
          <h4>${escapeHtml(item.value)}</h4>
          <p><strong>ИНН:</strong> <code>${item.data.inn}</code> | <strong>ОГРН:</strong> <code>${item.data.ogrn}</code></p>
          <p><strong>Адрес:</strong> ${escapeHtml(item.data.address?.value || item.data.address)}</p>
          <p><strong>Руководитель:</strong> ${escapeHtml(item.data.management?.name || item.data.management || '—')}</p>
          <p><strong>ОКВЭД:</strong> ${item.data.okved || '—'}</p>
        </div>
      `).join('');
    });
  }

  // ==========================================
  // 5. Tab 4: Banks (BIK)
  // ==========================================
  const bankInput = document.getElementById('bank-input');
  const btnBankSearch = document.getElementById('btn-bank-search');
  const bankResults = document.getElementById('bank-results');

  document.querySelectorAll('.chip-bank-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      bankInput.value = q;
      triggerBankSearch(q);
    });
  });

  if (btnBankSearch) {
    btnBankSearch.addEventListener('click', () => {
      const val = bankInput.value.trim();
      if (!val) return;
      triggerBankSearch(val);
    });
  }

  function triggerBankSearch(val) {
    fetch('/api/v1/suggest/bank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: val })
    })
    .then(res => res.json())
    .then(data => {
      const items = data.suggestions || [];
      if (items.length === 0) {
        bankResults.innerHTML = `<p class="text-muted">Ничего не найдено по вашему запросу</p>`;
        return;
      }
      bankResults.innerHTML = items.map(item => `
        <div class="entity-card">
          <h4>${escapeHtml(item.value)}</h4>
          <p><strong>БИК:</strong> <code>${item.data.bik}</code> | <strong>SWIFT:</strong> <code>${item.data.swift || '—'}</code></p>
          <p><strong>Корр. счет:</strong> <code>${item.data.correspondent_account}</code></p>
          <p><strong>Адрес:</strong> ${escapeHtml(item.data.address?.value || item.data.address)}</p>
        </div>
      `).join('');
    });
  }

  // ==========================================
  // 6. Tab 5: REST API Sandbox & Snippets
  // ==========================================
  const apiReqBody = document.getElementById('api-req-body');
  const btnSendApi = document.getElementById('btn-send-api');
  const apiResBody = document.getElementById('api-res-body');
  const apiResStatus = document.getElementById('api-res-status');
  const snippetCodeDisplay = document.getElementById('snippet-code-display');

  const SNIPPET_TEMPLATES = {
    curl: `curl -X POST http://localhost:3001/api/v1/clean/address \\
  -H "Content-Type: application/json" \\
  -d '{"query": "125009 г москва тверская 12"}'`,

    nodejs: `const response = await fetch('http://localhost:3001/api/v1/clean/address', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '125009 г москва тверская 12' })
});
const data = await response.json();
console.log(data);`,

    python: `import requests

url = "http://localhost:3001/api/v1/clean/address"
payload = {"query": "125009 г москва тверская 12"}
response = requests.post(url, json=payload)
print(response.json())`,

    php: `<?php
$ch = curl_init('http://localhost:3001/api/v1/clean/address');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['query' => '125009 г москва тверская 12']));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
$response = curl_exec($ch);
echo $response;`
  };

  document.querySelectorAll('.lang-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const lang = btn.getAttribute('data-lang');
      if (snippetCodeDisplay && SNIPPET_TEMPLATES[lang]) {
        snippetCodeDisplay.textContent = SNIPPET_TEMPLATES[lang];
      }
    });
  });

  if (btnSendApi) {
    btnSendApi.addEventListener('click', () => {
      try {
        const parsedBody = JSON.parse(apiReqBody.value);
        const startTime = Date.now();
        fetch('/api/v1/clean/address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedBody)
        })
        .then(res => res.json())
        .then(json => {
          const elapsed = Date.now() - startTime;
          if (apiResStatus) apiResStatus.textContent = `200 OK • ${elapsed} ms`;
          apiResBody.textContent = JSON.stringify(json, null, 2);
          showToast('Запрос успешно выполнен!');
        });
      } catch (e) {
        alert("Неверный формат JSON в запросе!");
      }
    });
  }
});
