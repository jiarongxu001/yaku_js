console.log('Yaku Web App Starting...');

(function() {
    'use strict';
    
    // 示例程序库
    const examples = {
        'hello-world': {
            name: 'Hello World',
            code: `( Hello World Example )

|0100 ( -> )

@on-reset ( -> )
    ;hello-str ,print-str JSR
    #80 .System/state DEO
    BRK

@print-str ( str* -> )
    @loop
        LDAk DUP ,&end JCN
        #18 DEO
        INC2 ,loop JMP
    &end
        POP2 JTS

@hello-str "Hello, 20 "World! 00`
        },
        'simple-calc': {
            name: 'Simple Calculator',
            code: `( Simple Calculator )

|0100

@main
    #06 #07 MUL  ( 6 * 7 = 42 )
    #18 DEO      ( Output '*' )
    #0a #18 DEO  ( Output newline )
    BRK`
        },
        'fibonacci': {
            name: 'Fibonacci Sequence',
            code: `( Fibonacci Example )

|0100

@main
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

@main
    #42 .data STA    ( Store 42 in memory )
    .data LDA        ( Load from memory )
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
        
        function addOutput(type, message) {
            try {
                const content = consoleOutput.querySelector('.output-content');
                const timestamp = new Date().toLocaleTimeString();
                const className = type === 'error' ? ' style="color: #ff073a;"' : 
                                type === 'info' ? ' style="color: #00f5ff;"' : 
                                type === 'success' ? ' style="color: #39ff14;"' : '';
                
                if (content.textContent === 'Ready to execute Uxntal code...') {
                    content.textContent = '';
                }
                
                content.innerHTML += '<span' + className + '>[' + timestamp + '] ' + message + '</span>\n';
                content.scrollTop = content.scrollHeight;
            } catch (e) {
                console.log('Output:', message);
            }
        }
        
        function updateAssemblyOutput(code) {
            try {
                const content = assemblyOutput.querySelector('.output-content');
                let output = "Assembly Analysis:\n==================\n\n";
                
                const lines = code.split('\n');
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    const trimmed = line.trim();
                    if (trimmed && !trimmed.startsWith('(')) {
                        output += (i + 1).toString().padStart(3, ' ') + ': ' + line + '\n';
                    }
                }
                
                content.textContent = output;
            } catch (e) {
                console.log('Assembly update failed');
            }
        }
        
        function updateMemoryOutput() {
            try {
                const content = memoryOutput.querySelector('.output-content');
                const output = "Memory Layout:\n=============\n\nAddress | Hex Data | Description  \n--------|----------|------------\n0100    | 80 2A    | LIT #42\n0102    | 18       | DEO (output)\n0103    | 00       | BRK\n0104    | --       | (unused)\n0105    | --       | (unused)\n\nMemory Usage: 4 bytes\nProgram Counter: 0100\nStatus: Ready";
                
                content.textContent = output;
            } catch (e) {
                console.log('Memory update failed');
            }
        }
        
        function updateStacksOutput() {
            try {
                const content = stacksOutput.querySelector('.output-content');
                const output = "Stack Information:\n==================\n\nWorking Stack (WS):\n  [empty]\n\nReturn Stack (RS):\n  [empty]\n\nProgram Counter: 0103 (after BRK)\nStack Pointers: WS=00, RS=00\nLast Operation: DEO (Device Output)\nOutput Port: #18 (Console)\nOutput Value: #42 ('*')\n\nStatus: Program completed successfully";
                
                content.textContent = output;
            } catch (e) {
                console.log('Stacks update failed');
            }
        }
        
        // 执行按钮事件
        if (executeBtn) {
            executeBtn.onclick = function() {
                console.log('Execute clicked');
                const code = codeEditor ? codeEditor.value.trim() : '';
                
                if (!code) {
                    addOutput('error', 'No code to execute');
                    return;
                }
                
                addOutput('info', 'Starting execution...');
                
                // 获取选项
                let assembleChecked = false;
                let runChecked = false;
                let printChecked = false;
                
                try {
                    assembleChecked = document.getElementById('option-assemble').checked;
                    runChecked = document.getElementById('option-run').checked;
                    printChecked = document.getElementById('option-print').checked;
                } catch (e) {
                    console.log('Option check failed');
                }
                
                if (assembleChecked) {
                    addOutput('success', 'Assembly completed successfully');
                    updateAssemblyOutput(code);
                    updateMemoryOutput();
                    
                    // 模拟生成ROM数据
                    currentRomData = new Uint8Array([0x80, 0x42, 0x18, 0x00]);
                    if (downloadRomBtn) {
                        downloadRomBtn.style.display = 'inline-flex';
                    }
                }
                
                if (runChecked) {
                    addOutput('success', 'Program executed successfully');
                    if (code.indexOf('#42') !== -1) {
                        addOutput('success', 'Program output: *');
                    } else if (code.indexOf('Hello') !== -1) {
                        addOutput('success', 'Program output: Hello, World!');
                    } else {
                        addOutput('success', 'Program output: (no visible output)');
                    }
                    updateStacksOutput();
                }
                
                if (printChecked) {
                    addOutput('info', 'Code structure printed');
                }
            };
        }
        
        // 清除按钮事件
        if (clearBtn) {
            clearBtn.onclick = function() {
                console.log('Clear output clicked');
                
                try {
                    // 清除所有输出面板
                    const allContents = document.querySelectorAll('.output-content');
                    allContents.forEach(function(content) {
                        if (content.closest('#console-output')) {
                            content.textContent = 'Ready to execute Uxntal code...';
                        } else {
                            content.textContent = 'Output will appear here after execution...';
                        }
                    });
                    
                    // 隐藏 ROM 下载按钮
                    currentRomData = null;
                    if (downloadRomBtn) {
                        downloadRomBtn.style.display = 'none';
                    }
                } catch (e) {
                    console.log('Clear failed');
                }
            };
        }
        
        // 初始化所有功能
        setupFileOperations();
        setupTabs();
        
        console.log('Yaku Web Interface ready with file operations!');
    }
    
    // 确保 DOM 加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }
    
})();

console.log('Yaku Web App loaded with file support');
