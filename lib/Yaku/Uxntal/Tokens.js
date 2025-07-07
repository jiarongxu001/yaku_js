"use strict";

// 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

import {
    operations,
    commutative_binary_ops,
    alu_ops,
    jump_operations,
    MAIN, LIT, INSTR, LABEL, REF, RAW, ADDR, PAD, EMPTY
} from './Definitions.js';

import { prettyPrintToken } from './PrettyPrint.js';

/**
 * Token操作工具类
 * 提供各种token类型检查、比较和转换功能
 */
export class Tokens {
    constructor() {
        this.VERSION = "1.0.0";
    }

    /**
     * 获取token类型和模式
     * @param {Array} tokens - token数组
     * @param {number} idx - 索引
     * @returns {Array} [type, mode]
     */
    static getTokenTypeAndMode(tokens, idx) {
        const token = tokens[idx];
        const ldSt = token[1];
        let type = ldSt.replace(/ST/g, '').replace(/LD/g, '');
        const mode = token[2] * 4 + token[3] * 2 + token[4];
        return [type, mode];
    }

    /**
     * 检查两个token是否有相同的字长和栈模式
     * @param {Array} t1 - token1
     * @param {Array} t2 - token2
     * @returns {boolean}
     */
    static sameWordSzAndStack(t1, t2) {
        return (t1[2] === t2[2]) && (t1[3] === t2[3]);
    }

    /**
     * 检查指定位置的tokens是否相等
     * @param {Array} tokens - token数组
     * @param {number} i - 起始索引
     * @param {Array} idxs - 要比较的相对索引对数组
     * @returns {boolean}
     */
    static tokensAreEqual(tokens, i, idxs) {
        for (let k = 0; k < Math.floor(idxs.length / 2); k++) {
            const idxL = idxs[k * 2];
            const idxR = idxs[k * 2 + 1];
            if (!this.tokenEqual(tokens[i + idxL], tokens[i + idxR])) {
                return false;
            }
        }
        return true;
    }

    /**
     * 比较两个token是否相等
     * @param {Array} t1 - token1
     * @param {Array} t2 - token2
     * @returns {boolean}
     */
    static tokenEqual(t1, t2) {
        // 简单的深度比较，对应Perl中的Dumper比较
        return JSON.stringify(t1) === JSON.stringify(t2);
    }

    /**
     * 检查token是否没有keep模式
     * @param {Array} t - token
     * @returns {boolean}
     */
    static noKeep(t) {
        return !t[4]; // 1 - t[4] 转换为布尔值
    }

    /**
     * 检查是否为字面量token
     * @param {Array} t - token
     * @returns {boolean}
     */
    static isLit(t) {
        return t[0] === LIT;
    }

    /**
     * 检查是否为填充token
     * @param {Array} t - token
     * @returns {boolean}
     */
    static isPadding(t) {
        return t[0] === PAD;
    }

    /**
     * 检查是否为操作指令token
     * @param {Array} t - token
     * @returns {boolean}
     */
    static isOp(t) {
        return (t[0] === INSTR) && (t[1] in alu_ops);
    }

    /**
     * 检查是否为可交换二元操作token
     * @param {Array} t - token
     * @returns {boolean}
     */
    static isCommBinOp(t) {
        return (t[0] === INSTR) && (t[1] in commutative_binary_ops);
    }

