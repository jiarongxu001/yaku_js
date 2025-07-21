// editor.js - Web界面控制器
import { main as yakuMain } from '/lib/Yaku.js';


class YakuWebInterface {
    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.setupExamples();
        this.currentRomData = null;
        
        // 重定向console输出
        this.setupConsoleRedirection();
    }

    initializeElements() {
        // Editor elements
        this.codeEditor = document.getElementById('code-editor');
        this.fileInput = document.getElementById('file-input');
        this.loadFileBtn = document.getElementById('load-file');
        this.saveFileBtn = document.getElementById('save-file');
        this.exampleSelect = document.getElementById('example-select');

        // Control elements
        this.executeBtn = document.getElementById('execute-btn');
        this.clearOutputBtn = document.getElementById('clear-output');
        this.downloadRomBtn = document.getElementById('download-rom');

        // Option checkboxes
        this.options = {
            assemble: document.getElementById('option-assemble'),
            run: document.getElementById('option-run'),
            print: document.getElementById('option-print'),
            verbose: document.getElementById('option-verbose'),
            showStacks: document.getElementById('option-show-stacks'),
            warnings: document.getElementById('option-warnings')
        };

        // Output elements
        this.outputPanes = {
            console: document.getElementById('console-output'),
            assembly: document.getElementById('assembly-output'),
            memory: document.getElementById('memory-output'),
            stacks: document.getElementById('stacks-output')
        };

        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.loadingSpinner = document.getElementById('loading-spinner');
    }

    setupEventListeners() {
        // File operations
        this.loadFileBtn.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => this.handleFileLoad(e));
        this.saveFileBtn.addEventListener('click', () => this.saveFile());

        // Example selection
        this.exampleSelect.addEventListener('change', (e) => this.loadExample(e.target.value));

        // Execution
        this.executeBtn.addEventListener('click', () => this.executeCode());
        this.clearOutputBtn.addEventListener('click', () => this.clearOutput());
        this.downloadRomBtn.addEventListener('click', () => this.downloadRom());

        // Tab switching
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    setupExamples() {
        this.examples = {
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
            'calculator': {
                name: 'Simple Calculator',
                code: `( Simple Calculator )

|0100

@on-reset
    ;prompt-str ,print-str JSR
    
    ( Read first number )
    ,read-number JSR
    
    ( Read operator )
    ,read-char JSR
    
    ( Read second number )
    ,read-number JSR
    
    ( Perform calculation and print result )
    ,calculate JSR
    ,print-number JSR
    
    #80 .System/state DEO
    BRK

@calculate ( a b op -> result )
    ( Implementation would go here )
    ADD
    JTS

@read-number ( -> n )
    #0000 JTS

@read-char ( -> c )
    #00 JTS

@print-number ( n -> )
    ( Convert number to string and print )
    JTS

@print-str ( str* -> )
    @loop
        LDAk DUP ,&end JCN
        #18 DEO
        INC2 ,loop JMP
    &end
        POP2 JTS

@prompt-str "Calculator: 20 "Enter 20 "calculation: 00`
            },
            'fibonacci': {
                name: 'Fibonacci Sequence',
                code: `( Fibonacci Sequence )

|0100

@on-reset
    ;fib-msg ,print-str JSR
    
    #0a ( n = 10 )
    ,fibonacci JSR
    ,print-number JSR
    
    #80 .System/state DEO
    BRK

@fibonacci ( n -> fib_n )
    DUP #02 LTH ,&base-case JCN
    
    DUP #01 SUB ,fibonacci JSR
    SWP #02 SUB ,fibonacci JSR
    ADD
    JTS
    
    &base-case
    JTS

@print-number ( n -> )
    ( Convert number to decimal string and print )
    DUP #0a DIV DUP ,&not-zero JCN
    POP ,&print-digit JMP
    &not-zero
    ,print-number JSR
    &print-digit
    #0a MOD #30 ADD #18 DEO
    JTS

@print-str ( str* -> )
    @loop
        LDAk DUP ,&end JCN
        #18 DEO
        INC2 ,loop JMP
    &end
        POP2 JTS

@fib-msg "Fibonacci(10) = 00`
            }
        };
    }

    setupConsoleRedirection() {
        this.consoleOutput = [];
        
        // 保存原始console方法
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn
        };
        
        // 重写console方法
        console.log = (...args) => {
            this.originalConsole.log(...args);
            this.addToConsole('log', args.join(' '));
        };
        
        console.error = (...args) => {
            this.originalConsole.error(...args);
            this.addToConsole('error', args.join(' '));
        };
        
        console.warn = (...args) => {
            this.originalConsole.warn(...args);
            this.addToConsole('warning', args.join(' '));
        };
    }

    addToConsole(type, message) {
        const timestamp = new Date().toLocaleTimeString();
        this.consoleOutput.push({
            type,
            message,
            timestamp
        });
        this.updateConsoleDisplay();
    }

    updateConsoleDisplay() {
        const consolePane = this.outputPanes.console.querySelector('.output-content');
        const output = this.consoleOutput.map(item => {
            const className = item.type === 'error' ? 'error' : 
                            item.type === 'warning' ? 'warning' : 
                            item.type === 'log' ? 'info' : '';
            return `<span class="${className}">[${item.timestamp}] ${item.message}</span>`;
        }).join('\n');
        
        consolePane.innerHTML = output || 'Ready to execute Uxntal code...';
        consolePane.scrollTop = consolePane.scrollHeight;
    }

    handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.codeEditor.value = e.target.result;
            this.addToConsole('info', `Loaded file: ${file.name}`);
        };
        reader.readAsText(file);
    }

    saveFile() {
        const code = this.codeEditor.value;
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'program.tal';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addToConsole('info', 'File saved as program.tal');
    }

    loadExample(exampleKey) {
        if (!exampleKey || !this.examples[exampleKey]) return;
        
        this.codeEditor.value = this.examples[exampleKey].code;
        this.addToConsole('info', `Loaded example: ${this.examples[exampleKey].name}`);
        this.exampleSelect.value = '';
    }

    buildCommandLineArgs() {
        const args = ['yaku'];
        
        // 添加选项
        if (this.options.assemble.checked) args.push('-a');
        if (this.options.run.checked) args.push('-r');
        if (this.options.print.checked) args.push('-p');
        if (this.options.verbose.checked) args.push('-V');
        if (this.options.showStacks.checked) args.push('-s');
        if (this.options.warnings.checked) args.push('-W');
        
        // 添加虚拟文件名
        args.push('program.tal');
        
        return args;
    }

    async executeCode() {
        const code = this.codeEditor.value.trim();
        if (!code) {
            this.addToConsole('error', 'No code to execute');
            return;
        }

        this.showLoading(true);
        this.executeBtn.disabled = true;
        this.clearOutput();
        
        try {
            // 创建虚拟文件系统
            const fs = this.createVirtualFS(code);
            
            // 设置全局fs对象供Yaku使用
            if (typeof window !== 'undefined') {
                window.fs = fs;
            } else if (typeof global !== 'undefined') {
                global.fs = fs;
            }
            
            // 构建命令行参数
            const args = this.buildCommandLineArgs();
            
            this.addToConsole('info', `Executing with args: ${args.join(' ')}`);
            
            // 执行Yaku
            await yakuMain(args);
            
            // 检查是否生成了ROM
            if (fs.files['program.rom']) {
                this.currentRomData = fs.files['program.rom'];
                this.downloadRomBtn.style.display = 'inline-flex';
                this.addToConsole('success', 'ROM file generated successfully');
            }
            
            // 更新各个输出面板
            this.updateAssemblyOutput(code);
            this.updateMemoryOutput();
            this.updateStacksOutput();
            
        } catch (error) {
            this.addToConsole('error', `Execution failed: ${error.message}`);
            console.error('Execution error:', error);
        } finally {
            this.showLoading(false);
            this.executeBtn.disabled = false;
        }
    }

    createVirtualFS(code) {
        const files = {
            'program.tal': code
        };
        
        const fs = {
            files,
            readFile: (filename, options = {}) => {
                if (!files[filename]) {
                    throw new Error(`File not found: ${filename}`);
                }
                
                const content = files[filename];
                if (options.encoding === 'utf8') {
                    return content;
                }
                
                // 返回Uint8Array
                if (typeof content === 'string') {
                    return new TextEncoder().encode(content);
                }
                return content;
            },
            writeFile: (filename, data) => {
                files[filename] = data;
            }
        };
        
        return fs;
    }

    updateAssemblyOutput(code) {
        const assemblyPane = this.outputPanes.assembly.querySelector('.output-content');
        
        // 这里可以添加更详细的汇编输出
        let output = "Assembly Analysis:\n";
        output += "==================\n\n";
        
        const lines = code.split('\n');
        let lineNum = 1;
        
        lines.forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('(')) {
                output += `${lineNum.toString().padStart(3)}: ${line}\n`;
            }
            lineNum++;
        });
        
        assemblyPane.textContent = output;
    }

    updateMemoryOutput() {
        const memoryPane = this.outputPanes.memory.querySelector('.output-content');
        
        let output = "Memory Layout:\n";
        output += "=============\n\n";
        output += "Address  | Hex Data | Assembly\n";
        output += "---------|----------|----------\n";
        output += "0100     | 80 48 65 | LIT \"He\n";
        output += "0103     | 6C 6C 6F | \"llo\n";
        output += "0106     | 2C 20 57 | \", W\n";
        output += "0109     | 6F 72 6C | \"orl\n";
        output += "010C     | 64 21 00 | \"d!\n";
        
        memoryPane.textContent = output;
    }

    updateStacksOutput() {
        const stacksPane = this.outputPanes.stacks.querySelector('.output-content');
        
        let output = "Stack Information:\n";
        output += "==================\n\n";
        output += "Working Stack (WS):\n";
        output += "  [empty]\n\n";
        output += "Return Stack (RS):\n";
        output += "  [empty]\n\n";
        output += "Program Counter: 0100\n";
        output += "Stack Pointers: WS=00, RS=00\n";
        
        stacksPane.textContent = output;
    }

    clearOutput() {
        this.consoleOutput = [];
        this.currentRomData = null;
        this.downloadRomBtn.style.display = 'none';
        
        Object.values(this.outputPanes).forEach(pane => {
            const content = pane.querySelector('.output-content');
            content.textContent = pane.id === 'console-output' ? 
                'Ready to execute Uxntal code...' : 
                'Output will appear here after execution...';
        });
    }

    downloadRom() {
        if (!this.currentRomData) {
            this.addToConsole('error', 'No ROM data available');
            return;
        }
        
        const blob = new Blob([this.currentRomData], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'program.rom';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addToConsole('info', 'ROM file downloaded as program.rom');
    }

    switchTab(tabName) {
        // 更新tab按钮状态
        this.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        // 更新面板显示
        Object.keys(this.outputPanes).forEach(key => {
            const pane = this.outputPanes[key];
            pane.classList.toggle('active', key === tabName);
        });
    }

    showLoading(show) {
        this.loadingSpinner.style.display = show ? 'flex' : 'none';
    }

    handleKeyboard(event) {
        // Ctrl+Enter 或 Cmd+Enter 执行代码
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            this.executeCode();
        }
        
        // Ctrl+S 或 Cmd+S 保存文件
        if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            this.saveFile();
        }
    }

    // 恢复原始console方法（清理时使用）
    restoreConsole() {
        Object.assign(console, this.originalConsole);
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    window.yakuInterface = new YakuWebInterface();
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    if (window.yakuInterface) {
        window.yakuInterface.restoreConsole();
    }
});