/** 图片渲染：走云崽 runtime.render，模板位于 resources/ 下 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pluginName = path.basename(PLUGIN_DIR);
const pluginResources = `${PLUGIN_DIR.replace(/\\/g, '/')}/resources`;

const counters = new Map();

function saveId(key) {
  const next = (counters.get(key) || 0) + 1;
  counters.set(key, next);
  setTimeout(() => counters.delete(key), 10_000);
  return `${key}_${next}`;
}

async function render(e, tpl, params = {}, cfg = {}) {
  const data = {
    ...params,
    pluginName,
    pluginResources,
    _plugin: pluginName,
    _htmlPath: tpl,
    _res_path: `${pluginResources}/`,
    _layout_path: `${pluginResources}/common/layout/`,
    tplFile: `./plugins/${pluginName}/resources/${tpl}.html`,
    quality: params.quality || 100,
    saveId: saveId(String(params.saveId || 'render')),
    copyright: `Created By Yunzai-Bot & ${pluginName}`,
    copyright2: `Created By Yunzai-Bot & ${pluginName} `,
  };

  if (!e?.runtime?.render) {
    const { default: puppeteer } = await import('../../../lib/puppeteer/puppeteer.js');
    return puppeteer.screenshots(`${pluginName}/${tpl}`, data);
  }

  return e.runtime.render(pluginName, tpl, data, {
    retType: cfg.retType || 'base64',
    beforeRender({ data: injected }) {
      return { ...injected, ...data };
    },
  });
}

/** runtime.render / puppeteer 的返回值可能是 Buffer、裸 base64，或已经是消息段 */
function imageSegment(value) {
  if (Buffer.isBuffer(value)) return segment.image(value);
  if (typeof value === 'string' && !/^(https?:|file:|base64:\/\/)/.test(value)) return segment.image(`base64://${value}`);
  return value;
}

export { render, imageSegment, pluginName, pluginResources };
