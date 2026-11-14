import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequestGet } from '../functions/api/products.js';

const phone = (id, name, extra = {}) => ({
  id, name, brand: 'huawei', category: '华为', price: 1000, memberPrice: 800, tags: [], ...extra
});
const products = [
  phone('mate-black', '华为Mate80 12GB+256GB曜石黑原封'),
  phone('mate-white', '华为Mate80-12GB+256GB雪域白原封'),
  phone('mate-green', '华为Mate 80 12GB+256GB极光青原封'),
  phone('mate-pro', '华为Mate80Pro 16GB+512GB曜石黑原封'),
  phone('mate-max', '华为Mate80Pro Max 16GB+512GB极地银原封'),
  phone('mate10', '华为Mate10 64G黑色'),
  phone('mate9', '华为Mate9 128G白色'),
  phone('mate90-1tb', 'Mate90Pro 16+1T 皓白原封'),
  phone('mate90-512-black', 'Mate90Pro 12+512 曜石黑原封'),
  phone('mate90-512-purple', 'Mate90Pro 16GB+512GB5G原封型格紫', { storage: '16GB' }),
  phone('mate90-512-white', 'Mate90Pro 12+512 晶钻白原封'),
  phone('mate90-256', 'Mate90Pro 12+256 晶钻白原封'),
  phone('tablet', '华为MatePad 128GB灰原封'),
  phone('other', '苹果手机 256GB黑原封', { brand: 'apple', category: '苹果' })
];
const expires_at = new Date(Date.now() + 60000).toISOString();
const env = {
  ASSETS: { fetch: async () => Response.json({ products, updateTime: '2026-11-09 07:05' }) },
  DB: {
    prepare: () => ({
      all: async () => ({ results: [] }),
      bind: token => ({ first: async () => (
        token === 'approved' || token === 'pending'
          ? { id: 1, role: 'B', status: token, expires_at }
          : null
      ) })
    })
  }
};

async function query(params = {}, token = '') {
  const url = new URL('https://example.test/api/products');
  url.search = new URLSearchParams(params);
  const request = new Request(url, { headers: token ? { 'X-Wnsm-Token': token } : {} });
  const response = await onRequestGet({ request, env });
  return { response, body: await response.json() };
}

test('报价先搜索筛选再分页，原版调用仍取得完整目录', async () => {
  const { body: legacy } = await query();
  assert.equal(legacy.count, products.length);
  assert.deepEqual(legacy.products.map(product => product.id), products.map(product => product.id));
  assert.equal('pagination' in legacy, false);
  assert.equal('modelKey' in legacy.products[0], false);
  const filters = { view: 'catalog', q: 'Mate80 256 原封', brand: 'huawei', type: 'phone', pageSize: '2' };
  const { body: first } = await query(filters);
  assert.deepEqual(first.products.map(product => product.id), ['mate-green', 'mate-white']);
  assert.deepEqual(first.pagination, { page: 1, pageSize: 2, total: 3, hasMore: true });
  const { body: second } = await query({ ...filters, page: '2' });
  assert.deepEqual(second.products.map(product => product.id), ['mate-black']);
  assert.equal(second.pagination.hasMore, false);
  const { body: outside } = await query({ ...filters, page: '999', pageSize: '500' });
  assert.equal(outside.pagination.pageSize, 50);
  assert.deepEqual(outside.products, []);
  assert.equal(outside.pagination.hasMore, false);
  const { body: tablets } = await query({ view: 'catalog', type: 'tablet' });
  assert.deepEqual(tablets.products.map(product => product.id), ['tablet']);
});

test('型号按数字顺序，规格跨页按容量、运行内存和颜色排序', async () => {
  const { body: models } = await query({ view: 'catalog', q: '华为Mate', pageSize: '2' });
  assert.deepEqual(models.products.map(product => product.id), ['mate9', 'mate10']);

  const params = { view: 'catalog', q: 'Mate90Pro', pageSize: '3' };
  const { body: first } = await query(params);
  assert.deepEqual(first.products.map(product => product.id), ['mate90-256', 'mate90-512-white', 'mate90-512-black']);
  const { body: second } = await query({ ...params, page: '2' });
  assert.deepEqual(second.products.map(product => product.id), ['mate90-512-purple', 'mate90-1tb']);
  const { body: detail } = await query({ view: 'model', key: 'huawei|mate90pro12+512晶钻白原封' });
  assert.equal(detail.modelName, 'Mate90Pro');
  assert.deepEqual(detail.products.map(product => product.id), [...first.products, ...second.products].map(product => product.id));
});

test('带单位搜索也能查到简称和省略单位的报价', async () => {
  const { body: gb } = await query({ view: 'catalog', q: 'Mate90 Pro 512GB' });
  assert.deepEqual(gb.products.map(product => product.id), ['mate90-512-white', 'mate90-512-black', 'mate90-512-purple']);
  const { body: tb } = await query({ view: 'catalog', q: 'Mate90 Pro 1TB' });
  assert.deepEqual(tb.products.map(product => product.id), ['mate90-1tb']);
});

test('分享机型只聚合相同型号，新旧查询均按会话保护价格', async () => {
  const { body: list } = await query({ view: 'catalog', q: 'Mate80' });
  const [base, , , pro, max] = list.products;
  assert.notEqual(base.modelKey, pro.modelKey);
  assert.notEqual(pro.modelKey, max.modelKey);
  for (const [token, price] of [['', 1000], ['pending', 1000], ['approved', 850]]) {
    const { body, response } = await query({ view: 'model', key: base.modelKey }, token);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(body.products.map(product => product.id), ['mate-green', 'mate-white', 'mate-black']);
    assert.equal(body.modelName.replace(/\s+/g, ''), '华为Mate80');
    for (const variant of body.products) {
      assert.equal(variant.displayPrice, price);
      assert.equal('memberPrice' in variant || 'cost' in variant || 'price' in variant, false);
    }
    const { body: listBody } = await query({ view: 'catalog', pageSize: '1' }, token);
    assert.equal(listBody.products[0].displayPrice, price);
  }
  assert.equal((await query({ view: 'model', key: 'no-longer-listed' })).response.status, 404);
});
