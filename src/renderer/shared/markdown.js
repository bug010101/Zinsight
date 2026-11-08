/**
 * 轻量 Markdown 渲染器（零依赖、纯函数、两端共用）
 *
 * 设计前提：AI 返回的是不可信文本，所以
 *   1. 先做 HTML 转义，再生成标签 —— 原始 HTML / <script> 永远不会生效；
 *   2. 不生成 <img>、不生成可点击外链 —— 不发起任何外部请求，也不跳出 App；
 *   3. 代码块内容只转义，不做二次 Markdown 解析。
 *
 * 支持：标题、粗体/斜体/删除线、行内代码、围栏代码块、有序/无序列表、
 *       引用、分割线、表格、链接文本化。
 *
 * 用法：
 *   浏览器经典脚本：window.ZinsightMarkdown.renderMarkdown(text)
 *   ESM：import Markdown from '../shared/markdown.js' → Markdown.renderMarkdown(text)
 *   Node：require('./markdown.js').renderMarkdown(text)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ZinsightMarkdown = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 行内代码 / 代码块先占位，避免内部文本被后续规则误解析
  function protect(store, html) {
    const key = '\u0000MD' + store.length + '\u0000';
    store.push(html);
    return key;
  }

  function inline(raw, store) {
    let text = escapeHtml(raw);

    // 行内代码
    text = text.replace(/`([^`\n]+)`/g, (_, code) =>
      protect(store, '<code class="md-code">' + code + '</code>'));

    // 图片：只显示替代文本，绝不加载远程资源
    text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, (_, alt) =>
      '[图片：' + alt + ']');

    // 链接：只保留文本，不生成 <a>，避免任何外跳 / 外发请求
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) =>
      label + '<span class="md-url">（' + url + '）</span>');

    // 强调（先粗体后斜体，避免 ** 被拆成两个 *）
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
    text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
    text = text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

    return text;
  }

  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
  }

  function splitRow(line) {
    return line.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
  }

  function renderMarkdown(text) {
    const src = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    if (!src.trim()) return '';

    const store = [];
    const out = [];
    const lines = src.split('\n');

    let paragraph = [];
    let listType = null;      // 'ul' | 'ol'
    let quote = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      out.push('<p>' + paragraph.map(line => inline(line, store)).join('<br>') + '</p>');
      paragraph = [];
    }
    function closeList() {
      if (!listType) return;
      out.push('</' + listType + '>');
      listType = null;
    }
    function flushQuote() {
      if (!quote.length) return;
      out.push('<blockquote>' + quote.map(line => inline(line, store)).join('<br>') + '</blockquote>');
      quote = [];
    }
    function flushAll() {
      flushParagraph();
      closeList();
      flushQuote();
    }

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];

      // 围栏代码块
      const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
      if (fence) {
        flushAll();
        const buf = [];
        index++;
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
          buf.push(lines[index]);
          index++;
        }
        const lang = fence[1] ? '<span class="md-lang">' + escapeHtml(fence[1]) + '</span>' : '';
        out.push('<pre class="md-pre">' + lang + '<code>' +
          escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }

      // 表格：表头行 + 分隔行
      if (/^\s*\|.*\|\s*$/.test(line) && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
        flushAll();
        const head = splitRow(line);
        const widths = splitRow(lines[index + 1]);
        const align = widths.map(widthSpec => {
          const trimmed = widthSpec.trim();
          if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
          if (trimmed.endsWith(':')) return 'right';
          return 'left';
        });
        let html = '<div class="md-table-wrap"><table><thead><tr>';
        head.forEach((cell, idx) => {
          html += '<th style="text-align:' + (align[idx] || 'left') + '">' +
            inline(cell, store) + '</th>';
        });
        html += '</tr></thead><tbody>';
        index += 2;
        while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
          const row = splitRow(lines[index]);
          html += '<tr>';
          head.forEach((_, idx) => {
            html += '<td style="text-align:' + (align[idx] || 'left') + '">' +
              inline(row[idx] === undefined ? '' : row[idx], store) + '</td>';
          });
          html += '</tr>';
          index++;
        }
        index--; // 回退一行，交给 for 的 i++ 消费
        out.push(html + '</tbody></table></div>');
        continue;
      }

      // 空行：收束当前块
      if (!line.trim()) {
        flushAll();
        continue;
      }

      // 水平线
      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        flushAll();
        out.push('<hr>');
        continue;
      }

      // 标题
      const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
      if (heading) {
        flushAll();
        const level = heading[1].length;
        out.push('<h' + level + '>' + inline(heading[2], store) + '</h' + level + '>');
        continue;
      }

      // 引用
      const quoted = line.match(/^\s*>\s?(.*)$/);
      if (quoted) {
        flushParagraph();
        closeList();
        quote.push(quoted[1]);
        continue;
      }
      flushQuote();

      // 列表（含一层缩进的嵌套，用 padding 表现）
      const item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (item) {
        flushParagraph();
        const type = /\d/.test(item[2]) ? 'ol' : 'ul';
        const depth = item[1].length >= 2 ? ' class="md-nested"' : '';
        if (listType !== type) {
          closeList();
          out.push('<' + type + '>');
          listType = type;
        }
        out.push('<li' + depth + '>' + inline(item[3], store) + '</li>');
        continue;
      }
      closeList();

      paragraph.push(line);
    }
    flushAll();

    let html = out.join('\n');
    // 还原被保护的片段（可能嵌套，循环直到没有占位符）
    for (let pass = 0; pass < 3; pass++) {
      if (!/\u0000MD\d+\u0000/.test(html)) break;
      html = html.replace(/\u0000MD(\d+)\u0000/g, (_, number) => store[Number(number)] || '');
    }
    return html;
  }

  return { renderMarkdown, escapeHtml };
});
