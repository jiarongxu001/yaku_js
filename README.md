# Yaku JavaScript

A complete JavaScript port of the Yaku Uxntal assembler and interpreter.

## Overview

Yaku is an assembler and interpreter for Uxntal, the assembly language for the Uxn virtual machine. This project is a faithful JavaScript port of the original Perl implementation.

## Features

-  Complete Uxntal assembler - Parse and assemble .tal files to .rom
-  Full Uxn interpreter - Execute Uxntal programs with virtual machine  
-  Debug support - Detailed execution tracing and stack inspection
-  Error checking - Comprehensive syntax and type checking
-  97.1% test compatibility - 137 out of 141 test programs pass

## Quick Start

```bash
# Assemble a Uxntal program
node bin/yaku.js -a program.tal

# Run a Uxntal program  
node bin/yaku.js -r program.tal

# Show help
node bin/yaku.js -h