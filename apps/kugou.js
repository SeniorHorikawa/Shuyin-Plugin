/** 酷狗插件：扫码登录 / 提交刷歌 / 账号信息 */
import plugin from '../../../lib/plugins/plugin.js';
import fs from 'node:fs';
import path from 'node:path';
import { post } from '../model/api.js';
import { render } from '../model/render.js';
import { DATA_DIR, secondsText, sleep } from '../model/utils.js';

const TAG = '酷狗刷歌';
const STORE_DIR = `${DATA_DIR}/kugou`;
const PROFILE_TPL = 'Template/Kugou/profile';
const CARD_STYLE = ['TOP100', 'TOP10', 'NO.1'];
const RING_RADIUS = 61;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const Y_SEGMENTS = 5;
const MEDAL_LIMIT = 4;
const REQUEST_TIMEOUT_MS = 30_000;
const POLL_MS = 10_000;
const LOGIN_TIMEOUT_MS = 5 * 60_000;
const SECONDS_PER_MINUTE = 0.7;
const MINUTES_LIMIT = 3000;
const DEFAULT_SONG = '晴天';
const SUBMIT_RE = /^#?酷狗提交刷歌(?:\s+(\d+))?(?:\s+(.+))?$/;
const SESSION_END_RE = /过期|不存在|已结束/;

const api = {
  qrLogin: () => post('kugou_qr_login', {}, REQUEST_TIMEOUT_MS),
  qrCheck: (key) => post('kugou_qr_check', { key }, REQUEST_TIMEOUT_MS),
  userInfo: (ck) => post('kugou_user_info', { ck }, REQUEST_TIMEOUT_MS),
  refreshToken: (ck) => post('kugou_refresh_token', { ck }, REQUEST_TIMEOUT_MS),
  durationStart: (ck, minutes, song) => post('kugou_duration_start', { ck, minutes, song }, REQUEST_TIMEOUT_MS),
  durationStatus: (taskId) => post('kugou_duration_status', { taskId }, REQUEST_TIMEOUT_MS),
  durationStop: (taskId) => post('kugou_duration_stop', { taskId }, REQUEST_TIMEOUT_MS),
};

const store = {
  file: (userId) => path.join(STORE_DIR, `${userId}.json`),

  read(userId) {
    try {
      return JSON.parse(fs.readFileSync(store.file(userId), 'utf8'));
    } catch {
      return null;
    }
  },

  write(userId, account) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(store.file(userId), JSON.stringify(account, null, 2));
  },
};

const picUrl = (url, size = 240) => String(url || '').replace('{size}', String(size));

const hoursText = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0) / 3600;
  if (!value) return '0';
  return value >= 10_000 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, '');
};

const minutesText = (seconds) => String(Math.round(Math.max(0, Number(seconds) || 0) / 60));

/**
 * 轴顶值：按量级向上取整并保证能均分成 segments 段
 * 5585 → 5600，76.8 → 80
 */
function niceTop(value, segments = Y_SEGMENTS) {
  if (!(value > 0)) return segments;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(value)) - 1);
  const padded = Math.ceil(value / magnitude) * magnitude;
  return Math.ceil(padded / segments) * segments;
}

