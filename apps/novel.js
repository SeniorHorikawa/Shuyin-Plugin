/** 小说插件：番茄/七猫搜索，起点/七猫/番茄整书下载 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { post } from '../model/api.js';
import { loadConfig } from '../model/config.js';
import { imageSegment, render } from '../model/render.js';
import { fetchToFile, pickUrl, safeName } from '../model/utils.js';

const CACHE_DIR = path.join(os.tmpdir(), 'novel_cache');
const SEARCH_TPL = 'Template/Novel/search';
const SEARCH_TIMEOUT_MS = 60 * 1000;
const REDIRECT_TIMEOUT_MS = 15 * 1000;
const REDIRECT_MAX_HOPS = 6;
const INDEX_LIMIT = 100;

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

function pickFanqieId(url) {
  const text = String(url || '');
  const q = text.match(/[?&#](?:book_?id|bookId|novel_?id|novelId)=(\d{6,20})/i);
  if (q) return q[1];
  const p = text.match(/\/(?:page|book|novel|reader)\/(\d{6,20})(?:[/?#]|$)/i);
  return p ? p[1] : '';
}


async function resolveFanqieId(startUrl) {
  let url = startUrl;
  for (let hop = 0; hop < REDIRECT_MAX_HOPS; hop++) {
    const direct = pickFanqieId(url);
    if (direct) return direct;

    let res;
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REDIRECT_TIMEOUT_MS),
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,*/*' },
      });
    } catch (err) {
      logger.warn(`[小说插件] 短链请求失败：${url} → ${err?.message || err}`);
      return '';
    }

    const location = res.headers.get('location');
    if (location) {
      let next;
      try {
        next = new URL(location, url).toString();
      } catch {
        return '';
      }
      if (!/^https?:/i.test(next)) return pickFanqieId(next);
      url = next;
      continue;
    }

    let body = '';
    try {
      body = await res.text();
    } catch {
      return '';
    }
    const m = body.match(/["']book_?[iI]d["']\s*[:=]\s*["']?(\d{6,20})/) || body.match(/[?&#]book_?id=(\d{6,20})/i);
    return m ? m[1] : '';
  }
  logger.warn(`[小说插件] 短链跳转超过 ${REDIRECT_MAX_HOPS} 跳仍未拿到 book_id：${startUrl}`);
  return '';
}

