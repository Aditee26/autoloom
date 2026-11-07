const OPERATORS = [
  'equals', 'not_equals', 'contains', 'not_contains',
  'greater_than', 'less_than', 'exists', 'is_empty',
];
const NO_VALUE_OPERATORS = new Set(['exists', 'is_empty']);

function isEmpty(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).length === 0;
  return false;
}

function looseEquals(a, b) {
  if (a === b) return true;
  if (a === undefined || a === null || b === undefined || b === null) return false;
  if (typeof a === 'object' || typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}

function contains(haystack, needle) {
  if (haystack === undefined || haystack === null) return false;
  if (Array.isArray(haystack)) return haystack.some((item) => looseEquals(item, needle));
  if (typeof haystack === 'object') return Object.prototype.hasOwnProperty.call(haystack, String(needle));
  return String(haystack).toLowerCase().includes(String(needle).toLowerCase());
}

function compareNumbers(a, b, cmp) {
  const x = Number(a);
  const y = Number(b);
  if (a === '' || b === '' || a === null || b === null || Number.isNaN(x) || Number.isNaN(y)) return false;
  return cmp(x, y);
}

/** Evaluate a condition. `actual` and `expected` are already interpolated. */
function evaluateCondition(operator, actual, expected) {
  switch (operator) {
    case 'equals': return looseEquals(actual, expected);
    case 'not_equals': return !looseEquals(actual, expected);
    case 'contains': return contains(actual, expected);
    case 'not_contains': return !contains(actual, expected);
    case 'greater_than': return compareNumbers(actual, expected, (x, y) => x > y);
    case 'less_than': return compareNumbers(actual, expected, (x, y) => x < y);
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'is_empty': return isEmpty(actual);
    default: throw new Error(`Unsupported operator: ${operator}`);
  }
}

module.exports = { OPERATORS, NO_VALUE_OPERATORS, evaluateCondition };
