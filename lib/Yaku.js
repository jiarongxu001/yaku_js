"use strict";

// 版本信息 - 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

// 环境变量常量 - 对应 use constant DBG/VV
const DBG = (typeof process !== 'undefined' && process.env.YAKU_DBG) || 0;
const VV = (typeof process !== 'undefined' && process.env.YAKU_VERBOSE) || 0;

// 导入所有子模块 - 对应 use Yaku::Uxntal::* 语句
import { parseUxntalProgram } from './Yaku/Uxntal/Parser.js';
import { checkErrors } from './Yaku/Uxntal/ErrorChecking.js';
import { EMPTY, MAIN } from './Yaku/Uxntal/Definitions.js';
import { prettyPrint } from './Yaku/Uxntal/PrettyPrint.js';
import { tokensToMemory } from './Yaku/Uxntal/Encoder.js';
import { runProgram } from './Yaku/Uxntal/Interpreter.js';
import { memToRom } from './Yaku/Uxntal/Assembler.js';

// 导入标志模块 - 对应 use Yaku::Flags
import { 
    setIN, setWW, setWRS, setPQ, setEE, setFF, setNSW, 
    WW, PQ, IN 
} from './Yaku/Flags.js';

// 浏览器兼容的文件系统函数
function readFileSync(filename, encoding = 'utf8') {
    // 在浏览器环境中，使用虚拟文件系统
    if (typeof window !== 'undefined' && window.fs) {
        return window.fs.readFile(filename, { encoding });
    }
    throw new Error(`File not found: ${filename}`);
}

function writeFileSync(filename, data) {
    // 在浏览器环境中，使用虚拟文件系统
    if (typeof window !== 'undefined' && window.fs) {
        return window.fs.writeFile(filename, data);
    }
    throw new Error('writeFileSync not supported in browser environment');
}

/**
 * 主函数 - 精确对应 Perl 中的 main() 子程序
 * @param {string[]} argv - 命令行参数
 */
