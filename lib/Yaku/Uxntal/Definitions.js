"use strict";

// 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

// 对应 use constant { ... }
export const MAIN = 0;        // for |0100
export const LIT = 1;         // a literal 
export const INSTR = 2;       // an instruction [$T{INSTR},$name,$short_mode,$rs,$k];
export const LABEL = 3;       // '@' or '&'; 2 for parent '@', 1 for child '&'
export const REF = 4;         // [$T{REF},$val,$ref_type,$is_child] 
export const IREF = 5;        // unused
export const RAW = 6;         // raw hex or string
export const ADDR = 7;        // |
export const PAD = 8;         // $ 
export const LAMBDA = 9;      // unused
export const EMPTY = 10;      // initially, all memory locations have this token
export const UNKNOWN = 11;    // Used in the Encoder
export const PLACEHOLDER = 12; // Used in Optimisations (currently unused)
export const INCLUDE = 13;    // Used in Parser to handle include statements
export const STR = 14;        // for tokenstrings that are not tokens
export const LD = 15;
export const ST = 16;

// 对应 our @tokenTypes = qw( ... )
export const tokenTypes = [
    'MAIN',
    'LIT',
    'INSTR',
    'LABEL',
    'REF',
    'IREF',
    'RAW',
    'ADDR',
    'PAD',
    'LAMBDA',
    'EMPTY',
    'UNKNOWN'
];

// 对应 our $refTypes = { ... }
export const refTypes = {
    '.': 0,    // dot(zeropage)
    ',': 1,    // comma(rel)
    ';': 2,    // semi(abs)
    '-': 3,    // dash(raw zero)
    '_': 4,    // underscore(raw rel)
    '=': 5,    // equals(raw abs)
    'I': 6     // immediate
};

// 对应 our @revRefTypes = ( ... )
export const revRefTypes = [
    '.',
    ',',
    ';',
    '-',
    '_',
    '=',
    'I'
];

// 对应 our @refWordSizes = ( ... )
export const refWordSizes = [
    1,  // '.'
    1,  // ','
    2,  // ';'
    1,  // '-'
    1,  // '_'
    1,  // '='
    2   // 'I'
];

// 对应 our @opcodes = qw( ... )
export const opcodes = [
    'LIT',
    'INC',
    'POP',
    'NIP',
    'SWP',
    'ROT',
    'DUP',
    'OVR',
    'EQU',
    'NEQ',
    'GTH',
    'LTH',
    'JMP',
    'JCN',
    'JSR',
    'STH',
    'LDZ',
    'STZ',
    'LDR',
    'STR',
    'LDA',
    'STA',
    'DEI',
    'DEO',
    'ADD',
    'SUB',
    'MUL',
    'DIV',
    'AND',
    'ORA',
    'EOR',
    'SFT'
];

// 对应 our %opcode=(); for my $opcode_idx ( 0 .. scalar @opcodes - 1 ) { ... }
export const opcode = {};
for (let opcode_idx = 0; opcode_idx < opcodes.length; opcode_idx++) {
    opcode[opcodes[opcode_idx]] = opcode_idx;
}

// 对应特殊操作码设置
opcode.BRK = 0x00;
opcode.LIT = 0x80;
opcode.JCI = 0x20; // ?
opcode.JMI = 0x40; // !
opcode.JSI = 0x60; // function call when there is no JSR

// 对应 our %jump_operations = ( ... )
export const jump_operations = {
    JMP: (w) => [w, 0],
    JSR: (w) => [w, 0],
    JCN: (w) => [w + 1, 0], // one of them is always a byte
    JCI: (w) => [1, 0],     // one of them is always a byte and the other a short
    JSI: (w) => [0, 0],     // this always a short
    JMI: (w) => [0, 0]      // this always a short
};

// 对应 our %stack_operations = ( ... )
// [#in-args,#out-args]
export const stack_operations = {
    POP: [1, 0],
    NIP: [2, 1],
    SWP: [2, 2],
    ROT: [3, 3],
    DUP: [1, 2],
    OVR: [2, 3],
    STH: [1, 0] // move between ws and rs
};

// 对应 our %cmp_operations =( ... )
// These are the only operations that always return a byte
export const cmp_operations = {
    EQU: [2, 1],
    NEQ: [2, 1],
    GTH: [2, 1],
    LTH: [2, 1]
};

// 对应 our %non_stack_operations =( ... )
export const non_stack_operations = {
    INC: [1, 1],

    ...cmp_operations,

    DEO: [2, 0],
    DEI: [1, 1],

    ADD: [2, 1],
    SUB: [2, 1],
    MUL: [2, 1],
    DIV: [2, 1],
    AND: [2, 1],
    ORA: [2, 1],
    EOR: [2, 1],
    SFT: [2, 1] // But 2nd arg of SFT is always 1 byte
};

// 对应 our %mem_operations = ( ... )
// This has three values. The first is the size of the address, the others the non-address args taken and returned
export const mem_operations = {
    LDA: [2, 0, 1],
    STA: [2, 1, 0],
    LDR: [1, 0, 1],
    STR: [1, 1, 0],
    LDZ: [1, 0, 1],
    STZ: [1, 1, 0]
};

// 对应 my %commutative_binary_ops = ( ... )
export const commutative_binary_ops = {
    ADD: 1,
    MUL: 1,
    AND: 1,
    ORA: 1,
    EOR: 1,
    NEQ: 1,
    EQU: 1
};

// 对应 my %alu_ops = ( ... )
export const alu_ops = {
    INC: 1,
    DIV: 1,
    SUB: 1,
    SFT: 1,
    LTH: 1,
    GTH: 1,
    ...commutative_binary_ops
};

// 对应 our %bin_ops = ( ... ) - 修正这部分
export const bin_ops = {
    ...commutative_binary_ops,
    DIV: 1,    // 修正：应该是1而不是[2, 1]
    SUB: 1,    // 添加SUB
    SFT: 1,    // 添加SFT
    LTH: 1,    // 添加比较操作
    GTH: 1
};

// 对应 our %operations =( ... )
export const operations = {
    ...stack_operations,
    ...non_stack_operations
};

// 对应 our %allowedFunctionCalls = ( ... )
// This is used in the optimisations
// we list the wordsizes
export const allowedFunctionCalls = {
    'mul2': [[2, 2], 2],
    'div2': [[2, 2], 2],
    'neg2': [[2], 2],
    'gt2': [[2, 2], 1],
    'gte2': [[2, 2], 1],
    'lt2': [[2, 2], 1],
    'lte2': [[2, 2], 1],
    'mul': [[1, 1], 1],
    'div': [[1, 1], 1],
    'neg': [[1], 1],
    'gt': [[1, 1], 1],
    'gte': [[1, 1], 1],
    'lt': [[1, 1], 1],
    'lte': [[1, 1], 1],

    'not': [[1], 1],

    // 'print-int': [[2], 0],
    'print-char': [[1], 0]
};

// 统一导出
export {
    VERSION,
    tokenTypes,
    refTypes, revRefTypes, refWordSizes,
    opcodes, opcode,
    jump_operations, stack_operations, cmp_operations, non_stack_operations, mem_operations,
    commutative_binary_ops, alu_ops, bin_ops, operations,
    allowedFunctionCalls
};