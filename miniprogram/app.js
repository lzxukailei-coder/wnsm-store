// wnsm.store 小程序全局逻辑
const { request } = require('./utils/api');

App({
  globalData: {
    user: null,
    products: [],
    updateTime: ''
  },

  onLaunch() {
    // 启动时尝试恢复登录态（后端 session token 存本地缓存，与官网 Cookie 体系隔离但用户表同一套）
    this.restoreSession();
  },

  async restoreSession() {
    try {
      const me = await request('/api/me');
      if (me.user) this.globalData.user = me.user;
    } catch (e) {
      this.globalData.user = null;
    }
  },

  setUser(user) {
    this.globalData.user = user;
  },

  logout() {
    this.globalData.user = null;
    wx.removeStorageSync('wnsm_token');
  }
});