export async function main(argv) {
    // 解析命令行选项 - 对应 getopts( 'hvWSVdsO0123raDpimef', \%opts )
    const opts = parseOptions(argv);

    // 帮助信息检查 - 对应 if (scalar keys %opts == 0 or $opts{'h'})
    if (Object.keys(opts).length === 0 || opts.h) {
        console.error(`\tThis is yaku version ${VERSION}
        ${argv[0] || 'yaku'} <options> <.tal file>
        -r: run
        -a: assemble
        -D: don't write .rom
        -s: show the stacks at the end of the run
        -O: turn on optimisations
            -O0: no opts
            -O1: default, same as -O
            -O2: currently unused
            -O3: currently unused but increases verbosity
        -p: print generated code and exit
        -W: fewer warning and error messages
        -S: no warnings for byte/short mismatch on stack manipulation instructions
        -i: take input from stdin instead of a file
        -m: assume a 'main' |0100 at the start of the program
        -e: turn all warnings into errors
        -f: fatal, die on the first error
        `);
        
        // 在浏览器环境中不能使用process.exit
        if (typeof process !== 'undefined') {
            process.exit(1);
        } else {
            throw new Error('Help requested');
        }
    }

    // 设置全局标志 - 对应 $IN = $opts{'i'} ? 1 : 0; 等
    setIN(opts.i ? 1 : 0);
    setWW(opts.W ? 1 : 0);    // fewer warning and error messages
    setWRS(opts.s ? 1 : 0);   // working and return stack
    setPQ(opts.p ? 1 : 0);    // print and quit
    setEE(opts.e ? 1 : 0);
    setFF(opts.f ? 1 : 0);
    setNSW(opts.S ? 1 : 0);   // no warnings for byte/short mismatch

    // 运行模式标志 - 对应 our $run = $opts{'r'} ? 1 : 0;
    const run = opts.r ? 1 : 0;
    const assemble = opts.a ? 1 : 0;
    const writeRom = opts.D ? 0 : 1;
    const hasMain = opts.m ? 2 : 0;

    // 检查输入文件 - 修复：先检查opts.i而不是IN
    const args = argv.slice(2).filter(arg => !arg.startsWith('-'));
    if (args.length === 0 && !opts.i) {
        console.error("Please provide the path to the .tal file");
        if (typeof process !== 'undefined') {
            process.exit(1);
        } else {
            throw new Error("Please provide the path to the .tal file");
        }
    }

    // 确定程序文件和ROM文件名 - 修复：现在可以安全使用IN
    const programFile = IN ? 'from_stdin.tal' : args[0];
    let romFile = programFile.replace(/\.tal$/, '');
    
    romFile += '.rom';

    // 初始化Uxn状态 - 对应 my $initialUxn = { ... }
    const initialUxn = {
        memory: Array(0x10000).fill().map(() => [EMPTY, 0, 1]),  // [EMPTY,0,1] x 0x10000
        stacks: [[], []],           // ws, rs (working stack, return stack)
        stackPtr: [0, 0],           // highest is 255, no circular stacks
        pc: 0,                      // Program counter
        symbolTable: {},            // Symbol table
        reverseSymbolTable: {},     // For error checking
        free: 0,                    // First unused address
        lambdaStack: [],
        lambdaCount: 0,
        hasMain: hasMain
    };

    // 处理标准输入 - 在浏览器环境中跳过
    if (IN && typeof process !== 'undefined') {
        try {
            const input = await readStdin();
            writeFileSync('from_stdin.tal', input);
        } catch (error) {
            console.error(`Error reading from stdin: ${error.message}`);
            process.exit(1);
        }
    }

    try {
        // 解析Uxntal程序 - 对应 my ($tokensWithoutIdx,$lineIdxs,$uxn) = parseUxntalProgram($programFile,$initialUxn);
        const [tokensWithoutIdx, lineIdxs, uxn] = parseUxntalProgram(programFile, initialUxn);

        // 错误处理设置 - 对应 $uxn->{lineIdxs}=$lineIdxs;
        uxn.lineIdxs = lineIdxs;

        // 添加token索引 - 对应 for my $idx (0 .. scalar @{$tokensWithoutIdx} - 1) { ... }
        const tokens = [];
        for (let idx = 0; idx < tokensWithoutIdx.length; idx++) {
            const token = [...tokensWithoutIdx[idx], idx];
            tokens.push(token);
        }

        // 添加MAIN标记 - 对应 if ($uxn->{'hasMain'}==2) { unshift @{$tokens}, [MAIN,0,0]; }
        if (uxn.hasMain === 2) {
            tokens.unshift([MAIN, 0, 0]);
        }

        // 错误检查 - 对应 if ( not $WW ) { checkErrors($tokens,$uxn); }
        if (!WW) {
            checkErrors(tokens, uxn);
        }

        // 打印代码模式 - 对应 if ($PQ) { prettyPrint $tokens; }
        if (PQ) {
            prettyPrint(tokens);
            return; // 在JavaScript中使用return而不是die
        }

        // 转换为内存表示 - 对应 $uxn = tokensToMemory($tokens,$uxn);
        const finalUxn = tokensToMemory(tokens, uxn);

        // 调试输出 - 对应 if (DBG) { ... }
        if (DBG) {
            for (let pc = 256; pc < finalUxn.free; pc++) {
                console.log(`${pc}:`, JSON.stringify(finalUxn.memory[pc]));
            }
            console.log('');
        }

        // 运行程序 - 对应 if ($run) { runProgram($uxn); }
        if (run) {
            runProgram(finalUxn);
        }

        // 汇编程序 - 对应 if ($assemble) { memToRom($uxn,$writeRom,$romFile); }
        if (assemble) {
            memToRom(finalUxn, writeRom, romFile);
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        if (opts.f) { // fatal mode
            if (typeof process !== 'undefined') {
                process.exit(1);
            } else {
                throw error;
            }
        }
    }
}

/**
 * 读取标准输入 - 仅在Node.js环境中使用
 * @returns {Promise<string>} 输入内容
 */
function readStdin() {
    if (typeof process === 'undefined') {
        throw new Error('stdin not supported in browser environment');
    }
    
    return new Promise((resolve, reject) => {
        let input = '';
        
        // 设置stdin编码
        process.stdin.setEncoding('utf8');
        
        // 读取stdin数据
        process.stdin.on('data', (chunk) => {
            input += chunk;
        });
        
        // stdin结束时处理数据
        process.stdin.on('end', () => {
            resolve(input);
        });
        
        process.stdin.on('error', reject);
        
        // 开始读取
        process.stdin.resume();
    });
}

/**
 * 解析命令行选项 - 对应 getopts 函数
 * @param {string[]} argv - 命令行参数
 * @returns {Object} 解析后的选项对象
 */
function parseOptions(argv) {
    const opts = {};
    
    // 支持的选项字符串 - 对应 'hvWSVdsO0123raDpimef'
    const validOptions = 'hvWSVdsO0123raDpimef';
    
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        
        if (arg.startsWith('-') && arg.length > 1) {
            // 处理短选项
            for (let j = 1; j < arg.length; j++) {
                const option = arg[j];
                if (validOptions.includes(option)) {
                    opts[option] = true;
                }
            }
        }
    }
    
    return opts;
}