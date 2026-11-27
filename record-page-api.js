(() => {
    if (globalThis.__sfmnRecordApiLoaded) return;
    globalThis.__sfmnRecordApiLoaded = true;

    const FIELD_SELECTOR = [
        'lightning-output-field[field-name]',
        'lightning-input-field[field-name]',
        'records-record-layout-item[field-label]',
        'force-record-layout-item[field-label]',
        '[data-field-api-name]',
        '[data-field-name]'
    ].join(',');
    const RECORD_LAYOUT_ITEM_SELECTOR = 'records-record-layout-item, force-record-layout-item';
    const LIGHTNING_FIELD_SELECTOR = 'lightning-output-field, lightning-input-field';
    const FIELD_LABEL_SELECTOR = [
        '.test-id__field-label-container',
        '.test-id__field-label',
        '.slds-form-element__label',
        '[slot="label"]'
    ].join(',');
    const FIELD_HELP_SELECTOR = 'lightning-helptext, .slds-form-element__icon';
    const API_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;

    const state = {
        context: null,
        showApi: false,
        selectedFields: new Set(),
        fieldApiNameByLabel: new Map(),
        scanTimer: null,
        toastTimer: null,
        tooltipElement: null,
        tooltipMarker: null
    };

    function getFieldApiName(element) {
        const directName = String(
            element.getAttribute('field-name') ||
            element.getAttribute('data-field-api-name') ||
            element.getAttribute('data-field-name') ||
            ''
        ).trim();
        if (API_NAME_PATTERN.test(directName)) return directName;

        const container = getFieldContainer(element);
        const metadataElement = container.querySelector(
            '[field-name], [data-field-api-name], [data-field-name], [data-target-selection-name], [data-field-id]'
        );
        if (metadataElement) {
            const nestedName = String(
                metadataElement.getAttribute('field-name') ||
                metadataElement.getAttribute('data-field-api-name') ||
                metadataElement.getAttribute('data-field-name') ||
                ''
            ).trim();
            if (API_NAME_PATTERN.test(nestedName)) return nestedName;

            const metadataValue = String(
                metadataElement.getAttribute('data-target-selection-name') ||
                metadataElement.getAttribute('data-field-id') ||
                ''
            );
            const metadataMatch = metadataValue.match(/(?:RecordField|Field)[.:_-]+[A-Za-z][A-Za-z0-9_]*[.:_-]+([A-Za-z][A-Za-z0-9_]*)$/);
            if (metadataMatch && API_NAME_PATTERN.test(metadataMatch[1])) return metadataMatch[1];
        }

        return state.fieldApiNameByLabel.get(element.getAttribute('field-label')) || '';
    }

    function setFieldMetadata(fields) {
        const uniqueFields = Array.from(new Map(
            (fields || [])
                .filter(field => field?.apiName && field?.label)
                .map(field => [`${String(field.label).trim()}\u0000${String(field.apiName).trim()}`, field])
        ).values());
        const labelCounts = new Map();
        uniqueFields.forEach(field => {
            const label = String(field?.label || '').trim();
            if (label) labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
        });

        state.fieldApiNameByLabel = new Map(
            uniqueFields
                .filter(field => field?.apiName && labelCounts.get(String(field.label || '').trim()) === 1)
                .map(field => [String(field.label).trim(), String(field.apiName).trim()])
        );
    }

    function getFieldContainer(element) {
        return element.closest(RECORD_LAYOUT_ITEM_SELECTOR) ||
            element.closest(LIGHTNING_FIELD_SELECTOR) ||
            element;
    }

    function positionMarker(container, marker) {
        const label = container.querySelector(FIELD_LABEL_SELECTOR);
        if (!label) {
            marker.style.left = '2px';
            marker.style.top = '2px';
            return;
        }

        const containerRect = container.getBoundingClientRect();
        const labelRect = label.getBoundingClientRect();
        const helpRight = Array.from(container.querySelectorAll(FIELD_HELP_SELECTOR))
            .map(help => help.getBoundingClientRect())
            .filter(rect => Math.abs(rect.top - labelRect.top) < Math.max(20, labelRect.height))
            .reduce((right, rect) => Math.max(right, rect.right), labelRect.right);
        marker.style.left = `${Math.max(0, helpRight - containerRect.left + 7)}px`;
        marker.style.top = `${Math.max(0, labelRect.top - containerRect.top + ((labelRect.height - 17) / 2))}px`;
    }

    function placeMarker(container, marker) {
        container.appendChild(marker);
        positionMarker(container, marker);
    }

    function removeMarkers() {
        hideApiTooltip();
        document.querySelectorAll('.sfmn-api-marker').forEach(marker => marker.remove());
        document.querySelectorAll('.sfmn-api-field').forEach(field => field.classList.remove('sfmn-api-field'));
    }

    function refreshContext() {
        const nextContext = RecordPageApiRules.getRecordPageContext(window.location.href);
        const currentKey = state.context ? `${state.context.objectApiName}:${state.context.recordId}` : '';
        const nextKey = nextContext ? `${nextContext.objectApiName}:${nextContext.recordId}` : '';

        if (currentKey === nextKey) return !!nextContext;

        state.context = nextContext;
        state.selectedFields.clear();
        state.fieldApiNameByLabel.clear();
        removeMarkers();

        if (!nextContext) {
            state.showApi = false;
        }

        return !!nextContext;
    }

    function updateMarker(marker) {
        const fieldApiName = marker.dataset.apiName;
        marker.hidden = !state.showApi;
        if (!state.showApi && state.tooltipMarker === marker) hideApiTooltip();
        marker.classList.toggle('sfmn-copy-enabled', state.showApi);
        marker.classList.toggle('sfmn-selected', state.selectedFields.has(fieldApiName));
        marker.setAttribute('aria-pressed', String(state.selectedFields.has(fieldApiName)));
    }

    async function handleMarkerClick(event) {
        event.preventDefault();
        event.stopPropagation();

        if (!state.showApi) return;
        if (!event.ctrlKey && !event.metaKey) {
            showToast('Hold Ctrl (or Cmd) and click API markers to select fields.');
            return;
        }

        const fieldApiName = event.currentTarget.dataset.apiName;
        if (state.selectedFields.has(fieldApiName)) {
            state.selectedFields.delete(fieldApiName);
        } else {
            state.selectedFields.add(fieldApiName);
        }

        updateAllMarkers();
        await copySelectionToClipboard();
    }

    function hideApiTooltip() {
        state.tooltipElement?.remove();
        state.tooltipElement = null;
        state.tooltipMarker = null;
    }

    function showApiTooltip(marker) {
        hideApiTooltip();

        const tooltip = document.createElement('div');
        tooltip.className = 'sfmn-api-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = marker.dataset.apiName;
        tooltip.style.visibility = 'hidden';
        document.body.appendChild(tooltip);

        const markerRect = marker.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const maxLeft = Math.max(8, window.innerWidth - tooltipRect.width - 8);
        const left = Math.min(Math.max(8, markerRect.left), maxLeft);
        const above = markerRect.top - tooltipRect.height - 6;
        const top = above >= 8
            ? above
            : Math.min(window.innerHeight - tooltipRect.height - 8, markerRect.bottom + 6);

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(8, top)}px`;
        tooltip.style.visibility = 'visible';
        state.tooltipElement = tooltip;
        state.tooltipMarker = marker;
    }

    function createMarker(fieldApiName) {
        const marker = document.createElement('button');
        marker.type = 'button';
        marker.className = 'sfmn-api-marker';
        marker.textContent = 'API';
        marker.dataset.apiName = fieldApiName;
        marker.setAttribute('aria-label', `Field API name: ${fieldApiName}`);
        marker.addEventListener('click', handleMarkerClick);
        marker.addEventListener('mouseenter', () => showApiTooltip(marker));
        marker.addEventListener('mouseleave', hideApiTooltip);
        marker.addEventListener('focus', () => showApiTooltip(marker));
        marker.addEventListener('blur', hideApiTooltip);
        updateMarker(marker);
        return marker;
    }

    function scanFields() {
        state.scanTimer = null;
        if (!refreshContext()) return;

        document.querySelectorAll(FIELD_SELECTOR).forEach(element => {
            const fieldApiName = getFieldApiName(element);
            if (!fieldApiName) return;

            const container = getFieldContainer(element);
            const existingMarker = container.querySelector('.sfmn-api-marker');
            if (existingMarker) {
                positionMarker(container, existingMarker);
                return;
            }

            container.classList.add('sfmn-api-field');
            placeMarker(container, createMarker(fieldApiName));
        });

        updateAllMarkers();
    }

    function scheduleScan() {
        if (state.scanTimer !== null) return;
        state.scanTimer = window.setTimeout(scanFields, 120);
    }

    function updateAllMarkers() {
        document.querySelectorAll('.sfmn-api-marker').forEach(updateMarker);
    }

    function showToast(message) {
        let toast = document.querySelector('.sfmn-api-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.className = 'sfmn-api-toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        window.clearTimeout(state.toastTimer);
        state.toastTimer = window.setTimeout(() => toast.remove(), 2600);
    }

    async function writeClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand('copy');
            textarea.remove();
            return copied;
        }
    }

    async function copySelectionToClipboard() {
        if (!state.showApi || !state.context) return;

        const query = RecordPageApiRules.buildFieldQuery(
            state.context.objectApiName,
            state.selectedFields
        );

        const copied = await writeClipboard(query);
        if (copied) {
            const count = state.selectedFields.size;
            showToast(query
                ? `${count} field${count === 1 ? '' : 's'} selected. SOQL copied.`
                : 'Selection and clipboard cleared.');
        } else {
            showToast('Could not copy the query to the clipboard.');
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || !String(message.type || '').startsWith('record_api_')) return false;

        refreshContext();
        if (Array.isArray(message.fields) && message.fields.length) {
            setFieldMetadata(message.fields);
        }
        if (message.type === 'record_api_toggle_show' && state.context) {
            state.showApi = !state.showApi;
            if (!state.showApi) state.selectedFields.clear();
        }

        scanFields();
        sendResponse({
            available: !!state.context,
            showApi: state.showApi,
            fieldCount: document.querySelectorAll('.sfmn-api-marker').length
        });
        return false;
    });

    new MutationObserver(scheduleScan).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    window.addEventListener('resize', () => {
        hideApiTooltip();
        scheduleScan();
    });
    window.addEventListener('scroll', hideApiTooltip, true);
    scanFields();
})();