"use strict";

// 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

// 全局标志变量 - 对应Perl中的our变量
export let WRS = 0;   // working and return stack
export let PQ = 0;    // print and quit  
export let WW = 0;    // fewer warning and error messages
export let IN = 0;    // input from stdin
export let EE = 0;    // turn all warnings into errors
export let FF = 0;    // fatal, die on the first error
export let NSW = 0;   // no warnings for byte/short mismatch

// 提供设置函数，供主程序调用
export function setWRS(value) { WRS = value; }
export function setPQ(value) { PQ = value; }
export function setWW(value) { WW = value; }
export function setIN(value) { IN = value; }
export function setEE(value) { EE = value; }
export function setFF(value) { FF = value; }
export function setNSW(value) { NSW = value; }