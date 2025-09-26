console.log('Yaku Web App Starting...');

(async function() {
    'use strict';
    
    // 首先设置浏览器兼容的 fs 对象
    if (typeof window !== 'undefined') {
        window.fs = {
            files: {},
            readFile: function(filename, options = {}) {
                if (!this.files[filename]) {
                    throw new Error(`File not found: ${filename}`);
                }
                
                const content = this.files[filename];
                if (options.encoding === 'utf8') {
                    return content;
                }
                
                if (typeof content === 'string') {
                    return new TextEncoder().encode(content);
                }
                return content;
            },
            writeFile: function(filename, data) {
                this.files[filename] = data;
                console.log(`Generated: ${filename} (${data.length} bytes)`);
            },
            readFileSync: function(filename, options = {}) {
                return this.readFile(filename, options);
            },
            writeFileSync: function(filename, data) {
                this.writeFile(filename, data);
            }
        };

        // 设置 global 也指向同一个对象
        if (typeof global !== 'undefined') {
            global.fs = window.fs;
        } else {
            window.global = { fs: window.fs };
        }
    }
    
    // 动态导入 Yaku 模块
    let yakuMain = null;
    try {
        const yakuModule = await import('./lib/Yaku.js');
        yakuMain = yakuModule.main;
        console.log('Yaku module loaded successfully');
    } catch (error) {
        console.error('Failed to load Yaku module:', error);
    }
    
    // 示例程序库
    const examples = {
        'hello-world': {
            name: 'Hello World',
            code: `( Hello World Example )

|0100
#48 #65 #6c #6c #6f #20 #57 #6f #72 #6c #64 #21 #0a 
@loop 
    DUP #18 DEO 
    INC 
    DUP #0a EQU ,&end JCN 
    ,loop JMP 
&end 
    POP 
    BRK`
        },
        'simple-calc': {
            name: 'Simple Calculator',
            code: `( Simple Calculator: 6 * 7 )

|0100
#06 #07 MUL  ( 6 * 7 = 42 )
#30 ADD      ( Convert to ASCII: 42 + 48 = 90 )
#18 DEO      ( Output the character )
#0a #18 DEO  ( Output newline )
BRK`
        },
        'fibonacci': {
            name: 'Fibonacci Sequence',
            code: `( Fibonacci Example )

|0100
#05 ,fibonacci JSR  ( Calculate fib(5) )
#30 ADD #18 DEO     ( Convert to ASCII and output )
BRK

@fibonacci ( n -> fib_n )
    DUP #02 LTH ,&base-case JCN
    DUP #01 SUB ,fibonacci JSR
    SWP #02 SUB ,fibonacci JSR
    ADD JTS
    &base-case JTS`
        },
        'memory-test': {
            name: 'Memory Test',
            code: `( Memory Access Test )

|0100
#42 .data STZ    ( Store 42 in memory )
.data LDZ        ( Load from memory )
#18 DEO          ( Output the value )
BRK

|0200
@data $1`
        }
    };
    
    // 等待 DOM 加载
    function initApp() {
        console.log('DOM loaded');
        
        // 获取所有元素
        const executeBtn = document.getElementById('execute-btn');
        const clearBtn = document.getElementById('clear-output');
        const downloadRomBtn = document.getElementById('download-rom');
        const codeEditor = document.getElementById('code-editor');
        const fileInput = document.getElementById('file-input');
        const loadFileBtn = document.getElementById('load-file-btn');
        const saveFileBtn = document.getElementById('save-file-btn');
        const exampleSelect = document.getElementById('example-select');
        
        const consoleOutput = document.getElementById('console-output');
        const assemblyOutput = document.getElementById('assembly-output');
        const memoryOutput = document.getElementById('memory-output');
        const stacksOutput = document.getElementById('stacks-output');
        
        // 标签页按钮
        const tabBtns = document.querySelectorAll('.tab-btn');
        const outputPanes = document.querySelectorAll('.output-pane');
        
        let currentRomData = null;
        let programOutput = '';
        
        // 设置程序输出捕获
        window.yakuOutput = function(char) {
            programOutput += char;
        };
        
        function addOutput(type, message) {
            try {
                const content = consoleOutput.querySelector('.output-content');
                const timestamp = new Date().toLocaleTimeString();
                const className = type === 'error' ? ' style="color: #ff073a;"' : 
                                type === 'info' ? ' style="color: #00f5ff;"' : 
                                type === 'success' ? ' style="color: #39ff14;"' : 
                                type === 'warning' ? ' style="color: #ffaa00;"' : '';
                
                if (content.textContent === 'Ready to execute Uxntal code...') {
                    content.innerHTML = '';
                }
                
                content.innerHTML += '<span' + className + '>[' + timestamp + '] ' + message + '</span>\n';
                content.scrollTop = content.scrollHeight;
            } catch (e) {
                console.log('Output:', message);
            }
        }
        
        // 错误捕获设置
        function setupErrorCapture() {
            const originalConsoleError = console.error;
            const capturedErrors = [];
            
            console.error = function(...args) {
                originalConsoleError.apply(console, args);
                const message = args.join(' ');
                capturedErrors.push(message);
            };
            
            return function restoreConsole() {
                console.error = originalConsoleError;
                return capturedErrors;
            };
        }
        
        // 执行函数 - 修复版本
        async function executeCode() {
            if (!yakuMain) {
                addOutput('error', 'Yaku module not loaded properly');
                return;
            }
            
            const code = codeEditor ? codeEditor.value.trim() : '';
            
            if (!code) {
                addOutput('error', 'No code to execute');
                return;
            }
            
            executeBtn.disabled = true;
            programOutput = '';
            
            addOutput('info', 'Starting execution...');
            
            // 设置错误捕获
            const restoreConsole = setupErrorCapture();
            
            try {
                // 创建虚拟文件系统
                window.fs.files = { 'program.tal': code };
                
                // 获取选项
                const assembleChecked = document.getElementById('option-assemble').checked;
                const runChecked = document.getElementById('option-run').checked;
                const printChecked = document.getElementById('option-print').checked;
                const verboseChecked = document.getElementById('option-verbose').checked;
                const showStacksChecked = document.getElementById('option-show-stacks').checked;
                const warningsChecked = document.getElementById('option-warnings').checked;
                
                // 构建参数
                const args = ['yaku'];
                if (assembleChecked) args.push('-a');
                if (runChecked) args.push('-r');
                if (printChecked) args.push('-p');
                if (verboseChecked) args.push('-V');
                if (showStacksChecked) args.push('-s');
                if (warningsChecked) args.push('-W');
                args.push('program.tal');
                
                addOutput('info', 'Executing: ' + args.join(' '));
                
                // 执行 Yaku - 使用更严格的 Promise 错误处理
                await yakuMain(args).catch(error => {
                    // 确保 Promise 拒绝被正确处理
                    throw error;
                });
                
                // 成功路径
                if (programOutput) {
                    addOutput('success', 'Program output: "' + programOutput + '"');
                } else {
                    addOutput('success', 'Program output: (no visible output)');
                }
                
                // 检查是否生成了 ROM
                if (window.fs.files['program.rom']) {
                    currentRomData = window.fs.files['program.rom'];
                    if (downloadRomBtn) {
                        downloadRomBtn.style.display = 'inline-flex';
                    }
                    addOutput('success', 'ROM file generated successfully');
                }
                
                addOutput('success', 'Execution completed successfully');
                
            } catch (error) {
                const capturedErrors = restoreConsole();
                
                // 更详细的错误处理
                console.log('Caught error:', error);
                console.log('Captured errors:', capturedErrors);
                
                if (error.message === 'BRK_NORMAL_EXIT') {
                    addOutput('success', 'Program completed successfully');
                    if (programOutput) {
                        addOutput('success', 'Program output: "' + programOutput + '"');
                    }
                } else if (error.message && error.message.startsWith('SYSTEM_EXIT_')) {
                    const exitCode = error.message.split('_')[2];
                    addOutput('success', 'Program exited with code: ' + exitCode);
                    if (programOutput) {
                        addOutput('success', 'Program output: "' + programOutput + '"');
                    }
                } else {
                    // 这里是关键 - 显示真正的错误
                    if (capturedErrors.length > 0) {
                        addOutput('error', 'Assembly/Syntax error: ' + capturedErrors.join('; '));
                    } else {
                        addOutput('error', 'Execution failed: ' + (error.message || error));
                    }
                }
                
                console.error('Full error details:', error);
            } finally {
                restoreConsole();
                executeBtn.disabled = false;
            }
        }
        
        // 文件操作功能
        function setupFileOperations() {
            // Load File 按钮
            if (loadFileBtn && fileInput) {
                loadFileBtn.onclick = function() {
                    fileInput.click();
                };
                
                fileInput.onchange = function(event) {
                    const file = event.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        codeEditor.value = e.target.result;
                        addOutput('info', 'File loaded: ' + file.name);
                    };
                    reader.readAsText(file);
                };
            }
            
            // Save File 按钮
            if (saveFileBtn) {
                saveFileBtn.onclick = function() {
                    const code = codeEditor.value;
                    const blob = new Blob([code], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'program.tal';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    addOutput('info', 'File saved as program.tal');
                };
            }
            
            // Example 下拉菜单
            if (exampleSelect) {
                exampleSelect.onchange = function() {
                    const selectedExample = this.value;
                    if (selectedExample && examples[selectedExample]) {
                        codeEditor.value = examples[selectedExample].code;
                        addOutput('info', 'Loaded example: ' + examples[selectedExample].name);
                        this.value = ''; // 重置选择
                    }
                };
            }
            
            // Download ROM 按钮
            if (downloadRomBtn) {
                downloadRomBtn.onclick = function() {
                    if (!currentRomData) {
                        addOutput('error', 'No ROM data available');
                        return;
                    }
                    
                    const blob = new Blob([currentRomData], { type: 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'program.rom';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    
                    addOutput('info', 'ROM file downloaded as program.rom');
                };
            }
        }
        
        // 标签页切换功能
        function setupTabs() {
            tabBtns.forEach(function(btn) {
                btn.onclick = function() {
                    const targetTab = this.getAttribute('data-tab');
                    
                    // 更新按钮状态
                    tabBtns.forEach(function(b) { 
                        b.classList.remove('active'); 
                    });
                    this.classList.add('active');
                    
                    // 更新面板显示
                    outputPanes.forEach(function(pane) {
                        pane.classList.remove('active');
                        if (pane.id === targetTab + '-output') {
                            pane.classList.add('active');
                        }
                    });
                };
            });
        }
        
        function clearOutput() {
            try {
                // 清除所有输出面板
                const allContents = document.querySelectorAll('.output-content');
                allContents.forEach(function(content) {
                    if (content.closest('#console-output')) {
                        content.innerHTML = 'Ready to execute Uxntal code...';
                    } else {
                        content.textContent = 'Output will appear here after execution...';
                    }
                });
                
                // 隐藏 ROM 下载按钮
                currentRomData = null;
                if (downloadRomBtn) {
                    downloadRomBtn.style.display = 'none';
                }
                
                programOutput = '';
            } catch (e) {
                console.log('Clear failed');
            }
        }
        
        // 执行按钮事件
        if (executeBtn) {
            executeBtn.onclick = executeCode;
        }
        
        // 清除按钮事件
        if (clearBtn) {
            clearBtn.onclick = clearOutput;
        }
        
        // 初始化所有功能
        setupFileOperations();
        setupTabs();
        
        // 显示启动信息
        if (yakuMain) {
            addOutput('info', 'Yaku Web Interface ready with real integration');
        } else {
            addOutput('error', 'Yaku module failed to load - some features may not work');
        }
        
        console.log('Yaku Web Interface initialized');
    }
    
    // 确保 DOM 加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
    
})().catch(error => {
    console.error('Failed to initialize Yaku Web App:', error);
});

console.log('Yaku Web App script loaded');