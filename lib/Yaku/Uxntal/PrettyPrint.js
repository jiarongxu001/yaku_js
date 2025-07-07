"use strict";

const VERSION = "1.0.0";

import { 
    refTypes, revRefTypes,
    MAIN, LIT, INSTR, LABEL, REF, IREF, RAW, ADDR, PAD, EMPTY, UNKNOWN, INCLUDE, STR, PLACEHOLDER
} from './Definitions.js';

/**
 * 格式化token数组为字符串
 */
export function prettyPrintStr(tokens, no_newline = 0) {
    let tokensStr = '';
    const nl = no_newline ? '' : '\n';
    let nskips = 0;
    let prefix = '';
    let skip = 0;
    let mws = '';
    const n_tokens = tokens.length;
    
    for (let i = 0; i < n_tokens; i++) {
        const token = tokens[i];
        if (!token || token.length === 0) continue;
        
        const tokenType = token[0];
        let tokenStr = '';
        mws = ' ';
        
        if (tokenType === MAIN) {
            tokenStr = `${nl}|0100${nl}`;
            mws = '';
        } else {
            if (tokenType === EMPTY) continue;
            
            const tokenVal = token[1];
            
            if (tokenType === LABEL) {
                if (token[2] === 1) { // '&'
                    tokenStr = token[1].endsWith('_LAMBDA') 
                        ? '}' 
                        : tokensStr.endsWith('\n') 
                            ? `&${tokenVal}${nl}`
                            : `${nl}&${tokenVal}${nl}`;
                } else if (token[2] === 2) { // '@'
                    const needsExtraNewline = /\![\w\-]+\n?$/.test(tokensStr) ? nl : '';
                    const needsTrailingNewline = (n_tokens > 1) && 
                        (i + 1 < tokens.length) && 
                        tokens[i + 1] && 
                        tokens[i + 1][0] === PAD ? '' : nl;
                    tokenStr = `${nl}${needsExtraNewline}@${tokenVal}${needsTrailingNewline}`;
                    mws = '';
                }
            } else if (tokenType === REF) {
                const maybe_child_ref = token[3] ? (!token[1].includes('/') ? '&' : '') : '';
                tokenStr = revRefTypes[token[2]] === 'I'
                    ? (token[1].includes('_LAMBDA')
                        ? '{'
                        : prefix + maybe_child_ref + tokenVal)
                    : revRefTypes[token[2]] + maybe_child_ref + tokenVal;
                prefix = '';
                skip = 0;
            } else if (tokenType === INSTR) {
                const [, tokenVal, wordSz, r, k] = token;
                skip = 1;
                
                if (tokenVal === 'JSI') {
                    prefix = '';
                } else if (tokenVal === 'JCI') {
                    prefix = '?';
                } else if (tokenVal === 'JMI') {
                    prefix = '!';
                } else {
                    const hasNextNonInstr = (i + 1 < tokens.length) && 
                        tokens[i + 1] && 
                        tokens[i + 1][0] !== INSTR;
                    tokenStr = tokenVal + 
                        (wordSz === 2 ? '2' : '') + 
                        (r === 1 ? 'r' : '') + 
                        (k === 1 ? 'k' : '') +
                        (hasNextNonInstr ? nl : '');
                    
                    if (tokenVal === 'BRK') {
                        tokenStr = `${nl}${tokenStr}`;
                    }
                    skip = 0;
                }
            } else if (tokenType === LIT) {
                tokenStr = '#' + toHex(tokenVal, token[2]);
            } else if (tokenType === RAW) {
                tokenStr = toHex(tokenVal, token[2]);
            } else if (tokenType === ADDR) {
                tokenStr = '|' + sprintf("%04x", tokenVal) + ' ';
            } else if (tokenType === PAD) {
                tokenStr = '$' + sprintf("%x", tokenVal);
            } else if (tokenType === EMPTY) {
                skip = 1;
            } else if (tokenType === PLACEHOLDER) {
                tokenStr = '( ' + token[1] + ' )';
            } else if (tokenType === STR) {
                tokenStr = token[1];
            } else if (tokenType === INCLUDE) {
                tokenStr = token[1];
            } else {
                tokenStr = 'TODO:' + JSON.stringify(token);
            }
        }
        
        if (!skip) {
            tokensStr += mws + tokenStr;
        }
    }
    
    return tokensStr;
}

