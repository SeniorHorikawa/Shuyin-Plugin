/** 通用工具函数 */
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = './data';

const URL_RE = /https?:\/\/[^\s"'`<>，。！？、；：（）【】《》“”‘’]+/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const secondsText = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const [h, m, s] = [total / 3600, (total % 3600) / 60, total % 60].map(Math.floor);
  if (h) return `${h} 小时 ${m} 分 ${s} 秒`;
  if (m) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
};

function pickUrl(text) {
  const m = String(text || '').match(URL_RE);
  return m ? m[0] : '';
}

function safeName(s) {
  return (
    String(s || '')
      .replace(/[\\/:*?"<>|\r\n\t]/g, '_')
      .trim() || 'book'
  ).slice(0, 80);
}

async function fetchToFile(url, absPath, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
  await fs.promises.writeFile(absPath, Buffer.from(await res.arrayBuffer()));
  return absPath;
}

export { DATA_DIR, URL_RE, sleep, secondsText, pickUrl, safeName, fetchToFile };
