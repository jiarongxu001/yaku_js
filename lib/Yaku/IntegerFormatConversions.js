"use strict";

// 对应 $VERSION = "1.0.0"
const VERSION = "1.0.0";

// 对应 sub signedShortToBytes2sComp($short)
export function signedShortToBytes2sComp(short) {
    if (short < 0) {
        short = 0x10000 + short; // 2's complement
    }
    return [(short >> 8), (short & 0xff)];
}

// 对应 sub bytes2sCompToSignedShort($hib,$lob)
export function bytes2sCompToSignedShort(hib, lob) {
    const short_2sc = (hib << 8) + lob;
    return (short_2sc < 0x8000) ? short_2sc : 0x10000 - short_2sc;
}

// 对应 sub signedByteToByte2sComp($byte)
export function signedByteToByte2sComp(byte) {
    return (byte < 0) ? 0x100 + byte : byte; // 2's complement
}

// 对应 sub byte2sCompToSignedByte($byte)
export function byte2sCompToSignedByte(byte) {
    return (byte < 0x80) ? byte : byte - 0x100;
}

// 对应 sub bytes2sCompToShort2sComp($hib,$lob)
export function bytes2sCompToShort2sComp(hib, lob) {
    if (lob === 'POP') {
        throw new Error("Invalid argument: lob cannot be 'POP'");
    }
    return (hib << 8) + lob;
}

// 对应 sub short2sComptToBytes2sComp($short)
export function short2sComptToBytes2sComp(short) {
    return [(short >> 8), (short & 0xff)];
}

// 对应 sub unsignedShortToUnsignedBytes($short)
export function unsignedShortToUnsignedBytes(short) {
    // This is identical to the above
    return [(short >> 8), (short & 0xff)];
}

// 对应 sub unsignedBytesToUnsignedShort($hib,$lob)
export function unsignedBytesToUnsignedShort(hib, lob) {
    return (hib << 8) + lob;
}

// 对应 sub signedShortToShort2sComp($short)
export function signedShortToShort2sComp(short) {
    return (short < 0) ? 0x10000 + short : short; // 2's complement
}

// 对应 sub short2sCompToSignedShort($short)
export function short2sCompToSignedShort(short) {
    return (short < 0x8000) ? short : short - 0x10000;
}