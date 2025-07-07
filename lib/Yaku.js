"use strict";

// 版本信息 - 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

// 环境变量常量 - 对应 use constant DBG/VV
const DBG = process.env.YAKU_DBG || 0;
const VV = process.env.YAKU_VERBOSE || 0;

// 导入所有子模块 - 对应 use Yaku::Uxntal::* 语句
import { parseUxntalProgram } from './Yaku/Uxntal/Parser.js';
import { checkErrors } from './Yaku/Uxntal/ErrorChecking.js';
import { EMPTY, MAIN } from './Yaku/Uxntal/Definitions.js';
import { prettyPrint } from './Yaku/Uxntal/PrettyPrint.js';
import { tokensToMemory } from './Yaku/Uxntal/Encoder.js';
import { runProgram } from './Yaku/Uxntal/Interpreter.js';
import { memToRom } from './Yaku/Uxntal/Assembler.js';

// 导入标志模块 - 对应 use Yaku::Flags
import { setIN, setWW, setWRS, setPQ, setEE, setFF, setNSW, WW, PQ } from './Yaku/Flags.js';

// Node.js 标准模块
import { readFileSync, writeFileSync } from 'fs';

/**
 * 主函数 - 精确对应 Perl 中的 main() 子程序
 * @param {string[]} argv - 命令行参数
 */
export function main(argv) {
    // 解析命令行选项 - 对应 getopts( 'hvWSVdsO0123raDpimef', \%opts )
    const opts = parseOptions(argv);

    // 帮助信息检查 - 对应 if (scalar keys %opts == 0 or $opts{'h'})
    if (Object.keys(opts).length === 0 || opts.h) {
        console.error(`\tThis is yaku version ${VERSION}
        ${argv[1]} <options> <.tal file>
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
        process.exit(1);
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

    // 优化选项 (暂未支持) - 对应注释掉的优化代码
    // const enableOpts = opts.O ? (opts['0'] ? 0 : 1) : 0;
    // const OPTLEVEL = opts['0'] ? 0 : opts['1'] ? 1 : opts['2'] ? 1 : opts['3'] ? 3 : opts.O ? 1 : 0;

    // 检查输入文件 - 对应 if (scalar @ARGV ==0 and not $IN)
    const args = argv.slice(2).filter(arg => !arg.startsWith('-'));
    if (args.length === 0 && !IN) {
        console.error("Please provide the path to the .tal file");
        process.exit(1);
    }

    // 确定程序文件和ROM文件名 - 对应 my $programFile= $IN ? 'from_stdin.tal' : $ARGV[0];
    const programFile = IN ? 'from_stdin.tal' : args[0];
    let romFile = programFile.replace(/\.tal$/, '');
    
    // if (enableOpts) {
    //     romFile += '_opt';
    // }
    
    romFile += '.rom';

    // 处理标准输入 - 对应 if($IN) { ... }
    if (IN) {
        // 在真实实现中，这里需要从stdin读取
        console.log("Reading from stdin not yet implemented");
        process.exit(1);
    }

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

        // 优化处理 (暂未实现) - 对应注释掉的优化代码
        // if (enableOpts) {
        //     if (DBG && VV == 3) {
        //         console.log('ORIG:');
        //         prettyPrint(tokens);
        //         console.log('END of ORIG');
        //     }
        //
        //     const tokensOpt = applyOptimisations(tokens, OPTLEVEL);
        //
        //     if (DBG || VV == 1 || PQ) {
        //         if (DBG || VV == 1) console.log('( OPT: )');
        //         prettyPrint(tokensOpt);
        //         if (PQ) process.exit(0);
        //     }
        //     tokens = tokensOpt;
        // } else 
        
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
        if (FF) { // fatal mode
            process.exit(1);
        }
    }
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

// 导出主函数 - 对应 @Yaku::EXPORT_OK = qw( main );
export { main };