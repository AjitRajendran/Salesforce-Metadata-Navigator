(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.RecordEditRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
    const TEXT_TYPES = new Set(['string', 'textarea', 'email', 'phone', 'url', 'picklist', 'multipicklist', 'reference', 'id', 'encryptedstring']);
    const NUMBER_TYPES = new Set(['int', 'double', 'currency', 'percent']);

    function supportsField(objectUpdateable, field) {
        return objectUpdateable === true && field?.updateable === true && !field.calculated && !field.autoNumber &&
            (TEXT_TYPES.has(field.type) || NUMBER_TYPES.has(field.type) || ['boolean', 'date', 'datetime'].includes(field.type));
    }

    function parseValue(field, raw) {
        if (field.type === 'boolean') {
            if (raw === 'true') return true;
            if (raw === 'false') return false;
        }
        if (raw === '') {
            if (!field.nillable) throw new Error('This field cannot be cleared.');
            return null;
        }
        if (NUMBER_TYPES.has(field.type)) {
            if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw)) throw new Error('Enter a valid number.');
            const number = Number(raw);
            const significant = raw.replace(/^[+-]/, '').replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
            if (!Number.isFinite(number) || significant.length > 15 || (Number.isInteger(number) && !Number.isSafeInteger(number))) {
                throw new Error('This number cannot be represented safely. Edit it in Salesforce instead.');
            }
            if (field.type === 'int' && !Number.isInteger(number)) throw new Error('Enter a whole number.');
            return number;
        }
        if (field.type === 'date') {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`)) ||
                new Date(`${raw}T00:00:00Z`).toISOString().slice(0, 10) !== raw) {
                throw new Error('Enter a valid date in YYYY-MM-DD format.');
            }
        }
        if (field.type === 'datetime') {
            const date = raw.slice(0, 10);
            if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ||
                Number.isNaN(Date.parse(raw)) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
                new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
                throw new Error('Enter a valid date and time with a timezone, for example 2026-01-31T14:30:00Z.');
            }
        }
        if (TEXT_TYPES.has(field.type) && typeof field.length === 'number' && field.length > 0 && raw.length > field.length) {
            throw new Error(`Value exceeds the maximum length of ${field.length} characters.`);
        }
        return raw;
    }

    return { supportsField, parseValue };
});
