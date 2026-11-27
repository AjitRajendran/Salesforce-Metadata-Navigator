(() => {
    const details = document.getElementById('recordDetails');
    const status = document.getElementById('status');
    const editStatus = document.getElementById('editStatus');
    const filter = document.getElementById('fieldFilter');
    const table = document.getElementById('fieldTable');
    const rows = document.getElementById('fieldRows');
    const editActions = document.getElementById('editActions');
    const editAllButton = document.getElementById('editAllFields');
    const saveAllButton = document.getElementById('saveAllFields');
    const cancelAllButton = document.getElementById('cancelAllFields');
    const reviewButton = document.getElementById('reviewChanges');
    const discardButton = document.getElementById('discardChanges');
    const reviewPanel = document.getElementById('reviewPanel');
    const reviewRows = document.getElementById('reviewRows');
    const saveButton = document.getElementById('saveChanges');
    const backButton = document.getElementById('backToFields');
    const conflictNotice = document.getElementById('conflictNotice');
    const saveErrors = document.getElementById('saveErrors');
    const saveErrorList = document.getElementById('saveErrorList');
    const pending = new Map();
    let fields = [];
    let source;
    let recordUrl;
    let lastModified = null;
    let editor = null;
    let bulkDrafts = null;
    let bulkErrors = new Map();
    let saving = false;

    function formatValue(value) {
        if (value === null) return '(empty)';
        if (typeof value === 'object') return JSON.stringify(value, null, 2);
        return String(value);
    }

    function showEditStatus(message, error = false) {
        editStatus.textContent = message;
        editStatus.classList.toggle('error', error);
    }

    function clearSaveErrors() {
        saveErrors.hidden = true;
        saveErrorList.replaceChildren();
    }

    function showSalesforceErrors(errors) {
        saveErrorList.replaceChildren();
        errors.forEach(item => {
            const entry = document.createElement('li');
            const prefix = item.errorCode === 'FIELD_CUSTOM_VALIDATION_EXCEPTION'
                ? 'Validation rule'
                : 'Salesforce error';
            const fieldNames = Array.isArray(item.fields)
                ? item.fields.filter(name => typeof name === 'string' && name.trim())
                : [];
            entry.textContent = `${prefix}: ${item.message}${fieldNames.length ? ` (Fields: ${fieldNames.join(', ')})` : ''}`;
            saveErrorList.appendChild(entry);
        });
        saveErrors.hidden = false;
        saveErrors.focus();
    }

    function addCell(row, value) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
        return cell;
    }

    function makeButton(text, handler) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = text;
        button.disabled = saving;
        button.addEventListener('click', handler);
        return button;
    }

    function updateActions() {
        editAllButton.hidden = Boolean(bulkDrafts);
        editAllButton.disabled = saving || Boolean(editor) || !fields.some(field => field.editable);
        saveAllButton.hidden = !bulkDrafts;
        cancelAllButton.hidden = !bulkDrafts;
        saveAllButton.disabled = saving;
        cancelAllButton.disabled = saving;
        reviewButton.textContent = `Review changes (${pending.size})`;
        reviewButton.disabled = saving || pending.size === 0 || Boolean(editor) || Boolean(bulkDrafts);
        discardButton.disabled = saving || pending.size === 0 || Boolean(bulkDrafts);
        saveButton.disabled = saving || pending.size === 0;
        backButton.disabled = saving;
        filter.disabled = saving || Boolean(editor);
    }

    function renderEditor(cell, field, bulk = false) {
        const wrapper = document.createElement('div');
        wrapper.className = 'field-editor';
        const label = document.createElement('label');
        label.textContent = `New value for ${field.label}`;
        const input = document.createElement(field.metadata.type === 'boolean' ? 'select' :
            field.metadata.type === 'textarea' || field.metadata.type === 'multipicklist' ? 'textarea' : 'input');
        if (field.metadata.type === 'boolean') {
            if (field.metadata.nillable) input.add(new Option('(empty)', ''));
            input.add(new Option('True', 'true'));
            input.add(new Option('False', 'false'));
        } else if (field.metadata.type === 'date') {
            input.type = 'date';
        } else if (input.tagName === 'INPUT') {
            input.type = 'text';
        }
        input.value = bulk ? bulkDrafts.get(field.name) : editor.value;
        input.setAttribute('aria-label', label.textContent);
        input.disabled = saving;
        const updateValue = () => {
            if (bulk) {
                bulkDrafts.set(field.name, input.value);
                bulkErrors.delete(field.name);
                error.textContent = '';
            } else {
                editor.value = input.value;
            }
        };
        input.addEventListener('input', updateValue);
        input.addEventListener('change', updateValue);
        const help = document.createElement('small');
        help.textContent = field.metadata.type === 'datetime'
            ? 'Use ISO format with timezone, e.g. 2026-01-31T14:30:00Z.'
            : field.metadata.type === 'multipicklist'
                ? 'Separate Salesforce picklist values with semicolons.'
                : 'Leave empty to clear the field, if allowed.';
        const error = document.createElement('span');
        error.className = 'field-error';
        error.setAttribute('role', 'alert');
        if (bulkErrors.has(field.name)) error.textContent = bulkErrors.get(field.name);
        const controls = document.createElement('div');
        controls.className = 'edit-controls';
        if (!bulk) controls.append(
            makeButton('Stage change', () => {
                try {
                    const value = RecordEditRules.parseValue(field.metadata, editor.value);
                    if (value === field.rawValue) pending.delete(field.name);
                    else pending.set(field.name, value);
                    editor = null;
                    showEditStatus('Change staged. Review and save to update Salesforce.');
                    render();
                } catch (validationError) {
                    error.textContent = validationError.message;
                }
            }),
            makeButton('Cancel edit', () => { editor = null; showEditStatus(''); render(); })
        );
        wrapper.append(label, input, help, error);
        if (!bulk) wrapper.appendChild(controls);
        cell.appendChild(wrapper);
    }

    function render() {
        const search = filter.value.trim().toLowerCase();
        const visible = fields.filter(field =>
            `${field.label} ${field.name} ${formatValue(pending.has(field.name) ? pending.get(field.name) : field.rawValue)}`.toLowerCase().includes(search)
        );
        rows.replaceChildren();
        for (const field of visible) {
            const row = document.createElement('tr');
            addCell(row, field.label);
            addCell(row, field.name);
            const valueCell = addCell(row, '');
            if (bulkDrafts && field.editable) {
                renderEditor(valueCell, field, true);
            } else if (editor?.name === field.name) {
                renderEditor(valueCell, field);
            } else {
                valueCell.textContent = formatValue(pending.has(field.name) ? pending.get(field.name) : field.rawValue);
                if (pending.has(field.name)) {
                    const pendingLabel = document.createElement('span');
                    pendingLabel.className = 'pending-label';
                    pendingLabel.textContent = 'Staged';
                    valueCell.appendChild(pendingLabel);
                }
            }
            const action = addCell(row, '');
            if (field.editable && !bulkDrafts) {
                const button = makeButton('Edit', () => {
                    const value = pending.has(field.name) ? pending.get(field.name) : field.rawValue;
                    editor = { name: field.name, value: value === null ? '' : String(value) };
                    reviewPanel.hidden = true;
                    showEditStatus('');
                    render();
                    rows.querySelector('.field-editor input, .field-editor textarea, .field-editor select')?.focus();
                });
                button.setAttribute('aria-label', `Edit ${field.label} (${field.name})`);
                button.disabled = saving || Boolean(editor);
                action.appendChild(button);
            } else if (!field.editable) {
                action.textContent = 'Read only';
            }
            rows.appendChild(row);
        }
        status.textContent = `Showing ${visible.length} of ${fields.length} returned fields.`;
        updateActions();
    }

    async function getToken() {
        const granted = await chrome.permissions.contains({
            permissions: ['cookies'], origins: [`${source.instanceUrl}/*`]
        });
        if (!granted) throw new Error('Salesforce access is not granted. Return to the Salesforce tab and connect the extension first.');
        const cookie = await chrome.cookies.get({ url: `${source.instanceUrl}/`, name: 'sid' });
        if (!cookie?.value) throw new Error('Salesforce session not found. Open the org in a logged-in tab and reconnect the extension.');
        return cookie.value;
    }

    async function salesforceRequest(url, token, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...options.headers }
        });
        if (!response.ok) {
            let message = response.status === 412
                ? 'The record changed in Salesforce since it was loaded. Review it in Salesforce before reloading this page.'
                : `Salesforce returned HTTP ${response.status}.`;
            const data = await response.json().catch(() => null);
            const errors = Array.isArray(data)
                ? data.filter(item => item && typeof item.message === 'string' && item.message.trim())
                : [];
            if (errors.length) {
                message += ` ${errors.map(item => item.message).join(' ')}`;
            }
            const error = new Error(message);
            error.salesforceErrors = errors;
            throw error;
        }
        return response;
    }

    async function load() {
        const token = await getToken();
        const base = `${source.instanceUrl}/services/data/v60.0/sobjects/${encodeURIComponent(source.objectApiName)}`;
        recordUrl = `${base}/${encodeURIComponent(source.recordId)}`;
        const [describeResponse, recordResponse] = await Promise.all([
            salesforceRequest(`${base}/describe`, token),
            salesforceRequest(recordUrl, token)
        ]);
        const [describe, record] = await Promise.all([describeResponse.json(), recordResponse.json()]);
        if (!Array.isArray(describe.fields) || !record || typeof record !== 'object' || Array.isArray(record)) {
            throw new Error('Salesforce returned an unexpected record or field description.');
        }
        const descriptions = new Map(describe.fields.filter(field => field?.name).map(field => [field.name, field]));
        const modified = typeof record.LastModifiedDate === 'string' ? Date.parse(record.LastModifiedDate) : NaN;
        lastModified = Number.isFinite(modified) ? new Date(modified).toUTCString() : null;
        fields = Object.keys(record).filter(name => name !== 'attributes').map(name => {
            const metadata = descriptions.get(name);
            return {
                name,
                label: metadata?.label || name,
                rawValue: record[name],
                metadata,
                editable: RecordEditRules.supportsField(describe.updateable, metadata) &&
                    (record[name] === null || ['string', 'number', 'boolean'].includes(typeof record[name]))
            };
        }).sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
        filter.disabled = false;
        table.hidden = false;
        editActions.hidden = false;
        status.classList.remove('error');
        render();
    }

    function reviewChanges() {
        conflictNotice.textContent = lastModified
            ? 'Salesforce will check whether the record has changed since it was loaded.'
            : 'This record has no accessible LastModifiedDate. Recent changes by others may be overwritten.';
        reviewRows.replaceChildren();
        for (const field of fields) {
            if (!pending.has(field.name)) continue;
            const row = document.createElement('tr');
            addCell(row, `${field.label} (${field.name})`);
            addCell(row, formatValue(field.rawValue));
            addCell(row, formatValue(pending.get(field.name)));
            reviewRows.appendChild(row);
        }
        reviewPanel.hidden = false;
        showEditStatus('');
        reviewPanel.scrollIntoView({ block: 'nearest' });
        saveButton.focus();
    }
    reviewButton.addEventListener('click', reviewChanges);
    editAllButton.addEventListener('click', () => {
        bulkDrafts = new Map(fields.filter(field => field.editable).map(field => {
            const value = pending.has(field.name) ? pending.get(field.name) : field.rawValue;
            return [field.name, value === null ? '' : String(value)];
        }));
        bulkErrors.clear();
        reviewPanel.hidden = true;
        showEditStatus('Edit fields, then click Save to review your changes.');
        render();
    });
    cancelAllButton.addEventListener('click', () => {
        bulkDrafts = null;
        bulkErrors.clear();
        showEditStatus('Edits canceled. Previously staged changes are unchanged.');
        render();
    });
    saveAllButton.addEventListener('click', () => {
        if (!bulkDrafts || saving) return;
        bulkErrors.clear();
        const nextPending = new Map(pending);
        for (const field of fields.filter(item => item.editable)) {
            const value = pending.has(field.name) ? pending.get(field.name) : field.rawValue;
            const initial = value === null ? '' : String(value);
            const draft = bulkDrafts.get(field.name);
            if (draft === initial) continue;
            try {
                const parsed = RecordEditRules.parseValue(field.metadata, draft);
                if (parsed === field.rawValue) nextPending.delete(field.name);
                else nextPending.set(field.name, parsed);
            } catch (error) {
                bulkErrors.set(field.name, error.message);
            }
        }
        if (bulkErrors.size) {
            filter.value = '';
            showEditStatus(`Fix ${bulkErrors.size} invalid field${bulkErrors.size === 1 ? '' : 's'} before saving.`, true);
            render();
            return;
        }
        pending.clear();
        nextPending.forEach((value, name) => pending.set(name, value));
        bulkDrafts = null;
        render();
        if (!pending.size) {
            showEditStatus('No changes to save.');
            return;
        }
        reviewChanges();
    });
    backButton.addEventListener('click', () => { reviewPanel.hidden = true; });
    discardButton.addEventListener('click', () => {
        pending.clear();
        editor = null;
        reviewPanel.hidden = true;
        clearSaveErrors();
        showEditStatus('Staged changes discarded. Salesforce was not updated.');
        render();
    });
    saveButton.addEventListener('click', async () => {
        if (saving || !pending.size || editor || bulkDrafts) return;
        saving = true;
        render();
        clearSaveErrors();
        showEditStatus('Saving changes to Salesforce...');
        try {
            const token = await getToken();
            const headers = { 'Content-Type': 'application/json' };
            if (lastModified) headers['If-Unmodified-Since'] = lastModified;
            await salesforceRequest(recordUrl, token, {
                method: 'PATCH',
                headers,
                body: JSON.stringify(Object.fromEntries(pending))
            });
        } catch (error) {
            console.error('Unable to save record data:', error);
            if (error.salesforceErrors?.length) {
                showSalesforceErrors(error.salesforceErrors);
                showEditStatus('Save failed. Salesforce returned the errors shown above; your changes remain staged.', true);
            } else {
                showEditStatus(`Save failed: ${error.message} Changes remain staged. If the connection was interrupted, check the Salesforce record before retrying.`, true);
            }
            saving = false;
            render();
            return;
        }
        pending.clear();
        reviewPanel.hidden = true;
        try {
            await load();
            showEditStatus('Changes saved. Record data refreshed from Salesforce.');
        } catch (error) {
            console.error('Record saved but refresh failed:', error);
            table.hidden = true;
            editActions.hidden = true;
            showEditStatus(`Changes were saved, but the record could not be refreshed: ${error.message}. Reload this page before editing again.`, true);
        } finally {
            saving = false;
            if (!table.hidden) render();
            else updateActions();
        }
    });
    filter.addEventListener('input', render);
    window.addEventListener('beforeunload', event => {
        const bulkChanged = bulkDrafts && fields.some(field => {
            if (!field.editable) return false;
            const value = pending.has(field.name) ? pending.get(field.name) : field.rawValue;
            return bulkDrafts.get(field.name) !== (value === null ? '' : String(value));
        });
        if (!pending.size && !editor && !saving && !bulkChanged) return;
        event.preventDefault();
        event.returnValue = '';
    });
    (async () => {
        try {
            source = RecordPageApiRules.getRecordDataSource(new URLSearchParams(location.search).get('sourceUrl'));
            details.textContent = `${source.objectApiName} \u2022 ${source.recordId}`;
            await load();
        } catch (error) {
            console.error('Unable to load record data:', error);
            status.classList.add('error');
            status.textContent = `Unable to load record data: ${error.message}`;
        }
    })();
})();
