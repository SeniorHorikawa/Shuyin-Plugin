/** 后端客户端：地址取自 config/novel.yaml 的 api_url */
import { loadConfig } from './config.js';

async function post(action, params = {}, timeoutMs = 60_000) {
  const apiUrl = String(loadConfig().api_url || '').replace(/\/+$/, '');
  const res = await fetch(`${apiUrl}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`后端返回非 JSON：${text.slice(0, 80)}`);
  }
  if (data.code !== 0) throw new Error(data.msg || `后端返回 code=${data.code}`);
  return data;
}

export { post };
