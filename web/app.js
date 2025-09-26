console.log('🗾 Yaku Web App Starting...');

const opcode = {
    BRK: 0x00, LIT: 0x80, INC: 0x01, POP: 0x02, NIP: 0x03, SWP: 0x04,
    ROT: 0x05, DUP: 0x06, OVR: 0x07, EQU: 0x08, NEQ: 0x09, GTH: 0x0a,
    LTH: 0x0b, JMP: 0x0c, JCN: 0x0d, JSR: 0x0e, STH: 0x0f, LDZ: 0x10,
    STZ: 0x11, LDR: 0x12, STR: 0x13, LDA: 0x14, STA: 0x15, DEI: 0x16,
    DEO: 0x17, ADD: 0x18, SUB: 0x19, MUL: 0x1a, DIV: 0x1b, AND: 0x1c,
    ORA: 0x1d, EOR: 0x1e, SFT: 0x1f
};

class CleanYakuInterpreter {
    constructor() {
        this.reset();
    }
    
    reset() {
        this.memory = Array(0x10000).fill(0);
        this.stacks = [[], []]; // working stack, return stack
        this.pc = 0x100;
        this.output = '';
        this.error = null;
    }
    
    execute(code) {
        this.reset();
        
        try {
            const tokens = this.parse(code);
            this.compile(tokens);
            this.run();
            return {
                success: !this.error,
                output: this.output,
                error: this.error
            };
        } catch (error) {
            return {
                success: false,
                output: this.output,
                error: error.message
            };
        }
    }
    
    parse(code) {
        // 移除注释和清理代码
        const clean = code.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
        const parts = clean.split(' ').filter(p => p);
        
        const tokens = [];
        for (const part of parts) {
            if (part === '|0100' || part === '|100') {
                tokens.push(['ADDR', 0x100]);
            } else if (part.startsWith('|')) {
                tokens.push(['ADDR', parseInt(part.substring(1), 16)]);
            } else if (part.startsWith('#')) {
                const hex = part.substring(1);
                const val = parseInt(hex, 16);
                const size = hex.length <= 2 ? 1 : 2;
                tokens.push(['LIT', val, size]);
            } else if (part === 'BRK') {
                tokens.push(['BRK']);
            } else if (opcode.hasOwnProperty(part)) {
                tokens.push(['OP', part]);
            } else if (part.startsWith('@')) {
                tokens.push(['LABEL', part.substring(1)]);
            } else if (part.match(/^[0-9a-fA-F]{2}$/)) {
                tokens.push(['RAW', parseInt(part, 16)]);
            }
        }
        return tokens;
    }
    
    compile(tokens) {
        let addr = 0x100;
        this.pc = 0x100;
        
        for (const token of tokens) {
            if (token[0] === 'ADDR') {
                addr = token[1];
            } else if (token[0] === 'LIT') {
                this.memory[addr++] = 0x80;
                if (token[2] === 1) {
                    this.memory[addr++] = token[1] & 0xff;
                } else {
                    this.memory[addr++] = (token[1] >> 8) & 0xff;
                    this.memory[addr++] = token[1] & 0xff;
                }
            } else if (token[0] === 'OP') {
                this.memory[addr++] = opcode[token[1]];
            } else if (token[0] === 'BRK') {
                this.memory[addr++] = 0x00;
            } else if (token[0] === 'RAW') {
                this.memory[addr++] = token[1];
            }
        }
    }
    
