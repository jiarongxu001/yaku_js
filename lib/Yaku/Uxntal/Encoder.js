"use strict";

// 版本信息
const VERSION = "1.0.0";
const VV = parseInt(process.env.YAKU_VERBOSE) || 0;

// 导入必要模块
import { WW, EE } from '../Flags.js';
import { 
    tokenTypes, opcode,
    MAIN, LIT, INSTR, LABEL, REF, IREF, RAW, ADDR, PAD, EMPTY, UNKNOWN
} from './Definitions.js';
import { 
    signedShortToShort2sComp,
    signedByteToByte2sComp,
    short2sComptToBytes2sComp,
    bytes2sCompToShort2sComp
} from '../IntegerFormatConversions.js';

// 辅助函数（简化版本，避免循环依赖）
function prettyPrintToken(token) {
    if (!token || !Array.isArray(token)) return 'undefined';
    if (token[0] === LABEL) return '@' + token[1];
    if (token[0] === REF) return '.' + token[1];
    if (token[0] === LIT) return '#' + token[1].toString(16).padStart(token[2] === 2 ? 4 : 2, '0');
    if (token[0] === INSTR) return token[1] + (token[2] === 2 ? '2' : '') + (token[3] ? 'r' : '') + (token[4] ? 'k' : '');
    return token[1] ? token[1].toString() : token.toString();
}

function getLineForToken(token, uxn) {
    if (uxn.lineIdxs && token[token.length - 1] !== undefined) {
        const tokenIdx = token[token.length - 1];
        if (uxn.lineIdxs[tokenIdx]) {
            const [lineIdx, fname] = uxn.lineIdxs[tokenIdx];
            const displayName = fname === 'from_stdin.tal' ? 'STDIN' : fname;
            return ` on line ${lineIdx} of ${displayName}`;
        }
    }
    return " (line information not available)";
}

function isParentLabel(token) {
    return token[0] === LABEL && token[2] === 2;
}

function isParentRef(token) {
    return token[0] === REF && token[3] === 0;
}

function isInstr(token, instrName) {
    return token && token[0] === INSTR && token[1] === instrName;
}

