"use strict";

// Version of this module
export const VERSION = "1.0.0";

// Constants from environment variables (Node.js specific)
const VV = parseInt(process.env.YAKU_VERBOSE || '0', 10);

// Imports from other Yaku modules
import { WRS, EE, WW, NSW } from '../Flags.js';
import {
    stack_operations, // Object/Map
    bin_ops,          // Object/Map
    LIT, INSTR, REF   // Constants
} from './Definitions.js';
import { loadToken } from './Encoder.js';
import {
    unsignedBytesToUnsignedShort,
    unsignedShortToUnsignedBytes
} from '../IntegerFormatConversions.js';
import { prettyPrintToken, toHex } from './PrettyPrint.js';
import { getLineForToken } from './ErrorChecking.js';

// Assuming Yaku::Uxntal::Actions exports an object `callInstr`
import { callInstr } from './Actions.js';

// Global warning tracker (Perl's %warnings = () is a package variable)
const warnings = {}; // Used to warn only once for specific size mismatches.

/**
 * Runs the Uxn program stored in the Uxn virtual machine's memory.
 * @param {object} uxn - The Uxn virtual machine state object.
 * @returns {void} The program execution terminates (or throws an error).
 * @throws {Error} If no main program is found, program counter exceeds memory,
 * or an unhandled error occurs during instruction execution.
 */
export function runProgram(uxn) {
    if (!uxn.hasOwnProperty('hasMain') || uxn.hasMain === 0) {
        throw new Error("There is no main program (|0100) in this source file, nothing to run.\n");
    }

    if (VV === 2) {
        console.log('*** RUNNING ***');
    }

    uxn.pc = 0x100; // All programs must start at 0x100
    const word_sz = 1; // Default word size
    let current_parent = 'MAIN';
    const call_stack = ['MAIN'];

    while (true) {
        if (uxn.pc > 0xffff) {
            throw new Error("Program counter reached end of memory.\n");
        }

        const token = loadToken(word_sz, uxn, uxn.pc);

        // Handle different token types
        switch (token[0]) {
            case LIT:
                throw new Error(`Should no longer happen! Token: ${JSON.stringify(token)}`);
            case INSTR:
                // Handle call stack tracking for jumps and calls
                if (token[1] === 'JSR' && token[2] === 2 && token[3] === 0) { // JSR2
                    if (uxn.reverseSymbolTable.hasOwnProperty(uxn.pc - 3)) {
                        current_parent = prettyPrintToken(uxn.reverseSymbolTable[uxn.pc - 3][0]);
                        call_stack.push(current_parent);
                    } else {
                        current_parent = '<lambda>';
                        call_stack.push(current_parent);
                    }
                } else if (token[1] === 'JSI') { // JSI
                    if (uxn.reverseSymbolTable.hasOwnProperty(uxn.pc + 1)) {
                        current_parent = prettyPrintToken(uxn.reverseSymbolTable[uxn.pc + 1][0]);
                        call_stack.push(current_parent);
                    }
                } else if (token[1] === 'JMP' && token[2] === 2 && token[3] === 0) { // JMP2
                    if (uxn.reverseSymbolTable.hasOwnProperty(uxn.pc - 3)) {
                        current_parent = prettyPrintToken(uxn.reverseSymbolTable[uxn.pc - 3][0]);
                    }
                } else if (token[1] === 'JMI') { // JMI
                    if (uxn.reverseSymbolTable.hasOwnProperty(uxn.pc + 1)) {
                        current_parent = prettyPrintToken(uxn.reverseSymbolTable[uxn.pc + 1][0]);
                    }
                }

                // Handle returns
                if (token[1] === 'JMP' && token[2] === 2 && token[3] === 1) { // JMP2r
                    call_stack.pop();
                    current_parent = call_stack[call_stack.length - 1];
                } else if (token[1] === 'JMP' && token[2] === 2 && token[3] === 0) { // JMP2 (tail call check)
                    const prev_token = loadToken(word_sz, uxn, uxn.pc - 1);
                    if (prev_token && prev_token[1] === 'STH' && prev_token[2] === 2 && prev_token[3] === 1) {
                        call_stack.pop();
                        current_parent = call_stack[call_stack.length - 1];
                    }
                }

                executeInstr(token, uxn, current_parent);
                break;
        }

        uxn.pc++;
    }
}

