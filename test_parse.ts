const a = "[{\"id\":\"1\"}]";
const parsed = typeof a === 'string' ? JSON.parse(a) : a;
console.log(Array.isArray(parsed));
