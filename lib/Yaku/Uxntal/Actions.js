
"use strict";

// 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

// 对应 use constant DBG => $ENV{YAKU_DBG} // 0;
const DBG = parseInt(process.env.YAKU_DBG) || 0;

// 导入模块
import { RAW } from './Definitions.js';
import { loadToken, storeToken } from './Encoder.js';
import { 
    byte2sCompToSignedByte,
    short2sComptToBytes2sComp,
    short2sCompToSignedShort,
    unsignedBytesToUnsignedShort,
    signedShortToShort2sComp,
    signedByteToByte2sComp
} from '../IntegerFormatConversions.js';

// Actions:

// 对应 sub store($args,$sz,$uxn)
export function store(args, sz, uxn) {
    storeToken([RAW, args[1], sz], uxn, args[0]);
}

// 对应 sub load($args,$sz,$uxn)
export function load(args, sz, uxn) {
    const token = loadToken(sz, uxn, args[0]);
    return token[1];
}

// 对应 sub storeRel($args,$sz,$uxn)
export function storeRel(args, sz, uxn) {
    const pc = uxn.pc + byte2sCompToSignedByte(args[0]) + 1;
    const token = [RAW, args[1], sz];
    const addr = storeToken(token, uxn, pc);
}

// 对应 sub loadRel($args,$sz,$uxn)
export function loadRel(args, sz, uxn) {
    const pc = uxn.pc + byte2sCompToSignedByte(args[0]) + 1;
    const token = loadToken(sz, uxn, pc);
    return token[1];
}

// 对应 sub call($args,$sz,$uxn)
export function call(args, sz, uxn) {
    const [hib, lob] = short2sComptToBytes2sComp(uxn.pc + 1);
    uxn.stacks[1].push([uxn.pc + 1, 2]);
    if (sz === 1) {
        uxn.pc += byte2sCompToSignedByte(args[0]);
    } else {
        uxn.pc = args[0] - 1;
    }
}

// 对应 sub jump($args,$sz,$uxn)
export function jump(args, sz, uxn) {
    if (sz === 1) { // relative jump
        uxn.pc += byte2sCompToSignedByte(args[0]);
    } else {
        uxn.pc = args[0] - 1;
    }
}

// 对应 sub condJump($args,$sz,$uxn)
export function condJump(args, sz, uxn) {
    if (args[1] !== 0) {
        if (sz === 1) { // relative jump
            const pc = uxn.pc + byte2sCompToSignedByte(args[0]);
            uxn.pc = pc;
        } else {
            uxn.pc = args[0] - 1;
        }
    }
}

// 对应 sub immediateCall($rs,$sz,$uxn,$keep)
export function immediateCall(rs, sz, uxn, keep) { // keep is ignored
    // Pushes PC+3 to the return-stack
    uxn.stacks[1].push([uxn.pc + 3, 2]);

    // Move the PC to a relative address at a distance equal to the next short in memory.
    const rel_addr_token = loadToken(2, uxn, uxn.pc + 1);
    const rel_addr = rel_addr_token[1];
    const pc = uxn.pc + 2 + short2sCompToSignedShort(rel_addr);
    uxn.pc = pc;
}

// 对应 sub immediateCondJump($args,$sz,$uxn)
export function immediateCondJump(args, sz, uxn) { // keep is ignored
    if (args[0] !== 0) {
        const rel_addr_token = loadToken(2, uxn, uxn.pc + 1);
        const rel_addr = rel_addr_token[1];
        const pc = uxn.pc + 2 + short2sCompToSignedShort(rel_addr);
        uxn.pc = pc;
    } else {
        uxn.pc += 2;
    }
}

// 对应 sub immediateJump($rs,$sz,$uxn,$keep)
export function immediateJump(rs, sz, uxn, keep) { // keep is ignored
    const rel_addr_token = loadToken(2, uxn, uxn.pc + 1);
    const rel_addr = rel_addr_token[1];
    const pc = uxn.pc + 2 + short2sCompToSignedShort(rel_addr);
    uxn.pc = pc;
}