/**
 * Executes a single Uxn instruction.
 */
function executeInstr(token, uxn, current_parent) {
    const [, instr, sz, rs, keep] = token;

    if (instr === 'BRK') {
        if (VV === 1) {
            console.log('\n*** DONE *** ');
        } else {
            console.log('');
        }
        if (VV === 2) {
            console.log(`BRK PC:${uxn.pc} (WS,RS) ${JSON.stringify(uxn.stacks)}`);
        }
        if (WRS) {
            showStacks(uxn);
        }
        throw new Error('BRK instruction executed. Program terminated.');
    }

    const instructionDetails = callInstr[instr];
    if (!instructionDetails) {
        throw new Error(`Unknown instruction: ${prettyPrintToken(token)} at PC ${uxn.pc} in ${current_parent} ${getLineForToken(token, uxn)}`);
    }

    const [action, nArgs, hasRes] = instructionDetails;

    if (nArgs === 0) { // Stack manipulation instructions
        if (VV === 2) {
            console.log(`EXEC STACK MANIP INSTR: ${prettyPrintToken(token)} @PC ${uxn.pc}`);
            console.log(` (WS,RS) ${JSON.stringify(uxn.stacks)}`);
        }
        uxn = conditionStack(token, uxn, current_parent);
        action(rs, sz, uxn, keep);
    } else { // Instructions that take arguments from stack
        const args = getArgsFromStack(token, instr, nArgs, sz, rs, keep, uxn, current_parent);

        if (VV === 2) {
            console.log(`EXEC INSTR: ${prettyPrintToken(token)} with args ${JSON.stringify(args)}`);
            console.log(`STACKS: (WS,RS) ${JSON.stringify(uxn.stacks)}`);
        }
        if (hasRes) {
            const res = action(args, sz, uxn);

            // Special handling for comparison results
            if (instr === 'EQU' || instr === 'NEQ' || instr === 'LTH' || instr === 'GTH') {
                uxn.stacks[rs].push([res, 1]);
            } else {
                uxn.stacks[rs].push([res, sz]);
            }
        } else {
            action(args, sz, uxn);
        }
    }

    // Handle warnings generated during execution
    if (uxn.hasOwnProperty('warning')) {
        console.error(`${uxn.warning}: ${prettyPrintToken(token)} in ${current_parent}${getLineForToken(token, uxn)}`);
        delete uxn.warning;
        if (EE) {
            throw new Error(`Execution error due to warning becoming an error: ${prettyPrintToken(token)}`);
        }
    }

    if (VV === 2) {
        console.log(`AFTER INSTR ${instr}${sz === 2 ? '2' : ''}: PC:${uxn.pc}=>${JSON.stringify(uxn.memory[uxn.pc])}; (WS,RS) ${JSON.stringify(uxn.stacks)}`);
    }
}

/**
 * Retrieves arguments for an instruction from the current stack.
 */
