(function initRecordPageApiRules(root, factory) {
    const api = factory();

    if (root) root.RecordPageApiRules = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, () => {
    const API_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/;

    function getRecordPageContext(urlValue) {
        try {
            const url = new URL(urlValue);
            const match = url.pathname.match(/^\/lightning\/r\/([^/]+)\/([A-Za-z0-9]{15,18})\/view\/?$/);
            if (!match) return null;

            const objectApiName = decodeURIComponent(match[1]);
            if (!API_NAME_PATTERN.test(objectApiName)) return null;

            return {
                objectApiName,
                recordId: match[2]
            };
        } catch {
            return null;
        }
    }

    function getStartupContext(urlValue) {
        try {
            const url = new URL(urlValue);
            if (url.protocol !== 'https:' ||
                !/(?:^|\.)(?:salesforce\.com|salesforce-setup\.com|force\.com)$/.test(url.hostname)) return null;
            const record = getRecordPageContext(urlValue);
            if (record) return { type: 'record', ...record };
            const list = url.pathname.match(/^\/lightning\/o\/([^/]+)\/list\/?$/i);
            if (list) {
                const objectApiName = decodeURIComponent(list[1]);
                return API_NAME_PATTERN.test(objectApiName) ? { type: 'list', objectApiName } : null;
            }
            if (url.hostname.endsWith('.my.salesforce-setup.com') ||
                /^\/lightning\/setup(?:\/|$)/i.test(url.pathname) ||
                /^\/_ui\/system\//i.test(url.pathname)) return { type: 'setup' };
            return null;
        } catch {
            return null;
        }
    }

    function getRecordDataSource(urlValue) {
        const context = getStartupContext(urlValue);
        if (!context || context.type !== 'record') throw new Error('Open Show All Data from a Salesforce Lightning record page.');
        const url = new URL(urlValue);
        const host = url.hostname.replace(/\.lightning\.force\.com$/, '.my.salesforce.com');
        if (!host.endsWith('.my.salesforce.com')) throw new Error('This Salesforce record host is not supported.');
        return { ...context, instanceUrl: `https://${host}` };
    }

    function buildFieldQuery(objectApiName, fieldApiNames) {
        if (!API_NAME_PATTERN.test(String(objectApiName || ''))) return '';

        const fields = Array.from(new Set(fieldApiNames || []))
            .map(name => String(name || '').trim())
            .filter(name => API_NAME_PATTERN.test(name));

        return fields.length ? `SELECT ${fields.join(', ')} FROM ${objectApiName}` : '';
    }

    return {
        getRecordPageContext,
        getStartupContext,
        getRecordDataSource,
        buildFieldQuery
    };
});