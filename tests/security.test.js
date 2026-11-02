import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCookies, getUser } from '../functions/_lib/auth.js';
import { toPublicProduct } from '../functions/_lib/catalog.js';
import { onRequestGet } from '../functions/api/products.js';
import { onRequest } from '../functions/data.json.js';

test('损坏的无关 Cookie 不阻断有效会话', () => {
  assert.equal(parseCookies('tracking=%ZZ; wnsm_session=valid').wnsm_session, 'valid');
  assert.equal(parseCookies('wnsm_session=%ZZ').wnsm_session, undefined);
});

test('过期、缺失或非法到期时间不能授予登录身份', async () => {
  const request = new Request('https://example.test/api/products', { headers: { 'X-Wnsm-Token': 'token' } });
  for (const expires_at of ['bad-date', null, undefined, '2000-01-01T00:00:00Z']) {
    const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ id: 1, role: 'B', status: 'approved', expires_at }) }) }) } };
    assert.equal(await getUser(request, env), null);
  }
  const env = { DB: { prepare: () => ({ bind: () => ({ first: async () => ({ id: 1, role: 'B', status: 'approved', expires_at: new Date(Date.now() + 60000).toISOString() }) }) }) } };
  assert.equal((await getUser(request, env)).id, 1);
});

const product = { id: 'sku1', name: '测试手机', category: '苹果', price: 1000, memberPrice: 800, tags: [] };
const pricing = { bMargin: 50, idMap: {}, modelMap: {}, nameRules: [] };
test('只有已审核 B 端获得批发价，各身份均不返回成本字段', () => {
  for (const [user, expected] of [[null, 1000], [{ role: 'C' }, 1000], [{ role: 'B', status: 'pending' }, 1000], [{ role: 'B', status: 'rejected' }, 1000], [{ role: 'B', status: 'approved' }, 850]]) {
    const result = toPublicProduct(product, user, pricing);
    assert.equal(result.displayPrice, expected);
    for (const field of ['price', 'memberPrice', 'cost', 'floor', 'fixed', 'override']) assert.equal(field in result, false);
  }
});

test('商品读取与登录校验并行，响应仍禁止缓存且不泄露原始价格', async () => {
  let releaseAuth;
  const authReady = new Promise(resolve => { releaseAuth = resolve; });
  const env = {
    ASSETS: { fetch: async () => {
      releaseAuth(null);
      return Response.json({ updateTime: 'fixture', products: [product] });
    } },
    DB: { prepare: () => ({
      bind: () => ({ first: () => authReady }),
      all: async () => ({ results: [] })
    }) }
  };
  const request = new Request('https://example.test/api/products', { headers: { 'X-Wnsm-Token': 'expired' } });
  const response = await onRequestGet({ request, env });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.equal(body.count, 1);
  assert.equal(body.auth, null);
  assert.equal(body.products[0].displayPrice, 1000);
  assert.equal('memberPrice' in body.products[0], false);
});

test('原始目录访问处理器拒绝外部请求', () => {
  assert.equal(onRequest().status, 403);
});
