// 品牌与品类展示映射（与官网 BRAND_ORDER / BRAND_NAMES 保持一致，保证多端分类统一）

const BRAND_ORDER = ['apple', 'huawei', 'honor', 'xiaomi', 'vivo', 'oppo', 'samsung', 'motorola', 'dji', 'nokia', 'xiaodu', 'skg', 'baihe', 'andun', 'edu', 'other'];

const BRAND_NAMES = {
  apple: '苹果', huawei: '华为', honor: '荣耀', xiaomi: '小米', vivo: 'VIVO',
  oppo: 'OPPO/一加', samsung: '三星', motorola: '摩托罗拉', dji: '大疆',
  nokia: '诺基亚', xiaodu: '小度', skg: 'SKG', baihe: '百合', andun: '安顿',
  edu: '学习设备', other: '其他'
};

// 后端 ptype 分组：phone 手机 / tablet 平板 / watch 手表 / audio 耳机 / accessory 配件 / computer 电脑 / smart 其他
const TYPE_TABS = [
  { key: 'all', name: '全部' },
  { key: 'phone', name: '手机' },
  { key: 'tablet', name: '平板' },
  { key: 'watch', name: '手表' },
  { key: 'audio', name: '耳机' },
  { key: 'accessory', name: '配件' },
  { key: 'computer', name: '电脑' }
];

const PRICE_LABEL = {
  wholesale: { text: '批发价', cls: 'tag-b' },
  retail: { text: '零售价', cls: 'tag-c' },
  pending: { text: '审核中', cls: 'tag-p' },
  public: { text: '渠道价', cls: 'tag-public' }
};

function groupByBrand(products) {
  const map = {};
  products.forEach(p => {
    const key = p.brand || 'other';
    if (!map[key]) map[key] = [];
    map[key].push(p);
  });
  return BRAND_ORDER.filter(k => map[k] && map[k].length).map(k => ({
    key: k,
    name: BRAND_NAMES[k] || k,
    items: map[k]
  }));
}

module.exports = { BRAND_ORDER, BRAND_NAMES, TYPE_TABS, PRICE_LABEL, groupByBrand };
