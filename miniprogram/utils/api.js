// 统一 API 封装：与官网 www.wnsm.store 同源同套 Functions 接口
// 官网用 httpOnly Cookie 携带 session；小程序没有浏览器 Cookie，改用自定义 header `X-Wnsm-Token`，
// 后端需要在 getUser() 中同时读取该 header（见 functions/_lib/auth.js 适配代码）。

// 生产环境线上域名（已在微信公众平台「开发管理 - 服务器域名」request 合法域名配置 https://wnsm.store 与 https://www.wnsm.store）
const BASE_URL = 'https://www.wnsm.store';

function getToken() {
  return wx.getStorageSync('wnsm_token') || '';
}

function setToken(token) {
  if (token) wx.setStorageSync('wnsm_token', token);
}

function clearToken() {
  wx.removeStorageSync('wnsm_token');
}

/**
 * 通用请求
 * @param {string} path  /api/xxx
 * @param {string} method GET/POST
 * @param {object} body  JSON body
 */
function request(path, method = 'GET', body) {
  return new Promise((resolve, reject) => {
    const header = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) header['X-Wnsm-Token'] = token;

    wx.request({
      url: BASE_URL + path,
      method,
      data: body || {},
      header,
      dataType: 'json',
      timeout: 30000,
      success(res) {
        let data = res.data || {};
        if (typeof data === 'string') {
          try { data = JSON.parse(data); } catch (err) { data = {}; }
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && data.ok !== false) {
          // 登录/注册接口回传 token（后端在响应里同时给 session token，供小程序保存）
          if (data.token) setToken(data.token);
          resolve(data);
        } else {
          reject(new Error(data.error || '请求失败，请稍后重试'));
        }
      },
      fail(err) {
        console.error('wx.request fail', path, err);
        reject(new Error('网络异常，请稍后重试'));
      }
    });
  });
}

module.exports = { request, setToken, clearToken, getToken, BASE_URL };
