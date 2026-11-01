Page({
  data: {},
  callPhone() {
    wx.makePhoneCall({ phoneNumber: '17361593016' });
  },
  copySite() {
    wx.setClipboardData({
      data: 'https://wnsm.store',
      success: () => wx.showToast({ title: '官网已复制' })
    });
  },
  openWebsite() {
    // 小程序内 web-view 需在后台配置业务域名；此处先给复制链接，上线后可替换为 web-view 页面
    wx.setClipboardData({
      data: 'https://wnsm.store',
      success: () => wx.showModal({
        title: '官网',
        content: '链接已复制：https://wnsm.store，可在浏览器打开',
        showCancel: false
      })
    });
  },
  previewQr(e) {
    const current = e.currentTarget.dataset.src;
    wx.previewImage({
      current,
      urls: ['/assets/qr-wechat.jpg', '/assets/qr-gongzhonghao.jpg']
    });
  },
  onShareAppMessage() {
    return { title: '兰州蜗牛数码 · 手机渠道报价', path: '/pages/about/about' };
  }
});
