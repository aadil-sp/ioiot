import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Cpu } from 'lucide-react';
import { ThemeContext } from '../App';

// The ESP32-C3 simulator (public/esp32c3-sim.html) in a sandboxed frame.
// With `code` it runs that sketch (the Web Editor's); without it the simulator shows its own editor.
// The circuit is kept in this browser under `storageKey`.
export default function Esp32Simulator({ code, onCode, onClose, storageKey = 'ioiot.sim.project', title }) {
    const { dark } = useContext(ThemeContext);
    const frame = useRef(null);
    const embedded = code !== undefined;
    // Loaded as srcdoc into a sandboxed frame: its scripts get an opaque origin, so a sketch can't
    // reach this site's login or storage
    const [html, setHtml] = useState(null);
    useEffect(() => { fetch('/esp32c3-sim.html').then(r => r.text()).then(setHtml).catch(() => setHtml('<p style="font:14px system-ui;color:#c00">Couldn\'t load the simulator.</p>')); }, []);

    useEffect(() => {
        const load = () => {
            let project;
            try { project = JSON.parse(localStorage.getItem(storageKey)); } catch { }
            frame.current?.contentWindow?.postMessage({
                type: 'load', theme: dark ? 'dark' : 'light', title: title || 'ESP32-C3 Simulator',
                code: embedded ? code : undefined, project: project || undefined, template: project ? undefined : 'blink',
                showEditor: !embedded, autorun: embedded
            }, '*');
        };
        const onMessage = (e) => {
            if (e.source !== frame.current?.contentWindow) return;
            const d = e.data || {};
            if (d.type === 'sim-ready') load();
            if (d.type === 'sim-project') try { localStorage.setItem(storageKey, JSON.stringify(d.project)); } catch { }
            if (d.type === 'sim-code' && onCode) onCode(d.code);
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
        // load once per open; later code changes are sent below
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    useEffect(() => { frame.current?.contentWindow?.postMessage({ type: 'theme', theme: dark ? 'dark' : 'light' }, '*'); }, [dark]);

    const iframe = html === null
        ? <div className="w-full h-full flex items-center justify-center text-sm font-mono opacity-60">Loading simulator…</div>
        : <iframe ref={frame} title="ESP32-C3 simulator" srcDoc={html} sandbox="allow-scripts" className="w-full h-full border-0" />;
    if (!onClose) return iframe;
    // On document.body so it sits above the site's top bar
    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-2 sm:p-6" role="dialog" aria-label="ESP32-C3 simulator">
            <div className={`w-full h-full max-w-[1500px] flex flex-col rounded-2xl overflow-hidden border shadow-2xl ${dark ? 'bg-[#0f1216] border-[#252535]' : 'bg-white border-gray-200'}`}>
                <div className={`flex items-center gap-2 px-4 py-2 border-b text-sm font-mono ${dark ? 'border-[#252535] text-white' : 'border-gray-200 text-gray-900'}`}>
                    <Cpu className="w-4 h-4 text-orange-500" />
                    <span className="font-bold">Simulator</span>
                    <span className={`text-xs ${dark ? 'text-gray-500' : 'text-gray-400'}`}>Runs in your browser — nothing is uploaded</span>
                    <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-black/10" aria-label="Close simulator"><X className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 min-h-0">{iframe}</div>
            </div>
        </div>,
        document.body
    );
}
