// 统一 API 封装：与官网 www.wnsm.store 同源同套 Functions 接口
// 官网用 httpOnly Cookie 携带 session；小程序没有浏览器 Cookie，改用自定义 header `X-Wnsm-Token`，
// 后端需要在 getUser() 中同时读取该 header（见 functions/_lib/auth.js 适配代码）。

// 生产环境线上域名（已在微信公众平台「开发管理 - 服务器域名」request 合法域名中配置 https://wnsm.store）
const BASE_URL = 'https://wnsm.store';

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
      timeout: 15000,
      success(res) {
        const data = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300 && data.ok !== false) {
          // 登录/注册接口回传 token（后端在响应里同时给 session token，供小程序保存）
          if (data.token) setToken(data.token);
          resolve(data);
        } else {
          reject(new Error(data.error || '请求失败，请稍后重试'));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络异常，请检查网络后重试'));
      }
    });
  });
}

module.exports = { request, setToken, clearToken, getToken, BASE_URL };