function buildProfileParams(info, account, running) {
  const profile = info.profile || {};
  const homepage = info.homepage || {};
  const listen = info.listen || {};
  const detail = listen.detail || {};
  const warnings = info.warnings || [];

  const level = Number(listen.level) || 0;
  const nextGrade = Number(listen.nextGrade) || level + 1;
  const currentPoint = Number(listen.currentPoint) || 0;
  const nextGradePoint = Number(listen.nextGradePoint) || 0;
  const percent = nextGradePoint > 0 ? Math.min(100, (currentPoint / nextGradePoint) * 100) : 0;

  const nickname = profile.nickname || account?.nickname || '酷狗用户';
  const clocks = Array.isArray(detail.clocks) ? detail.clocks : [];
  const clockMinutes = clocks.map((item) => (Number(item.listen_duration) || 0) / 60);
  const axisTop = niceTop(Math.max(0, ...clockMinutes), Y_SEGMENTS);
  const peak = clocks.reduce((best, item) => ((Number(item.listen_duration) || 0) > (Number(best.listen_duration) || 0) ? item : best), clocks[0] || { clock: 0 });

  const songs = (detail.rank_song || []).slice(0, 3).map((song, index) => ({
    idx: index + 1,
    name: song.name || '-',
    singer: song.singer_name || '',
    cover: picUrl(song.cover, 180),
  }));

  const medalAll = ((info.medals || {}).list?.list || []).map((medal) => ({
    name: medal.name || '',
    level: medal.level || '1',
    img: (medal.data_source || []).find((item) => item.content_type === 'image')?.content || '',
  }));
  const medals = medalAll.slice(0, medalAll.length > MEDAL_LIMIT ? MEDAL_LIMIT - 1 : MEDAL_LIMIT);
  const medalExtra = Math.max(0, medalAll.length - medals.length);

  const cards = ((info.musicCards || {}).cards || []).map((card) => ({
    image: picUrl(card.image, 240),
    title: card.title || '',
    sub: card.sub_title || '',
    content: card.content || '',
    styleText: CARD_STYLE[Number(card.style) || 0] || '',
  }));

  const rank = Number(detail.friend_rank?.rank) || 0;
  const regAt = new Date(String(profile.reg_time || '').replace(/-/g, '/')).getTime();
  const joinDays = Number.isNaN(regAt) ? 0 : Math.max(0, Math.floor((Date.now() - regAt) / 86_400_000));

  return {
    nickname,
    initial: nickname.slice(0, 1),
    avatar: profile.pic || profile.avatar || homepage.pic || '',
    signature: profile.signature || homepage.descri || '这个人很懒，什么都没写',
    gender: Number(profile.sex) === 1 ? '男' : Number(profile.sex) === 2 ? '女' : '',
    region: [profile.province, profile.city].filter(Boolean).join(' · ') || '未知地区',
    regDate: String(profile.reg_time || '').slice(0, 10) || '-',
    userid: profile.userid ?? info.userid ?? account?.userid ?? '-',
    username: profile.username || '',
    running,
    ringDash: `${((percent / 100) * RING_LENGTH).toFixed(1)} ${RING_LENGTH.toFixed(1)}`,
    percent: percent.toFixed(1),
    level,
    nextGrade,
    currentPoint,
    nextGradePoint,
    pointGap: Math.max(0, nextGradePoint - currentPoint),
    follows: homepage.follows ?? 0,
    fans: homepage.fans ?? 0,
    friends: homepage.friends ?? 0,
    visitors: homepage.visitors ?? 0,
    friendRank: rank ? `No.${rank}` : '-',
    joinDays,
    todayHours: hoursText(listen.todaySeconds),
    totalHours: hoursText(listen.totalSeconds),
    listenDays: detail.accumulate_listen_days ?? 0,
    todayText: `今日 ${minutesText(listen.todaySeconds)} 分钟`,
    peakText: `${peak.clock ?? 0}:00`,
    axis: Array.from({ length: Y_SEGMENTS + 1 }, (_, index) => {
      const value = (axisTop * (Y_SEGMENTS - index)) / Y_SEGMENTS;
      return {
        pos: (index * 100) / Y_SEGMENTS,
        label: Number.isInteger(value) ? String(value) : value.toFixed(1),
      };
    }),
    clocks: clocks.map((item, index) => {
      const seconds = Number(item.listen_duration) || 0;
      return {
        label: index % 2 === 0 ? String(item.clock ?? index) : '',
        vText: seconds ? minutesText(seconds) : '',
        h: seconds ? Math.round((clockMinutes[index] / axisTop) * 1000) / 10 : 0,
        on: seconds > 0,
      };
    }),
    songs,
    songEmpty: songs.length === 0,
    medals,
    medalEmpty: medals.length === 0,
    medalCount: medalAll.length,
    medalExtra,
    cards,
    cardCount: cards.length,
    favCount: info.favorites?.count ?? 0,
    songCount: info.songs?.total ?? 0,
    queryTime: listen.serverTime || profile.servertime || '',
    warnText: warnings.length ? '部分信息获取失败，已跳过缺失项' : '',
  };
}

