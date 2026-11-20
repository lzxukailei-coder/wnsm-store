// 手机号登录与注册复用官网账号，已绑定的微信可直接登录。
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
    loading: '',
    notice: ''
  },

  onUnload() {
    this.unloaded = true;
  },

  switchMode() {
    if (!this.data.loading) this.setData({ mode: this.data.mode === 'login' ? 'register' : 'login', notice: '' });
  },

  switchRole(e) {
    if (!this.data.loading) this.setData({ role: e.currentTarget.dataset.role });
  },

  openAbout() {
    wx.switchTab({ url: '/pages/about/about' });
  },

  onInput(e) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },

  finishLogin(data) {
    if (this.unloaded) return;
    if (!data.user || typeof data.token !== 'string' || !data.token) {
      throw new Error('登录未完成，请重试');
    }
    setToken(data.token);
    app.setUser(data.user);
    this.setData({ password: '', password2: '' });
    wx.showToast({ title: '登录成功' });
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
  },

  async onWechatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: 'wechat', notice: '' });
    try {
      const { code } = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
      if (this.unloaded) return;
      if (!code) throw new Error('微信登录凭证为空');
      const data = await request('/api/wechat-login', 'POST', { code, source: 'miniprogram' });
      if (this.unloaded) return;
      if (data.needBind) {
        this.setData({ notice: '此微信还未绑定账号，请用手机号登录或注册。' });
        return;
      }
      this.finishLogin(data);
    } catch (error) {
      if (!this.unloaded) this.setData({ notice: '微信登录暂不可用，请用手机号登录。' });
    } finally {
      if (!this.unloaded) this.setData({ loading: '' });
    }
  },

  async onSubmit() {
    if (this.data.loading) return;
    const { mode, role, phone, password, password2, company, contact, businessLicense } = this.data;
    if (!/^1\d{10}$/.test(phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });
    if (password.length < 6 || password.length > 32) return wx.showToast({ title: '密码 6-32 位', icon: 'none' });
    if (mode === 'register' && password !== password2) return wx.showToast({ title: '两次密码不一致', icon: 'none' });
    if (mode === 'register' && role === 'B' && !company.trim()) return wx.showToast({ title: '同行需填门店/公司名', icon: 'none' });

    this.setData({ loading: 'password', notice: '' });
    try {
      const data = mode === 'login'
        ? await request('/api/login', 'POST', { phone, password })
        : await request('/api/register', 'POST', {
          phone, password,
          role: role === 'B' ? 'business' : 'C',
          company, contact, businessLicense
        });
      this.finishLogin(data);
    } catch (e) {
      if (!this.unloaded) this.setData({ notice: e.message });
    } finally {
      if (!this.unloaded) this.setData({ loading: '' });
    }
  }
});
