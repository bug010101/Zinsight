/**
 * 安卓端 · 超市小票 Canvas 绘制
 * 把 Core.buildReceiptModel 的结果画成一张「超市消费小票」位图（中文由系统字体渲染），
 * 再由 io.js 交给 jspdf 包装成真正的 .pdf。单独成模块以满足单文件行数约束。
 */

import { Core } from './deps.js';

const RECEIPT_W = 340;
const RECEIPT_PAD = 16;
const RECEIPT_FONT = (size, weight) =>
  `${weight ? weight + ' ' : ''}${size}px -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;

/**
 * 把 buildReceiptModel 的结果画成一张「超市消费小票」位图（中文由系统字体渲染）。
 * 返回 { canvas, width, height }（width/height 为逻辑像素，canvas 内部按 2x 渲染保证清晰）。
 */
export function renderReceiptCanvas(model) {
  const dpr = 2;
  const lineH = 18;
  const noteH = 15;
  const gap = 7;

  // 先估算高度
  let height = RECEIPT_PAD;
  height += 26 + 16 + 18;          // 店名 + 两行副标题
  height += gap + 6;               // 分割线
  model.items.forEach(item => {
    height += lineH;
    if (item.note) height += noteH + 2;
    height += gap;
  });
  height += gap + 6;               // 分割线
  height += lineH * 4 + 6 + 8;     // 三项合计 + 总笔数（带上线）
  height += gap + 6;               // 分割线
  height += 14 + 16;               // 两行页脚
  height += RECEIPT_PAD;

  const canvas = document.createElement('canvas');
  canvas.width = RECEIPT_W * dpr;
  canvas.height = Math.ceil(height) * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, RECEIPT_W, height);
  ctx.textBaseline = 'middle';

  let cursorY = RECEIPT_PAD;
  const drawDash = () => {
    ctx.strokeStyle = '#c4c4c4';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(RECEIPT_PAD, cursorY);
    ctx.lineTo(RECEIPT_W - RECEIPT_PAD, cursorY);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  ctx.textAlign = 'center';
  ctx.fillStyle = '#1a1a1a';
  ctx.font = RECEIPT_FONT(17, 'bold');
  ctx.fillText('Zinsight 消费小票', RECEIPT_W / 2, cursorY + 13);
  cursorY += 26;
  ctx.font = RECEIPT_FONT(11);
  ctx.fillStyle = '#8a8a8a';
  ctx.fillText(`${model.scope} · 共 ${model.count} 笔`, RECEIPT_W / 2, cursorY + 8);
  cursorY += 16;
  ctx.fillText(model.generatedAt, RECEIPT_W / 2, cursorY + 9);
  cursorY += 18 + gap;
  drawDash();
  cursorY += 6;

  ctx.font = RECEIPT_FONT(13, 'bold');
  model.items.forEach(item => {
    const label = item.income ? '收入' : '支付';
    const color = item.income ? '#1e8449' : '#c0392b';
    const catText = item.category + (item.reward ? ' ·奖励' : '');
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(catText, RECEIPT_PAD, cursorY + lineH / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.fillText(`${label} ¥${Core.formatMoney(item.amount)}`, RECEIPT_W - RECEIPT_PAD, cursorY + lineH / 2);
    cursorY += lineH;
    if (item.note) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#9a9a9a';
      ctx.font = RECEIPT_FONT(11);
      ctx.fillText(item.note, RECEIPT_PAD, cursorY + noteH / 2);
      ctx.font = RECEIPT_FONT(13, 'bold');
      cursorY += noteH + 2;
    }
    cursorY += gap;
  });

  drawDash();
  cursorY += 6;

  const summary = [
    ['收入合计', Core.formatMoney(model.totalIncome), '#1e8449'],
    ['生活支付', Core.formatMoney(model.totalLife), '#c0392b'],
    ['奖励支付', Core.formatMoney(model.totalReward), '#c0392b']
  ];
  summary.forEach(([text, value, color]) => {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#1a1a1a';
    ctx.font = RECEIPT_FONT(13);
    ctx.fillText(text, RECEIPT_PAD, cursorY + lineH / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = color;
    ctx.font = RECEIPT_FONT(13, 'bold');
    ctx.fillText('¥' + value, RECEIPT_W - RECEIPT_PAD, cursorY + lineH / 2);
    cursorY += lineH;
  });
  cursorY += 6;
  drawDash();
  cursorY += 8;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#1a1a1a';
  ctx.font = RECEIPT_FONT(14, 'bold');
  ctx.fillText('总笔数', RECEIPT_PAD, cursorY + lineH / 2);
  ctx.textAlign = 'right';
  ctx.fillText(`${model.count} 笔`, RECEIPT_W - RECEIPT_PAD, cursorY + lineH / 2);
  cursorY += lineH + gap;
  drawDash();
  cursorY += 6;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#b0b0b0';
  ctx.font = RECEIPT_FONT(10);
  ctx.fillText('本小票由 Zinsight 生成', RECEIPT_W / 2, cursorY + 7);
  cursorY += 14;
  ctx.fillText('数据全部保存在本机 · 仅供个人记账参考', RECEIPT_W / 2, cursorY + 8);

  return { canvas, width: RECEIPT_W, height: Math.ceil(height) };
}
