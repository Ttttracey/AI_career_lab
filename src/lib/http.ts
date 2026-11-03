export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const url = new URL(request.url);
  const actualHost = request.headers.get('host') || url.host;
  const actual = new URL(url.protocol + '//' + actualHost);
  if (origin && origin !== actual.origin) throw new Error('请求来源不匹配。');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(actual.hostname)) throw new Error('此版本只允许本地访问。');
}
export function errorResponse(error: unknown) {
  const raw = error instanceof Error ? error.message : '';
  const safe = /[\u4e00-\u9fff]/.test(raw) && !/api[_-]?key|Bearer|sk-/i.test(raw) ? raw.slice(0, 350) : '服务调用失败，输入已经保留。请检查配置后重试；系统没有切换成演示结果。';
  return Response.json({ error: safe }, { status: 400 });
}