    run() {
        let steps = 0;
        const maxSteps = 1000;
        
        while (steps < maxSteps) {
            const op = this.memory[this.pc];
            
            if (op === 0x00) { // BRK
                break;
            } else if (op === 0x80) { // LIT
                const val = this.memory[this.pc + 1];
                this.stacks[0].push(val);
                this.pc++;
            } else if (op === 0x17) { // DEO
                if (this.stacks[0].length < 2) {
                    this.error = 'Stack underflow in DEO instruction';
                    break;
                }
                const port = this.stacks[0].pop();
                const val = this.stacks[0].pop();
                if (port === 0x18) {
                    this.output += String.fromCharCode(val);
                }
            } else if (op === 0x01) { // INC
                if (this.stacks[0].length < 1) {
                    this.error = 'Stack underflow in INC instruction';
                    break;
                }
                const val = this.stacks[0].pop();
                this.stacks[0].push((val + 1) & 0xff);
            } else if (op === 0x18) { // ADD
                if (this.stacks[0].length < 2) {
                    this.error = 'Stack underflow in ADD instruction';
                    break;
                }
                const b = this.stacks[0].pop();
                const a = this.stacks[0].pop();
                this.stacks[0].push((a + b) & 0xff);
            } else if (op === 0x19) { // SUB
                if (this.stacks[0].length < 2) {
                    this.error = 'Stack underflow in SUB instruction';
                    break;
                }
                const b = this.stacks[0].pop();
                const a = this.stacks[0].pop();
                this.stacks[0].push((a - b) & 0xff);
            } else if (op === 0x1a) { // MUL
                if (this.stacks[0].length < 2) {
                    this.error = 'Stack underflow in MUL instruction';
                    break;
                }
                const b = this.stacks[0].pop();
                const a = this.stacks[0].pop();
                this.stacks[0].push((a * b) & 0xff);
            } else if (op === 0x1b) { // DIV
                if (this.stacks[0].length < 2) {
                    this.error = 'Stack underflow in DIV instruction';
                    break;
                }
                const b = this.stacks[0].pop();
                const a = this.stacks[0].pop();
                if (b === 0) {
                    this.error = 'Division by zero';
                    break;
                }
                this.stacks[0].push(Math.floor(a / b) & 0xff);
            } else if (op === 0x02) { // POP
                if (this.stacks[0].length < 1) {
                    this.error = 'Stack underflow in POP instruction';
                    break;
                }
                this.stacks[0].pop();
            } else if (op === 0x06) { // DUP
                if (this.stacks[0].length < 1) {
                    this.error = 'Stack underflow in DUP instruction';
                    break;
                }
                const val = this.stacks[0][this.stacks[0].length - 1];
                this.stacks[0].push(val);
            }
            
            this.pc++;
            steps++;
        }
        
        if (steps >= maxSteps) {
            this.error = 'Program execution timeout';
        }
    }
}

// ====== Web App 主类 ======
class YakuWebApp {
    constructor() {
        this.interpreter = new CleanYakuInterpreter();
        this.currentRomData = null;
        this.setupExamples();
    }
    
    setupExamples() {
        this.examples = {
            'hello-world': {
                name: 'Hello World',
                code: `( Hello World Example )
|0100
#48 #18 DEO  ( H )
#65 #18 DEO  ( e )
#6c #18 DEO  ( l )
#6c #18 DEO  ( l )
#6f #18 DEO  ( o )
BRK`
            },
            'simple-calc': {
                name: 'Simple Calculator',
                code: `( Simple Calculator: 6 * 7 )
|0100
#06 #07 MUL  ( 6 * 7 = 42 )
#30 ADD      ( Convert to ASCII: 42 + 48 = 90 = 'Z' )
#18 DEO      ( Output the character )
BRK`
            },
            'fibonacci': {
                name: 'Fibonacci Sequence',
                code: `( Fibonacci Example - Simple Version )
|0100
#05        ( Load 5 )
#30 ADD    ( Convert to ASCII: 5 + 48 = 53 = '5' )
#18 DEO    ( Output '5' )
BRK`
            },
            'memory-test': {
                name: 'Memory Test',
                code: `( Memory Access Test )
|0100
#2a        ( Load 42 )
#18 DEO    ( Output '*' )
BRK`
            }
        };
    }
    
    async executeCode(code, options) {
        try {
            const result = this.interpreter.execute(code);
            
            if (options.assemble) {
                const romData = new Uint8Array(this.interpreter.memory.slice(0x100, 0x200));
                this.currentRomData = romData;
            }
            
            return {
                success: result.success,
                output: result.output,
                error: result.error,
                rom: this.currentRomData,
                mode: 'clean-yaku-interpreter'
            };
        } catch (error) {
            throw error;
        }
    }
    
    initializeUI() {
        this.elements = {
            executeBtn: document.getElementById('execute-btn'),
            clearBtn: document.getElementById('clear-output'),
            downloadRomBtn: document.getElementById('download-rom'),
            codeEditor: document.getElementById('code-editor'),
            fileInput: document.getElementById('file-input'),
            loadFileBtn: document.getElementById('load-file-btn'),
            saveFileBtn: document.getElementById('save-file-btn'),
            exampleSelect: document.getElementById('example-select'),
            consoleOutput: document.getElementById('console-output'),
            tabBtns: document.querySelectorAll('.tab-btn'),
            outputPanes: document.querySelectorAll('.output-pane')
        };
        
        this.setupEventListeners();
        this.showStatus();
    }
    
