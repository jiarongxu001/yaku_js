"use strict";

const VERSION = "1.0.0";

// import { readFileSync } from 'fs';
import { 
    tokenTypes, refTypes, opcode,
    MAIN, LIT, INSTR, LABEL, REF, IREF, RAW, ADDR, PAD, EMPTY, UNKNOWN, INCLUDE, STR
} from './Definitions.js';
import { prettyPrintToken } from './PrettyPrint.js';
import { getLinesForTokens } from './ErrorChecking.js';
import { WW } from '../Flags.js';

const VV = (typeof process !== 'undefined' && process.env?.YAKU_VERBOSE)
  ? parseInt(process.env.YAKU_VERBOSE)
  : 0;


/**
 * 解析Uxntal程序文件
 */
export function parseUxntalProgram(programFile, uxn) {
    let programText;
    try {
        programText = window.fs.readFile(programFile, { encoding: 'utf8' });

    } catch (error) {
        throw new Error(`Can't open file ${programFile}: ${error.message}`);
    }
    
    programText = programText.replace(/\r/g, ''); // 移除回车符

    if (!uxn.linesForToken) {
        uxn.linesForToken = {};
    }
    uxn.linesForToken = { ...uxn.linesForToken, ...getLinesForTokens(programText) };

    const programText_noComments = stripCommentsFSM(programText);
    
    if (/^\s*$/.test(programText_noComments)) {
        let snippet = '';
        if (/\S\)/.test(programText)) {
            const match = programText.match(/(\s.{1,16}\S\).{1,16}\s)/);
            if (match) snippet += match[1];
        }
        if (/\(\S/.test(programText)) {
            const match = programText.match(/(\s.{1,16}\(\S.{1,16}\s)/);
            if (match) snippet += match[1];
        }
        throw new Error(`Error in comments, probably missing space around paren:\n\t${snippet}\n`);
    } else if (/([^\(]+\))/.test(programText_noComments)) {
        const match = programText_noComments.match(/([^\(]+\))/);
        const p = match[1];
        let ok = false;
        
        const stringMatch = programText_noComments.match(/(\"[^\"]+?\))/);
        if (stringMatch) {
            const astr = stringMatch[1];
            if (new RegExp(`(.+?)\\Q${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(astr)) {
                ok = true;
            }
        }
        if (!ok) {
            const snippet = p.substring(Math.max(0, p.length - 80));
            console.warn(`Possible error in comments, probably missing space around paren:\n\t${snippet}\n`);
            throw new Error(`<${programText_noComments}>`);
        }
    }

    // 分词
    const tokenStrings = programText_noComments.split(/\s+/).filter(s => s.length > 0);
    const tokens = tokenStrings.map(str => parseToken(str, uxn));

    const tokenList = [];
    for (const item of tokens) {
        if (Array.isArray(item[0])) { // 是token列表，需要展开
            for (const token of item) {
                if (token.length > 0) {
                    tokenList.push(token);
                }
            }
        } else {
            if (item[0] === MAIN) {
                uxn.hasMain = 1;
            }
            tokenList.push(item);
        }
    }

    // 处理每个token的行信息
    const [tokenLineIdxs, lines] = getLineForEachToken(tokenList, programFile, programText);
    uxn.linesPerFile = uxn.linesPerFile || {};
    uxn.linesPerFile[programFile] = lines;

    const mergedTokenList = [];
    const mergedTokenLineIdxs = [];
    let idx = 0;

    for (const item of tokenList) {
        const lineIdx = tokenLineIdxs[idx];
        if (item[0] === INCLUDE) {
            const [included_tokens, tokenLineIdxs_for_include, updatedUxn] = parseUxntalProgram(item[1], uxn);
            uxn = updatedUxn;
            
            if (included_tokens.length > 0) {
                mergedTokenList.push(...included_tokens);
                mergedTokenLineIdxs.push(...tokenLineIdxs_for_include);
            } else {
                throw new Error(`Failed to include ${item[1]}`);
            }
        } else {
            mergedTokenList.push(item);
            mergedTokenLineIdxs.push(lineIdx);
        }
        idx++;
    }

    return [mergedTokenList, mergedTokenLineIdxs, uxn];
}

/**
 * 使用FSM去除注释
 */
function stripCommentsFSM(programText) {
    programText = programText.replace(/\n+/g, '  '); // 替换换行为空格
    programText = programText.replace(/\t+/g, '  ');
    
    let parens_count = 0;
    const chars = (' ' + programText + ' ').split('');

    let matched_str = '';
    let prev_ch = '';
    let in_str = 0;
    
    for (let ch_idx = 0; ch_idx < chars.length; ch_idx++) {
        const ch = chars[ch_idx];
        const next_ch = ch_idx + 1 < chars.length ? chars[ch_idx + 1] : '';
        
        if (ch === '"' && next_ch !== ' ') {
            in_str = 1;
        }
        if (in_str && next_ch === ' ') {
            in_str = 0;
        }
        
        const paren_in_str = (in_str === 1) && (ch === '(');
        
        // 添加不在( ... )内的字符
        if (parens_count === 0 && (ch !== '(' || paren_in_str)) {
            matched_str += ch;
        }

        if ((prev_ch === ' ' || prev_ch === '') && (ch === '(') && (next_ch === ' ')) {
            parens_count++;
        } else if (ch === ')' && prev_ch === ' ' && (next_ch === ' ')) {
            parens_count--;
            if (parens_count < 0) {
                throw new Error(`Error: Comment invalid near ${matched_str}\n`);
            }
        }
        
        prev_ch = ch;
    }

    return matched_str;
}

/**
 * 解析单个token - 根据Perl逻辑进行正确的if-elsif链修复
 */
function parseToken(tokenStr, uxn) {
    if (tokenStr.startsWith('~')) { // include
        const pathStr = tokenStr.substring(1);
        return [INCLUDE, pathStr];
    } 
    
    if (tokenStr.startsWith('%')) { // macros
        throw new Error("Error: Macros not yet supported\n");
    }    
    
    if (tokenStr === '[' || tokenStr === ']') {
        return [[]];
    }
    
    if (tokenStr.startsWith('#')) { // LIT
        const valStr = tokenStr.substring(1);
        if (/([^0-9a-f])/.test(valStr)) {
            const match = valStr.match(/([^0-9a-f])/);
            throw new Error(`Error: Constant #${valStr} contains invalid hex digit ${match[1]} at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
        const val = parseInt(valStr, 16);
        if (valStr.length === 2) {
            return [LIT, val, 1];
        } else if (valStr.length === 4) {
            return [LIT, val, 2];
        } else {
            throw new Error(`Error: Constant #${valStr} must be at two or four hex digits at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
    }
    
    if (tokenStr.startsWith('"')) { // raw string
        const chars = tokenStr.substring(1).split('');
        const charTokens = chars.map(char => [RAW, char.charCodeAt(0), 1]);
        if (charTokens.length > 0) {
            return charTokens;
        } else {
            throw new Error(`Error: Invalid <${tokenStr}> at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
    } 
    
    // 检查引用模式 - 对应Perl的 elsif  ($tokenStr =~/^([;,\._\-=])(.+)$/)
    const refMatch = tokenStr.match(/^([;,\._\-=])(.+)$/);
    if (refMatch) { // refs
        const rune = refMatch[1];
        let val = refMatch[2];
        let is_child = 0;
        
        if (val.includes('&')) {
            is_child = 1;
            val = val.replace(/&/g, '');
        } else if (val.includes('/')) {
            is_child = 2;
        }
        
        const ref_type = refTypes[rune];
        return [REF, val, ref_type, is_child];
    } 
    
    if (tokenStr.startsWith('@')) { // label
        const val = tokenStr.substring(1);
        return [LABEL, val, 2]; // 2 for parent
    } 
    
    if (tokenStr.startsWith('&')) { // child label
        const val = tokenStr.substring(1);
        return [LABEL, val, 1]; // 1 for child
    } 
    
    if (tokenStr === '|0100' || tokenStr === '|100') { // main
        return [MAIN];
    } 
    
    if (tokenStr.startsWith('|')) { // other absolute padding
        const val = tokenStr.substring(1);
        if (val.length === 0) {
            throw new Error(`Error: Invalid <${tokenStr}> at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
        return [ADDR, parseInt(val, 16)];
    } 
    
    if (tokenStr.startsWith('$')) { // relative padding
        const val = tokenStr.substring(1);
        if (val.length === 0) {
            throw new Error(`Error: Invalid <${tokenStr}> at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
        return [PAD, parseInt(val, 16)];
    } 
    
    if (tokenStr.startsWith('?{')) {
        const lambda_count = uxn.lambdaCount || 0;
        if (!uxn.lambdaStack) uxn.lambdaStack = [];
        uxn.lambdaStack.push(lambda_count);
        uxn.lambdaCount = (uxn.lambdaCount || 0) + 1;
        return [
            [INSTR, 'JCI', 2, 0, 0],
            [REF, lambda_count + '_LAMBDA', 6, 1]
        ];
    } 
    
    if (tokenStr.startsWith('?')) {
        let val = tokenStr.substring(1);
        if (val.length === 0) {
            throw new Error(`Error: Invalid <${tokenStr}> at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
        let is_child = 0;
        if (val.includes('&') || val.includes('/')) {
            is_child = 1;
            val = val.replace(/&/g, '');
        }
        return [
            [INSTR, 'JCI', 2, 0, 0],
            [REF, val, 6, is_child]
        ];
    } 
    
    if (tokenStr.startsWith('!')) {
        let val = tokenStr.substring(1);
        if (val.length === 0) {
            throw new Error(`Error: Invalid <${tokenStr}> at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
        let is_child = 0;
        if (val.includes('&') || val.includes('/')) {
            is_child = 1;
            val = val.replace(/&/g, '');
        }
        return [
            [INSTR, 'JMI', 2, 0, 0],
            [REF, val, 6, is_child]
        ];
    } 
    
    if (tokenStr.startsWith('{')) {
        const lambda_count = uxn.lambdaCount || 0;
        if (!uxn.lambdaStack) uxn.lambdaStack = [];
        uxn.lambdaStack.push(lambda_count);
        uxn.lambdaCount = (uxn.lambdaCount || 0) + 1;
        return [
            [INSTR, 'JSI', 2, 0, 0],
            [REF, lambda_count + '_LAMBDA', 6, 1]
        ];
    } 
    
    if (tokenStr.startsWith('}')) {
        if (!uxn.lambdaStack || uxn.lambdaStack.length === 0) {
            throw new Error(`Error: Unmatched '}' at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
        const lambda_count = uxn.lambdaStack.pop();
        return [LABEL, lambda_count + '_LAMBDA', 1];
    } 
    
    if (/^[A-Z]{3}[2kr]*$/.test(tokenStr)) { // maybe instruction
        const instr = tokenStr.substring(0, 3);
        if (opcode.hasOwnProperty(instr)) {
            return parseInstructionToken(tokenStr, instr);
        } else {
            if (!WW) {
                console.error(`Warning: ${instr} is not an instruction, treating it as a subroutine call\n`);
            }
            return [
                [INSTR, 'JSI', 2, 0, 0],
                [REF, tokenStr, 6, 0]
            ];
        }
    } 
    
    // 最后处理其他情况 - 对应Perl的else块
    if (tokenStr === '') {
        return [EMPTY, 0, 1];
    } else {
        if (/^[a-f0-9]{2,4}$/.test(tokenStr)) { // valid raw hex
            const word_sz = tokenStr.length === 2 ? 1 : tokenStr.length === 4 ? 2 : (() => {
                throw new Error(`Error: Invalid token <${tokenStr}> at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
            })();
            return [RAW, parseInt(tokenStr, 16), word_sz];
        } else if (/^[a-f0-9]+$/.test(tokenStr)) { // raw hex but wrong size
            throw new Error(`Error: Invalid number <${tokenStr}> at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        } else if (/^[<\*\+\^\w].+/.test(tokenStr) || /^\w/.test(tokenStr)) {
            // Valid identifiers - immediate function call
            return [
                [INSTR, 'JSI', 2, 0, 0],
                [REF, tokenStr, 6, 0]
            ];
        } else {
            throw new Error(`Error: Invalid token <${tokenStr}> at line ${getLinesForToken([STR, tokenStr], uxn)}\n`);
        }
    }
}

/**
 * 将指令解析逻辑提取为独立函数
 */
function parseInstructionToken(tokenStr, instr) {
    const len = tokenStr.length;
    
    if (len === 3) {
        return [INSTR, instr, 1, 0, 0];
    } else if (len === 4) {
        const mode = tokenStr.charAt(3);
        if (mode === '2') {
            return [INSTR, instr, 2, 0, 0];
        } else if (mode === 'r') {
            return [INSTR, instr, 1, 1, 0];
        } else if (mode === 'k') {
            return [INSTR, instr, 1, 0, 1];
        } else {
            throw new Error(`Error: Invalid instruction mode '${mode}' in '${tokenStr}'`);
        }
    } else if (len === 5) {
        const modes = tokenStr.substring(3, 5);
        if (modes === '2r' || modes === 'r2') {
            return [INSTR, instr, 2, 1, 0];
        } else if (modes === '2k' || modes === 'k2') {
            return [INSTR, instr, 2, 0, 1];
        } else if (modes === 'rk' || modes === 'kr') {
            return [INSTR, instr, 1, 1, 1];
        } else {
            throw new Error(`Error: Invalid instruction mode combination '${modes}' in '${tokenStr}'`);
        }
    } else if (len === 6) {
        return [INSTR, instr, 2, 1, 1];
    } else {
        throw new Error(`Error: Invalid instruction length in '${tokenStr}'`);
    }
}

/**
 * 获取每个token的行信息
 */
function getLineForEachToken(tokens, programFile, programText) {
    const tokenLineIdxs = [];
    const lines = programText.split(/\n/);
    
    let lineIdx = 1;
    let ttokenIdx = 0;
    let in_block_comment = 0;
    let before_block_start = 0;
    let after_block_end = 0;
    
    for (let line_ro of lines) {
        let line = line_ro;
        
        // 首先替换字符串中的括号为ASCII码
        if (line.includes('"')) {
            const chunks = line.split(/\s+/);
            for (let i = 0; i < chunks.length; i++) {
                let chunk = chunks[i];
                if (chunk.startsWith('"')) {
                    while (chunk.includes('(')) {
                        chunk = chunk.replace(/\(/, ' 28 "');
                    }
                    while (chunk.includes(')')) {
                        chunk = chunk.replace(/\)/, ' 29 "');
                    }
                    chunk = chunk.replace(/\s*"\s*$/, '');
                    chunk = chunk.replace(/^\s*"\s*/, '');
                    chunks[i] = chunk;
                }
            }
            line = chunks.join(' ');
        }
        
        // 然后迭代移除匹配的括号
        while (/\([^\(\)]+?\)/.test(line)) {
            line = line.replace(/\([^\(\)]+?\)/g, '');
        }
        
        // FSM处理块注释
        if (in_block_comment === 0 && /^[^\(\)]+\(/.test(line)) {
            line = line.replace(/\(.+$/, '');
            before_block_start = 1;
            in_block_comment = 1;
        }
        
        if (in_block_comment === 1 && /\)[^\(\)]+$/.test(line)) {
            line = line.replace(/^.+\)/, '');
            after_block_end = 1;
            in_block_comment = 0;
        }
        
        if (before_block_start === 0 && in_block_comment === 0 && /^\s*\(/.test(line)) {
            in_block_comment = 1;
            lineIdx++;
            continue;
        }
        
        if (in_block_comment === 1 && /\)\s*$/.test(line)) {
            in_block_comment = 0;
            lineIdx++;
            continue;
        }
        
        if (before_block_start === 0 && after_block_end === 0 && in_block_comment === 1) {
            lineIdx++;
            continue;
        }
        
        before_block_start = 0;
        
        // 匹配tokens
        for (let tokenIdx = ttokenIdx; tokenIdx < tokens.length; tokenIdx++) {
            const token = tokens[tokenIdx];
            
            if (token[0] === EMPTY) {
                if (!/^\s*$/.test(line)) {
                    tokenLineIdxs[tokenIdx] = [0, programFile];
                    continue;
                } else {
                    tokenLineIdxs[tokenIdx] = [lineIdx, programFile];
                    ttokenIdx++;
                    break;
                }
            } else if (
                token[0] === RAW ||
                token[0] === PAD ||
                token[0] === ADDR ||
                (token[0] === INSTR && /J[MSC]I/.test(token[1]))
            ) {
                tokenLineIdxs[tokenIdx] = [0, programFile];
                ttokenIdx++;
                continue;
            }
            
            let tokenStr = (token[0] === MAIN) ? '\\|0?100' : prettyPrintToken(token);
            
            if (token[0] === INSTR) {
                const sz = token[2] - 1;
                const r = token[3];
                const k = token[4];
                if (sz + r + k === 3) {
                    tokenStr = token[1] + '(?:2kr|2rk|k2r|kr2|r2k|rk2)';
                } else if (sz + r + k === 2) {
                    if (sz + k === 2) {
                        tokenStr = token[1] + '(?:2k|k2)';
                    } else if (r + k === 2) {
                        tokenStr = token[1] + '(?:rk|kr)';
                    } else if (r + sz === 2) {
                        tokenStr = token[1] + '(?:2r|r2)';
                    }
                }
            } else if (/^[\|\$\@\&\.]/.test(tokenStr)) {
                tokenStr = '\\' + tokenStr;
            }
            
            if (!/^\s*$/.test(line) && new RegExp(tokenStr).test(line)) {
                tokenLineIdxs[tokenIdx] = [lineIdx, programFile];
                line = line.replace(new RegExp(tokenStr), '');
            } else {
                tokenLineIdxs[tokenIdx] = [0, programFile];
                ttokenIdx = tokenIdx;
                break;
            }
        }
        
        lineIdx++;
    }
    
    lines.push(''); // 为跳过的tokens添加
    return [tokenLineIdxs, lines];
}

function getLinesForToken(token, uxn) {
    // 简化版本，返回基本信息
    return "unknown line";
}