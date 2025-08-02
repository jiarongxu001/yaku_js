#!/usr/bin/env node
import fs from 'fs';
global.fs = fs;
import { main } from '../../lib/Yaku.js';
main(process.argv.slice(2));
