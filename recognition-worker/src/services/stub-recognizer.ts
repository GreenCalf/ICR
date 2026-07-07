const latin = 'ABCDERFGHIJKLMNOPQRSTUVWXYZ';
const digits = '0123456789';
const cyrillic = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩ';
const mixed = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function pick(source: string) {
  const idx = Math.floor(Math.random() * source.length);
  return source[idx];
}

function alternatives(main: string, source: string) {
  const set = new Set([main]);
  while (set.size < 4) {
    set.add(pick(source));
  }
  return Array.from(set);
}

export function runStubForField(fieldCode: string) {
  const f = fieldCode.toLowerCase();
  if (f.includes('document') || f.includes('number')) {
    const value = `${pick(digits)}${pick(digits)}${pick(digits)}${pick(digits)}-${pick(digits)}${pick(digits)}${pick(digits)}`;
    return {
      value,
      confidence: 0.84,
      alternatives: alternatives(value.slice(0, 1), digits)
    };
  }
  if (f === 'code') {
    const value = `${pick(cyrillic)}${pick(cyrillic)}${pick(mixed)}${pick(digits)}`;
    return { value, confidence: 0.73, alternatives: alternatives(value[0], cyrillic) };
  }
  const value = `${pick(latin)}${pick(latin)}${pick(latin)}${pick(digits)}`;
  return { value, confidence: 0.81, alternatives: alternatives(value[0], latin) };
}

