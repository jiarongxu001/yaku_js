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

// 获取测试文件 - 使用您实际的测试目录
function getTestFiles() {
    const testDir = path.join(__dirname, 'yaku-tests/tests');
    const files = [];
    
    if (!fs.existsSync(testDir)) {
        console.log('Test directory not found:', testDir);
        return files;
    }
    
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

// 运行测试
async function runTests() {
    const testFiles = getTestFiles();
    console.log(`Found ${testFiles.length} test files`);
    
    if (testFiles.length === 0) {
        console.log('No test files found. Checking available .tal files...');
        const allTalFiles = [];
        
        // 查找所有.tal文件
        function findTalFiles(dir) {
            if (!fs.existsSync(dir)) return;
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                if (fs.statSync(fullPath).isDirectory()) {
                    findTalFiles(fullPath);
                } else if (item.endsWith('.tal')) {
                    allTalFiles.push(fullPath);
                }
            }
        }
        
        findTalFiles(__dirname);
        console.log('All .tal files found:');
        allTalFiles.forEach(f => console.log('  ', f));
        return;
    }
    
    const results = [];
    
    for (let i = 0; i < Math.min(5, testFiles.length); i++) { // 先测试5个文件
        const testFile = testFiles[i];
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
            if (jsResult.error) console.log(`    JS Error: ${jsResult.error}`);
            if (perlResult.error) console.log(`    Perl Error: ${perlResult.error}`);
        }
    }
    
    const passed = results.filter(r => r.match).length;
    const total = results.length;
    
    console.log('\n=== TEST SUMMARY ===');
    console.log(`Total tests: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success rate: ${total > 0 ? (passed/total*100).toFixed(1) : 0}%`);
}

runTests().catch(console.error);
