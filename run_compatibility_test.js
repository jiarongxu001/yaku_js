import { spawn } from 'child_process';
import { main as yakuMain } from './lib/Yaku.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 运行JavaScript版本
async function runJSVersion(talFile) {
    let output = '';
    let error = '';
    
    // 捕获stdout和stderr
    const originalStdoutWrite = process.stdout.write;
    const originalStderrWrite = process.stderr.write;
    
    process.stdout.write = function(chunk) {
        output += chunk;
        return true;
    };
    
    process.stderr.write = function(chunk) {
        error += chunk;
        return true;
    };
    
    let success = false;
    try {
        await yakuMain(['-r', talFile]);
        success = true;
    } catch (err) {
        error += err.message;
    } finally {
        process.stdout.write = originalStdoutWrite;
        process.stderr.write = originalStderrWrite;
    }
    
    return { success, output: output.trim(), error: error.trim() };
}

// 运行Perl版本
async function runPerlVersion(talFile) {
    return new Promise((resolve) => {
        const child = spawn('perl', ['perl_yaku/yaku.pl', '-r', talFile]);
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
        
        child.on('error', (err) => {
            resolve({
                success: false,
                output: '',
                error: err.message
            });
        });
    });
}

// 获取所有测试文件
function getTestFiles() {
    const testDir = path.join(__dirname, 'tests');
    const files = [];
    
    function scanDir(dir) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                scanDir(fullPath);
            } else if (item.endsWith('.tal')) {
                files.push(fullPath);
            }
        }
    }
    
    scanDir(testDir);
    return files;
}

// 运行所有测试
async function runAllTests() {
    const testFiles = getTestFiles();
    console.log(`Found ${testFiles.length} test files`);
    
    const results = [];
    
    for (const testFile of testFiles) {
        console.log(`Testing: ${path.relative(__dirname, testFile)}`);
        
        const jsResult = await runJSVersion(testFile);
        const perlResult = await runPerlVersion(testFile);
        
        const match = jsResult.success === perlResult.success && 
                     jsResult.output === perlResult.output;
        
        results.push({
            file: path.relative(__dirname, testFile),
            match,
            js: jsResult,
            perl: perlResult
        });
        
        console.log(`  ${match ? 'PASS' : 'FAIL'}`);
        if (!match) {
            console.log(`    JS:   ${jsResult.success ? 'SUCCESS' : 'FAIL'} - "${jsResult.output}"`);
            console.log(`    Perl: ${perlResult.success ? 'SUCCESS' : 'FAIL'} - "${perlResult.output}"`);
        }
    }
    
    // 生成报告
    const passed = results.filter(r => r.match).length;
    const total = results.length;
    
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success rate: ${(passed/total*100).toFixed(1)}%`);
    
    // 保存详细结果
    fs.writeFileSync('test_results.json', JSON.stringify(results, null, 2));
    console.log('\nDetailed results saved to test_results.json');
}

runAllTests().catch(console.error);
