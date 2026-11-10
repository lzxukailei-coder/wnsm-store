import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const path = (page) => '../miniprogram/pages/' + page + '/' + page + '.js';
const item = (id, name) => ({ id, name, brand: 'huawei', ptype: 'phone', displayPrice: 1000, priceLabel: 'public' });

function mount(name) {
  let definition;
  globalThis.Page = value => { definition = value; };
  require(path(name));
  return { ...definition, data: structuredClone(definition.data), setData(next) { Object.assign(this.data, next); } };
}

function harness() {
  const calls = [];
  const captured = { route: '', clipboard: '' };
  globalThis.wx = {
    getStorageSync: () => '',
    request: options => { calls.push(options); },
    navigateTo: ({ url }) => { captured.route = url; },
    setNavigationBarTitle() {},
    setClipboardData: ({ data }) => { captured.clipboard = data; }
  };
  globalThis.getApp = () => ({ globalData: { user: null }, setUser() {} });
  return { calls, captured };
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
    pagination: { page: 1, total: 2, hasMore: true },
    products: [item('mate', '华为Mate80 12GB+256GB曜石黑原封')]
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
    pagination: { page: 2, total: 2, hasMore: false },
    products: [item('mate-white', '华为Mate80 12GB+256GB雪域白原封')]
  });
  await more;
  assert.equal(page.data.groups[0].items.length, 2);
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

test('预览能兼容官网旧接口，登录后会重新获取报价', async () => {
  const { calls } = harness();
  const { requestQuotes } = require('../miniprogram/utils/quote-catalog.js');
  const black = item('black', '华为Mate80 12GB+256GB曜石黑原封');
  const white = item('white', '华为Mate80 12GB+256GB雪域白原封');
  const pro = item('pro', '华为Mate80Pro 16GB+512GB曜石黑原封');
  const firstPage = requestQuotes({ view: 'catalog', page: 1, pageSize: 1, q: 'Mate80' });
  send(calls[0], { products: [black, white, pro], updateTime: '2026-11-09 07:05' });
  const data = await firstPage;
  assert.deepEqual(data.pagination, { page: 1, total: 3, hasMore: true });
  assert.deepEqual(data.products.map(product => product.id), ['black']);

  const params = { view: 'model', key: 'huawei|华为mate80' };
  const publicModel = await requestQuotes(params);
  assert.equal(calls.length, 1);
  assert.deepEqual(publicModel.products.map(product => product.id), ['black', 'white']);

  wx.getStorageSync = () => 'test-session';
  const memberModel = requestQuotes(params);
  assert.equal(calls.length, 2);
  assert.equal(Object.entries(calls[1].header).find(([name]) => name.toLowerCase() === 'x-wnsm-token')?.[1], 'test-session');
  send(calls[1], { products: [{ ...black, displayPrice: 900 }], auth: { approved: true } });
  assert.equal((await memberModel).products[0].displayPrice, 900);
});
