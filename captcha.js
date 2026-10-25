// 八方登录验证码识别（4位数字）：灰度二值化 -> 连通域去噪 -> 放大 -> tesseract
// 实测样本 12/12 正确（字符面积 35~66，噪点面积均为 1，minArea=12 可完全区分）
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

// 8 邻域连通域，仅保留面积 >= minArea 的黑色块，其余置白（去散点噪点）
function denoise(grey, w, h, minArea) {
  const visited = new Uint8Array(w * h);
  const out = Buffer.alloc(w * h, 255);
  for (let i = 0; i < w * h; i++) {
    if (grey[i] >= 128 || visited[i]) continue;
    const stack = [i], pts = [];
    visited[i] = 1;
    while (stack.length) {
      const idx = stack.pop();
      pts.push(idx);
      const x = idx % w, y = (idx / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!visited[ni] && grey[ni] < 128) { visited[ni] = 1; stack.push(ni); }
        }
      }
    }
    if (pts.length >= minArea) for (const p of pts) out[p] = 0;
  }
  return out;
}

class CaptchaSolver {
  async init() {
    this.worker = await createWorker('eng', 1, { logger: () => {} });
    await this.worker.setParameters({
      tessedit_char_whitelist: '0123456789',
      tessedit_pageseg_mode: '7' // 单行文本
    });
  }

  // 输入验证码图片 Buffer（JPEG），返回识别出的 4 位数字字符串
  async solve(buf) {
    const { data, info } = await sharp(buf).grayscale().threshold(160)
      .raw().toBuffer({ resolveWithObject: true });
    const clean = denoise(data, info.width, info.height, 12);
    const png = await sharp(clean, { raw: { width: info.width, height: info.height, channels: 1 } })
      .resize(info.width * 4, info.height * 4, { kernel: 'nearest' })
      .png().toBuffer();
    const ret = await this.worker.recognize(png);
    return (ret.data.text || '').replace(/[^0-9]/g, '');
  }

  async close() { if (this.worker) await this.worker.terminate(); }
}

module.exports = { CaptchaSolver };
