"use strict";

const VERSION = "1.0.0";

// 导入模块
import {
    tokenTypes, refTypes, opcode,
    MAIN, LIT, INSTR, LABEL, REF, RAW, PAD, EMPTY
} from './Definitions.js';
import { EE } from '../Flags.js';

// 辅助函数
function prettyPrintStr(tokens, mode) {
    return tokens.map(t => Array.isArray(t) ? (t[1] || t.toString()) : t.toString()).join(' ');
}

function prettyPrintToken(token) {
    if (!token || !Array.isArray(token)) return 'undefined';
    if (token[0] === LABEL) return '@' + token[1];
    if (token[0] === REF) return '.' + token[1];
    if (token[0] === LIT) return '#' + token[1].toString(16).padStart(token[2] === 2 ? 4 : 2, '0');
    if (token[0] === INSTR) return token[1] + (token[2] === 2 ? '2' : '') + (token[3] ? 'r' : '') + (token[4] ? 'k' : '');
    return token[1] ? token[1].toString() : token.toString();
}

export function getLineForToken(token, uxn) {
    if (!token || !Array.isArray(token)) {
        return " (invalid token)";
    }
    
    const tokenIdx = token[token.length - 1];
    if (uxn.lineIdxs && uxn.lineIdxs[tokenIdx]) {
        const [lineIdx, fname] = uxn.lineIdxs[tokenIdx];
        const line = uxn.linesPerFile?.[fname]?.[lineIdx - 1] || '';
        const displayName = fname === 'from_stdin.tal' ? 'STDIN' : fname;
        return " on line " + lineIdx + " of " + displayName + ": " + line;
    } else {
        return " (line information not available)";
    }
}

// 主要检查函数
export function checkErrors(tokens, uxn) {
    uxn = buildAllocationTable(tokens, uxn);

    let current_parent = '';
    const errors = [];
    const warnings = [];
    let found_main = false;

    for (let idx = 0; idx < tokens.length; idx++) {
        const token = tokens[idx];
        const next_token = (idx + 1 < tokens.length) ? tokens[idx + 1] : [EMPTY, 0, 0];
        const prev_token = tokens[idx - 1];

        if (token[0] === MAIN) {
            found_main = true;
        }

        // 零页写入检查
        if (uxn.hasMain === 1 && !found_main && token[0] === RAW) {
            errors.push('Writing raw values in the zero page is not allowed: ' + 
                prettyPrintToken(token) + getLineForToken(token, uxn));
        }
        // 父标签处理
        else if (token[0] === LABEL && token[2] === 2) {
            current_parent = token[1];
        }
        // 堆栈常量后跟加载/存储错误
        else if (token[0] === LIT && next_token[0] === INSTR && 
                  /(?:LD|ST)[ARZ]/.test(next_token[1])) {
            errors.push('Stack constant followed by load or store:' + 
                prettyPrintStr([token, next_token], 1) + getLineForToken(token, uxn));
        }
        // 原始常量后跟加载/存储错误
        else if (token[0] === RAW && next_token[0] === INSTR && 
                  /(?:LD|ST)[ARZ]/.test(next_token[1])) {
            errors.push('Raw constant followed by load or store:' + 
                prettyPrintStr([token, next_token], 1) + getLineForToken(token, uxn));
        }
        // 引用检查
        else if (token[0] === REF) {
            const accessMode = ['Z', 'R', 'A', 'Z', 'R', 'A', ''];
            
            if (next_token[0] === INSTR && /(LD|ST)([ARZ])/.test(next_token[1])) {
                const match = next_token[1].match(/(LD|ST)([ARZ])/);
                const a_mode = match[2];
                
                if (a_mode !== accessMode[token[2]]) {
                    errors.push(prettyPrintToken(next_token) + ' has address with incompatible reference mode ' + 
                        prettyPrintToken(token) + getLineForToken(token, uxn));
                }

                // 分配检查
                const name = (token[3] === 1 && current_parent !== '') ? 
                    current_parent + '/' + token[1] : token[1];
                const alloc_sz = uxn.allocationTable?.[name] || 0;
                const word_sz = next_token[2];
                
                if (token[2] < 3) {
                    if (alloc_sz === 0) {
                        errors.push('No allocation for reference:' + 
                            prettyPrintStr([token, next_token], 1) + 
                            getLineForToken(next_token, uxn) + " <" + name + ">");
                    } else if (alloc_sz < word_sz) {
                        errors.push('Allocation is only a byte, access is a short:' + 
                            prettyPrintStr([token, next_token], 1) + 
                            getLineForToken(next_token, uxn));
                    } else if (alloc_sz > word_sz && alloc_sz === 2) {
                        warnings.push('Allocation is larger than access size:' + 
                            prettyPrintStr([token, next_token], 1) + 
                            getLineForToken(next_token, uxn));
                    }
                }
            }
            // 跳转指令检查
            else if (next_token[0] === INSTR && /(JMP|JCN|JSR)/.test(next_token[1])) {
                if (token[2] === 1 && next_token[2] !== 1) {
                    errors.push(prettyPrintToken(next_token) + ' has address with incompatible reference mode ' + 
                        prettyPrintToken(token) + getLineForToken(token, uxn));
                } else if (token[2] === 2 && next_token[2] !== 2) {
                    errors.push(prettyPrintToken(next_token) + ' has address with incompatible reference mode ' + 
                        prettyPrintToken(token) + getLineForToken(token, uxn));
                }
            }
        }
        // SFT指令检查
        else if (token[0] === LIT && next_token[0] === INSTR && /SFT/.test(next_token[1])) {
            if (token[2] === 2) {
                errors.push('Second argument of SFT must be a byte:' + 
                    prettyPrintStr([prev_token, token, next_token], 1) + 
                    getLineForToken(token, uxn));
            }
        }
    }

    // 处理警告和错误
    if (warnings.length > 0) {
        for (const warning of warnings) {
            console.error("Warning: " + warning);
        }
        if (EE) process.exit(1);
    }
    
    if (errors.length > 0) {
        for (const error of errors) {
            console.error("Error: " + error);
        }
        process.exit(1);
    }
}

