/**
 * 安卓端 · 外部依赖统一出口（共享内核 / Markdown / Capacitor 插件）
 * ES 模块：由 app.js 作为 build:www 的打包入口统一 bundle。
 */
import LedgerCore from '../shared/ledger-core.js';
import Markdown from '../shared/markdown.js';
import AiContext from '../shared/ai/index.js';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const Core = LedgerCore;
export const NATIVE = !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
export { Markdown, AiContext, Capacitor, CapacitorHttp, Filesystem, Directory, Encoding, Share };
