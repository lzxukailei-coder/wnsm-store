const { request, getToken } = require('../../utils/api');
const { TYPE_TABS, BRAND_ORDER, BRAND_NAMES, groupByModel } = require('../../utils/catalog');
const { PAGE_SIZE, requestQuotes, decorateQuote, beijingQuoteTime, quotePath } = require('../../utils/quote-catalog');
const app = getApp();

function groupUpdates(existing, incoming) {
  if (existing.length === 0) return { groups: incoming };
  const lastIndex = existing.length - 1;
  const last = existing[lastIndex];
  const updates = {};
  let nextIndex = existing.length;
  for (const group of incoming) {
    if (group.key === last.key) {
      group.items.forEach((item, index) => {
        updates[`groups[${lastIndex}].items[${last.items.length + index}]`] = item;
      });
    } else {
      updates[`groups[${nextIndex}]`] = group;
      nextIndex++;
    }
  }
  return updates;
}

function samePriceViewer(previous, current) {
  return previous?.id === current?.id && previous?.role === current?.role && previous?.status === current?.status;
}

Page({
  data: {
    groups: [],
    quoteTime: '',
    user: null,
    keyword: '',
    currentBrand: 'all',
    currentType: 'all',
    brandList: [{ key: 'all', name: '全部' }].concat(BRAND_ORDER.map(key => ({ key, name: BRAND_NAMES[key] }))),
    typeTabs: TYPE_TABS,
    page: 0,
    count: 0,
    hasMore: false,
    loading: true,
    loadingMore: false,
    error: ''
  },

  onLoad() {
    this.queryVersion = 0;
  },

  onShow() {
    const token = getToken();
    if (this.activeToken !== token) {
      this.activeToken = token;
      return this.startQuery({ user: app.globalData.user }, { refresh: true });
    }
  },

  onUnload() {
    clearTimeout(this.searchTimer);
    this.queryVersion++;
  },

  async onPullDownRefresh() {
    try {
      await this.startQuery({}, { refresh: true });
    } finally {
      wx.stopPullDownRefresh();
    }
  },

  startQuery(filters = {}, { delay = 0, refresh = false } = {}) {
    clearTimeout(this.searchTimer);
    const version = ++this.queryVersion;
    this.setData(Object.assign({
      groups: [], quoteTime: '', page: 0, count: 0, hasMore: false, loading: true, loadingMore: false, error: ''
    }, filters));
    if (delay) {
      this.searchTimer = setTimeout(() => this.readPage(1, version, refresh), delay);
      return;
    }
    return this.readPage(1, version, refresh);
  },

  async readPage(page, version, refresh) {
    const { keyword, currentBrand, currentType } = this.data;
    const token = getToken();
    try {
      const result = await requestQuotes({
        view: 'catalog', page, pageSize: PAGE_SIZE, q: keyword,
        brand: currentBrand, type: currentType
      }, { refresh });
      if (version !== this.queryVersion || token !== getToken()) return;
      const user = result.auth || null;
      if (token && result.auth === null) {
        app.logout();
        this.activeToken = '';
      }
      app.setUser(user);
      if (page > 1 && (this.rawQuoteTime !== result.updateTime || !samePriceViewer(this.data.user, user))) {
        return this.startQuery({ user }, { refresh: true });
      }
      this.rawQuoteTime = result.updateTime;
      const incoming = groupByModel(result.products.map(decorateQuote));
      this.setData({
        ...groupUpdates(this.data.groups, incoming),
        quoteTime: beijingQuoteTime(result.updateTime),
        user,
        page: result.pagination.page,
        count: result.pagination.total,
        hasMore: result.pagination.hasMore,
        loading: false,
        loadingMore: false
      });
    } catch (error) {
      if (version === this.queryVersion) {
        this.setData({ error: error.message || '暂时无法读取报价，请重试。', loading: false, loadingMore: false });
      }
    }
  },

  onReachBottom() {
    if (!this.data.error) this.loadMore();
  },

  loadMore() {
    const { loading, loadingMore, hasMore, page } = this.data;
    if (loading || loadingMore || !hasMore) return;
    this.setData({ loadingMore: true, error: '' });
    return this.readPage(page + 1, this.queryVersion, false);
  },

  retry() {
    if (this.data.page) return this.loadMore();
    return this.startQuery({}, { refresh: true });
  },

  onSearch(event) {
    this.startQuery({ keyword: event.detail.value }, { delay: 280 });
  },

  onSearchConfirm(event) {
    this.startQuery({ keyword: event.detail.value });
  },

  onBrandTap(event) {
    this.startQuery({ currentBrand: event.currentTarget.dataset.brand });
  },

  onTypeTap(event) {
    this.startQuery({ currentType: event.currentTarget.dataset.type });
  },

  openQuote(event) {
    const { key, id } = event.currentTarget.dataset;
    if (key) wx.navigateTo({ url: quotePath(key, String(id)) });
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？',
      success: (result) => {
        if (!result.confirm) return;
        // 请求先取到当前会话，再立即清理本机页面与登录状态。
        const revoke = request('/api/logout', 'POST');
        app.logout();
        this.activeToken = '';
        this.startQuery({ user: null }, { refresh: true });
        revoke.catch(() => wx.showToast({ title: '本机已退出，服务端退出未确认', icon: 'none' }));
      }
    });
  },

  onShareAppMessage() {
    return { title: '蜗牛数码·手机渠道报价', path: '/pages/index/index' };
  }
});
