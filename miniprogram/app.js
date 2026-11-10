// wnsm.store 小程序全局逻辑
const { clearToken } = require('./utils/api');

App({
  globalData: {
    user: null
  },

  setUser(user) {
    this.globalData.user = user;
  },

  logout() {
    this.globalData.user = null;
    clearToken();
  }
});