function extractQidianId(text) {
  const msg = String(text || '').trim();
  const q = msg.match(/[?&]bookId=(\d+)/i);
  if (q) return q[1];
  const url = msg.match(/https?:\/\/(?:[\w-]+\.)*qidian\.com\/(?:book|info)\/(\d+)/i);
  if (url) return url[1];
  const cmd = msg.match(/^#?起点下载\s*(\d{6,12})$/);
  return cmd ? cmd[1] : '';
}

function extractQimaoId(text) {
  const msg = String(text || '').trim();
  const url = pickUrl(msg);
  if (url) {
    const p = url.match(/\/(?:article-detail|book-detail|book|novel|detail)\/(\d{5,12})(?:[/?#]|$)/i);
    if (p) return p[1];
    const q = url.match(/[?&#](?:book_?id|bookId|id)=(\d{5,12})(?:[&#]|$)/i);
    if (q) return q[1];
    const any = url.match(/(\d{5,12})(?:[/?#]|$)/);
    if (any) return any[1];
  }
  const cmd = msg.match(/^#?七猫下载\s*(\d{5,12})$/);
  return cmd ? cmd[1] : '';
}

async function extractFanqieId(text) {
  const msg = String(text || '').trim();
  const cmd = msg.match(/^#?番茄下载\s*(\d{6,20})$/);
  if (cmd) return cmd[1];
  const url = pickUrl(msg);
  if (url) return resolveFanqieId(url);
  return '';
}

function summarizeQidian(resp, target) {
  const noPerm = Number(resp.no_permission_chapters) || 0;
  const fail = Number(resp.fail_chapters) || 0;
  const miss = noPerm + fail;
  const why = [];
  if (fail) why.push(`${fail} 章解密失败`);
  if (noPerm) why.push(`${noPerm} 章无权限（未购买/无试读）`);
  return {
    title: resp.book_name || target.title || target.book_id,
    done: Number(resp.chapters) || 0,
    chars: Number(resp.chars) || 0,
    note: miss ? `，另有 ${miss} 章没取到（${why.join('，')}）` : '',
  };
}

function summarizeQimao(resp, target) {
  const fail = Number(resp.failed_chapters) || 0;
  return {
    title: resp.title || target.title || target.book_id,
    done: Number(resp.decrypted_chapters) || 0,
    chars: Number(resp.total_chars) || 0,
    note: fail ? `，另有 ${fail} 章没取到` : '',
  };
}

function summarizeFanqie(resp, target) {
  const fail = Number(resp.failed_chapters) || 0;
  const limited = resp.truncated ? `（只取到前 ${resp.chapter_count}/${resp.total_chapters} 章）` : '';
  return {
    title: resp.title || target.title || target.book_id,
    done: Number(resp.decrypted_chapters) || 0,
    chars: Number(resp.total_chars) || 0,
    note: `${limited}${fail ? `，另有 ${fail} 章没取到` : ''}`,
  };
}

const SITES = {
  qidian: {
    name: '起点',
    download: 'qidian_download_book',
    limitable: false,
    ck: true,
    extract: extractQidianId,
    summarize: summarizeQidian,
    hint: '没识别到书号：直接发起点链接，或 #起点下载 <书号>',
  },
  fanqie: {
    name: '番茄',
    search: 'fanqie_search_book',
    download: 'fanqie_download_book',
    limitable: true,
    extract: extractFanqieId,
    summarize: summarizeFanqie,
    hint: '没识别到书号：直接发番茄分享链接，或 #番茄下载 <书号>',
  },
  qimao: {
    name: '七猫',
    search: 'qimao_search_book',
    download: 'qimao_download_book',
    limitable: false,
    extract: extractQimaoId,
    summarize: summarizeQimao,
    hint: '没识别到书号：直接发七猫分享链接，或 #七猫下载 <书号>',
  },
};

const SOURCE_ALIAS = {
  起点: 'qidian',
  qidian: 'qidian',
  qd: 'qidian',
  番茄: 'fanqie',
  fanqie: 'fanqie',
  fq: 'fanqie',
  七猫: 'qimao',
  qimao: 'qimao',
  qm: 'qimao',
};

function detectSite(msg) {
  const text = String(msg || '');
  if (/^#?起点下载/.test(text) || /qidian\.com/i.test(text)) return 'qidian';
  if (/^#?七猫下载/.test(text) || /wtzw\.com/i.test(text)) return 'qimao';
  if (/^#?番茄下载/.test(text) || /(?:changdunovel|fanqienovel|fqnovel)\.com/i.test(text)) return 'fanqie';
  return '';
}

/** 字数：3687843 → 369万字 */
function wordText(count) {
  const value = Number(count) || 0;
  if (value <= 0) return '';
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1).replace(/\.0$/, '')}亿字`;
  if (value >= 10_000) return `${Math.round(value / 10_000)}万字`;
  return `${value}字`;
}

/** 番茄/七猫两种返回结构 → 统一书籍模型 */
function normalizeBook(source, book) {
  const intro = String(book.abstract || book.intro || '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    source,
    book_id: String(book.book_id),
    title: book.title || '未知书名',
    author: book.author || '未知',
    chapter_count: Number(book.chapter_count) || 0,
    words: Number(book.word_count) || 0,
    score: book.score || '',
    status: book.status || (book.is_over === '1' ? '完结' : book.is_over === '0' ? '连载' : ''),
    read_count: Number(book.read_count) || 0,
    category: book.category || '',
    sub_title: String(book.sub_title || ''),
    cover: book.cover || book.thumb_url || '',
    intro,
  };
}

/** 搜索结果 → 模板参数 */
function buildSearchParams(keyword, list) {
  const counter = {};
  const cards = list.map((book, index) => {
    counter[book.source] = (counter[book.source] || 0) + 1;
    // 七猫把「女强・连载・201万字」塞在 sub_title 里
    const segments = String(book.sub_title || '')
      .split(/[・·|]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const status = book.status || segments.find((item) => /连载|完结/.test(item)) || '';
    const words = wordText(book.words) || segments.find((item) => /字/.test(item)) || '';

    const chips = [{ text: SITES[book.source].name, kind: 'src' }];
    if (book.score) chips.push({ text: `${book.score} 分`, kind: 'score' });
    if (status) chips.push({ text: status, kind: /完结/.test(status) ? 'done' : '' });
    if (words) chips.push({ text: words, kind: '' });

    return {
      no: index + 1,
      title: book.title,
      author: book.author,
      category: book.category || segments[0] || '',
      cover: book.cover,
      intro: book.intro,
      chips,
    };
  });

  return {
    keyword,
    list: cards,
    total: cards.length,
    sources: Object.entries(counter).map(([key, count]) => ({ key, name: SITES[key].name, count })),
    cacheMinutes: loadConfig().cache_minutes,
    queryTime: timeText(),
  };
}

function timeText() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

const SEARCH_REG = '^#?(?:搜(小说|番茄|七猫)|小说搜索)\\s*(.*)$';
const DOWNLOAD_REG = '^#?(?:小说下载|下载小说)\\s*(.*)$';
const HELP_REG = '^#?小说(?:帮助|菜单|指令|功能)$';
const URL_REG = 'https?://[^\\s]*(?:qidian|wtzw|changdunovel|fanqienovel|fqnovel)\\.com[^\\s]*';
const CMD_REG = '^#?(?:起点|七猫|番茄)下载\\s*\\d{5,20}$';

const searchCache = new Map();
const downloadLocks = new Set();

const SEARCH_USAGE = '用法：#搜小说 关键词（或 #搜番茄 / #搜七猫 关键词）';
const DOWNLOAD_USAGE = ['用法：#小说下载 序号 [章节数]', '或：#小说下载 番茄:书籍ID [章节数] / #小说下载 七猫:书籍ID / #小说下载 起点:书籍ID', '也可直接发起点/七猫/番茄分享链接'].join('\n');

export class Novel extends plugin {
  constructor() {
    super({
      name: '小说搜索下载',
      dsc: '番茄/七猫搜索，起点/七猫/番茄整书下载',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: SEARCH_REG, fnc: 'search' },
        { reg: DOWNLOAD_REG, fnc: 'download' },
        { reg: HELP_REG, fnc: 'help' },
        { reg: URL_REG, fnc: 'downloadBook' },
        { reg: CMD_REG, fnc: 'downloadBook' },
      ],
    });
  }

  async search(e) {
    const m = e.msg.match(SEARCH_REG);
    const sourceZh = m?.[1] || '小说';
    const keyword = (m?.[2] || '').trim();

    if (!keyword) {
      await e.reply(SEARCH_USAGE, true);
      return true;
    }

    const sources = sourceZh === '小说' ? ['fanqie', 'qimao'] : [sourceZh === '番茄' ? 'fanqie' : 'qimao'];
    await e.reply(`正在搜索「${keyword}」，来源：${sources.map((i) => SITES[i].name).join('、')}…`, true);

    const results = await Promise.allSettled(sources.map((i) => this.searchSource(i, keyword)));
    const list = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const failed = results.filter((r) => r.status === 'rejected');

    if (!list.length) {
      const detail = failed
        .map((r) => r.reason?.message)
        .filter(Boolean)
        .join('；');
      if (detail) logger.warn(`[小说插件] 搜索失败：${detail}`);
      await e.reply(failed.length ? '搜索失败，请稍后再试' : `「${keyword}」没有搜到结果`, true);
      return true;
    }

    searchCache.set(String(e.user_id), { time: Date.now(), keyword, list });

    try {
      const image = await render(e, SEARCH_TPL, buildSearchParams(keyword, list), { retType: 'base64' });
      await e.reply(imageSegment(image), true);
      return true;
    } catch (err) {
      logger.warn(`[小说插件] 搜索图片渲染失败，回退合并转发：${err.message}`);
    }

    const text = `「${keyword}」搜索结果（${list.length}条）\n` + list.map((b, i) => this.formatBook(b, i + 1)).join('\n\n') + `\n\n回复 #小说下载 序号 下载（${loadConfig().cache_minutes}分钟内有效）`;
    await this.replyRich(e, text);
    return true;
  }

  async searchSource(source, keyword) {
    const cfg = loadConfig();
    const params = source === 'fanqie' ? { keyword, count: Math.min(cfg.search_count, 30) } : { keyword, page: '1' };
    const res = await post(SITES[source].search, params, SEARCH_TIMEOUT_MS);
    return (res.books || []).slice(0, cfg.search_count).map((book) => normalizeBook(source, book));
  }

  formatBook(b, i) {
    const meta = [b.author];
    if (b.chapter_count) meta.push(`${b.chapter_count}章`);
    if (b.status) meta.push(b.status);
    if (b.score) meta.push(`评分${b.score}`);
    const lines = [`${i}. [${SITES[b.source].name}]《${b.title}》`, meta.filter(Boolean).join(' | ')];
    if (b.intro) lines.push(b.intro.length > 80 ? b.intro.slice(0, 80) + '…' : b.intro);
    return lines.join('\n');
  }

  async download(e) {
    const m = e.msg.match(DOWNLOAD_REG);
    const target = this.parseDownloadArg(m?.[1] || '', String(e.user_id));

    if (target.error === 'no-cache') {
      await e.reply(['没有找到你的搜索结果（可能已过期）', '请先 #搜小说 关键词，再用 #小说下载 序号', '或直接 #小说下载 番茄:书号 / 七猫:书号 / 起点:书号'].join('\n'), true);
      return true;
    }
    if (target.error === 'out-of-range') {
      await e.reply(`序号超出范围，当前搜索结果只有 ${target.total} 条`, true);
      return true;
    }
    if (target.error) {
      await e.reply(DOWNLOAD_USAGE, true);
      return true;
    }

    await this.startDownload(e, target);
    return true;
  }

  parseDownloadArg(raw, userId) {
    const tokens = raw.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || tokens.length > 2) return { error: 'usage' };

    let limit = 0;
    if (tokens.length === 2) {
      if (!/^\d{1,5}章?$/.test(tokens[1])) return { error: 'usage' };
      limit = parseInt(tokens[1]);
    }

    const ref = tokens[0];
    const m = ref.match(/^(起点|qidian|qd|番茄|fanqie|fq|七猫|qimao|qm)[:：]?(\d+)$/i);
    if (m) return { source: SOURCE_ALIAS[m[1].toLowerCase()] || SOURCE_ALIAS[m[1]], book_id: m[2], limit };

    if (!/^\d+$/.test(ref)) return { error: 'usage' };

    const index = Number(ref);
    if (index <= INDEX_LIMIT) {
      const cached = this.getCache(userId);
      if (!cached) return { error: 'no-cache' };
      if (index < 1 || index > cached.list.length) return { error: 'out-of-range', total: cached.list.length };
      const hit = cached.list[index - 1];
      return { source: hit.source, book_id: hit.book_id, title: hit.title, limit, index, keyword: cached.keyword };
    }

    return { source: ref.length >= 8 ? 'fanqie' : 'qimao', book_id: ref, limit, guessed: true };
  }

  async downloadBook(e) {
    const site = detectSite(e.msg || '');
    if (!site) return true;

    const bookId = await SITES[site].extract(e.msg || '');
    if (!bookId) return true;

    await this.startDownload(e, { source: site, book_id: bookId });
    return true;
  }

  async startDownload(e, target) {
    const site = SITES[target.source];
    const cfg = loadConfig();

    if (site.ck && (!cfg.QIDIAN_CK || !/QDInfo=/.test(cfg.QIDIAN_CK))) {
      await e.reply('起点 ck 未配置，无法下载', true);
      return;
    }

    const userId = String(e.user_id);
    if (downloadLocks.has(userId)) {
      await e.reply('你已有下载任务在进行中，请等它完成…', true);
      return;
    }

    if (target.limit && !site.limitable) {
      await e.reply('该来源暂不支持限量下载，将下载整本，请耐心等待…', true);
    }
    const limit = site.limitable ? target.limit || cfg.max_chapters : 0;

    downloadLocks.add(userId);
    let absPath = '';
    try {
      const picked = target.index ? `搜索结果第 ${target.index} 条${target.keyword ? `（${target.keyword}）` : ''}` : '';
      await e.reply([`正在下载《${target.title || target.book_id}》（${site.name}）`, picked, limit ? `限量前 ${limit} 章` : '整书全本下载', '大部头可能需要几分钟，请耐心等待…'].filter(Boolean).join('\n'), true);

      const params = { book_id: target.book_id };
      if (site.ck) params.ck = cfg.QIDIAN_CK;
      if (limit) params.max_chapters = limit;

      const timeout = cfg.download_timeout_sec * 1000;
      const res = await post(site.download, params, timeout);
      if (!res.url) throw new Error('响应里没有 url');

      const result = site.summarize(res, target);
      absPath = path.join(CACHE_DIR, safeName(res.file_name || `${result.title || target.book_id}.txt`));

      await fetchToFile(res.url, absPath, timeout);

      const sizeMB = (Number(res.file_size) || fs.statSync(absPath).size) / 1024 / 1024;
      const lines = [`《${result.title}》下载完成`, `${site.name} · ${result.done} 章 / ${result.chars} 字${result.note}`, `大小：${sizeMB.toFixed(1)} MB`];
      if (sizeMB > cfg.size_warn_mb) lines.push('⚠ 文件较大，发送可能较慢');
      lines.push('正在发送文件…');
      await e.reply(lines.join('\n'), true);

      await this.sendFile(e, absPath);
    } catch (err) {
      logger.warn(`[小说插件] 下载失败：${err?.message || err}`);
      await e.reply('下载失败，请稍后再试', true);
    } finally {
      if (absPath) await fs.promises.rm(absPath, { force: true }).catch(() => {});
      downloadLocks.delete(userId);
    }
  }

  async sendFile(e, absPath) {
    try {
      if (e.isGroup) {
        if (e.group.sendFile) await e.group.sendFile(absPath);
        else await e.group.fs.upload(absPath);
      } else {
        await e.friend.sendFile(absPath);
      }
    } catch (err) {
      logger.warn(`[小说插件] 文件发送失败：${err?.message || err}`);
      await e.reply('文件已下载好，但发送失败（可能受群文件限制或超出大小上限）', true);
    }
  }

  getCache(userId) {
    const key = String(userId);
    const cache = searchCache.get(key);
    if (!cache) return null;
    if (Date.now() - cache.time > loadConfig().cache_minutes * 60 * 1000) {
      searchCache.delete(key);
      return null;
    }
    return cache;
  }

  async replyRich(e, text) {
    try {
      const msgList = [{ user_id: e.self_id, message: text }];
      const msg = e.isGroup ? await e.group.makeForwardMsg(msgList) : await e.friend.makeForwardMsg(msgList);
      await e.reply(msg);
    } catch (err) {
      logger.warn(`[小说插件] 合并转发失败，改用纯文本：${err.message}`);
      await e.reply(text, true);
    }
  }

  async help(e) {
    await e.reply(['【小说搜索下载】', '#搜小说 关键词 —— 同时搜索番茄/七猫', '#搜番茄 关键词 / #搜七猫 关键词', `#小说下载 序号 [章节数] —— 1~${INDEX_LIMIT} 视为搜索结果序号（限量仅番茄支持）`, '#小说下载 番茄:书号 [章节数] / #小说下载 七猫:书号 / #小说下载 起点:书号', '#起点下载 书号 / #七猫下载 书号 / #番茄下载 书号', '直接发起点/七猫/番茄分享链接也可下载整本', '', '序号需先搜索（缓存默认 15 分钟）；超过 100 的数字按书号处理（≥8 位算番茄）'].join('\n'), true);
    return true;
  }
}
