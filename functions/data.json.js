// 拦截外部对原始 data.json（含八方成本价）的直接访问。
// 后端函数内部仍可通过 env.ASSETS.fetch('/data.json') 读取（ASSETS 不走 Functions 路由）。
export function onRequest() {
  return new Response('Forbidden', {
    status: 403,
    statusText: 'Forbidden',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
  });
}