// 对应 sub lit($rs,$sz,$uxn,$keep)
export function lit(rs, sz, uxn, keep) { // keep is ignored
    const token = uxn.memory[uxn.pc + 1];
    if (sz === 1) {
        uxn.stacks[rs].push([token[1], token[2]]);
        uxn.pc++;
    } else if (sz === 2) {
        const next_token = uxn.memory[uxn.pc + 2];
        const short_val = unsignedBytesToUnsignedShort(token[1], next_token[1]);
        uxn.stacks[rs].push([short_val, 2]);
        uxn.pc += 2;
    }
}

// 对应 sub stash($rs,$sz,$uxn,$keep)
export function stash(rs, sz, uxn, keep) {
    if (keep) {
        const a = uxn.stacks[rs][uxn.stacks[rs].length - 1];
        uxn.stacks[1 - rs].push(a);
    } else {
        const a = uxn.stacks[rs].pop();
        uxn.stacks[1 - rs].push(a);
    }
}

// 对应 sub pop_($rs,$sz,$uxn,$keep)
export function pop_(rs, sz, uxn, keep) {
    if (!keep) { // makes no sense but nevertheless
        uxn.stacks[rs].pop();
    }
}

// 对应 sub swap($rs,$sz,$uxn,$keep)
export function swap(rs, sz, uxn, keep) { // a1 a2 b1 b2 => b1 b2 a1 a2
    const b = uxn.stacks[rs].pop();
    const a = uxn.stacks[rs].pop();
    if (keep) {
        uxn.stacks[rs].push(a);
        uxn.stacks[rs].push(b);
    }
    uxn.stacks[rs].push(b);
    uxn.stacks[rs].push(a);
}

// 对应 sub nip($rs,$sz,$uxn,$keep)
export function nip(rs, sz, uxn, keep) { // a b -> b; a1 a2 b1 b2 -> b1 b2
    sz = 1; // for debugging
    if (keep) {
        dup(rs, sz, uxn, 0);
    } else {
        const b = uxn.stacks[rs].pop();
        if (sz === 1) {
            const a = uxn.stacks[rs].pop();
            uxn.stacks[rs].push(b);
        } else {
            const b2 = [...b];
            const b1 = uxn.stacks[rs].pop();
            const a2 = uxn.stacks[rs].pop();
            const a1 = uxn.stacks[rs].pop();
            uxn.stacks[rs].push(b1);
            uxn.stacks[rs].push(b2);
        }
    }
}

// 对应 sub rot($rs,$sz,$uxn,$keep)
export function rot(rs, sz, uxn, keep) { // a b c -> b c a
    const c = uxn.stacks[rs].pop();
    const b = uxn.stacks[rs].pop();
    const a = uxn.stacks[rs].pop();
    if (keep) {
        uxn.stacks[rs].push(a);
        uxn.stacks[rs].push(b);
        uxn.stacks[rs].push(c);
    }
    uxn.stacks[rs].push(b);
    uxn.stacks[rs].push(c);
    uxn.stacks[rs].push(a);
}

// 对应 sub dup($rs,$sz,$uxn,$keep)
export function dup(rs, sz, uxn, keep) {
    const a = uxn.stacks[rs][uxn.stacks[rs].length - 1];
    uxn.stacks[rs].push([...a]);
    if (keep) {
        uxn.stacks[rs].push([...a]);
    }
}

// 对应 sub over($rs,$sz,$uxn,$keep)
export function over(rs, sz, uxn, keep) { // a b -> a b a; keep: a b a b a
    const a = uxn.stacks[rs][uxn.stacks[rs].length - 2];
    uxn.stacks[rs].push([...a]);
    if (keep) {
        dup(rs, 2, uxn, 0);
    }
}

// 对应 sub add($args,$sz,$uxn)
export function add(args, sz, uxn) { // 2's comp
    const res = (args[1] + args[0]);
    return (sz === 1 ? res & 0xff : res & 0xffff);
}

// 对应 sub sub_($args,$sz,$uxn)
export function sub_(args, sz, uxn) {
    if (sz === 2) {
        return (signedShortToShort2sComp(args[1] - args[0])) & 0xffff;
    } else {
        return (signedByteToByte2sComp(args[1] - args[0])) & 0xff;
    }
}

// 对应 sub mul($args,$sz,$uxn)
export function mul(args, sz, uxn) {
    const res = args[1] * args[0];
    return (sz === 1 ? res & 0xff : res & 0xffff);
}