/**
 * 打印token数组
 */
export function prettyPrint(tokens, no_newline = 0) {
    const tokensStr = prettyPrintStr(tokens, no_newline);
    console.log(tokensStr);
}

/**
 * 格式化单个token
 */
export function prettyPrintToken(token) {
    if (!token || token.length === 0) {
        return '';
    }
    
    const tokenType = token[0];
    let tokenStr = '';
    
    if (tokenType === EMPTY) {
        return '';
    } else if (tokenType === MAIN) {
        tokenStr = '|0100';
    } else {
        const tokenVal = token[1];
        
        if (tokenType === LABEL) {
            if (token[2] === 1) { // '&'
                tokenStr = token[1].endsWith('_LAMBDA') 
                    ? '}' 
                    : '&' + tokenVal;
            } else if (token[2] === 2) { // '@'
                tokenStr = '@' + tokenVal;
            }
        } else if (tokenType === REF) {
            const maybe_child_ref = token[3] ? (!token[1].includes('/') ? '&' : '') : '';
            tokenStr = revRefTypes[token[2]] === 'I'
                ? (token[1].endsWith('_LAMBDA')
                    ? '{'
                    : maybe_child_ref + tokenVal)
                : revRefTypes[token[2]] + maybe_child_ref + tokenVal;
        } else if (tokenType === INSTR) {
            const [, tokenVal, wordSz, r, k] = token;
            tokenStr = tokenVal + 
                (wordSz === 2 ? '2' : '') + 
                (r === 1 ? 'r' : '') + 
                (k === 1 ? 'k' : '');
        } else if (tokenType === LIT) {
            tokenStr = '#' + toHex(tokenVal, token[2]);
        } else if (tokenType === RAW) {
            tokenStr = toHex(tokenVal, token[2]);
        } else if (tokenType === ADDR) {
            tokenStr = '|' + sprintf("%04x", tokenVal) + ' ';
        } else if (tokenType === PAD) {
            tokenStr = '$' + sprintf("%x", tokenVal);
        } else if (tokenType === PLACEHOLDER) {
            tokenStr = '( ' + token[1] + ' )';
        } else if (tokenType === STR) {
            tokenStr = token[1];
        } else if (tokenType === INCLUDE) {
            tokenStr = token[1];
        } else {
            tokenStr = 'TODO:' + JSON.stringify(token);
        }
    }
    
    return tokenStr;
}

/**
 * 将数值转换为十六进制字符串
 */
export function toHex(n, sz) {
    if (typeof n === 'string' && /_\d$/.test(n)) {
        n = n.replace(/_(\d)$/, ''); // 去除 _2
        // const word_sz = parseInt(match[1]);
    }
    
    const szx2 = sz * 2;
    if (n < 0) {
        n = Math.pow(2, 8 * sz) + n;
    }
    
    return sprintf(`%0${szx2}x`, n);
}

/**
 * 简化的sprintf实现
 */
function sprintf(format, ...args) {
    let i = 0;
    return format.replace(/%(-?)(\d*)([sdxc%])/g, (match, leftAlign, width, type) => {
        if (type === '%') return '%';
        
        let result;
        switch (type) {
            case 's':
                result = String(args[i++]);
                break;
            case 'd':
                result = Number(args[i++]).toString();
                break;
            case 'x':
                result = Number(args[i++]).toString(16);
                break;
            case 'c':
                result = String.fromCharCode(Number(args[i++]));
                break;
            default:
                return match;
        }
        
        // 处理宽度和对齐
        if (width) {
            const w = parseInt(width);
            if (leftAlign) {
                result = result.padEnd(w, ' ');
            } else {
                if (type === 'x') {
                    result = result.padStart(w, '0');
                } else {
                    result = result.padStart(w, ' ');
                }
            }
        }
        
        return result;
    });
}