function getArgsFromStack(token, instr, nArgs, sz, rs, keep, uxn, current_parent) {
    const args = [];
    const keep_args = [];

    if (VV === 2) {
        console.log(`NARGS for INSTR: ${prettyPrintToken(token)}: ${nArgs}`);
    }

    for (let i = 0; i < nArgs; i++) {
        if (uxn.stacks[rs].length === 0) {
            console.error(`Error: Stack underflow for ${prettyPrintToken(token)} in ${current_parent}${getLineForToken(token, uxn)}`);
            throw new Error(`Stack underflow for ${prettyPrintToken(token)}`);
        }

        let arg_val, arg_sz;

        // Special handling for argument sizes based on instruction
        if (instr === 'LDA' || instr === 'STA') {
            [arg_val, arg_sz] = (i === 0)
                ? _getShortArg(token, uxn, current_parent)
                : (sz === 2)
                    ? _getShortArg(token, uxn, current_parent)
                    : _getByteArg(token, uxn, current_parent);
        } else if (instr.startsWith('LD') || instr.startsWith('ST') || instr === 'DEI') {
            [arg_val, arg_sz] = (i === 0)
                ? _getByteArg(token, uxn, current_parent)
                : (sz === 2)
                    ? _getShortArg(token, uxn, current_parent)
                    : _getByteArg(token, uxn, current_parent);
        } else if (instr === 'JCN') {
            [arg_val, arg_sz] = (i === 1)
                ? _getByteArg(token, uxn, current_parent)
                : (sz === 2)
                    ? _getShortArg(token, uxn, current_parent)
                    : _getByteArg(token, uxn, current_parent);
        } else if (instr === 'JCI') {
            [arg_val, arg_sz] = _getByteArg(token, uxn, current_parent);
        } else if (instr === 'SFT' || instr === 'DEO') {
            [arg_val, arg_sz] = (i === 0)
                ? _getByteArg(token, uxn, current_parent)
                : (sz === 2)
                    ? _getShortArg(token, uxn, current_parent)
                    : _getByteArg(token, uxn, current_parent);
        } else {
            [arg_val, arg_sz] = (sz === 2)
                ? _getShortArg(token, uxn, current_parent)
                : _getByteArg(token, uxn, current_parent);
        }

        args.push(arg_val);
        if (keep) {
            keep_args.push([arg_val, arg_sz]);
        }
    }

    if (keep) {
        for (let i = keep_args.length - 1; i >= 0; i--) {
            uxn.stacks[rs].push(keep_args[i]);
        }
    }

    return args;
}

/**
 * Helper function to extend a byte argument with an extra byte from the stack.
 */
function _extendWithExtraByte(arg1_token, token, uxn, current_parent) {
    const [, , , rs] = token;
    const arg1_val = arg1_token[0];

    if (uxn.stacks[rs].length === 0) {
        console.error(`Error: Stack underflow for ${prettyPrintToken(token)} in ${current_parent}${getLineForToken(token, uxn)}`);
        throw new Error(`Stack underflow for ${prettyPrintToken(token)}`);
    }
    const arg2_token = uxn.stacks[rs].pop();

    let arg_val;
    let split_short = 0;

    if (arg2_token[1] === 1) {
        arg_val = unsignedBytesToUnsignedShort(arg2_token[0], arg1_val);
    } else {
        split_short = 1;
        const [hi_byte2, lo_byte2] = unsignedShortToUnsignedBytes(arg2_token[0]);
        uxn.stacks[rs].push([hi_byte2, 1]);
        arg_val = unsignedBytesToUnsignedShort(lo_byte2, arg1_val);
    }
    return [arg_val, split_short];
}

/**
 * Pops a byte argument from the current stack.
 */
function _getByteArg(token, uxn, current_parent) {
    const [, instr, , rs] = token;
    const arg_token = uxn.stacks[rs].pop();

    let arg_val;
    if (arg_token[1] === 2) {
        if (instr !== 'DEO' && !bin_ops.hasOwnProperty(instr)) {
            warnSizeMismatch(token, uxn, current_parent, 1);
        }
        const [, lo_byte] = unsignedShortToUnsignedBytes(arg_token[0]);
        uxn.stacks[rs].push([unsignedShortToUnsignedBytes(arg_token[0])[0], 1]);
        arg_val = lo_byte;
    } else {
        arg_val = arg_token[0];
    }
    return [arg_val, 1];
}

/**
 * Pops a short argument from the current stack.
 */
function _getShortArg(token, uxn, current_parent) {
    const [, , , rs] = token;
    const arg_token = uxn.stacks[rs].pop();

    let arg_val;
    if (arg_token[1] === 1) {
        const [extended_val, split_short] = _extendWithExtraByte(arg_token, token, uxn, current_parent);
        if (split_short) {
            warnSizeMismatch(token, uxn, current_parent, 0);
        }
        arg_val = extended_val;
    } else {
        arg_val = arg_token[0];
    }
    return [arg_val, 2];
}

/**
 * Pre-conditions the stack for stack manipulation instructions.
 */
