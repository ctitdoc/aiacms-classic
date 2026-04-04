(() => {
  const CONFIG = window.AIACMS_CLASSIC_CONFIG || {};
  const root = document.getElementById('app-root');

  const state = {
    documents: [],
    documentsLoading: false,
    documentsError: '',
    sortDir: 'desc',
    selectedFeatures: ['All'],
    availableFeatures: [],
    dateOp: 'any',
    dateValue: '',
    page: 1,
    pageSize: 12,
    pageDocs: [],
    filteredCount: 0,
    totalPages: 1,
    logsXml: '',
  };

  const routes = {
    '/': renderDocumentsPage,
    '/documents': renderDocumentsPage,
    '/record-document': renderRecordDocumentPage,
    '/query': renderQueryPage,
    '/logs': renderLogsPage,
    '/restructure': renderRestructurePage,
    '/generate-cv': renderGenerateCvPage,
    '/result': renderResultPage,
  };

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-nav-link]');
    if (!link) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(link.getAttribute('href') || '/documents');
  });

  window.addEventListener('popstate', () => {
    renderCurrentRoute();
    updateActiveNavigation();
  });

  renderCurrentRoute();
  updateActiveNavigation();

  function navigate(path, replaceState = false) {
    const url = new URL(path, window.location.origin);
    if (replaceState) {
      window.history.replaceState({}, '', url.pathname + url.search);
    } else {
      window.history.pushState({}, '', url.pathname + url.search);
    }
    renderCurrentRoute();
    updateActiveNavigation();
  }

  function currentPath() {
    return window.location.pathname || '/documents';
  }

  function currentSearchParams() {
    return new URLSearchParams(window.location.search);
  }

  function renderCurrentRoute() {
    const renderer = routes[currentPath()] || renderDocumentsPage;
    renderer();
  }

  function updateActiveNavigation() {
    document.querySelectorAll('a[data-nav-link]').forEach((link) => {
      const href = link.getAttribute('href');
      link.classList.toggle('active', href === currentPath());
    });
  }

  function pageHeader(title, subtitle, actionsHtml = '') {
    return `
      <div class="row" style="margin-bottom: 12px;">
        <div>
          <h1>${escapeHtml(title)}</h1>
          ${subtitle ? `<p class="muted">${escapeHtml(subtitle)}</p>` : ''}
        </div>
        <div class="spacer"></div>
        ${actionsHtml}
      </div>
    `;
  }

  function cardDocument(doc, showDelete = false) {
    const options = orderedActions(doc.actions)
      .map((action) => `<option value="${escapeHtmlAttr(action.href)}">${escapeHtml(action.label)}</option>`)
      .join('');

    return `
      <div class="card card-doc" data-document-id="${escapeHtmlAttr(doc.id)}">
        <div class="doc-head">
          <div>
            <div class="doc-title">${escapeHtml(doc.id)}</div>
            <div class="muted">${escapeHtml(doc.lastModifiedIso || '')}</div>
          </div>
          <div class="doc-actions">
            <select data-action-select="${escapeHtmlAttr(doc.id)}">
              <option value="">Actions…</option>
              ${options}
            </select>
            ${showDelete ? `<a href="#" class="danger-link" data-delete-id="${escapeHtmlAttr(doc.id)}">DELETE</a>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function orderedActions(actions = {}) {
    const order = [
      'VIEW', 'EDIT', 'XML',
      'MARKDOWN',
      'RESUME', 'RESUME/PDF',
      'PDF',
      'ARTURIA PAGE', 'SKATELECTRIQUE PAGE',
      'TEXTILE'
    ];

    const rank = new Map(order.map((key, index) => [key, index]));

    return Object.entries(actions)
      .filter(([, href]) => !!href)
      .map(([label, href]) => ({ label, href }))
      .sort((a, b) => (rank.get(a.label) ?? 999) - (rank.get(b.label) ?? 999));
  }

  async function renderDocumentsPage() {
    root.innerHTML = `
      ${pageHeader('Documents', 'Listing des documents + actions.', `
        <div class="row">
          <button class="ghost" id="documents-reload">Reload</button>
          <button class="ghost" id="documents-sort-toggle"></button>
        </div>
      `)}
      <div class="card" style="margin-bottom: 12px;">
        <div class="row filters-row">
          <div style="min-width: 260px; max-width: 420px;">
            <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Features (OR)</div>
            <select multiple id="documents-features"></select>
            <div class="muted" style="font-size: 12px; margin-top: 6px;">Tip: Ctrl/Cmd+click pour multi-sélection</div>
          </div>
          <div style="min-width: 170px;">
            <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Date filter</div>
            <select id="documents-date-op">
              <option value="any">Any</option>
              <option value="after">Modified ≥</option>
              <option value="before">Modified ≤</option>
            </select>
          </div>
          <div style="min-width: 190px;">
            <div class="muted" style="font-size: 12px; margin-bottom: 4px;">Date</div>
            <input type="date" id="documents-date-value" />
          </div>
          <div class="spacer"></div>
          <div class="muted" style="font-size: 12px;" id="documents-count"></div>
        </div>
      </div>
      <div id="documents-status"></div>
      <div class="card" id="documents-list"></div>
      <div class="row page-footer">
        <button class="ghost" id="documents-prev">Prev</button>
        <span class="muted" id="documents-page-label"></span>
        <button class="ghost" id="documents-next">Next</button>
      </div>
    `;

    bindDocumentActions();
    renderDocumentControls();

    if (state.documents.length === 0 && !state.documentsLoading) {
      await loadDocuments();
    } else {
      recomputeDocuments();
      renderDocumentsView();
    }
  }

  async function loadDocuments() {
    state.documentsLoading = true;
    state.documentsError = '';
    renderDocumentsStatus();

    try {
      const response = await apiGet('/api/documents');
      state.documents = Array.isArray(response.documents) ? response.documents : [];
      state.availableFeatures = collectAvailableFeatures(state.documents);
      state.page = 1;
      recomputeDocuments();
    } catch (error) {
      state.documents = [];
      state.availableFeatures = [];
      state.documentsError = error.message || String(error);
      recomputeDocuments();
    } finally {
      state.documentsLoading = false;
      renderDocumentControls();
      renderDocumentsView();
    }
  }

  function bindDocumentActions() {
    root.querySelector('#documents-reload')?.addEventListener('click', () => loadDocuments());
    root.querySelector('#documents-sort-toggle')?.addEventListener('click', () => {
      state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
      state.page = 1;
      recomputeDocuments();
      renderDocumentsView();
    });

    root.querySelector('#documents-features')?.addEventListener('change', (event) => {
      const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
      state.selectedFeatures = selected.length > 0 ? selected : ['All'];
      if (state.selectedFeatures.includes('All') && state.selectedFeatures.length > 1) {
        state.selectedFeatures = state.selectedFeatures.filter((item) => item !== 'All');
      }
      state.page = 1;
      recomputeDocuments();
      renderDocumentsView();
      renderDocumentControls();
    });

    root.querySelector('#documents-date-op')?.addEventListener('change', (event) => {
      state.dateOp = event.target.value;
      state.page = 1;
      recomputeDocuments();
      renderDocumentsView();
      renderDocumentControls();
    });

    root.querySelector('#documents-date-value')?.addEventListener('change', (event) => {
      state.dateValue = event.target.value;
      state.page = 1;
      recomputeDocuments();
      renderDocumentsView();
    });

    root.querySelector('#documents-prev')?.addEventListener('click', () => {
      state.page = Math.max(1, state.page - 1);
      recomputeDocuments();
      renderDocumentsView();
    });

    root.querySelector('#documents-next')?.addEventListener('click', () => {
      state.page = Math.min(state.totalPages, state.page + 1);
      recomputeDocuments();
      renderDocumentsView();
    });
  }

  function renderDocumentControls() {
    const sortButton = root.querySelector('#documents-sort-toggle');
    if (sortButton) {
      sortButton.textContent = `Sort: ${state.sortDir === 'desc' ? 'Last modified ↓' : 'Last modified ↑'}`;
    }

    const featuresSelect = root.querySelector('#documents-features');
    if (featuresSelect) {
      const options = ['All', ...state.availableFeatures]
        .map((feature) => `<option value="${escapeHtmlAttr(feature)}" ${state.selectedFeatures.includes(feature) ? 'selected' : ''}>${escapeHtml(feature)}</option>`)
        .join('');
      featuresSelect.innerHTML = options;
    }

    const dateOpSelect = root.querySelector('#documents-date-op');
    if (dateOpSelect) {
      dateOpSelect.value = state.dateOp;
    }

    const dateInput = root.querySelector('#documents-date-value');
    if (dateInput) {
      dateInput.value = state.dateValue;
      dateInput.disabled = state.dateOp === 'any';
    }
  }

  function renderDocumentsStatus() {
    const status = root.querySelector('#documents-status');
    if (!status) return;

    if (state.documentsLoading) {
      status.innerHTML = '<div>Loading…</div>';
      return;
    }

    if (state.documentsError) {
      status.innerHTML = `<div class="error-text">${escapeHtml(state.documentsError)}</div>`;
      return;
    }

    status.innerHTML = '';
  }

  function renderDocumentsView() {
    renderDocumentsStatus();

    const count = root.querySelector('#documents-count');
    if (count) {
      count.textContent = `${state.filteredCount} / ${state.documents.length} docs`;
    }

    const list = root.querySelector('#documents-list');
    if (list) {
      if (!state.documentsLoading && state.pageDocs.length === 0) {
        list.innerHTML = '<div class="muted">No documents</div>';
      } else {
        list.innerHTML = state.pageDocs.map((doc) => cardDocument(doc, true)).join('');
      }

      list.querySelectorAll('select[data-action-select]').forEach((select) => {
        select.addEventListener('change', (event) => {
          const href = event.target.value;
          if (href) {
            window.open(href, '_blank', 'noopener,noreferrer');
          }
          event.target.value = '';
        });
      });

      list.querySelectorAll('[data-delete-id]').forEach((link) => {
        link.addEventListener('click', async (event) => {
          event.preventDefault();
          const id = link.getAttribute('data-delete-id') || '';
          if (!window.confirm(`Delete ${id} ?`)) return;
          await apiPost('/api/delete-document', { id });
          state.documents = state.documents.filter((doc) => doc.id !== id);
          state.availableFeatures = collectAvailableFeatures(state.documents);
          state.page = 1;
          recomputeDocuments();
          renderDocumentControls();
          renderDocumentsView();
        });
      });
    }

    const pageLabel = root.querySelector('#documents-page-label');
    if (pageLabel) {
      pageLabel.textContent = `Page ${state.page} / ${state.totalPages}`;
    }

    const prevButton = root.querySelector('#documents-prev');
    if (prevButton) prevButton.disabled = state.page <= 1;
    const nextButton = root.querySelector('#documents-next');
    if (nextButton) nextButton.disabled = state.page >= state.totalPages;
  }

  function recomputeDocuments() {
    const selected = state.selectedFeatures.includes('All')
      ? []
      : state.selectedFeatures.filter((item) => item !== 'All');

    const hasDate = state.dateOp !== 'any' && !!state.dateValue;
    const dateStart = hasDate ? new Date(state.dateValue).getTime() : 0;
    const dateEnd = hasDate ? dateStart + 24 * 60 * 60 * 1000 - 1 : 0;

    const filtered = state.documents.filter((doc) => {
      const features = Array.isArray(doc.features) ? doc.features : [];
      const matchFeatures = selected.length === 0 || features.some((feature) => selected.includes(String(feature)));
      if (!matchFeatures) return false;
      if (!hasDate) return true;
      const time = Date.parse(doc.lastModifiedIso || '');
      if (Number.isNaN(time)) return false;
      if (state.dateOp === 'after') return time >= dateStart;
      if (state.dateOp === 'before') return time <= dateEnd;
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const ta = Date.parse(a.lastModifiedIso || '') || 0;
      const tb = Date.parse(b.lastModifiedIso || '') || 0;
      return state.sortDir === 'desc' ? tb - ta : ta - tb;
    });

    state.filteredCount = sorted.length;
    state.totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), state.totalPages);

    const start = (state.page - 1) * state.pageSize;
    state.pageDocs = sorted.slice(start, start + state.pageSize);
  }

  function collectAvailableFeatures(documents) {
    const preferred = ['RESUME', 'MARKDOWN', 'PDF', 'ARTURIA', 'SKATELECTRIQUE', 'TEXTILE', 'VIEW', 'EDIT', 'XML'];
    const rank = new Map(preferred.map((item, index) => [item, index]));
    const set = new Set();

    documents.forEach((document) => {
      (document.features || []).forEach((feature) => set.add(String(feature)));
    });

    return Array.from(set).filter((feature) => feature && feature !== 'All').sort((a, b) => {
      const ra = rank.has(a) ? rank.get(a) : 999;
      const rb = rank.has(b) ? rank.get(b) : 999;
      return ra !== rb ? ra - rb : a.localeCompare(b);
    });
  }

  function renderRecordDocumentPage() {
    root.innerHTML = `
      ${pageHeader('Record document', 'Créer un document (mock).')}
      <div class="grid cols-2">
        <div class="card">
          <h2>Author pseudo</h2>
          <p class="muted">Écran legacy : un champ texte + bouton.</p>
          <div class="grid">
            <input type="text" id="record-file-name" placeholder="Ex: dictionary_new_doc.xml" />
            <div class="row">
              <button id="record-submit">Envoyer</button>
              <span class="muted" id="record-message"></span>
            </div>
          </div>
        </div>
        <div class="card">
          <h2>Notes</h2>
          <p class="muted">À brancher côté backend :</p>
          <ul>
            <li><p>POST /cms/record_document (payload: filename + author)</p></li>
            <li><p>Retour: identifiant du fichier + refresh list</p></li>
          </ul>
        </div>
      </div>
    `;

    root.querySelector('#record-submit')?.addEventListener('click', async () => {
      const input = root.querySelector('#record-file-name');
      const message = root.querySelector('#record-message');
      const fileName = input.value.trim();
      message.textContent = '';

      try {
        const response = await apiPost('/api/create-document', { fileName });
        message.textContent = `Created: ${response.document.id}`;
        input.value = '';
      } catch (error) {
        message.textContent = `Error: ${error.message || String(error)}`;
      }
    });
  }

  function renderQueryPage() {
    root.innerHTML = `
      ${pageHeader('Document query (XQuery)', 'Exécution XQuery (mock).')}
      <div class="grid cols-2">
        <div class="card">
          <div class="row" style="margin-bottom: 10px;">
            <label class="muted">Result format :</label>
            <select id="query-format" style="max-width: 180px;">
              <option>HTML</option>
              <option>XML</option>
            </select>
            <div class="spacer"></div>
            <button id="query-submit">Submit</button>
          </div>
          <textarea id="query-text">for $x in collection('dictionary')/dictionary/data_definition[ . contains text 'email']&#10;return $x</textarea>
        </div>
        <div class="card">
          <h2>Result</h2>
          <p class="muted" id="query-empty">No result yet.</p>
          <pre id="query-result" class="render-box hidden"></pre>
        </div>
      </div>
    `;

    root.querySelector('#query-submit')?.addEventListener('click', async () => {
      const query = root.querySelector('#query-text').value;
      const format = root.querySelector('#query-format').value;
      const result = root.querySelector('#query-result');
      const empty = root.querySelector('#query-empty');
      result.classList.add('hidden');
      empty.classList.remove('hidden');
      empty.textContent = 'Loading...';

      try {
        const response = await apiPost('/api/run-xquery', { query, format });
        result.textContent = response.content;
        result.classList.remove('hidden');
        empty.classList.add('hidden');
      } catch (error) {
        empty.textContent = `Error: ${error.message || String(error)}`;
      }
    });
  }

  async function renderLogsPage() {
    root.innerHTML = `
      ${pageHeader('Get logs', 'Affiche un XML de logs (mock).')}
      <div class="card">
        <p class="muted" id="logs-loading">Loading...</p>
        <pre id="logs-xml" class="render-box hidden"></pre>
      </div>
    `;

    try {
      const response = await apiGet('/api/logs');
      root.querySelector('#logs-xml').textContent = response.xml;
      root.querySelector('#logs-xml').classList.remove('hidden');
      root.querySelector('#logs-loading').classList.add('hidden');
    } catch (error) {
      root.querySelector('#logs-loading').textContent = `Error: ${error.message || String(error)}`;
    }
  }

  function renderRestructurePage() {
    root.innerHTML = `
      ${pageHeader('Restructure text CV', 'Textarea + bouton (mock).')}
      <div class="card">
        <textarea id="restructure-raw-text">Contact&#10;Franck Delahaye&#10;email: ...&#10;&#10;Key skills&#10;...</textarea>
        <div class="row" style="margin-top: 12px;">
          <button id="restructure-submit">Restructure</button>
          <span class="muted" id="restructure-status"></span>
        </div>
      </div>
    `;

    root.querySelector('#restructure-submit')?.addEventListener('click', async () => {
      const status = root.querySelector('#restructure-status');
      const rawText = root.querySelector('#restructure-raw-text').value;
      status.textContent = 'Processing...';

      try {
        const response = await apiPost('/api/restructure-text-cv', { rawText });
        sessionStorage.setItem('aiacmsClassic.processResult', JSON.stringify(response.result));
        navigate(`/result?id=${encodeURIComponent(response.result.id)}`);
      } catch (error) {
        status.textContent = `Error: ${error.message || String(error)}`;
      }
    });
  }

  function renderGenerateCvPage() {
    root.innerHTML = `
      ${pageHeader('Generate CV for offer', 'Appel backend réel /cms/get_resume_for_job_offer_request_json')}
      <div class="grid cols-2">
        <div class="card">
          <h2>Job offer text</h2>
          <textarea id="generate-offer-text">Offre ... (paste here)</textarea>
        </div>
        <div class="card">
          <h2>Generation rules</h2>
          <textarea id="generate-rules-text">SchemedTalks/cvForOfferRulesFile_default.txt</textarea>
        </div>
      </div>
      <div class="card" style="margin-top: 14px;">
        <div class="row">
          <button id="generate-submit">Generate</button>
          <span class="muted" id="generate-status"></span>
        </div>
      </div>
    `;

    root.querySelector('#generate-submit')?.addEventListener('click', async () => {
      const status = root.querySelector('#generate-status');
      const textDocument = root.querySelector('#generate-offer-text').value;
      const prePromptFile = root.querySelector('#generate-rules-text').value;
      status.textContent = 'Processing...';

      try {
        const response = await apiPost('/api/generate-cv', { text_document: textDocument, prePromptFile });
        sessionStorage.setItem('aiacmsClassic.generatedDocument', JSON.stringify(response.document));
        status.textContent = '';
        navigate('/result');
      } catch (error) {
        status.textContent = `Error: ${error.message || String(error)}`;
      }
    });
  }

  async function renderResultPage() {
    const params = currentSearchParams();
    const resultId = params.get('id');
    let mockResult = null;
    let generatedDocument = null;

    if (resultId) {
      const cached = sessionStorage.getItem('aiacmsClassic.processResult');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.id === resultId) {
            mockResult = parsed;
          }
        } catch (_) {}
      }

      if (!mockResult) {
        try {
          const response = await apiGet(`/api/result?id=${encodeURIComponent(resultId)}`);
          mockResult = response.result;
        } catch (error) {
          root.innerHTML = `
            ${pageHeader('Result', 'Écran résultat')}
            <p class="error-text">${escapeHtml(error.message || String(error))}</p>
          `;
          return;
        }
      }
    } else {
      const cachedDocument = sessionStorage.getItem('aiacmsClassic.generatedDocument');
      if (cachedDocument) {
        try {
          generatedDocument = JSON.parse(cachedDocument);
        } catch (_) {
          generatedDocument = null;
        }
      }
    }

    if (!mockResult && !generatedDocument) {
      navigate('/documents', true);
      return;
    }

    let bodyHtml = '';
    if (generatedDocument) {
      bodyHtml = `
        <div class="card">
          ${cardDocument(generatedDocument, false)}
          <div class="row" style="margin-top: 12px;">
            <button class="danger" id="result-delete">DELETE (mock)</button>
            <button class="ghost" id="result-back">Back</button>
            <span class="muted" id="result-status"></span>
          </div>
        </div>
      `;
    } else {
      const links = Array.isArray(mockResult.links) ? mockResult.links : [];
      bodyHtml = `
        <div class="card">
          <h2>${escapeHtml(mockResult.title || 'Result')}</h2>
          <div class="result-links" style="margin-bottom: 14px;">
            ${links.map((link) => `<a href="${escapeHtmlAttr(link.href)}" target="_blank" rel="noreferrer">${escapeHtml(link.label)}</a>`).join('')}
          </div>
          <div class="grid cols-2">
            <div class="card">
              <h2>XML</h2>
              <pre class="render-box">${escapeHtml(mockResult.xml || '')}</pre>
            </div>
            <div class="card">
              <h2>HTML</h2>
              <pre class="render-box">${escapeHtml(mockResult.html || '')}</pre>
            </div>
          </div>
          <div class="row" style="margin-top: 12px;">
            <button class="ghost" id="result-back">Back</button>
          </div>
        </div>
      `;
    }

    root.innerHTML = `${pageHeader('Result', 'Écran résultat')}${bodyHtml}`;

    root.querySelector('#result-back')?.addEventListener('click', () => window.history.back());
    root.querySelector('#result-delete')?.addEventListener('click', () => {
      const status = root.querySelector('#result-status');
      status.textContent = 'Deleted (mock).';
      setTimeout(() => {
        sessionStorage.removeItem('aiacmsClassic.generatedDocument');
        navigate('/documents');
      }, 400);
    });
  }

  async function apiGet(url) {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      credentials: 'same-origin',
    });
    return handleApiResponse(response);
  }

  async function apiPost(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    return handleApiResponse(response);
  }

  async function handleApiResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();

    if (!response.ok) {
      if (payload && typeof payload === 'object' && payload.error) {
        throw new Error(payload.error);
      }
      throw new Error(typeof payload === 'string' ? payload : `HTTP ${response.status}`);
    }

    return payload;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function escapeHtmlAttr(value) {
    return escapeHtml(value);
  }
})();
