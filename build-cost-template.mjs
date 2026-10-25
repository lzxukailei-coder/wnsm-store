// 成本录入模板生成器：按品牌切表 + 同型号(内存/颜色/渠道)聚拢，激活/原封相邻。
// 输出后台「批量导入」可直接粘贴的长表 CSV（6列），只含手机+平板、在库、公开价>=MIN。
import fs from 'fs';
const MIN = 5000;
const d = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url), 'utf8'));
const ps = d.products || [];
const oos = p => (p.tags || []).includes('缺货') || p.price < 100;
const PHONE_CATS = ['苹果','华为','华为ND','华为全国','小米','荣耀','VIVO','OPPO','三星','摩托罗拉','诺基亚','百合'];
const TABLET_RE = /平板|iPad|IPAD|MatePad/;
const isCore = p => PHONE_CATS.includes(p.category) || TABLET_RE.test(p.name || '');

// 渠道归一：激活在前，原封在后（同型号同颜色时排到一起）
function channelKind(p) {
  const t = (p.tags || []).join('');
  const ch = p.channel || '';
  if (t.includes('激活') || ch.includes('激活')) return { rank: 0, label: '激活' };
  if (t.includes('国补') || ch.includes('国补')) return { rank: 3, label: '国补' };
  if (ch === '官网') return { rank: 2, label: '官网' };
  return { rank: 1, label: '原封' };
}

// 机型归并键（用于“同型号”聚拢）。苹果用“型号名”；安卓取内存配置前的机型名
function familyOf(p) {
  const n = p.name || '';
  if (p.category === '苹果' && p.model) {
    const i = n.indexOf('(');
    return i > 0 ? n.slice(0, i) : n;
  }
  const m = n.match(/\d+GB?\+\d+(?:GB|TB|G|T)?/i) || n.match(/\d+\+\d+(?:GB|TB|G|T)?/i);
  if (m) return n.slice(0, n.indexOf(m[0])).replace(/[\s\-_·]+$/, '').trim();
  const m2 = n.match(/(\d+)(TB|GB|G)(?![A-Za-z])/i);
  if (m2) return n.slice(0, n.indexOf(m2[0])).replace(/[\s\-_·]+$/, '').trim();
  return n.replace(/原封.*$/, '').replace(/激活.*$/, '').trim();
}

// 存储容量（GB），用于同机型内存排序（256<512<1024）
function storageRankOf(p) {
  const n = p.name || '';
  const re = /(\d+)\s*(TB|GB|G|T)\b/gi;
  const vals = [];
  let m;
  while ((m = re.exec(n))) {
    let v = +m[1];
    if (m[2].toUpperCase() === 'TB' || m[2] === 'T') v *= 1024;
    vals.push(v);
  }
  if (vals.length) return Math.max(...vals);
  const s = String(p.storage || '');
  const mm = s.match(/(\d+)\s*(TB|GB|G|T)/i);
  if (mm) { let v = +mm[1]; if (/TB|T/i.test(mm[2])) v *= 1024; return v; }
  return 0;
}

function fileKey(p) {
  const n = p.name || '', c = p.category || '', b = p.brand || '';
  if (TABLET_RE.test(n)) return '08_平板';
  if (c.includes('苹果') || b === 'apple') return '01_苹果';
  if (c.includes('华为') || b === 'huawei') return '02_华为';
  if (c.includes('小米') || b === 'xiaomi') return '03_小米';
  if (c.includes('荣耀') || b === 'honor') return '04_荣耀';
  if (c === 'VIVO' || b === 'vivo') return '05_VIVO';
  if (c === 'OPPO' || b === 'oppo') return '06_OPPO';
  if (c.includes('三星') || b === 'samsung') return '07_三星';
  return '09_其他品牌';
}

const rows = ps.filter(p => isCore(p) && !oos(p) && p.price >= MIN).map(p => {
  const ck = channelKind(p);
  return {
    id: p.id, name: p.name, category: p.category, price: p.price,
    chLabel: ck.label, chRank: ck.rank,
    family: familyOf(p), storage: storageRankOf(p), color: p.color || '',
    file: fileKey(p)
  };
});

// 每个机型分组的最高价（让贵机型整体排在前）
const gmax = {};
for (const r of rows) {
  const k = r.file + '||' + r.family;
  if (!(k in gmax) || r.price > gmax[k]) gmax[k] = r.price;
}

const files = {};
for (const r of rows) {
  r.gmax = gmax[r.file + '||' + r.family];
  (files[r.file] ||= []).push(r);
}

const BOM = '\uFEFF';
const header = '类型,匹配值,成本,硬底价,固定价,备注';
for (const [file, list] of Object.entries(files)) {
  list.sort((a, b) =>
    b.gmax - a.gmax ||
    a.family.localeCompare(b.family, 'zh') ||
    a.storage - b.storage ||
    a.color.localeCompare(b.color, 'zh') ||
    a.chRank - b.chRank ||
    a.price - b.price
  );
  const lines = [header];
  for (const r of list) {
    lines.push(`编号,${r.id},,,,【${r.chLabel}】${r.name}｜${r.category}｜公开价${r.price}`);
  }
  fs.writeFileSync(new URL('./成本_' + file + '.csv', import.meta.url), BOM + lines.join('\r\n'), 'utf8');
}

console.log(`数据时间 ${d.updateTime} | 公开价≥${MIN} 的手机+平板：${rows.length} 个 SKU\n`);
Object.keys(files).sort().forEach(f => {
  const list = files[f];
  const families = new Set(list.map(x => x.family)).size;
  console.log(`成本_${f}.csv  ${list.length} 个SKU / ${families} 个机型`);
});
