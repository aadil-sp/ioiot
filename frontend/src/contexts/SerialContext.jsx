/**
 * SerialContext.jsx
 * Global Web Serial API connection — persists across tab navigation.
 * - Single connect/disconnect per browser session
 * - Auto-reconnect on mount if previously connected
 * - Exposes send(), connect(), disconnect(), serialLog, serialConnected
 */
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

const SerialContext = createContext(null);

export function SerialProvider({ children }) {
    const [serialConnected, setSerialConnected] = useState(false);
    const [serialLog, setSerialLog] = useState([]);
    const [baudRate, setBaudRate] = useState(() => parseInt(localStorage.getItem('serialBaudRate') || '115200'));
    const [autoConnecting, setAutoConnecting] = useState(false);

    const portRef = useRef(null);
    const readerRef = useRef(null);
    const bufferRef = useRef('');

    // Callback subscribers for incoming data (key=value JSON from Arduino)
    const dataHandlersRef = useRef([]);

    const addLog = useCallback((text, type = 'sys') => {
        setSerialLog(prev => [...prev.slice(-500), {
            type, text, time: new Date().toLocaleTimeString()
        }]);
    }, []);

    const startReading = useCallback(async (port) => {
        const decoder = new TextDecoder();
        const reader = port.readable.getReader();
        readerRef.current = reader;
        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                bufferRef.current += decoder.decode(value, { stream: true });
                const lines = bufferRef.current.split('\n');
                bufferRef.current = lines.pop();
                lines.forEach(line => {
                    const trimmed = line.trim();
                    if (!trimmed) return;
                    addLog(trimmed, 'rx');
                    // Try to parse JSON responses from Arduino
                    try {
                        const parsed = JSON.parse(trimmed);
                        dataHandlersRef.current.forEach(fn => fn(parsed));
                    } catch { }
                });
            }
        } catch (e) {
            // disconnected / cancelled
        }
    }, [addLog]);

    const connect = useCallback(async ({ requestNew = true, baud } = {}) => {
        const rate = baud || baudRate;
        if (!('serial' in navigator)) {
            addLog('✗ Web Serial not supported. Use Chrome or Edge.', 'error');
            return false;
        }
        try {
            let port;
            if (requestNew) {
                port = await navigator.serial.requestPort();
            } else {
                const ports = await navigator.serial.getPorts();
                if (ports.length === 0) return false;
                port = ports[0];
            }
            await port.open({ baudRate: rate });
            portRef.current = port;
            setSerialConnected(true);
            localStorage.setItem('serialAutoConnect', 'true');
            localStorage.setItem('serialBaudRate', String(rate));
            addLog(`✓ Connected at ${rate} baud`);
            startReading(port);
            return true;
        } catch (e) {
            if (e.name !== 'NotFoundError') addLog(`✗ ${e.message}`, 'error');
            return false;
        }
    }, [baudRate, addLog, startReading]);

    const disconnect = useCallback(async () => {
        try {
            if (readerRef.current) { await readerRef.current.cancel(); readerRef.current = null; }
            if (portRef.current) { await portRef.current.close(); portRef.current = null; }
        } catch { }
        setSerialConnected(false);
        localStorage.removeItem('serialAutoConnect');
        addLog('× Disconnected');
    }, [addLog]);

    const send = useCallback(async (data) => {
        if (!portRef.current || !serialConnected) return;
        try {
            const writer = portRef.current.writable.getWriter();
            const encoded = new TextEncoder().encode(
                typeof data === 'object' ? JSON.stringify(data) + '\n' : String(data)
            );
            await writer.write(encoded);
            writer.releaseLock();
            addLog(typeof data === 'object' ? JSON.stringify(data) : data.trim(), 'tx');
        } catch (e) {
            addLog(`✗ Send failed: ${e.message}`, 'error');
        }
    }, [serialConnected, addLog]);

    // Subscribe to incoming parsed JSON data
    const onData = useCallback((handler) => {
        dataHandlersRef.current.push(handler);
        return () => {
            dataHandlersRef.current = dataHandlersRef.current.filter(h => h !== handler);
        };
    }, []);

    // Auto-connect on mount if previously connected
    useEffect(() => {
        if ('serial' in navigator && localStorage.getItem('serialAutoConnect') === 'true') {
            setAutoConnecting(true);
            setTimeout(async () => {
                const ok = await connect({ requestNew: false });
                if (!ok) localStorage.removeItem('serialAutoConnect');
                setAutoConnecting(false);
            }, 800);
        }
    }, []);

    return (
        <SerialContext.Provider value={{
            serialConnected, serialLog, setSerialLog,
            baudRate, setBaudRate,
            connect, disconnect, send, addLog, onData,
            autoConnecting,
            portRef
        }}>
            {children}
        </SerialContext.Provider>
    );
}

export const useSerial = () => {
    const ctx = useContext(SerialContext);
    if (!ctx) throw new Error('useSerial must be used within SerialProvider');
    return ctx;
};
