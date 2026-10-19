/** 配置读取：插件目录下 config/novel.yaml，缺失时写入默认模板 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const PLUGIN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CONFIG_FILE = path.join(PLUGIN_DIR, 'config', 'novel.yaml');

const DEFAULT_CONFIG = {
  api_url: 'https://api.avbvcv.xyz',
  QIDIAN_CK: 'ywkey=; ywguid=; appId=12; areaId=30; lang=cn; mode=normal; bar=104; qid=1678fab9465bfa9d5be1f107100019300c0e; qidth=1678fab9465bfa9d5be1f10710001930; gorgon=cetFo3wj5EwjZBblPc9QX6JiGisxDvs5tWiuwBVwZkC9Zrh0U8Ibi3-2bEyhg0AfsSLuWHcZ4nDaPtL_JuE81UFjTgKcHkkrRzsymWPDIh68jfGVxln95kn0LG2nff5SxeJoFrwRgf4jR2Ou2BCO6Zmuk6uUJCy5s3btM3Q1Oyjctbs1h_hSsIShW9kOp8neZjhiNDY2MTRmZmRiY2Q2ZjcyZmU1NDdiMTVkYTg3N2Y=; QDInfo=ErOpI3OlIMknMzxt++3ojjMgF2CB4rQ2y1e99XuOJ8Xk5t6ZnHl1pkzc4+Zf3HwIIuvTVwQob/gRe+Qjpth4QLnBBJDHRYtLOtSIFPS1CffwgUUeEpo8f2TOj7VAXd4kc8PiWsp8mhbnE+sdpwI5CYNOToxuSmpE9Q0A3Do2bMI4kNLM2o8iSEgflxDvocB+yB1UBs7yVGam9ASRmquHm3S37c7CdcLk3jXXrpz83NqwjrXDFoP4LwIDmuKpcdSJ2N1cViMKzBIVV01S3iJAaZf+yGJ0CN6xI4cPClMWuTg=',
  search_count: 8,
  cache_minutes: 15,
  download_timeout_sec: 600,
  max_chapters: 0,
  size_warn_mb: 80,
};

const CONFIG_TEMPLATE = `# 小说插件配置
# 接口网关地址（番茄/七猫/起点 action 共用）
api_url: https://api.avbvcv.xyz
#起点读书ck(带上完整请求头)
QIDIAN_CK: 'ywkey=; ywguid=; appId=12; areaId=30; lang=cn; mode=normal; bar=104; qid=1678fab9465bfa9d5be1f107100019300c0e; qidth=1678fab9465bfa9d5be1f10710001930; gorgon=cetFo3wj5EwjZBblPc9QX6JiGisxDvs5tWiuwBVwZkC9Zrh0U8Ibi3-2bEyhg0AfsSLuWHcZ4nDaPtL_JuE81UFjTgKcHkkrRzsymWPDIh68jfGVxln95kn0LG2nff5SxeJoFrwRgf4jR2Ou2BCO6Zmuk6uUJCy5s3btM3Q1Oyjctbs1h_hSsIShW9kOp8neZjhiNDY2MTRmZmRiY2Q2ZjcyZmU1NDdiMTVkYTg3N2Y=; QDInfo=ErOpI3OlIMknMzxt++3ojjMgF2CB4rQ2y1e99XuOJ8Xk5t6ZnHl1pkzc4+Zf3HwIIuvTVwQob/gRe+Qjpth4QLnBBJDHRYtLOtSIFPS1CffwgUUeEpo8f2TOj7VAXd4kc8PiWsp8mhbnE+sdpwI5CYNOToxuSmpE9Q0A3Do2bMI4kNLM2o8iSEgflxDvocB+yB1UBs7yVGam9ASRmquHm3S37c7CdcLk3jXXrpz83NqwjrXDFoP4LwIDmuKpcdSJ2N1cViMKzBIVV01S3iJAaZf+yGJ0CN6xI4cPClMWuTg='
# 搜索每个来源返回条数（番茄上限 30）
search_count: 8
# 搜索结果缓存分钟数，缓存期内可用「#小说下载 序号」
cache_minutes: 15
# 整书下载 HTTP 超时（秒），大部头全本可能需要几分钟
download_timeout_sec: 600
# 番茄整书默认最大章节数，0 表示全本
max_chapters: 0
# 发送前超过该大小（MB）提示
size_warn_mb: 80
`;

function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
      fs.writeFileSync(CONFIG_FILE, CONFIG_TEMPLATE);
    }
    return { ...DEFAULT_CONFIG, ...(parse(fs.readFileSync(CONFIG_FILE, 'utf8')) || {}) };
  } catch (err) {
    logger.warn(`[Browser] 配置读取失败，使用默认配置：${err.message}`);
    return { ...DEFAULT_CONFIG };
  }
}

export { CONFIG_FILE, loadConfig };
