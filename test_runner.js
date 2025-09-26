import { spawn } from 'child_process';
import { main as yakuMain } from './lib/Yaku.js';
import fs from 'fs';
import path from 'path';

// 运行JavaScript版本
async function runJSVersion(talFile) {
    // 重定向输出到变量
    let output = '';
    const originalWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
        output += chunk;
        return true;
    };
    
    try {
        await yakuMain(['-r', talFile]);
        return { success: true, output: output.trim() };
    } catch (error) {
        return { success: false, error: error.message, output: output.trim() };
    } finally {
        process.stdout.write = originalWrite;
    }
}

// 运行Perl版本 - 您需要提供正确的Perl命令
async function runPerlVersion(talFile) {
    return new Promise((resolve) => {
        // TODO: 替换为您实际的Perl Yaku命令
        const perlCmd = 'perl';
        const perlScript = '/path/to/yaku.pl'; // 您需要提供正确路径
        
        const child = spawn(perlCmd, [perlScript, '-r', talFile]);
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => stdout += data);
        child.stderr.on('data', (data) => stderr += data);
        
        child.on('close', (code) => {
            resolve({
                success: code === 0,
                output: stdout.trim(),
                error: stderr.trim()
            });
        });
    });
}

// 比较结果
function compareResults(jsResult, perlResult) {
    if (jsResult.success !== perlResult.success) {
        return { match: false, reason: 'Exit status differs' };
    }
    
    if (jsResult.output !== perlResult.output) {
        return { 
            match: false, 
            reason: 'Output differs',
            jsOutput: jsResult.output,
            perlOutput: perlResult.output
        };
    }
    
    return { match: true };
}

export { runJSVersion, runPerlVersion, compareResults };
