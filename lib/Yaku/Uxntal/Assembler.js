"use strict";

// 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

// 对应 use constant VV => $ENV{YAKU_VERBOSE} // 0;
const VV = (typeof process !== 'undefined' && process.env?.YAKU_VERBOSE) ? parseInt(process.env.YAKU_VERBOSE) : 0;

// 导入模块
import { opcode, INSTR } from './Definitions.js';

// 对应 sub memToRom($uxn,$writeRom,$romFile)
export function memToRom(uxn, writeRom, romFile) {
    const bytes = [];

    // 对应 for my $i ( 0x100 .. $uxn->{free}-1)
    for (let i = 0x100; i < uxn.free; i++) {
        const token = uxn.memory[i];
        bytes.push(tokenToByte(token));
    }

    // 对应 my @rev_bytes = reverse @bytes;
    const rev_bytes = [...bytes].reverse();
    const bytes_no_zeroed_mem = [];
    let skip = true;

    // 对应 for my $byte (@rev_bytes)
    for (const byte of rev_bytes) {
        if (byte !== 0) {
            skip = false;
        }

        // 对应 unshift @bytes_no_zeroed_mem,$byte unless $skip;
        if (!skip) {
            bytes_no_zeroed_mem.unshift(byte);
        }
    }

    // 对应 if (VV==2)
    if (VV === 2) {
        let s = '';
        bytes_no_zeroed_mem.forEach(byte => {
            s += sprintf("%02x ", byte);
        });
        console.log(s);
    }

    // 对应 if ($writeRom)
    if (writeRom) {
        const romBuffer = new Uint8Array(bytes_no_zeroed_mem);

        try {
            if (typeof window !== 'undefined' && window.fs?.writeFile) {
                window.fs.writeFile(romFile, romBuffer);
                console.log(`ROM file written: ${romFile}`);
            } else {
                console.warn("Cannot write ROM: 'fs.writeFile' is not available in this environment.");
            }
        } catch (error) {
            throw new Error(`Failed to write ROM file: ${error.message}`);
        }
    }
}

// 对应 sub tokenToByte($token)
function tokenToByte(token) {
    if (token[0] === INSTR) {
        const [t_, instr, short, r, k] = token;
        let instr_byte = ((short - 1) << 5) + (r << 6) + (k << 7) + (opcode[instr] & 0x1F);

        if (token[1] === 'LIT') {
            instr_byte = 0x80 + ((short - 1) << 5) + (r << 6) + (k << 7);
        } else if (/J[SCM]I/.test(token[1])) {
            instr_byte = opcode[instr];
        }

        return instr_byte;
    } else {
        return token[1];
    }
}

// 改进的sprintf函数，支持更多格式
function sprintf(format, ...args) {
    let i = 0;
    return format.replace(/%(-?)(\d*)([sdxc%])/g, (match, leftAlign, width, type) => {
        if (type === '%') return '%';

        let result;
        switch (type) {
            case 's': result = String(args[i++]); break;
            case 'd': result = Number(args[i++]).toString(); break;
            case 'x': result = Number(args[i++]).toString(16); break;
            case 'c': result = String.fromCharCode(Number(args[i++])); break;
            default: return match;
        }

        if (width) {
            const w = parseInt(width);
            result = leftAlign
                ? result.padEnd(w, ' ')
                : (type === 'x' ? result.padStart(w, '0') : result.padStart(w, ' '));
        }

        return result;
    });
}
