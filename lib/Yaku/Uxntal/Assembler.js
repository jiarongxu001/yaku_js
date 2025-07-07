"use strict";

// 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

// 对应 use constant VV => $ENV{YAKU_VERBOSE} // 0;
const VV = parseInt(process.env.YAKU_VERBOSE) || 0;

// 导入模块
import { opcode, INSTR } from './Definitions.js';
import { writeFileSync } from 'fs';

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
        // 对应 map { $romStr .= sprintf("%c",$_) } @bytes_no_zeroed_mem ;
        const romBuffer = Buffer.from(bytes_no_zeroed_mem);
        
        try {
            // 对应 open my $ROM, '>', $romFile or die $!;
            writeFileSync(romFile, romBuffer);
            console.log(`ROM file written: ${romFile}`);
        } catch (error) {
            throw new Error(`Failed to write ROM file: ${error.message}`);
        }
    }
}

// 对应 sub tokenToByte($token)
function tokenToByte(token) {
    // 对应 if ($token->[0] == INSTR )
    if (token[0] === INSTR) {
        // 对应 my ($t_,$instr,$short,$r,$k) = @{$token};
        const [t_, instr, short, r, k] = token;
        
        // 对应注释中的位运算逻辑：
        // LIT:
        // 100 0 0000 --
        // 101 0 0000 2
        // 110 0 0000 r
        // 111 0 0000 2r
        
        // 对应 my $instr_byte = (($short-1) << 5) + ($r << 6) + ($k << 7) + ($opcode{$instr} & 0x1F);
        let instr_byte = ((short - 1) << 5) + (r << 6) + (k << 7) + (opcode[instr] & 0x1F);
        
        // 对应 if ($token->[1] eq 'LIT')
        if (token[1] === 'LIT') {
            // 对应 $instr_byte = 0x80 + (($short-1) << 5) + ($r << 6) + ($k << 7);
            instr_byte = 0x80 + ((short - 1) << 5) + (r << 6) + (k << 7);
        }
        // 对应 elsif ($token->[1] =~ /J[SCM]I/)
        else if (/J[SCM]I/.test(token[1])) {
            // 对应 $instr_byte = $opcode{$instr};
            instr_byte = opcode[instr];
        }
        
        return instr_byte;
    } else {
        // 对应 my $byte = $token->[1];
        const byte = token[1];
        return byte;
    }
}

// 改进的sprintf函数，支持更多格式
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

// 导出主要函数
export { memToRom };