// 报价首页：列表 / 搜索 / 品牌筛选 / 品类筛选 / 登录态入口 / 联系客服
const { request, clearToken } = require('../../utils/api');
const { TYPE_TABS, PRICE_LABEL, groupByBrand } = require('../../utils/catalog');
const app = getApp();

Page({
  data: {
    products: [],
    groups: [],
    updateTime: '',
    user: null,
    keyword: '',
    currentBrand: 'all',
    currentType: 'all',
    brandList: [{ key: 'all', name: '全部' }],
    typeTabs: TYPE_TABS,
    loaded: false,
    loadingError: ''
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
      this.applyFilter();
      this.setData({
        updateTime: data.updateTime || '',
        loaded: true,
        loadingError: ''
      });
    } catch (e) {
      this.setData({ loaded: true, loadingError: e.message });
    } finally {
      wx.hideLoading();
    }
  },

  applyFilter() {
    let list = app.globalData.products;
    const { keyword, currentBrand, currentType } = this.data;

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

    // 品牌筛选条选项按当前商品实际出现的品牌生成
    const brands = [{ key: 'all', name: '全部' }];
    const seen = {};
    list.forEach(p => {
      if (!seen[p.brand]) { seen[p.brand] = true; brands.push({ key: p.brand, name: p.brand }); }
    });

    const groups = groupByBrand(list).map(g => ({
      ...g,
      items: g.items.map(this.decorateProduct)
    }));

    this.setData({ groups, brandList: brands });
  },

  decorateProduct(p) {
    const label = PRICE_LABEL[p.priceLabel] || PRICE_LABEL.public;
    return {
      ...p,
      labelText: label.text,
      labelCls: label.cls,
      priceText: p.outStock ? '缺货/待报价' : (p.displayPrice != null ? '¥ ' + p.displayPrice : '—')
    };
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  onBrandTap(e) {
    this.setData({ currentBrand: e.currentTarget.dataset.brand });
    this.applyFilter();
  },

  onTypeTap(e) {
    this.setData({ currentType: e.currentTarget.dataset.type });
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
    // 联系客服：跳转公众号/官网客服，线下电话在 about 页统一展示
    wx.showModal({
      title: '联系客服',
      content: '致电 17361593016，或在「关于我们」页扫码添加微信',
      confirmText: '拨打',
      success: (r) => { if (r.confirm) wx.makePhoneCall({ phoneNumber: '17361593016' }); }
    });
  },

  onShareAppMessage() {
    return {
      title: '蜗牛数码·手机渠道报价（每日更新）',
      path: '/pages/index/index'
    };
  }
});