export class Kugou extends plugin {
  constructor() {
    super({
      name: '酷狗刷歌',
      dsc: '酷狗扫码登录 / 提交刷歌 / 账号信息',
      event: 'message',
      priority: 5000,
      rule: [
        { reg: '^#?酷狗(帮助|菜单)$', fnc: 'help' },
        { reg: '^#?酷狗登录$', fnc: 'login' },
        { reg: '^#?酷狗取消登录$', fnc: 'cancelLogin' },
        { reg: '^#?酷狗提交刷歌(\\s+.*)?$', fnc: 'submit' },
        { reg: '^#?酷狗停止刷歌$', fnc: 'stopDuration' },
        { reg: '^#?酷狗刷新$', fnc: 'refresh' },
        { reg: '^#?我的酷狗$', fnc: 'profile' },
      ],
    });
    this.logins = new Map();
    this.tasks = new Map();
  }

  async help(e) {
    await e.reply(['【酷狗刷歌】', '#酷狗登录', '#酷狗取消登录 ', `#酷狗提交刷歌 分钟 [歌名]`, '#酷狗停止刷歌', '#酷狗刷新', '#我的酷狗'].join('\n'), true);
    return true;
  }

  async login(e) {
    const userId = String(e.user_id);
    if (this.logins.has(userId)) {
      await e.reply('你已有一个酷狗登录任务在进行中，可发送 #酷狗取消登录 取消。', true);
      return true;
    }

    let qr;
    try {
      qr = await api.qrLogin();
    } catch (err) {
      await e.reply(this.failText(err), true);
      return true;
    }

    await e.reply([segment.image('base64://' + qr.qrcode), '请用酷狗 APP 扫码并确认登录'], true);

    this.pollLogin(userId, e, qr.key).catch((err) => logger.warn(`[${TAG}] 登录轮询异常：${err.message}`));
    return true;
  }

  async cancelLogin(e) {
    const userId = String(e.user_id);
    const session = this.logins.get(userId);
    if (!session) {
      await e.reply('你当前没有进行中的酷狗登录任务。', true);
      return true;
    }
    session.cancelled = true;
    this.logins.delete(userId);
    await e.reply('已取消你的酷狗扫码登录。', true);
    return true;
  }

  async submit(e) {
    const userId = String(e.user_id);
    if (this.tasks.has(userId)) {
      await e.reply('你已有一个刷歌任务在进行中，可发送 #酷狗停止刷歌 停止。', true);
      return true;
    }

    const account = store.read(userId);
    if (!account?.ck) {
      await e.reply('你还没有登录酷狗，请先发送 #酷狗登录 扫码。', true);
      return true;
    }

    const [, rawMinutes, rawSong] = SUBMIT_RE.exec(e.msg) ?? [];
    const minutes = Number(rawMinutes ?? 0);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > MINUTES_LIMIT) {
      await e.reply(['用法：#酷狗提交刷歌 分钟 [歌名]', `例如：#酷狗提交刷歌 10 ${DEFAULT_SONG}`, `分钟范围 1~${MINUTES_LIMIT}，歌名不填默认《${DEFAULT_SONG}》。`].join('\n'), true);
      return true;
    }
    const song = (rawSong ?? '').trim() || DEFAULT_SONG;

    let task;
    try {
      task = await api.durationStart(account.ck, minutes, song);
    } catch (err) {
      await e.reply(this.failText(err), true);
      return true;
    }

    const effective = Number(task.minutes) || minutes;
    const etaSeconds = effective * SECONDS_PER_MINUTE;

    store.write(userId, { ...account, lastTaskId: task.taskId });
    await e.reply(['已提交酷狗刷歌', `时长：${effective} 分钟（${task.backfill ? '回填今日' : '从当前时刻'}）`, `歌曲：${song}`, `预计耗时：约 ${secondsText(etaSeconds)}`, '', `约 ${secondsText(etaSeconds)} 后回报本次刷取结果，发送 #酷狗停止刷歌 可提前停止。`].join('\n'), true);

