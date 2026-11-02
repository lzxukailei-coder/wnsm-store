// 报价首页：列表 / 搜索 / 品牌筛选 / 品类筛选 / 登录态入口 / 联系客服
const { request, clearToken } = require('../../utils/api');
const { TYPE_TABS, PRICE_LABEL, BRAND_ORDER, BRAND_NAMES, groupByBrand } = require('../../utils/catalog');
const app = getApp();

const PAGE_SIZE = 20;

Page({
  data: {
    groups: [],
    updateTime: '',
    user: null,
    keyword: '',
    currentBrand: 'all',
    currentType: 'all',
    brandList: [{ key: 'all', name: '全部' }],
    typeTabs: TYPE_TABS,
    loaded: false,
    loadingError: '',
    visibleCount: PAGE_SIZE,
    filteredCount: 0
  },

  onShow() {
    this.setData({ user: app.globalData.user });
    this.loadProducts();
  },

  async loadProducts() {
    wx.showLoading({ title: '加载报价…' });
    try {
      const data = await request('/api/products');
      app.globalData.products = data.products || [];
      app.globalData.updateTime = data.updateTime || '';
      if (data.auth) {
        app.setUser(data.auth);
        this.setData({ user: data.auth });
      }
      this.setData({ visibleCount: PAGE_SIZE });
      this.applyFilter();
      this.setData({
        updateTime: data.updateTime || '',
        loaded: true,
        loadingError: ''
      });
    } catch (e) {
      console.error('loadProducts failed', e);
      this.setData({ loaded: true, loadingError: e.message || '网络异常，请稍后重试' });
    } finally {
      wx.hideLoading();
    }
  },

  applyFilter() {
    let list = app.globalData.products || [];
    const { keyword, currentBrand, currentType, visibleCount } = this.data;

    if (currentBrand !== 'all') list = list.filter(p => p.brand === currentBrand);
    if (currentType !== 'all') list = list.filter(p => p.ptype === currentType);
    if (keyword) {
      const k = keyword.trim().toLowerCase();
      list = list.filter(p =>
        (p.name || '').toLowerCase().includes(k) ||
        (p.model || '').toLowerCase().includes(k) ||
        (p.category || '').toLowerCase().includes(k)
      );
    }
    const brandKeys = {};
    list.forEach(p => { brandKeys[p.brand || 'other'] = true; });
    const brands = [{ key: 'all', name: '全部' }].concat(
      BRAND_ORDER.filter(k => brandKeys[k]).map(k => ({ key: k, name: BRAND_NAMES[k] || k }))
    );

    const fullGroups = groupByBrand(list);
    const visibleList = list.slice(0, visibleCount);
    const groups = groupByBrand(visibleList).map(g => {
      const fullGroup = fullGroups.find(x => x.key === g.key);
      return {
        key: g.key,
        name: g.name,
        totalItems: fullGroup ? fullGroup.items.length : g.items.length,
        items: g.items.map(p => this.decorateProduct(p))
      };
    });

    this.setData({ groups, brandList: brands, filteredCount: list.length });
  },

  decorateProduct(p) {
    const label = PRICE_LABEL[p.priceLabel] || PRICE_LABEL.public;
    return Object.assign({}, p, {
      labelText: label.text,
      labelCls: label.cls,
      priceText: p.outStock ? '缺货/待报价' : (p.displayPrice != null ? '¥ ' + p.displayPrice : '—')
    });
  },

  onReachBottom() {
    const { visibleCount, filteredCount } = this.data;
    if (visibleCount >= filteredCount) return;
    this.setData({ visibleCount: visibleCount + PAGE_SIZE });
    this.applyFilter();
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value, visibleCount: PAGE_SIZE });
    this.applyFilter();
  },

  onBrandTap(e) {
    this.setData({ currentBrand: e.currentTarget.dataset.brand, visibleCount: PAGE_SIZE });
    this.applyFilter();
  },

  onTypeTap(e) {
    this.setData({ currentType: e.currentTarget.dataset.type, visibleCount: PAGE_SIZE });
    this.applyFilter();
  },

  goLogin() {
    wx.navigateTo({ url: '/pages/login/login' });
  },

  async onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号吗？',
      success: async (res) => {
        if (res.confirm) {
          await request('/api/logout', 'POST').catch(() => {});
          clearToken();
          app.logout();
          this.setData({ user: null });
          this.loadProducts();
        }
      }
    });
  },

  onContact() {
    // 联系客服：拨号或跳「关于我们」页查看个人微信 / 公众号二维码
    wx.showModal({
      title: '联系客服',
      content: '致电 17361593016，或到「关于我们」页扫码添加微信、查看公众号',
      confirmText: '拨打',
      cancelText: '查看联系方式',
      success: (r) => {
        if (r.confirm) {
          wx.makePhoneCall({ phoneNumber: '17361593016' });
        } else if (r.cancel) {
          wx.switchTab({ url: '/pages/about/about' });
        }
      }
    });
  },

  onShareAppMessage() {
    return {
      title: '蜗牛数码·手机渠道报价（每日更新）',
      path: '/pages/index/index'
    };
  }
});
