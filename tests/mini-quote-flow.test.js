import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const path = (page) => '../miniprogram/pages/' + page + '/' + page + '.js';
const item = (id, name) => ({ id, name, brand: 'huawei', ptype: 'phone', displayPrice: 1000, priceLabel: 'public' });

function mount(name) {
  let definition;
  globalThis.Page = value => { definition = value; };
  const file = require.resolve(path(name));
  delete require.cache[file];
  require(file);
  return {
    ...definition,
    data: structuredClone(definition.data),
    writes: [],
    setData(next) {
      this.writes.push(next);
      for (const [key, value] of Object.entries(next)) {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        const field = parts.pop();
        const parent = parts.reduce((current, part) => current[part], this.data);
        parent[field] = value;
      }
    }
  };
}

function harness(token = '') {
  const calls = [];
  const captured = { route: '', clipboard: '', backs: 0, toasts: [] };
  globalThis.wx = {
    getStorageSync: () => token,
    setStorageSync: (key, value) => { token = value; },
    removeStorageSync: () => { token = ''; },
    request: options => { calls.push(options); },
    navigateTo: ({ url }) => { captured.route = url; },
    navigateBack: () => { captured.backs++; },
    showToast: ({ title }) => { captured.toasts.push(title); },
    setNavigationBarTitle() {},
    setClipboardData: ({ data }) => { captured.clipboard = data; }
  };
  const app = {
    globalData: { user: null },
    setUser(user) { this.globalData.user = user; },
    logout() { this.setUser(null); wx.removeStorageSync('wnsm_token'); }
  };
  globalThis.getApp = () => app;
  return { calls, captured, app };
}

function send(call, data) {
  call.success({ statusCode: 200, data: { ok: true, auth: null, ...data } });
}

test('切换搜索条件后，较早返回的请求不会覆盖新报价', async () => {
  const { calls, captured } = harness();
  const page = mount('index');
  page.onLoad();
  const initial = page.startQuery();
  const search = page.startQuery({ keyword: 'Mate80 256' });
  assert.equal(new URL(calls[0].url).searchParams.get('pageSize'), '20');
  assert.equal(new URL(calls[1].url).searchParams.get('q'), 'Mate80 256');
  send(calls[1], {
    updateTime: '2026-11-09 07:05',
    pagination: { page: 1, total: 3, hasMore: true },
    products: [item('mate', '华为Mate80 12GB+256GB冰川蓝原封')]
  });
  await search;
  send(calls[0], {
    updateTime: '2026-11-09 00:57',
    pagination: { page: 1, total: 1, hasMore: false },
    products: [item('old', '旧结果')]
  });
  await initial;
  assert.equal(page.data.groups[0].items[0].id, 'mate');
  assert.equal(page.data.quoteTime, '2026-11-09 15:05');
  const more = page.loadMore();
  assert.equal(new URL(calls[2].url).searchParams.get('page'), '2');
  send(calls[2], {
    updateTime: '2026-11-09 07:05',
    pagination: { page: 2, total: 3, hasMore: false },
    products: [item('mate-white', '华为Mate80 12GB+256GB雪域白原封'), item('mate-pro', '华为Mate80Pro 16GB+512GB曜石黑原封')]
  });
  await more;
  assert.deepEqual(page.data.groups.map(group => group.items.map(product => product.id)), [['mate', 'mate-white'], ['mate-pro']]);
  const append = page.writes.at(-1);
  assert.equal(Object.hasOwn(append, 'groups'), false);
  assert.equal(append['groups[0].items[1]'].id, 'mate-white');
  const quote = page.data.groups[0].items[1];
  page.openQuote({ currentTarget: { dataset: { id: quote.id, key: quote.modelKey } } });
  assert.match(captured.route, /^\/pages\/quote\/quote\?/);
  assert.equal(new URL(captured.route, 'https://example.test').searchParams.get('id'), 'mate-white');
});

test('机型分享保留选中规格，询价复制商品信息而不夹带会员报价', async () => {
  const { calls, captured } = harness();
  const page = mount('quote');
  page.modelKey = 'huawei|华为mate80';
  page.selectedId = 'white';
  const loaded = page.loadModel();
  send(calls[0], {
    updateTime: '2026-11-09 07:05',
    modelName: '华为Mate80',
    products: [
      item('black', '华为Mate80 12GB+256GB曜石黑原封'),
      { ...item('white', '华为Mate80 12GB+256GB雪域白原封'), color: '雪域白', priceLabel: 'wholesale' }
    ]
  });
  await loaded;
  assert.equal(page.data.selected.id, 'white');
  page.copyInquiry();
  assert.match(captured.clipboard, /华为Mate80.*雪域白原封/);
  assert.match(captured.clipboard, /256GB \/ 雪域白 \/ 原封/);
  assert.doesNotMatch(captured.clipboard, /¥|批发价|会员价/);
  const link = new URL(page.onShareAppMessage().path, 'https://example.test');
  assert.equal(link.searchParams.get('key'), page.modelKey);
  assert.equal(link.searchParams.get('id'), 'white');
});