    this.reportLater(userId, e, task.taskId, etaSeconds).catch((err) => logger.warn(`[${TAG}] 任务回报异常：${err.message}`));
    return true;
  }

  async stopDuration(e) {
    const userId = String(e.user_id);
    const entry = this.tasks.get(userId);
    const taskId = entry?.taskId ?? store.read(userId)?.lastTaskId;
    if (!taskId) {
      await e.reply('你没有正在进行的酷狗刷歌任务。', true);
      return true;
    }

    if (entry) {
      entry.cancelled = true;
      this.tasks.delete(userId);
    }
    try {
      const state = await api.durationStop(taskId);
      await e.reply(`已停止酷狗刷歌\n本次刷取：${secondsText(state.submitted)}`, true);
    } catch (err) {
      logger.warn(`[${TAG}] 停止刷歌失败：${err.message}`);
      await e.reply('未知错误', true);
    }
    return true;
  }

  async refresh(e) {
    const userId = String(e.user_id);
    const account = store.read(userId);
    if (!account?.ck) {
      await e.reply('你还没有登录酷狗，请先发送 #酷狗登录 扫码。', true);
      return true;
    }

    let data;
    try {
      data = await api.refreshToken(account.ck);
    } catch (err) {
      await e.reply(this.failText(err), true);
      return true;
    }

    const nickname = data.account?.nickname || account.nickname || '';
    const tExpireTime = Number(data.account?.tExpireTime) || 0;
    store.write(userId, {
      ...account,
      ck: data.ck,
      nickname,
      tExpireTime,
      refreshedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const text = [`昵称：${nickname || '-'}`, `过期时间：${this.expireText(tExpireTime)}`].join('\n');
    const avatar = data.rawData?.pic || '';
    try {
      await e.reply(avatar ? [segment.image(avatar), text] : text, true);
    } catch {
      await e.reply(text, true);
    }
    return true;
  }

  async profile(e) {
    const userId = String(e.user_id);
    const account = store.read(userId);
    if (!account?.ck) {
      await e.reply('你还没有登录酷狗，请先发送 #酷狗登录 扫码。', true);
      return true;
    }

    let info;
    try {
      info = await api.userInfo(account.ck);
    } catch (err) {
      await e.reply(this.failText(err), true);
      return true;
    }

    const running = Boolean(this.tasks.get(userId));
    const params = buildProfileParams(info, account, running);

    try {
      const image = await render(e, PROFILE_TPL, params, { retType: 'base64' });
      await e.reply(segment.image(image), true);
      return true;
    } catch (err) {
      logger.warn(`[${TAG}] 资料图片渲染失败，回退文本：${err.message}`);
    }

    await e.reply(this.profileText(info, account, userId, running), true);
    return true;
  }

  profileText(info, account, userId, running) {
    const { profile = {}, listen = {}, warnings } = info;
    const region = [profile.province, profile.city].filter(Boolean).join(' ');
    const lines = ['【我的酷狗】', `昵称：${profile.nickname || account.nickname || '-'}`, `账号：${profile.userid ?? info.userid ?? account.userid ?? '-'}`];
    if (listen.level != null) {
      const point = listen.nextGradePoint == null ? '' : `（积分 ${listen.currentPoint ?? '-'} / ${listen.nextGradePoint}）`;
      lines.push(`听歌等级：${listen.level}${point}`);
    }
    lines.push(`今日听歌：${listen.todaySeconds == null ? '暂不可用' : secondsText(listen.todaySeconds)}`);
    lines.push(`累计听歌：${listen.totalSeconds == null ? '暂不可用' : secondsText(listen.totalSeconds)}`);
    if (region) lines.push(`地区：${region}`);
    if (profile.reg_time) lines.push(`注册时间：${profile.reg_time}`);
    if (profile.signature) lines.push(`签名：${profile.signature}`);
    if (running) lines.push('刷歌任务：运行中');
    if (listen.serverTime) lines.push(`查询时间：${listen.serverTime}`);
    if (warnings?.length) {
      logger.warn(`[${TAG}] ${userId} 资料查询警告：${warnings.join('；')}`);
      lines.push('提示：部分信息获取失败');
    }
    return lines.join('\n');
  }

  async pollLogin(userId, e, key) {
    const session = { key, cancelled: false };
    this.logins.set(userId, session);

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    let scanned = false;
    let failures = 0;

    try {
      while (!session.cancelled && Date.now() < deadline) {
        await sleep(POLL_MS);
        if (session.cancelled) return;

        let state;
        try {
          state = await api.qrCheck(key);
        } catch (err) {
          if (SESSION_END_RE.test(err.message) || ++failures > 3) {
            logger.warn(`[${TAG}] ${userId} 登录轮询结束：${err.message}`);
            await e.reply('未知错误', true);
            return;
          }
          continue;
        }
        failures = 0;

        if (state.phase === 'waiting') continue;

        if (state.phase === 'scanned') {
          if (!scanned) {
            scanned = true;
            await e.reply('已扫码，请在手机上点击确认登录。', true);
          }
          continue;
        }

        if (state.phase === 'success') {
          const { userid = '', nickname = '' } = state.account ?? {};
          store.write(userId, {
            userid: String(userid),
            nickname,
            ck: state.ck,
            device: state.device ?? null,
            updatedAt: Date.now(),
          });
          logger.info(`[${TAG}] ${userId} 登录成功：${nickname || userid}`);
          await e.reply([`酷狗登录成功: ${nickname ? `：${nickname}` : ''}(${userid || '-'})`, '发送 #我的酷狗 查看信息，发送 #酷狗提交刷歌 10 开始刷歌。'].join('\n'), true);
          return;
        }

        if (state.phase === 'cancelled') {
          await e.reply('酷狗登录已取消。', true);
          return;
        }
        await e.reply(`酷狗二维码已失效（${state.phase}），请重新发送 #酷狗登录。`, true);
        return;
      }

      if (!session.cancelled) {
        await e.reply('酷狗二维码已过期（超过有效期未确认），请重新发送 #酷狗登录。', true);
      }
    } finally {
      if (this.logins.get(userId) === session) this.logins.delete(userId);
    }
  }

  async reportLater(userId, e, taskId, etaSeconds) {
    const entry = { taskId, cancelled: false };
    this.tasks.set(userId, entry);

    try {
      await sleep(etaSeconds * 1000);
      if (entry.cancelled) return;
      const state = await api.durationStatus(taskId);
      await e.reply(this.taskSummary(state), true);
    } catch (err) {
      logger.warn(`[${TAG}] 任务 ${taskId} 查询失败：${err.message}`);
      if (!entry.cancelled) await e.reply('未知错误', true);
    } finally {
      if (this.tasks.get(userId) === entry) this.tasks.delete(userId);
    }
  }

  taskSummary(state) {
    if (state.error) logger.warn(`[${TAG}] 任务 ${state.taskId} 中断：${state.error}`);
    if (state.csccError) logger.warn(`[${TAG}] 任务 ${state.taskId} 统计异常：${state.csccError}`);
    const lines = [`酷狗刷歌${state.error ? '中断' : '完成'}`, `本次刷取：${secondsText(state.submitted)}`];
    if (state.todayInitial != null && state.todayServer != null) {
      const gain = Math.max(0, state.todayServer - state.todayInitial);
      lines.push(`今日听歌：${state.todayInitial} 秒 → ${state.todayServer} 秒（+${gain}）`);
    }
    return lines.join('\n');
  }

  expireText(unixSeconds) {
    if (!unixSeconds) return '未知';
    const at = new Date(unixSeconds * 1000);
    const days = Math.max(0, Math.ceil((at.getTime() - Date.now()) / 86400000));
    return `${at.toLocaleString('zh-CN', { hour12: false })}（剩 ${days} 天）`;
  }

  failText(err) {
    logger.warn(`[${TAG}] 后端调用失败：${err.message}`);
    return err.message;
  }
}