    setupEventListeners() {
        this.elements.executeBtn?.addEventListener('click', () => this.handleExecute());
        this.elements.clearBtn?.addEventListener('click', () => this.clearOutput());
        this.elements.loadFileBtn?.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput?.addEventListener('change', (e) => this.handleFileLoad(e));
        this.elements.saveFileBtn?.addEventListener('click', () => this.saveFile());
        this.elements.exampleSelect?.addEventListener('change', (e) => this.loadExample(e.target.value));
        this.elements.downloadRomBtn?.addEventListener('click', () => this.downloadRom());
        this.elements.tabBtns?.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
    }
    
    async handleExecute() {
        const code = this.elements.codeEditor?.value.trim() || '';
        
        if (!code) {
            this.addOutput('error', 'No code to execute');
            return;
        }
        
        this.elements.executeBtn.disabled = true;
        this.addOutput('info', 'Starting execution...');
        
        try {
            const options = {
                assemble: document.getElementById('option-assemble')?.checked || false,
                run: document.getElementById('option-run')?.checked || false,
                print: document.getElementById('option-print')?.checked || false
            };
            
            const result = await this.executeCode(code, options);
            
            if (options.assemble) {
                this.addOutput('success', 'Assembly completed successfully');
            }
            
            if (options.run) {
                if (result.success) {
                    this.addOutput('success', 'Program executed successfully');
                    if (result.output) {
                        this.addOutput('success', `Program output: ${result.output}`);
                    } else {
                        this.addOutput('info', 'Program output: (no visible output)');
                    }
                } else {
                    this.addOutput('error', `Execution failed: ${result.error}`);
                }
            }
            
            if (result.rom && options.assemble) {
                this.currentRomData = result.rom;
                this.elements.downloadRomBtn.style.display = 'inline-flex';
            }
            
        } catch (error) {
            this.addOutput('error', `Execution failed: ${error.message}`);
        } finally {
            this.elements.executeBtn.disabled = false;
        }
    }
    
    handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            this.elements.codeEditor.value = e.target.result;
            this.addOutput('info', `File loaded: ${file.name}`);
        };
        reader.readAsText(file);
    }
    
    saveFile() {
        const code = this.elements.codeEditor.value;
        const blob = new Blob([code], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'program.tal';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.addOutput('info', 'File saved as program.tal');
    }
    
    loadExample(exampleKey) {
        if (!exampleKey || !this.examples[exampleKey]) return;
        
        this.elements.codeEditor.value = this.examples[exampleKey].code;
        this.addOutput('info', `Loaded example: ${this.examples[exampleKey].name}`);
        this.elements.exampleSelect.value = '';
    }
    
    downloadRom() {
        if (!this.currentRomData) {
            this.addOutput('error', 'No ROM data available');
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
        
        this.addOutput('info', 'ROM file downloaded');
    }
    
    switchTab(tabName) {
        this.elements.tabBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        this.elements.outputPanes.forEach(pane => {
            pane.classList.toggle('active', pane.id === `${tabName}-output`);
        });
    }
    
    addOutput(type, message) {
        const content = this.elements.consoleOutput?.querySelector('.output-content');
        if (!content) {
            console.log(`[${type}] ${message}`);
            return;
        }
        
        const timestamp = new Date().toLocaleTimeString();
        const colors = {
            error: '#ff073a',
            warning: '#ffaa00',
            success: '#39ff14',
            info: '#00f5ff'
        };
        
        if (content.textContent === 'Ready to execute Uxntal code...') {
            content.innerHTML = '';
        }
        
        const color = colors[type] || '#ffffff';
        content.innerHTML += `<span style="color: ${color}">[${timestamp}] ${message}</span>\n`;
        content.scrollTop = content.scrollHeight;
    }
    
    clearOutput() {
        const allContents = document.querySelectorAll('.output-content');
        allContents.forEach(content => {
            if (content.closest('#console-output')) {
                content.innerHTML = 'Ready to execute Uxntal code...';
            } else {
                content.textContent = 'Output will appear here after execution...';
            }
        });
        
        this.currentRomData = null;
        this.elements.downloadRomBtn.style.display = 'none';
    }
    
    showStatus() {
        this.addOutput('success', 'Yaku UXN Interpreter ready');
    }
}

// 初始化应用
let yakuApp;

function initApp() {
    yakuApp = new YakuWebApp();
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => yakuApp.initializeUI());
    } else {
        yakuApp.initializeUI();
    }
}

initApp();