test('预览对官网旧报价排序，登录后会重新获取报价', async () => {
  const { calls } = harness();
  const { requestQuotes, decorateQuote } = require('../miniprogram/utils/quote-catalog.js');
  const black = item('black', '华为Mate80 12GB+256GB曜石黑原封');
  const white = item('white', '华为Mate80 12GB+256GB雪域白原封');
  const pro = item('pro', '华为Mate80Pro 16GB+512GB曜石黑原封');
  const pura = { ...item('pura', 'Pura X 12GB+512GB5G原封型格紫'), storage: '12GB' };
  const firstPage = requestQuotes({ view: 'catalog', page: 1, pageSize: 1, q: 'Mate80' });
  send(calls[0], { products: [pro, black, pura, white], updateTime: '2026-11-09 07:05' });
  const data = await firstPage;
  assert.deepEqual(data.pagination, { page: 1, total: 3, hasMore: true });
  assert.deepEqual(data.products.map(product => product.id), ['white']);
  const nextPage = await requestQuotes({ view: 'catalog', page: 2, pageSize: 1, q: 'Mate80' });
  assert.deepEqual(nextPage.products.map(product => product.id), ['black']);

  const params = { view: 'model', key: 'huawei|华为mate80' };
  const publicModel = await requestQuotes(params);
  assert.equal(calls.length, 1);
  assert.deepEqual(publicModel.products.map(product => product.id), ['white', 'black']);

  const puraModel = await requestQuotes({ view: 'model', key: 'huawei|purax12gb+512gb5g原封型格紫' });
  const variant = decorateQuote(puraModel.products[0]);
  assert.equal(variant.storageLabel, '12GB+512GB');
  assert.equal(variant.color, '型格紫');

  wx.getStorageSync = () => 'test-session';
  const memberModel = requestQuotes(params);
  assert.equal(calls.length, 2);
  assert.equal(Object.entries(calls[1].header).find(([name]) => name.toLowerCase() === 'x-wnsm-token')?.[1], 'test-session');
  send(calls[1], { products: [{ ...black, displayPrice: 900 }], auth: { approved: true } });
  assert.equal((await memberModel).products[0].displayPrice, 900);
});

test('较晚返回的旧报价不能覆盖刚刷新的预览缓存', async () => {
  const { calls } = harness();
  const { requestQuotes } = require('../miniprogram/utils/quote-catalog.js');
  const params = { view: 'catalog', page: 1 };
  const earlier = requestQuotes(params, { refresh: true });
  const later = requestQuotes(params, { refresh: true });
  send(calls[1], { products: [item('today', '今日报价')], updateTime: '2026-11-10 07:05' });
  await later;
  send(calls[0], { products: [item('morning', '早间报价')], updateTime: '2026-11-10 00:57' });
  await earlier;
  const cached = await requestQuotes(params);
  assert.equal(calls.length, 2);
  assert.equal(cached.products[0].id, 'today');
});

test('翻页时登录失效会清理旧批发价并重新取公开报价', async () => {
  const { calls } = harness('expired-during-pagination');
  const page = mount('index');
  const updateTime = '2026-11-10 07:05';
  const phone = item('mate', '华为Mate80 12GB+256GB雪域白原封');
  page.onLoad();
  const first = page.onShow();
  send(calls[0], {
    updateTime, auth: { id: 1, role: 'B', status: 'approved' },
    pagination: { page: 1, total: 2, hasMore: true },
    products: [{ ...phone, displayPrice: 900, priceLabel: 'wholesale' }]
  });
  await first;
  assert.equal(page.data.groups[0].items[0].displayPrice, 900);

  const more = page.loadMore();
  send(calls[1], { updateTime, pagination: { page: 2, total: 2, hasMore: false }, products: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(wx.getStorageSync('wnsm_token'), '');
  assert.equal(page.data.user, null);
  assert.deepEqual(page.data.groups, []);
  assert.equal(new URL(calls[2].url).searchParams.get('page'), '1');
  assert.equal(calls[2].header['X-Wnsm-Token'], undefined);
  send(calls[2], { updateTime, pagination: { page: 1, total: 1, hasMore: false }, products: [phone] });
  await more;
  assert.equal(page.data.groups[0].items[0].displayPrice, 1000);
});

test('未绑定微信停留在登录页，拿到手机号登录会话后才返回', async () => {
  const { calls, captured, app } = harness();
  wx.login = ({ success }) => success({ code: 'test-code' });
  const page = mount('login');
  const wechatLogin = page.onWechatLogin();
  await page.onWechatLogin();
  assert.equal(calls.length, 1);
  send(calls[0], { needBind: true });
  await wechatLogin;
  assert.equal(captured.backs, 0);
  assert.deepEqual(captured.toasts, []);
  assert.equal(app.globalData.user, null);
  assert.match(page.data.notice, /未绑定.*手机号/);

  page.setData({ phone: '19900000000', password: 'test-password' });
  const unexpected = page.onSubmit();
  calls[1].success({ statusCode: 200, data: '<html>unavailable</html>' });
  await unexpected;
  assert.equal(captured.backs, 0);
  assert.match(page.data.notice, /失败/);

  const passwordLogin = page.onSubmit();
  const user = { id: 2, role: 'C', status: 'approved' };
  send(calls[2], { user, token: 'new-session' });
  await passwordLogin;
  assert.equal(wx.getStorageSync('wnsm_token'), 'new-session');
  assert.deepEqual(app.globalData.user, user);
  assert.equal(captured.backs, 1);
});
