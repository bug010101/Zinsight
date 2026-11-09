/**
 * 源码规范检查（零依赖，Node 内置模块）
 *
 * 运行：npm run lint（也由 npm run test:core 在跑自测前自动执行）
 *
 * 规则对应 README「代码规范」章节：
 *   1. 标识符不得含 $ 等符号，不得使用单字母局部名
 *   2. 只用 const / let，禁止 var
 *   3. 运行时 JS/CJS 单文件不超过 300 行（共享纯函数内核为约定例外）
 *   4. 文件名用小写字母 + 连字符，语义清晰
 *   5. 跨模块成员调用（Core / LedgerCore / AiContext）必须真实存在
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'src');
const LINE_LIMIT = 300;
const LINE_LIMIT_EXCEPTIONS = new Set(['src/renderer/shared/ledger-core.js']);

let failures = 0;
function report(rule, problems) {
  if (!problems.length) {
    console.log('  ✓ ' + rule);
    return;
  }
  failures += problems.length;
  console.log('  ✗ ' + rule + '（' + problems.length + ' 处）');
  problems.slice(0, 12).forEach(item => console.log('      ' + item));
  if (problems.length > 12) console.log('      ... 其余 ' + (problems.length - 12) + ' 处');
}

/**
 * 生成「代码区掩码」：字符串、注释、正则字面量、模板字符串正文用空格占位，
 * 模板字符串 ${...} 内的表达式仍保留为代码。用于只在真实代码里找标识符。
 */
function buildCodeMask(source) {
  const mask = source.split('');
  const blank = (from, to) => {
    for (let index = from; index < to && index < mask.length; index++) {
      if (mask[index] !== '\n' && mask[index] !== '\r') mask[index] = ' ';
    }
  };
  let index = 0;
  let state = 'code';
  let quoteStart = -1;
  let quoteChar = '';
  let templateDepth = 0;
  let previousMeaningful = '';
  const regexKeywords = new Set(['return', 'case', 'throw', 'yield', 'typeof', 'delete', 'void', 'new', 'else']);

  const previousWord = () => {
    let cursor = index - 1;
    while (cursor >= 0 && /\s/.test(source[cursor])) cursor--;
    const end = cursor + 1;
    while (cursor >= 0 && /[\w$]/.test(source[cursor])) cursor--;
    return source.slice(cursor + 1, end);
  };

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'code') {
      if (char === '/' && next === '/') {
        const end = source.indexOf('\n', index) === -1 ? source.length : source.indexOf('\n', index);
        blank(index, end); index = end; continue;
      }
      if (char === '/' && next === '*') { state = 'block-comment'; quoteStart = index; index += 2; continue; }
      if (char === "'" || char === '"' || char === '`') {
        state = char === '`' ? 'template' : 'string'; quoteChar = char; quoteStart = index; index++; continue;
      }
      if (char === '/' && (/[([{=,:;!?&|+\-*%~^<>]/.test(previousMeaningful) || regexKeywords.has(previousWord()))) {
        state = 'regex'; quoteStart = index; index++; continue;
      }
      if (!/\s/.test(char)) previousMeaningful = char;
      index++; continue;
    }
    if (state === 'line-comment') { if (char === '\n') state = 'code'; index++; continue; }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') { blank(quoteStart, index + 2); state = 'code'; index += 2; continue; }
      index++; continue;
    }
    if (state === 'string' || state === 'nested-string') {
      if (char === '\\') { index += 2; continue; }
      if (char === quoteChar) {
        blank(quoteStart, index + 1);
        state = state === 'nested-string' ? 'template-expression' : 'code';
        index++; continue;
      }
      index++; continue;
    }
    if (state === 'template') {
      if (char === '\\') { index += 2; continue; }
      if (char === '$' && next === '{') {
        blank(quoteStart, index); state = 'template-expression'; templateDepth = 1; index += 2; continue;
      }
      if (char === '`') { blank(quoteStart, index + 1); state = 'code'; index++; continue; }
      index++; continue;
    }
    if (state === 'template-expression') {
      if (char === "'" || char === '"' || char === '`') {
        state = 'nested-string'; quoteChar = char; quoteStart = index; index++; continue;
      }
      if (char === '{') templateDepth++;
      if (char === '}') {
        templateDepth--;
        if (templateDepth === 0) { state = 'template'; quoteStart = index + 1; index++; continue; }
      }
      index++; continue;
    }
    if (state === 'regex') {
      if (char === '\\') { index += 2; continue; }
      if (char === '[') { state = 'regex-class'; index++; continue; }
      if (char === '/') {
        let end = index + 1;
        while (/[a-z]/i.test(source[end] || '')) end++;
        blank(quoteStart, end); state = 'code'; index = end; continue;
      }
      index++; continue;
    }
    if (state === 'regex-class') {
      if (char === '\\') { index += 2; continue; }
      if (char === ']') state = 'regex';
      index++; continue;
    }
    index++;
  }
  if (state === 'string' || state === 'template' || state === 'regex') blank(quoteStart, source.length);
  return mask.join('');
}

