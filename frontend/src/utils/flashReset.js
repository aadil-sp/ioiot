// Helpers for USB flashing with esptool-js.

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// esptool-js 0.5.7's after('hard_reset') only releases RTS and never pulses it, so the chip stayed
// in the flasher after an upload. Pulse RTS with DTR (BOOT) released, like esptool.py, to start the new code.
export async function resetToApp(transport) {
    await transport.setDTR(false);
    await transport.setRTS(true);
    await wait(200);
    await transport.setRTS(false);
    await wait(200);
}

// Arduino writes boot_app0 at 0xe000. Without it, a board that had a Wi-Fi (OTA) update keeps booting
// that older app, so send an erased otadata block when the compile server didn't include one.
export function withOtaData(fileArray) {
    if (fileArray.some(f => f.address === 0xe000) || !fileArray.some(f => f.address === 0x10000)) return fileArray;
    return [...fileArray, { address: 0xe000, data: '\xff'.repeat(0x2000) }];
}
