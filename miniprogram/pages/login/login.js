// 登录 / 注册：复用官网同一套手机号 + 密码账号体系；
// 预留微信一键登录（wx.login + code2session 绑定手机号）接口位，待后端 /api/wechat-login 上线后切换。
const { request, setToken } = require('../../utils/api');
const app = getApp();

Page({
  data: {
    mode: 'login',           // login | register
    role: 'C',               // C 个人客户 | B 同行
    phone: '',
    password: '',
    password2: '',
    company: '',
    contact: '',
    businessLicense: '',
    loading: false
  },

  switchMode() {
    this.setData({ mode: this.data.mode === 'login' ? 'register' : 'login' });
  },

  switchRole(e) {
    this.setData({ role: e.currentTarget.dataset.role });
  },

  openAbout() {
    wx.switchTab({ url: '/pages/about/about' });
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  // 微信一键登录（占位流程：先 wx.login 拿 code，后端 code2session 后绑定/匹配手机号）
  async onWechatLogin() {
    wx.showLoading({ title: '微信登录…' });
    wx.login({
      success: async (res) => {
        try {
          const data = await request('/api/wechat-login', 'POST', {
            code: res.code,
            source: 'miniprogram'
          });
          if (data.token) setToken(data.token);
          app.setUser(data.user);
          wx.showToast({ title: '登录成功' });
          setTimeout(() => wx.navigateBack(), 600);
        } catch (e) {
          wx.showToast({ title: e.message, icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '微信授权失败', icon: 'none' }); }
    });
  },

  async onSubmit() {
    const { mode, role, phone, password, password2, company, contact, businessLicense } = this.data;
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });
    if (password.length < 6 || password.length > 32) return wx.showToast({ title: '密码 6-32 位', icon: 'none' });
    if (mode === 'register' && password !== password2) return wx.showToast({ title: '两次密码不一致', icon: 'none' });
    if (mode === 'register' && role === 'B' && !company.trim()) return wx.showToast({ title: '同行需填门店/公司名', icon: 'none' });

    this.setData({ loading: true });
    try {
      if (mode === 'login') {
        const data = await request('/api/login', 'POST', { phone, password });
        app.setUser(data.user);
      } else {
        const data = await request('/api/register', 'POST', {
          phone, password,
          role: role === 'B' ? 'business' : 'C',
          company, contact, businessLicense
        });
        app.setUser(data.user);
      }
      wx.showToast({ title: '成功' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      wx.showToast({ title: e.message, icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  }
});
