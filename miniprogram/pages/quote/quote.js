const { requestQuotes, decorateQuote, beijingQuoteTime, quotePath } = require('../../utils/quote-catalog');

function routeValue(value) {
  if (typeof value !== 'string') return '';
  try { return decodeURIComponent(value); } catch { return value; }
}

Page({
  data: {
    modelName: '机型报价',
    variants: [],
    selected: null,
    quoteTime: '',
    loading: true,
    error: ''
  },

  onLoad(options) {
    this.modelKey = routeValue(options.key);
    this.selectedId = routeValue(options.id);
    this.loadModel();
  },

  onUnload() {
    this.unloaded = true;
  },

  async loadModel() {
    if (!this.modelKey) {
      this.setData({ loading: false, error: '这个机型链接不完整，请返回查报价。' });
      return;
    }
    this.setData({ loading: true, error: '' });
    try {
      const data = await requestQuotes({ view: 'model', key: this.modelKey });
      if (this.unloaded) return;
      const variants = data.products.map(decorateQuote);
      const selected = variants.find(product => String(product.id) === this.selectedId)
        || variants.find(product => !product.outStock) || variants[0] || null;
      if (!selected) throw new Error('这个机型暂时没有报价');
      this.setData({
        modelName: data.modelName,
        variants,
        selected,
        quoteTime: beijingQuoteTime(data.updateTime),
        loading: false
      });
      wx.setNavigationBarTitle({ title: data.modelName });
    } catch (error) {
      if (!this.unloaded) this.setData({ loading: false, error: error.message || '报价加载失败，请重试。' });
    }
  },

  chooseVariant(event) {
    const id = String(event.currentTarget.dataset.id);
    const selected = this.data.variants.find(product => String(product.id) === id);
    if (selected) {
      this.selectedId = id;
      this.setData({ selected });
    }
  },

  copyInquiry() {
    const selected = this.data.selected;
    if (!selected) return;
    const specs = [selected.storageLabel, selected.color, selected.channelLabel].filter(Boolean).join(' / ');
    const lines = ['你好，我想咨询下面这款商品', '机型：' + this.data.modelName, '商品：' + selected.name];
    if (specs) lines.push('规格：' + specs);
    lines.push('请帮我确认当前报价、库存和保修。');
    wx.setClipboardData({ data: lines.join('\n') });
  },

  goContact() {
    wx.switchTab({ url: '/pages/about/about' });
  },

  goQuotes() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  onShareAppMessage() {
    const selected = this.data.selected;
    return {
      title: this.data.modelName + '｜蜗牛数码报价',
      path: quotePath(this.modelKey, selected ? String(selected.id) : '')
    };
  }
});
