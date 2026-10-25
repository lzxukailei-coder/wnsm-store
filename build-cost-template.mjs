// 成本录入模板生成器：按品牌切表 + 同型号(版本/内存/颜色/渠道)聚拢，激活/原封相邻。
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

// 版本/配置变体词（出现在内存配置之后，需补入机型键；不含纯颜色/玻璃工艺）
const VERSION_WORDS = [
  '典藏版','先锋版','优享版','周年纪念版','纪念版','柔光悦读版','柔光版','标准版',
  '灵动款','灵动版','悦读版','鸿蒙焕新版','焕新版','北斗版','灵盾防窥屏','超能版',
  '超级版','至尊版','尊享版','活力版','元气版','徕卡版','特别版','卫星通信版',
  '卫星消息版','星闪版','畅学版','非凡大师'
];

// 解析运行内存/存储容量，返回 {ram,rom,index,str}
function parseCfg(n) {
  const m = n.match(/(\d+)\s*GB?\s*\+\s*(\d+)\s*(TB|GB|G|T)?/i) ||
            n.match(/(\d+)\s*\+\s*(\d+)\s*(TB|GB|G|T)?/i);
  if (m) {
    let rom = +m[2];
    const u = (m[3] || 'G').toUpperCase();
    if (u === 'TB' || u === 'T') rom *= 1024;
    return { ram: +m[1], rom, index: n.indexOf(m[0]), str: m[0] };
  }
  const m2 = n.match(/(\d+)\s*(TB|GB|G|T)(?![A-Za-z])/i);
  if (m2) {
    let rom = +m2[1];
    if (/TB|T/i.test(m2[2])) rom *= 1024;
    return { ram: 0, rom, index: n.indexOf(m2[0]), str: m2[0] };
  }
  return { ram: 0, rom: 0, index: -1, str: '' };
}

// 机型归并键：苹果用型号名；其他取“机型名”，并补内存配置后的版本词（典藏/先锋/柔光…）
function familyOf(p) {
  const n = p.name || '';
  if (p.category === '苹果' && p.model) {
    const i = n.indexOf('(');
    return i > 0 ? n.slice(0, i) : n;
  }
  const cfg = parseCfg(n);
  let prefix, suffix;
  if (cfg.index >= 0) {
    prefix = n.slice(0, cfg.index).replace(/[\s\-_·]+$/, '').trim();
    suffix = n.slice(cfg.index + cfg.str.length);
  } else {
    prefix = n.replace(/原封.*$/, '').replace(/激活.*$/, '').trim();
    suffix = '';
  }
  const vs = VERSION_WORDS.filter(w => suffix.includes(w) && !prefix.includes(w));
  return vs.length ? prefix + ' ' + vs.join('') : prefix;
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
  const cfg = parseCfg(p.name || '');
  return {
    id: p.id, name: p.name, category: p.category, price: p.price,
    chLabel: ck.label, chRank: ck.rank,
    family: familyOf(p), rom: cfg.rom, ram: cfg.ram, color: p.color || '',
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
    a.rom - b.rom ||
    a.ram - b.ram ||
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