function buildAllocationTable(tokens, uxn) {
    let current_parent = '';
    let current_cfqn = '';
    uxn.allocationTable = {};
    let prev_consecutive_label = '';
    
    for (let idx = 0; idx < tokens.length; idx++) {
        const token = tokens[idx];
        const next_token = (idx + 1 < tokens.length) ? tokens[idx + 1] : [EMPTY, 0, 0];
        
        if (token[0] === LABEL) {
            if (token[2] === 2) { // parent
                current_parent = token[1];
                current_cfqn = '';
            } else {
                current_cfqn = current_parent + '/' + token[1];
            }
            
            if (next_token[0] === PAD) {
                const name = current_cfqn !== '' ? current_cfqn : current_parent;
                uxn.allocationTable[name] = next_token[1];
            } else if (next_token[0] === RAW) {
                const name = current_cfqn !== '' ? current_cfqn : current_parent;
                uxn.allocationTable[name] = next_token[2];
            } else if (next_token[0] === LABEL) {
                prev_consecutive_label = (token[2] === 2) ? current_parent : current_cfqn;
                continue;
            } else {
                const name = current_cfqn !== '' ? current_cfqn : current_parent;
                uxn.allocationTable[name] = 0;
            }
            
            if (prev_consecutive_label !== '') {
                const currentAlloc = current_cfqn !== '' 
                    ? uxn.allocationTable[current_cfqn]
                    : uxn.allocationTable[current_parent];
                uxn.allocationTable[prev_consecutive_label] = currentAlloc;
                prev_consecutive_label = '';
            }
        }
    }
    
    return uxn;
}

export function getLinesForTokens(programText) {
    const linesForToken = {};
    const lines = programText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\s*\(.+?\)\s*$/, '');
        const tokens = line.split(/\s+/).filter(t => t.length > 0);
        
        for (const token of tokens) {
            if (token.startsWith('"')) {
                const chars = token.substr(1).split('');
                for (const char of chars) {
                    const hexChar = char.charCodeAt(0).toString(16).padStart(2, '0');
                    if (!linesForToken[hexChar]) linesForToken[hexChar] = [];
                    linesForToken[hexChar].push(i + 1);
                }
            } else {
                if (!linesForToken[token]) linesForToken[token] = [];
                linesForToken[token].push(i + 1);
            }
        }
    }
    
    return linesForToken;
}