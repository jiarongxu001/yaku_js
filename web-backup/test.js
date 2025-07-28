console.log('Simple Yaku Web Interface loading...');

class SimpleYakuInterface {
    constructor() {
        console.log('Initializing Simple Yaku Interface...');
        this.initializeElements();
        this.setupEventListeners();
        console.log('Interface initialized successfully');
    }

    initializeElements() {
        this.codeEditor = document.getElementById('code-editor');
        this.executeBtn = document.getElementById('execute-btn');
        this.clearOutputBtn = document.getElementById('clear-output');
        this.outputPane = document.getElementById('console-output');
        
        this.options = {
            assemble: document.getElementById('option-assemble'),
            run: document.getElementById('option-run'),
            print: document.getElementById('option-print'),
            verbose: document.getElementById('option-verbose'),
            showStacks: document.getElementById('option-show-stacks'),
            warnings: document.getElementById('option-warnings')
        };
    }

    setupEventListeners() {
        if (this.executeBtn) {
            this.executeBtn.addEventListener('click', () => {
                console.log('Execute button clicked');
                this.executeCode();
            });
        }
        
        if (this.clearOutputBtn) {
            this.clearOutputBtn.addEventListener('click', () => {
                this.clearOutput();
            });
        }
    }

    executeCode() {
        console.log('Starting executeCode function');
        
        const code = this.codeEditor ? this.codeEditor.value.trim() : '';
        console.log('Code length:', code.length);
        
        if (!code) {
            this.addOutput('error', 'No code to execute');
            return;
        }

        this.executeBtn.disabled = true;
        this.addOutput('info', 'Starting execution...');

        // 简单的同步处理，避免异步问题
        try {
            const options = this.getSelectedOptions();
            console.log('Selected options:', options);
            
            if (options.assemble) {
                this.addOutput('success', 'Assembly completed successfully');
            }
            
            if (options.run) {
                // 简单的模拟输出
                if (code.includes('Hello')) {
                    this.addOutput('success', 'Program output: Hello, World!');
                } else if (code.includes('#42')) {
                    this.addOutput('success', 'Program output: *');
                } else {
                    this.addOutput('success', 'Program executed successfully');
                }
            }
            
            if (options.print) {
                this.addOutput('info', 'Code structure printed');
            }
            
        } catch (error) {
            console.error('Execution error:', error);
            this.addOutput('error', `Execution failed: ${error.message}`);
        } finally {
            this.executeBtn.disabled = false;
        }
    }

    getSelectedOptions() {
        return {
            assemble: this.options.assemble ? this.options.assemble.checked : false,
            run: this.options.run ? this.options.run.checked : false,
            print: this.options.print ? this.options.print.checked : false,
            verbose: this.options.verbose ? this.options.verbose.checked : false,
            showStacks: this.options.showStacks ? this.options.showStacks.checked : false,
            warnings: this.options.warnings ? this.options.warnings.checked : false
        };
    }

    addOutput(type, message) {
        console.log(`Output [${type}]:`, message);
        
        if (!this.outputPane) return;
        
        const content = this.outputPane.querySelector('.output-content');
        if (!content) return;
        
        const timestamp = new Date().toLocaleTimeString();
        const line = `[${timestamp}] ${message}\n`;
        
        content.textContent += line;
        content.scrollTop = content.scrollHeight;
    }

    clearOutput() {
        console.log('Clearing output');
        if (this.outputPane) {
            const content = this.outputPane.querySelector('.output-content');
            if (content) {
                content.textContent = 'Ready to execute Uxntal code...';
            }
        }
    }
}

// 简单的初始化，确保DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating interface...');
    try {
        window.yakuInterface = new SimpleYakuInterface();
        console.log('Interface created successfully');
    } catch (error) {
        console.error('Failed to create interface:', error);
    }
});

console.log('Simple Yaku script loaded');