// 对应 sub div($args,$sz,$uxn)
export function div(args, sz, uxn) {
    return Math.floor(args[1] / args[0]);
}

// 对应 sub inc($args,$sz,$uxn)
export function inc(args, sz, uxn) {
    const res = args[0] + 1;
    return (sz === 1 ? res & 0xff : res & 0xffff);
}

// 对应 sub sft($args,$sz,$uxn)
export function sft(args, sz, uxn) {
    const shift_word = args[0];
    const shift_val = args[1];
    if (shift_word > 15) {
        return ((args[1] << (args[0] >> 4)) & (sz === 1 ? 0xff : 0xffff));
    } else {
        return ((args[1] >> args[0]) & (sz === 1 ? 0xff : 0xffff));
    }
}

// 对应 sub and_($args,$sz,$uxn)
export function and_(args, sz, uxn) {
    return (args[1] & args[0]);
}

// 对应 sub ora($args,$sz,$uxn)
export function ora(args, sz, uxn) {
    return (args[1] | args[0]);
}

// 对应 sub eor($args,$sz,$uxn)
export function eor(args, sz, uxn) {
    return (args[1] ^ args[0]);
}

// 对应 sub equ($args,$sz,$uxn)
export function equ(args, sz, uxn) {
    return args[0] === args[1] ? 1 : 0;
}

// 对应 sub neq($args,$sz,$uxn)
export function neq(args, sz, uxn) {
    return args[0] !== args[1] ? 1 : 0;
}

// 对应 sub lth($args,$sz,$uxn)
export function lth(args, sz, uxn) {
    return args[1] < args[0] ? 1 : 0;
}

// 对应 sub gth($args,$sz,$uxn)
export function gth(args, sz, uxn) {
    return args[1] > args[0] ? 1 : 0;
}

// 对应 sub deviceOut($args,$sz,$uxn)
export function deviceOut(args, sz, uxn) {
    // Sending a non-null byte to the System/state port will terminate the application
    if (args[0] === 24) { // 0x18, Console/write
        process.stdout.write(String.fromCharCode(args[1]));
    } else if (args[0] === 15) { // 0x0f, System/state
        if (args[1] !== 0) {
            process.exit(args[1] & 0x7f);
        }
    }
}

// 对应 sub deviceIn($args,$sz,$uxn)
export function deviceIn(args, sz, uxn) {
    if (args[0] === 4) { // System/wst
        return uxn.stacks[0].length;
    } else if (args[0] === 5) { // System/rst
        return uxn.stacks[1].length;
    } else {
        throw new Error(`Sorry, DEI for port ${args[0]} is not implemented in the yaku interpreter`);
    }
}

// 对应 our $callInstr = { ... }
export const callInstr = {
    'INC': [inc, 1, 1],
    'ADD': [add, 2, 1],
    'MUL': [mul, 2, 1],
    'SUB': [sub_, 2, 1],
    'DIV': [div, 2, 1],
    'SFT': [sft, 2, 1],
    'AND': [and_, 2, 1],
    'ORA': [ora, 2, 1],
    'EOR': [eor, 2, 1],
    'EQU': [equ, 2, 1],
    'NEQ': [neq, 2, 1],
    'LTH': [lth, 2, 1],
    'GTH': [gth, 2, 1],
    'DEO': [deviceOut, 2, 0],
    'DEI': [deviceIn, 1, 0],
    'JSR': [call, 1, 0],
    'JMP': [jump, 1, 0],
    'JCN': [condJump, 2, 0],
    'LDA': [load, 1, 1],
    'STA': [store, 2, 0],
    'LDR': [loadRel, 1, 1],
    'STR': [storeRel, 2, 0],
    'LDZ': [load, 1, 1],
    'STZ': [store, 2, 0],
    'STH': [stash, 0, 0],
    'DUP': [dup, 0, 0],
    'SWP': [swap, 0, 0],
    'ROT': [rot, 0, 0],
    'OVR': [over, 0, 0],
    'POP': [pop_, 0, 0],
    'NIP': [nip, 0, 0],
    'LIT': [lit, 0, 0],
    'JCI': [immediateCondJump, 1, 0],
    'JMI': [immediateJump, 0, 0],
    'JSI': [immediateCall, 0, 0],
};