    /**
     * 检查指定位置的tokens是否有keep模式
     * @param {Array} tokens - token数组
     * @param {number} i - 起始索引
     * @param {Array} idxs - 要检查的相对索引数组
     * @returns {boolean}
     */
    static hasKeepMode(tokens, i, idxs) {
        for (const idx of idxs) {
            if (tokens[i + idx][4] === 1) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取token的字长
     * @param {Array} token - token
     * @returns {number}
     */
    static getWordSz(token) {
        return token[2];
    }

    /**
     * 获取token的栈模式
     * @param {Array} token - token
     * @returns {number}
     */
    static getStackMode(token) {
        return token[3];
    }

    /**
     * 将操作码字符串转换为指令token
     * @param {string} op - 操作码字符串 (如 "ADD2k", "MUL", "SUBr")
     * @returns {Array} 指令token
     */
    static toInstrToken(op) {
        let wordSz = 1;
        let r = 0;
        let k = 0;

        // 解析修饰符
        if (op.includes('2')) {
            wordSz = 2;
            op = op.replace('2', '');
        }
        if (op.includes('r')) {
            r = 1;
            op = op.replace('r', '');
        }
        if (op.includes('k')) {
            k = 1;
            op = op.replace('k', '');
        }

        return [INSTR, op, wordSz, r, k];
    }

    /**
     * 检查是否为存储指令
     * @param {Array} token - token
     * @returns {boolean}
     */
    static isStore(token) {
        return !this.isInstr(token, 'STH') && this.isInstr(token, 'ST');
    }

    /**
     * 检查是否为加载指令
     * @param {Array} token - token
     * @returns {boolean}
     */
    static isLoad(token) {
        return this.isInstr(token, 'LD');
    }

    /**
     * 检查是否为条件跳转指令
     * @param {Array} token - token
     * @returns {boolean}
     */
    static isCondJump(token) {
        return this.isInstr(token, 'JCI') || this.isInstr(token, 'JCN');
    }

    /**
     * 检查是否为跳转指令
     * @param {Array} token - token
     * @returns {boolean}
     */
    static isJump(token) {
        return this.isInstr(token, 'JMI') || this.isInstr(token, 'JMP');
    }

    /**
     * 检查是否为调用指令
     * @param {Array} token - token
     * @returns {boolean}
     */
    static isCall(token) {
        return this.isInstr(token, 'JSI') || this.isInstr(token, 'JSR');
    }

    /**
     * 检查是否为指定的指令
     * @param {Array} token - token
     * @param {string} op - 操作码
     * @returns {boolean}
     */
    static isInstr(token, op) {
        return (token[0] === INSTR) && token[1].startsWith(op);
    }

    /**
     * 检查是否为引用token
     * @param {Array} token - token
     * @param {number} [parentOrChild] - 可选的父子类型检查
     * @returns {boolean}
     */
    static isRef(token, parentOrChild = undefined) {
        let res = token[0] === REF;
        if (parentOrChild !== undefined) {
            res = res && (token[3] === parentOrChild);
        }
        return res;
    }

    /**
     * 检查是否为父引用
     * @param {Array} t - token
     * @returns {boolean}
     */
    static isParentRef(t) {
        return this.isRef(t, 0);
    }

    /**
     * 检查是否为子引用
     * @param {Array} t - token
     * @returns {boolean}
     */
    static isChildRef(t) {
        return this.isRef(t, 1);
    }

    /**
     * 检查是否为标签token
     * @param {Array} token - token
     * @param {number} [parentOrChild] - 可选的父子类型检查
     * @returns {boolean}
     */
    static isLabel(token, parentOrChild = undefined) {
        let res = token[0] === LABEL;
        if (parentOrChild !== undefined) {
            res = res && (token[2] === parentOrChild);
        }
        return res;
    }

    /**
     * 检查是否为父标签
     * @param {Array} t - token
     * @returns {boolean}
     */
    static isParentLabel(t) {
        return this.isLabel(t, 2);
    }

    /**
     * 检查是否为子标签
     * @param {Array} t - token
     * @returns {boolean}
     */
    static isChildLabel(t) {
        return this.isLabel(t, 1);
    }

    /**
     * 检查token是否有指定名称
     * @param {Array} token - token
     * @param {string} name - 名称
     * @returns {boolean}
     */
    static hasName(token, name) {
        return token[1] === name;
    }

    /**
     * 检查是否为子元素(标签或引用)
     * @param {Array} token - token
     * @returns {boolean}
     */
    static isChild(token) {
        if (token[0] === LABEL) {
            return token[2] === 1;
        } else if (token[0] === REF) {
            return token[3] === 1;
        } else {
            throw new Error(`Not a label or reference: ${prettyPrintToken(token)}`);
        }
    }

    /**
     * 检查是否为父元素(标签或引用)
     * @param {Array} token - token
     * @returns {boolean}
     */
    static isParent(token) {
        if (token[0] === LABEL) {
            return token[2] === 2;
        } else if (token[0] === REF) {
            return token[3] === 0;
        } else {
            throw new Error(`Not a label or reference: ${prettyPrintToken(token)}`);
        }
    }
}