function conditionStack(token, uxn, current_parent) {
    const [, instr, sz, rs] = token;

    if (!stack_operations.hasOwnProperty(instr)) {
        return uxn;
    }

    const [nBytesNeeded_raw, hasResult_raw] = stack_operations[instr];
    const nBytesNeeded = nBytesNeeded_raw * sz;
    let nBytesGot = 0;
    const eltsForInstr = [];

    while (nBytesGot < nBytesNeeded) {
        if (uxn.stacks[rs].length === 0) {
            console.error(`Error: Stack underflow, got ${nBytesGot}, need ${nBytesNeeded} for ${prettyPrintToken(token)} in ${current_parent}${getLineForToken(token, uxn)}`);
            throw new Error(`Stack underflow for ${prettyPrintToken(token)}`);
        }
        let elt = uxn.stacks[rs].pop();

        nBytesGot += elt[1];

        if (nBytesGot > nBytesNeeded) {
            const [hi_byte, lo_byte] = unsignedShortToUnsignedBytes(elt[0]);
            uxn.stacks[rs].push([hi_byte, 1]);
            nBytesGot -= 1;
            elt = [lo_byte, 1];
        }

        if (sz === 2 && elt[1] === 1) {
            warnSizeMismatch(token, uxn, current_parent, 0);
            const lo_byte = elt[0];
            let hi_byte = 0;

            if (uxn.stacks[rs].length === 0) {
                console.error(`Error: Stack underflow, got ${nBytesGot}, need ${nBytesNeeded} for ${prettyPrintToken(token)} in ${current_parent}${getLineForToken(token, uxn)}`);
                throw new Error(`Stack underflow for ${prettyPrintToken(token)}`);
            }
            const elt2 = uxn.stacks[rs].pop();
            nBytesGot += elt2[1];

            if (elt2[1] === 1) {
                hi_byte = elt2[0];
            } else {
                const [hi_byte2, lo_byte2] = unsignedShortToUnsignedBytes(elt2[0]);
                uxn.stacks[rs].push([hi_byte2, 1]);
                nBytesGot -= 1;
                hi_byte = lo_byte2;
            }
            const elt_val = unsignedBytesToUnsignedShort(hi_byte, lo_byte);
            eltsForInstr.unshift([elt_val, 2]);
        } else if (sz === 1 && elt[1] === 2) {
            warnSizeMismatch(token, uxn, current_parent, 1);
            const [hi_byte, lo_byte] = unsignedShortToUnsignedBytes(elt[0]);
            eltsForInstr.unshift([lo_byte, 1]);
            uxn.stacks[rs].push([hi_byte, 1]);
            nBytesGot -= 1;
        } else {
            eltsForInstr.unshift(elt);
        }
    }
    
    uxn.stacks[rs] = [...uxn.stacks[rs], ...eltsForInstr];
    return uxn;
}

/**
 * Issues a size mismatch warning if not suppressed by flags.
 */
function warnSizeMismatch(token, uxn, current_parent, sb) {
    let warning_line_key = prettyPrintToken(token);
    warning_line_key += `_${current_parent}${getLineForToken(token, uxn)}`;
    warning_line_key = warning_line_key.replace(/:\s*.+$/, '');
    warning_line_key = warning_line_key.replace(/\son\sline\s/g, '_');
    warning_line_key = warning_line_key.replace(/\sof\s/g, '_');
    warning_line_key = warning_line_key.replace(/\.tal$/, '');

    if (!warnings.hasOwnProperty(warning_line_key)) {
        warnings[warning_line_key] = 1;

        if (!(WW || NSW)) {
            const message = sb === 1
                ? 'short, instruction expects byte'
                : 'byte, instruction expects short';
            console.error(`Warning: value on stack is ${message}: ${prettyPrintToken(token)} in ${current_parent}${getLineForToken(token, uxn)}`);
            if (EE) {
                throw new Error(`Execution error (due to size mismatch warning becoming error): ${prettyPrintToken(token)}`);
            }
        }
    }
}

/**
 * Prints the current state of the working and return stacks.
 */
function showStacks(uxn) {
    console.error('Working Stack: [');
    for (const t of uxn.stacks[0]) {
        console.error(`\t${toHex(t[0], t[1])}\t(${t[1] === 1 ? 'byte' : 'short'} ${t[0]})`);
    }
    console.error('\t]');
    console.error('Return Stack: [');
    for (const t of uxn.stacks[1]) {
        console.error(`\t${toHex(t[0], t[1])}\t(${t[1] === 1 ? 'byte' : 'short'} ${t[0]})`);
    }
    console.error('\t]');
}