function collectFiles(dir, output) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(target, output);
    else if (/\.(js|cjs)$/.test(entry.name)) output.push(target);
  }
  return output;
}

const files = collectFiles(SOURCE_DIR, []);
files.push(path.join(ROOT, 'main.js'));
const sources = new Map(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
const relative = file => path.relative(ROOT, file).split(path.sep).join('/');
const locate = (source, position) => source.slice(0, position).split('\n').length;

console.log('源码规范检查');

// 1. 符号标识符：jQuery 风格的 $ / $$ / $xxx 一律禁止
const symbolProblems = [];
for (const [file, source] of sources) {
  const mask = buildCodeMask(source);
  for (const match of source.matchAll(/(?<![\w.])\$+[\w$]*(?=\s*[,(=])|\$\$?(?=\s*[,(=])/g)) {
    if (mask.slice(match.index, match.index + match[0].length).trim() !== match[0].trim()) continue;
    symbolProblems.push(relative(file) + ':' + locate(source, match.index) + '  ' + match[0]);
  }
}
report('禁止 $ / $$ 等符号标识符', symbolProblems);

// 2. 单字母局部名：变量、参数、箭头函数参数必须语义化
const shortNameProblems = [];
for (const [file, source] of sources) {
  const mask = buildCodeMask(source);
  for (const match of source.matchAll(/(?<![\w.$])([A-Za-z])(?![\w$])/g)) {
    if (mask[match.index] !== match[1]) continue;
    shortNameProblems.push(relative(file) + ':' + locate(source, match.index) + '  ' + match[1]);
  }
}
report('禁止单字母局部变量 / 参数', shortNameProblems);

// 3. var 声明
const varProblems = [];
for (const [file, source] of sources) {
  source.split('\n').forEach((line, index) => {
    if (/\bvar\s+/.test(line) && !/^\s*[*/]/.test(line)) varProblems.push(relative(file) + ':' + (index + 1));
  });
}
report('只用 const / let，禁止 var', varProblems);

// 4. 文件规模
const sizeProblems = [];
for (const [file, source] of sources) {
  const name = relative(file);
  const lines = source.split('\n').length;
  if (lines > LINE_LIMIT && !LINE_LIMIT_EXCEPTIONS.has(name)) sizeProblems.push(name + '  ' + lines + ' 行');
}
report('运行时 JS/CJS 单文件 <= ' + LINE_LIMIT + ' 行（内核例外）', sizeProblems);

// 5. 文件名
const filenameProblems = [];
for (const file of files) {
  if (!/^[a-z0-9.-]+\.(js|cjs)$/.test(path.basename(file))) filenameProblems.push(relative(file));
}
report('文件名小写字母 + 连字符', filenameProblems);

// 6. 跨模块成员调用契约
const contractProblems = [];
const Core = require(path.join(SOURCE_DIR, 'renderer/shared/ledger-core.js'));
const AiContext = require(path.join(SOURCE_DIR, 'renderer/shared/ai/index.js'));
for (const [file, source] of sources) {
  for (const match of source.matchAll(/\b(Core|LedgerCore|AiContext)\.([A-Za-z_$][\w$]*)/g)) {
    const api = match[1] === 'AiContext' ? AiContext : Core;
    if (!(match[2] in api)) contractProblems.push(relative(file) + ':' + locate(source, match.index) + '  ' + match[0]);
  }
}
report('Core / LedgerCore / AiContext 成员调用均存在', contractProblems);

console.log(failures ? '\n共 ' + failures + ' 处不符合规范' : '\n全部符合规范');
process.exit(failures ? 1 : 0);
