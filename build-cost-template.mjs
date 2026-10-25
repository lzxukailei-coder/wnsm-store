import fs from 'fs';
const d = JSON.parse(fs.readFileSync(new URL('./data.json', import.meta.url), 'utf8'));
const ps = d.products || [];
const oos = p => (p.tags || []).includes('缺货') || p.price < 100;

// 核心经营品类：手机（含全国/ND 渠道）+ 平板；排除电视/家电/手表/眼镜/耳机/配件/笔记本
const PHONE_CATS = ['苹果','华为','华为ND','华为全国','小米','荣耀','VIVO','OPPO','三星','摩托罗拉','诺基亚','百合'];
const TABLET_RE = /平板|iPad|IPAD|MatePad/;
const isCore = p => PHONE_CATS.includes(p.category) || TABLET_RE.test(p.name || '');

// 生成“成本录入模板”：在库、核心品类、公开价在 [min,max) 的 SKU，按价降序，id 精确匹配
function build(min, max, file) {
  const rows = ps.filter(p => isCore(p) && !oos(p) && p.price >= min && p.price < max)
    .sort((a, b) => b.price - a.price);
  const lines = ['类型,匹配值,成本,硬底价,固定价,备注'];
  const catCount = {};
  for (const p of rows) {
    catCount[p.category] = (catCount[p.category] || 0) + 1;
    // 备注不含半角逗号，避免简单 CSV 切列；用全角｜分隔
    const ch = p.channel && p.channel !== '*' ? p.channel : (p.tags || []).join('/') || '';
    const note = `${p.name}｜${p.category}｜公开价${p.price}｜${ch}`;
    lines.push(`编号,${p.id},,,,${note}`);
  }
  const BOM = '\uFEFF';
  fs.writeFileSync(new URL('./' + file, import.meta.url), BOM + lines.join('\r\n'), 'utf8');
  const range = max === Infinity ? `≥${min}` : `${min}~${max}`;
  console.log(`\n${file}：${rows.length} 行（公开价${range}，在库）`);
  Object.entries(catCount).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log('   ', k, v));
}

build(8000, Infinity, '成本录入_第一批_8000以上.csv');
build(5000, 8000, '成本录入_第二批_5000到8000.csv');