function getChildSyntax(token) {
    let tokenStr = prettyPrintToken(token);
    tokenStr = tokenStr.replace(/^([,;=_-])[\w\-\_]+?\//, '$1&');
    return tokenStr;
}

// 主要导出函数 - 对应 sub tokensToMemory($tokens,$uxn)
export function tokensToMemory(tokens, uxn) {
    uxn = populateMemoryAndBuildSymbolTable(tokens, uxn);
    uxn = resolveSymbols(uxn);

    // 构建反向符号表 - 对应第一个for循环
    for (const symbol in uxn.symbolTable.Labels) {
        const [pc, token] = uxn.symbolTable.Labels[symbol];
        if (isParentLabel(token)) {
            uxn.reverseSymbolTable[pc] = [token, 1];
        }
    }

    // 构建引用反向符号表 - 对应第二个for循环
    for (const symbol in uxn.symbolTable.Refs) {
        const [pcs, token] = uxn.symbolTable.Refs[symbol];
        for (const pc of pcs) {
            if (isParentRef(token)) {
                // 检查是否用于JSR2, JSI, JMP2或JMI
                if (isInstr(uxn.memory[pc - 1], 'JSI') || isInstr(uxn.memory[pc + 3], 'JSR')) {
                    uxn.reverseSymbolTable[pc] = [token, 2];
                } else if (isInstr(uxn.memory[pc - 1], 'JMI') || isInstr(uxn.memory[pc + 3], 'JMP')) {
                    uxn.reverseSymbolTable[pc] = [token, 3];
                } else {
                    uxn.reverseSymbolTable[pc] = [token, 0];
                }
            }
        }
    }

    return uxn;
}

// 对应 sub populateMemoryAndBuildSymbolTable($tokens,$uxn)
function populateMemoryAndBuildSymbolTable(tokens, uxn) {
    // 初始化必要的数据结构
    if (!uxn.symbolTable) {
        uxn.symbolTable = { Labels: {}, Refs: {} };
    }
    if (!uxn.reverseSymbolTable) {
        uxn.reverseSymbolTable = {};
    }

    let pc = 0;
    let current_parent_label = '';
    let emptyLocs = 0;

    for (const token of tokens) {
        if (token[0] === MAIN) {
            pc = 0x0100;
        } else if (token[0] === ADDR) {
            pc = token[1];
        } else if (token[0] === PAD) {
            // 填充零字节 - 对应 for my $ii ( 0 .. $token->[1])
            for (let ii = 0; ii <= token[1]; ii++) {
                uxn.memory[pc + ii] = [RAW, 0, 1];
            }
            pc += token[1];
        } else if (token[0] === LABEL) {
            let labelName = token[1];
            if (token[2] === 2) { // parent label
                current_parent_label = labelName;
            } else { // child label
                labelName = current_parent_label + '/' + labelName;
            }
            
            const token2 = [...token];
            token2[1] = labelName;
            const tokenStr = labelName.match(/\d+_LAMBDA/) ? '@' + labelName : prettyPrintToken(token2);
            
            if (!(labelName in uxn.symbolTable.Labels)) {
                uxn.symbolTable.Labels[labelName] = [pc, token];
            } else {
                if (token[2] === 2) {
                    throw new Error(`Error: duplicate label ${tokenStr}, at lines ${uxn.linesForToken?.[tokenStr]?.join(', ') || 'unknown'}`);
                } else {
                    throw new Error(`Error: duplicate child label ${tokenStr}, at lines ${uxn.linesForToken?.['&' + token[1]]?.join(', ') || 'unknown'}`);
                }
            }
        } else if (token[0] === REF) {
            let labelName = token[1];
            if (token[3] && !labelName.includes('/')) {
                labelName = current_parent_label + '/' + labelName;
            }
            token[1] = labelName;
            
            if (!(labelName in uxn.symbolTable.Refs)) {
                uxn.symbolTable.Refs[labelName] = [[pc], token];
            } else {
                uxn.symbolTable.Refs[labelName][0].push(pc);
            }
            pc = storeToken(token, uxn, pc);
        } else if (token[0] !== EMPTY) {
            // LIT => 1, INSTR => 2, RAW => 6
            pc = storeToken(token, uxn, pc);
        } else {
            emptyLocs++;
        }
        
        if (pc > 0xffff) {
            throw new Error(`Memory capacity exceeded at token ${prettyPrintToken(token)}\nPC: ${pc} > 65535\nEmpty locations: ${emptyLocs}`);
        }
    }
    
    uxn.free = pc;
    return uxn;
}

// 对应 sub resolveSymbols($uxn)
function resolveSymbols(uxn) {
    let i = 0;
    
    for (const token of uxn.memory) {
        if (token && token[0] === REF) {
            // 获取标签地址
            const labelInfo = uxn.symbolTable.Labels[token[1]];
            if (!labelInfo) {
                if (opcode[token[1].substr(0, 3)]) {
                    const tokenStr = prettyPrintToken(token);
                    throw new Error(`Error: Invalid opcode ${tokenStr.includes('/') ? getChildSyntax(token) : tokenStr} at line ${getLineForToken(token, uxn)}`);
                } else {
                    const tokenStr = prettyPrintToken(token);
                    throw new Error(`Error: label not defined for reference ${tokenStr.includes('/') ? getChildSyntax(token) : tokenStr} at line ${getLineForToken(token, uxn)}`);
                }
            }
            
            let address = labelInfo[0]; // 获取地址
            const addr_mode = token[2]; // 地址模式 0 1 2 3 4 5
            
            if (addr_mode === 6) { // Immediate
                address -= i + 2;
                if (address > 32767 || address < -32768) {
                    const tokenStr = prettyPrintToken(token);
                    throw new Error(`Error: relative address too large for ${tokenStr} at line ${getLineForToken(token, uxn)}`);
                }
                if (address < 0) {
                    address = signedShortToShort2sComp(address);
                }
            } else if (addr_mode === 1 || addr_mode === 4) { // relative address, 1 byte
                address -= i + 2;
                if (address > 127 || address < -128) {
                    const tokenStr = prettyPrintToken(token);
                    throw new Error(`Error: relative address ${address} is too large for ${tokenStr} at line ${getLineForToken(token, uxn)}`);
                }
                if (address < 0) {
                    address = signedByteToByte2sComp(address);
                }
            }
            
            const word_sz = ((addr_mode === 2) || (addr_mode === 5) || (addr_mode === 6)) ? 2 : 1;
            storeToken([RAW, address, word_sz], uxn, i);
        }
        i++;
    }
    
    return uxn;
}

// 对应 sub storeToken($token,$uxn,$addr)
export function storeToken(token, uxn, addr) {
    if (token[0] === LIT || (token[0] === REF && token[2] < 3)) {
        const word_sz = token[0] === RAW 
            ? token[2] 
            : token[2] === 2 ? 2 : 1;
        const lit_instr_token = [INSTR, 'LIT', word_sz, 0, 0];
        uxn.memory[addr++] = lit_instr_token;
        if (token[0] === LIT) {
            token[0] = RAW;
        }
    }
    
    if (token[0] === RAW || token[0] === REF) { // If it is 2 bytes, we decompose
        const word_sz = (token[0] === RAW)
            ? token[2]
            : ((token[2] === 2) || (token[2] === 5) || (token[2] === 6)) ? 2 : 1;
            
        if (word_sz === 2) {
            let tokenval_hi = token[1];
            let tokenval_lo = token[1];
            
            if (/^\d+$/.test(token[1].toString())) {
                [tokenval_hi, tokenval_lo] = short2sComptToBytes2sComp(token[1]);
            }
            
            const token_hi = [...token];
            token_hi[1] = tokenval_hi;
            if (token[0] === RAW) token_hi[2] = 1;
            uxn.memory[addr++] = token_hi;
            
            const token_lo = [...token];
            token_lo[1] = tokenval_lo;
            if (token[0] === RAW) token_lo[2] = 1;
            uxn.memory[addr++] = token_lo;
        } else {
            uxn.memory[addr++] = token;
        }
    } else if (token[0] === INSTR) { // Always one byte
        uxn.memory[addr++] = token;
    } else {
        throw new Error(`Can't store a token of type ${tokenTypes[token[0]]} in memory`);
    }
    
    return addr;
}

// 对应 sub loadToken($word_sz,$uxn,$addr)
export function loadToken(word_sz, uxn, addr) {
    let token = uxn.memory[addr] || [EMPTY, 0, 1];
    
    if (!WW && token[0] === EMPTY) {
        uxn.warning = `Warning: loading a ${word_sz === 1 ? 'byte' : 'short'} from empty memory location ${addr}`;
    }
    
    if (word_sz === 2) {
        const token_hi = [...token];
        const token_lo = [...(uxn.memory[addr + 1] || [EMPTY, 0, 1])];
        const tokenval_hi = token_hi[1];
        const tokenval_lo = token_lo[1];
        
        if (token_hi[0] === token_lo[0] && token_hi[0] !== INSTR) {
            const tokenval = bytes2sCompToShort2sComp(tokenval_hi, tokenval_lo);
            token = token_hi;
            token[1] = tokenval;
        } else {
            console.log(`Warning: Combining bytes ${tokenval_hi} and ${tokenval_lo} in ${prettyPrintToken(uxn.memory[uxn.pc])} ${getLineForToken(uxn.memory[uxn.pc], uxn)}`);
            if (EE) process.exit(1);
            
            let hi_val = tokenval_hi;
            let lo_val = tokenval_lo;
            
            if (token_hi[0] === INSTR) {
                hi_val = opcode[tokenval_hi] || 0;
            }
            if (token_lo[0] === INSTR) {
                lo_val = opcode[tokenval_lo] || 0;
            }
            
            const tokenval = bytes2sCompToShort2sComp(hi_val, lo_val);
            token = token_hi;
            token[1] = tokenval;
        }
    }
    
    return token;
}