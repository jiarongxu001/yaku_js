#!/usr/bin/env node

"use strict";

const VERSION = "1.0.0";

// 导入 Node.js 原生 fs 模块
import fs from 'fs';

// 将 fs 绑定到 global，供其他模块（如 Parser.js）使用
global.fs = fs;

import { main } from '../lib/Yaku.js';

main(process.argv.slice(2));
