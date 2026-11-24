// Arduino C++ → JavaScript for the simulator.
//
// Not a compiler: it rewrites the C++ students write (globals, functions, loops, arrays, Strings,
// library objects like Servo or WebServer, lambdas) into async JavaScript that runs against the
// simulated board. Every token keeps the whitespace in front of it, so line numbers stay the same
// and errors can point at the student's own line.
(function (root) {
    const TYPE_WORDS = new Set(['void', 'int', 'long', 'short', 'char', 'bool', 'boolean', 'byte', 'word', 'float', 'double',
        'unsigned', 'signed', 'const', 'static', 'volatile', 'constexpr', 'inline', 'register', 'extern', 'auto',
        'uint8_t', 'uint16_t', 'uint32_t', 'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'size_t', 'String', 'PROGMEM',
        'IRAM_ATTR', 'ICACHE_RAM_ATTR', 'ARDUINO_ISR_ATTR']);
    const INT_TYPES = new Set(['int', 'long', 'short', 'byte', 'word', 'unsigned', 'signed', 'uint8_t', 'uint16_t', 'uint32_t',
        'uint64_t', 'int8_t', 'int16_t', 'int32_t', 'int64_t', 'size_t']);
    // Library classes the simulator implements (anything else unknown becomes a do-nothing stand-in)
    const KNOWN_CLASSES = new Set(['Servo', 'WebServer', 'DHT', 'DHTesp', 'IPAddress', 'NewPing', 'Preferences', 'HTTPClient',
        'WiFiClient', 'WiFiClientSecure', 'ESP32PWM']);
    // Calls that take time on the board, so the sketch has to wait for them
    const WAITING_CALLS = new Set(['delay', 'delayMicroseconds', 'pulseIn', 'pulseInLong', '__yield']);
    const WAITING_METHODS = new Set(['readString', 'readStringUntil', 'parseInt', 'parseFloat', 'handleClient', 'readBytesUntil', 'GET', 'POST']);
    const STATEMENT_START = new Set([';', '{', '}', null]);
    const KEYWORDS = new Set(['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'return', 'break', 'continue',
        'new', 'delete', 'sizeof', 'typedef', 'struct', 'class', 'enum', 'true', 'false', 'goto', 'this', 'public', 'private']);

    const MULTI_OPS = ['<<=', '>>=', '->', '::', '++', '--', '<=', '>=', '==', '!=', '&&', '||', '+=', '-=', '*=', '/=', '%=', '&=',
        '|=', '^=', '<<', '>>'];

    function tokenize(src) {
        const tokens = [];
        let i = 0, ws = '';
        const n = src.length;
        while (i < n) {
            const c = src[i];
            if (c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v') { ws += c; i++; continue; }
            if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const end = e === -1 ? n : e; ws += ' '.repeat(end - i); i = end; continue; }
            if (c === '/' && src[i + 1] === '*') {
                const e = src.indexOf('*/', i + 2); const end = e === -1 ? n : e + 2;
                ws += src.slice(i, end).replace(/[^\n]/g, ' '); i = end; continue;
            }
            let t, v;
            if (c === '"' || c === '\'') {
                let j = i + 1;
                while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; }
                v = src.slice(i, j + 1); t = c === '"' ? 'str' : 'chr'; i = j + 1;
            } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
                const m = /^(0[xX][0-9a-fA-F']+|0[bB][01']+|[0-9][0-9']*\.?[0-9]*(?:[eE][+-]?[0-9]+)?|\.[0-9]+(?:[eE][+-]?[0-9]+)?)[uUlLfF]*/.exec(src.slice(i));
                v = m[0]; t = 'num'; i += v.length;
                v = v.replace(/'/g, '').replace(/[uUlLfF]+$/, '');
                if (/^0[0-7]+$/.test(v)) v = '0o' + v.slice(1); // C octal
                if (/^[0-9]+\.$/.test(v)) v += '0';
            } else if (/[A-Za-z_]/.test(c)) {
                const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
                v = m[0]; t = 'id'; i += v.length;
            } else {
                v = MULTI_OPS.find(op => src.startsWith(op, i)) || c; t = 'op'; i += v.length;
            }
            tokens.push({ t, v, ws });
            ws = '';
        }
        tokens.push({ t: 'eof', v: '', ws });
        return tokens;
    }

    // #include / #define / #if lines: replaced by blank lines of the same length so line numbers hold
    function preprocess(src, warnings) {
        const includes = [];
        const defines = [];
        const lines = src.replace(/\r\n?/g, '\n').split('\n');
        let joined = [];
        for (let k = 0; k < lines.length; k++) {
            let line = lines[k];
            const m = /^\s*#\s*(\w+)\s*(.*)$/.exec(line);
            if (!m) { joined.push(line); continue; }
            // Continued lines
            let body = m[2], extra = 0;
            while (body.endsWith('\\') && k + 1 < lines.length) { body = body.slice(0, -1) + ' ' + lines[++k]; extra++; }
            const directive = m[1];
            if (directive === 'include') {
                const lib = (/[<"]([^>"]+)[>"]/.exec(body) || [])[1];
                if (lib) includes.push(lib);
                joined.push('');
            } else if (directive === 'define') {
                const fn = /^(\w+)\(([^)]*)\)\s*(.*)$/.exec(body);
                const obj = /^(\w+)\s*(.*)$/.exec(body);
                if (fn) joined.push(`const ${fn[1]} = (${fn[2]}) => (${stripComment(fn[3])});`);
                else if (obj) {
                    const value = stripComment(obj[2]).trim();
                    defines.push(obj[1]);
                    joined.push(value ? `const ${obj[1]} = ${value};` : '');
                } else joined.push('');
            } else {
                joined.push('');
            }
            for (let e = 0; e < extra; e++) joined.push('');
        }
        return { src: joined.join('\n'), includes, defines };
    }
    const stripComment = (s) => s.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

    function transpile(source) {
        pendingLoopBody.length = 0;
        doStack.length = 0;
        const warnings = [];
        const pre = preprocess(String(source || ''), warnings);
        const tk = tokenize(pre.src);
        const fnNames = new Set();
        const intVars = new Set();
        const classTypes = new Set(KNOWN_CLASSES);
        const unknownClasses = new Set();

        // Pass 0: find the sketch's own function names (so calls to them can be awaited)
        for (let i = 0; i < tk.length; i++) {
            if (tk[i].t === 'id' && tk[i + 1] && tk[i + 1].v === '(' && i > 0 && (isTypeTok(tk[i - 1]) || tk[i - 1].v === '*' || tk[i - 1].v === '&')
                && !KEYWORDS.has(tk[i].v)) {
                const close = matchParen(tk, i + 1);
                if (close !== -1 && tk[close + 1] && tk[close + 1].v === '{') fnNames.add(tk[i].v);
            }
        }
        // Classes used like "LiquidCrystal_I2C lcd(0x27, 16, 2);" that the simulator doesn't know
        for (let i = 0; i < tk.length - 2; i++) {
            const prev = i ? tk[i - 1].v : null;
            if (tk[i].t === 'id' && /^[A-Z]/.test(tk[i].v) && !classTypes.has(tk[i].v) && !TYPE_WORDS.has(tk[i].v)
                && tk[i + 1].t === 'id' && !KEYWORDS.has(tk[i + 1].v) && ['(', ';', '=', ','].includes(tk[i + 2].v)
                && (STATEMENT_START.has(prev) || prev === undefined) && !fnNames.has(tk[i + 1].v)) {
                classTypes.add(tk[i].v); unknownClasses.add(tk[i].v);
            }
        }
        function isTypeTok(tok) { return tok && tok.t === 'id' && (TYPE_WORDS.has(tok.v) || classTypes.has(tok.v)); }

        const out = []; // output tokens
        const emit = (v, ws = '') => out.push({ v, ws });

        let i = 0;
        let parenDepth = 0;
        const forInitDepth = []; // paren depths at which a for(...) header starts

        while (i < tk.length) {
            const tok = tk[i];
            if (tok.t === 'eof') { emit('', tok.ws); break; }
            const prevOut = lastSignificant(out);

            // Declarations: at statement start, or first thing inside for(
            const atStatement = STATEMENT_START.has(prevOut) || (prevOut === '(' && forInitDepth.includes(parenDepth))
                || prevOut === ':' && isLabelColon(out);
            if (isTypeTok(tok) && atStatement && !(tk[i + 1] && tk[i + 1].v === '(' && !classTypes.has(tok.v) && tok.v !== 'String')
                && !(tk[i + 1] && (tk[i + 1].v === '.' || tk[i + 1].v === '::'))) {
                const res = declaration(i);
                if (res) { i = res; continue; }
            }

            // Casts: (int) x  /  (float) x
            if (tok.v === '(' && isTypeTok(tk[i + 1])) {
                let j = i + 1;
                const words = [];
                while (isTypeTok(tk[j]) || tk[j].v === '*') { words.push(tk[j].v); j++; }
                if (tk[j].v === ')' && !classTypes.has(words[words.length - 1])) {
                    const isInt = words.some(w => INT_TYPES.has(w)) || words.includes('char') && !words.includes('*');
                    const end = operandEnd(tk, j + 1);
                    if (end > j + 1) {
                        emit(isInt ? '__int(' : '(', tok.ws);
                        copyRange(j + 1, end);
                        emit(')');
                        i = end;
                        continue;
                    }
                }
            }
            // Function-style casts: int(x), float(x), String(x)
            if (tok.t === 'id' && tk[i + 1].v === '(' && (INT_TYPES.has(tok.v) || ['float', 'double', 'String', 'char', 'bool', 'boolean'].includes(tok.v))
                && !atStatement) {
                emit(INT_TYPES.has(tok.v) ? '__int' : tok.v === 'String' ? '__String' : tok.v === 'char' ? '__char' : ['bool', 'boolean'].includes(tok.v) ? 'Boolean' : 'Number', tok.ws);
                i++;
                continue;
            }
            // Lambdas: [](...) { ... }  /  [&]() { }
            if (tok.v === '[' && ['(', ',', '=', 'return'].includes(prevOut)) {
                let j = i + 1;
                while (tk[j].v !== ']' && tk[j].t !== 'eof') j++;
                if (tk[j + 1] && tk[j + 1].v === '(') {
                    const close = matchParen(tk, j + 1);
                    if (close !== -1 && tk[close + 1].v === '{') {
                        emit('async (' + params(j + 2, close) + ') =>', tok.ws);
                        i = close + 1;
                        continue;
                    }
                }
            }
            // sizeof(a) / sizeof(a[0])  →  a.length
            if (tok.v === 'sizeof' && tk[i + 1].v === '(') {
                const close = matchParen(tk, i + 1);
                const inner = tk.slice(i + 2, close).map(x => x.v).join('');
                if (tk[close + 1] && tk[close + 1].v === '/' && tk[close + 2] && tk[close + 2].v === 'sizeof') {
                    const close2 = matchParen(tk, close + 3);
                    emit(`${inner}.length`, tok.ws);
                    i = close2 + 1;
                    continue;
                }
                emit(`__sizeof(${inner})`, tok.ws);
                i = close + 1;
                continue;
            }
            // Loops get a yield point so a busy loop can't freeze the page
            if ((tok.v === 'for' || tok.v === 'while') && tk[i + 1].v === '(') {
                const close = matchParen(tk, i + 1);
                const isDoWhileTail = tok.v === 'while' && prevOut === '}' && doWhileOpen(out);
                emit(tok.v, tok.ws);
                if (tok.v === 'for') forInitDepth.push(parenDepth + 1);
                // copy the header through the generic path, then fix the body
                pendingLoopBody.push({ close, isDoWhileTail });
                i++;
                continue;
            }
            if (tok.v === 'do' && tk[i + 1].v === '{') {
                emit('do', tok.ws); emit('{', tk[i + 1].ws); emit(' await __yield();');
                doStack.push(true);
                i += 2;
                continue;
            }

            // Pointers and scope
            if (tok.v === '->' || tok.v === '::') { emit('.', tok.ws); i++; continue; }
            if (tok.v === 'NULL' || tok.v === 'nullptr') { emit('null', tok.ws); i++; continue; }
            if (tok.v === 'F' && tk[i + 1].v === '(' && tk[i + 2].t === 'str') { emit('', tok.ws); i++; continue; } // F("x") → ("x")
            if (tok.v === 'PROGMEM') { emit('', tok.ws); i++; continue; }
            if (tok.v === 'yield' && tk[i + 1].v === '(') { tok.v = '__yield'; }

            // String methods that change the String in place in Arduino
            if (tok.t === 'id' && tk[i + 1].v === '.' && ['trim', 'toUpperCase', 'toLowerCase'].includes(tk[i + 2].v) && tk[i + 3].v === '('
                && tk[i + 4].v === ')' && tk[i + 5].v === ';' && STATEMENT_START.has(prevOut)) {
                emit(`${tok.v} = ${tok.v}.${tk[i + 2].v}();`, tok.ws);
                i += 6;
                continue;
            }
            if (tok.t === 'id' && tk[i + 1].v === '.' && tk[i + 2].v === 'replace' && tk[i + 3].v === '(' && STATEMENT_START.has(prevOut)) {
                const close = matchParen(tk, i + 3);
                if (tk[close + 1].v === ';') {
                    emit(`${tok.v} = __replaceAll(${tok.v}, `, tok.ws);
                    copyRange(i + 4, close);
                    emit(');');
                    i = close + 2;
                    continue;
                }
            }
            if (tok.v === '.' && (tk[i + 1].v === 'length' || tk[i + 1].v === 'c_str') && tk[i + 2].v === '(' && tk[i + 3].v === ')') {
                if (tk[i + 1].v === 'length') emit('.length', tok.ws);
                i += 4;
                continue;
            }

            // Assignments to int variables truncate like C (x = a / b)
            if (tok.t === 'id' && intVars.has(tok.v) && parenDepth === 0 && STATEMENT_START.has(prevOut) && ['=', '+=', '-=', '*=', '/=', '%='].includes(tk[i + 1].v)) {
                const end = statementEnd(tk, i + 2);
                const op = tk[i + 1].v;
                emit(`${tok.v} = __int(`, tok.ws);
                if (op !== '=') emit(`${tok.v} ${op[0]} (`);
                copyRange(i + 2, end, true);
                emit(op !== '=' ? '))' : ')');
                i = end;
                continue;
            }

            // Await the sketch's own functions and the board calls that take time
            if (tok.t === 'id' && tk[i + 1].v === '(' && prevOut !== '.' && prevOut !== 'function'
                && (fnNames.has(tok.v) || WAITING_CALLS.has(tok.v))) {
                emit('(await ' + tok.v, tok.ws);
                const close = matchParen(tk, i + 1);
                copyRange(i + 1, close + 1);
                emit(')');
                i = close + 1;
                continue;
            }
            if (tok.t === 'id' && tk[i + 1].v === '.' && tk[i + 2] && WAITING_METHODS.has(tk[i + 2].v) && tk[i + 3].v === '(' && prevOut !== '.') {
                const close = matchParen(tk, i + 3);
                emit('(await ' + tok.v, tok.ws);
                copyRange(i + 1, close + 1);
                emit(')');
                i = close + 1;
                continue;
            }

            if (tok.v === '(') parenDepth++;
            if (tok.v === ')') {
                if (forInitDepth.length && forInitDepth[forInitDepth.length - 1] === parenDepth) forInitDepth.pop();
                parenDepth--;
            }
            emit(tok.t === 'chr' ? charLiteral(tok.v) : tok.v, tok.ws);
            i++;
            // A loop header just closed: give the body a yield point
            const pl = pendingLoopBody[pendingLoopBody.length - 1];
            if (pl && i - 1 === pl.close) {
                pendingLoopBody.pop();
                if (pl.isDoWhileTail) { doStack.pop(); continue; }
                const next = tk[i];
                if (next.v === '{') { emit('{', next.ws); emit(' await __yield();'); i++; }
                else if (next.v === ';') { emit('{ await __yield(); }', next.ws); i++; }
                else {
                    // single-statement body
                    const end = statementEnd(tk, i, true);
                    emit('{ await __yield();');
                    const saved = i; i = end;
                    copyRange(saved, end, false, true);
                    emit(' }');
                }
            }
        }

        // declaration starting at i: returns the index after it, or 0 if it isn't one
        function declaration(i0) {
            let j = i0;
            const words = [];
            while (isTypeTok(tk[j]) || tk[j].v === '*' || tk[j].v === '&') { if (tk[j].t === 'id') words.push(tk[j].v); j++; }
            if (tk[j].t !== 'id' || KEYWORDS.has(tk[j].v)) return 0;
            const baseType = words.filter(w => !['IRAM_ATTR', 'ICACHE_RAM_ATTR', 'ARDUINO_ISR_ATTR', 'const', 'static', 'volatile', 'constexpr', 'inline', 'register', 'extern', 'unsigned', 'signed'].includes(w)).pop() || 'int';
            const isClass = classTypes.has(baseType) && baseType !== 'String';
            const isIntType = words.some(w => INT_TYPES.has(w)) && !words.includes('float') && !words.includes('double');
            const ws = tk[i0].ws;
            const name = tk[j].v;
            // Function definition / prototype / object with constructor args
            if (tk[j + 1].v === '(') {
                const close = matchParen(tk, j + 1);
                if (close === -1) return 0;
                if (tk[close + 1].v === '{') {
                    emit(`async function ${name}(${params(j + 2, close)})`, ws);
                    return close + 1;
                }
                if (tk[close + 1].v === ';' || tk[close + 1].v === ',') {
                    if (isClass || baseType === 'String') {
                        // Servo s(…) / IPAddress ip(192,168,1,1) / String s("x")
                        emit(`let ${name} = ${baseType === 'String' ? '__String(' : `new ${unknownClasses.has(baseType) ? `__Unknown('${baseType}', ` : baseType + '('}`}`, ws);
                        copyRange(j + 2, close);
                        emit(')' + (tk[close + 1].v === ';' ? ';' : ''));
                        return close + 2;
                    }
                    emit('', ws); // prototype: drop it
                    return close + 2;
                }
                return 0;
            }
            // Variables: name[dims] = init, other = …;
            emit('let', ws);
            let k = j;
            let first = true;
            while (true) {
                while (tk[k].v === '*' || tk[k].v === '&') k++;
                if (tk[k].t !== 'id') return k;
                const vname = tk[k].v;
                if (!first) emit(',');
                emit(' ' + vname, first ? ' ' : tk[k].ws);
                first = false;
                if (isIntType) intVars.add(vname);
                k++;
                const dims = [];
                while (tk[k].v === '[') {
                    const close = matchBracket(tk, k);
                    dims.push(tk.slice(k + 1, close).map(x => x.v).join('') || null);
                    k = close + 1;
                }
                if (tk[k].v === '=') {
                    emit(' =');
                    const end = initEnd(tk, k + 1);
                    if (tk[k + 1].v === '{') {
                        // {1, 2, 3} → [1, 2, 3]
                        for (let m = k + 1; m < end; m++) {
                            const v = tk[m].v === '{' ? '[' : tk[m].v === '}' ? ']' : tk[m].t === 'chr' ? charLiteral(tk[m].v) : tk[m].v;
                            emit(v, tk[m].ws);
                        }
                    } else if (dims.length && tk[k + 1].t === 'str' && end === k + 2) {
                        emit(tk[k + 1].v, tk[k + 1].ws); // char msg[] = "hi"
                    } else if (isIntType && !dims.length && !(end === k + 2 && tk[k + 1].t === 'num')) {
                        emit(' __int(');
                        const save = i; copyRange(k + 1, end, true); i = save;
                        emit(')');
                    } else {
                        const save = i; copyRange(k + 1, end, true); i = save;
                    }
                    k = end;
                } else if (dims.length) {
                    emit(` = __array(${baseType === 'String' ? '""' : '0'}, ${dims.map(d => d || 0).join(', ')})`);
                } else if (isClass) {
                    emit(` = new ${unknownClasses.has(baseType) ? `__Unknown('${baseType}')` : baseType + '()'}`);
                } else if (baseType === 'String') {
                    emit(' = ""');
                } else if (['float', 'double'].includes(baseType) || isIntType || ['bool', 'boolean', 'char', 'int', 'long'].includes(baseType)) {
                    emit(baseType === 'bool' || baseType === 'boolean' ? ' = false' : ' = 0');
                }
                if (tk[k].v === ',') { k++; continue; }
                if (tk[k].v === ';') { emit(';', tk[k].ws); return k + 1; }
                if (tk[k].v === ')' || tk[k].v === ':') return k; // for (int i = 0 …;  /  range-for
                return k;
            }
        }

        function params(from, to) {
            const groups = [];
            let cur = [];
            let depth = 0;
            for (let m = from; m < to; m++) {
                const v = tk[m].v;
                if (v === '(' || v === '[' || v === '{') depth++;
                if (v === ')' || v === ']' || v === '}') depth--;
                if (v === ',' && depth === 0) { groups.push(cur); cur = []; continue; }
                cur.push(tk[m]);
            }
            if (cur.length) groups.push(cur);
            return groups.map(g => {
                const eq = g.findIndex(x => x.v === '=');
                const decl = eq === -1 ? g : g.slice(0, eq);
                const ids = decl.filter(x => x.t === 'id' && !TYPE_WORDS.has(x.v) && !classTypes.has(x.v));
                const name = ids.length ? ids[ids.length - 1].v : '';
                if (!name || (decl.length === 1 && decl[0].v === 'void')) return '';
                return eq === -1 ? name : `${name} = ${g.slice(eq + 1).map(x => x.v).join(' ')}`;
            }).filter(Boolean).join(', ');
        }

        // copy tokens [from, to) through the main loop (so nested rules apply)
        function copyRange(from, to, allowAssign, keepIndex) {
            const saveI = i;
            const sub = tk.slice(from, to);
            for (let m = 0; m < sub.length; m++) {
                const tok = sub[m];
                const prev = lastSignificant(out);
                if (tok.t === 'id' && tok.v !== '' && tk[from + m + 1] && tk[from + m + 1].v === '(' && prev !== '.' && prev !== 'function'
                    && (fnNames.has(tok.v) || WAITING_CALLS.has(tok.v))) {
                    const close = matchParen(tk, from + m + 1);
                    if (close < to) {
                        emit('(await ' + tok.v, tok.ws);
                        copyRange(from + m + 1, close + 1);
                        emit(')');
                        m = close - from;
                        continue;
                    }
                }
                if (tok.t === 'id' && tk[from + m + 1] && tk[from + m + 1].v === '.' && tk[from + m + 2] && WAITING_METHODS.has(tk[from + m + 2].v)
                    && tk[from + m + 3] && tk[from + m + 3].v === '(' && prev !== '.') {
                    const close = matchParen(tk, from + m + 3);
                    if (close < to) {
                        emit('(await ' + tok.v, tok.ws);
                        copyRange(from + m + 1, close + 1);
                        emit(')');
                        m = close - from;
                        continue;
                    }
                }
                if (tok.v === '(' && isTypeTok(tk[from + m + 1])) {
                    let j = from + m + 1;
                    const words = [];
                    while (isTypeTok(tk[j]) || tk[j].v === '*') { words.push(tk[j].v); j++; }
                    if (tk[j].v === ')' && j < to) {
                        const isInt = words.some(w => INT_TYPES.has(w));
                        const end = Math.min(operandEnd(tk, j + 1), to);
                        emit(isInt ? '__int(' : '(', tok.ws);
                        copyRange(j + 1, end);
                        emit(')');
                        m = end - 1 - from;
                        continue;
                    }
                }
                if (tok.t === 'id' && tk[from + m + 1] && tk[from + m + 1].v === '(' && (INT_TYPES.has(tok.v) || ['float', 'double', 'String'].includes(tok.v))) {
                    emit(INT_TYPES.has(tok.v) ? '__int' : tok.v === 'String' ? '__String' : 'Number', tok.ws);
                    continue;
                }
                if (tok.v === '[' && ['(', ',', '='].includes(prev)) {
                    let j = from + m + 1;
                    while (tk[j].v !== ']' && j < to) j++;
                    if (tk[j + 1] && tk[j + 1].v === '(') {
                        const close = matchParen(tk, j + 1);
                        if (close !== -1 && tk[close + 1] && tk[close + 1].v === '{') {
                            emit('async (' + params(j + 2, close) + ') =>', tok.ws);
                            m = close - from;
                            continue;
                        }
                    }
                }
                if (tok.v === 'sizeof' && tk[from + m + 1].v === '(') {
                    const close = matchParen(tk, from + m + 1);
                    const inner = tk.slice(from + m + 2, close).map(x => x.v).join('');
                    if (tk[close + 1] && tk[close + 1].v === '/' && tk[close + 2] && tk[close + 2].v === 'sizeof') {
                        const close2 = matchParen(tk, close + 3);
                        emit(`${inner}.length`, tok.ws);
                        m = close2 - from;
                        continue;
                    }
                    emit(`__sizeof(${inner})`, tok.ws);
                    m = close - from;
                    continue;
                }
                if (tok.v === '->' || tok.v === '::') { emit('.', tok.ws); continue; }
                if (tok.v === 'NULL' || tok.v === 'nullptr') { emit('null', tok.ws); continue; }
                if (tok.v === '.' && tk[from + m + 1] && (tk[from + m + 1].v === 'length' || tk[from + m + 1].v === 'c_str') && tk[from + m + 2].v === '(' && tk[from + m + 3].v === ')') {
                    if (tk[from + m + 1].v === 'length') emit('.length', tok.ws);
                    m += 3;
                    continue;
                }
                emit(tok.t === 'chr' ? charLiteral(tok.v) : tok.v, tok.ws);
            }
            if (!keepIndex) i = saveI;
        }

        const js = out.map(o => o.ws + o.v).join('');
        if (unknownClasses.size) warnings.push(`Not simulated: ${[...unknownClasses].join(', ')}. Its calls do nothing here, but the rest of your sketch runs.`);
        return { js, warnings, includes: pre.includes, functions: [...fnNames] };
    }

    // These are module-level so declaration()/copyRange() closures can share them across calls
    const pendingLoopBody = [];
    const doStack = [];
    function doWhileOpen() { return doStack.length > 0; }
    function isLabelColon(out) {
        // "case X:" or "default:" — statements may follow
        for (let k = out.length - 2; k >= 0 && k > out.length - 8; k--) {
            const v = out[k].v.trim();
            if (v === 'case' || v === 'default') return true;
            if (v === ';' || v === '{' || v === '}') return false;
        }
        return false;
    }

    function lastSignificant(out) {
        for (let k = out.length - 1; k >= 0; k--) {
            const v = out[k].v.trim();
            if (v) {
                if (v.endsWith('await __yield();')) return '{';
                const last = v.split(/\s+/).pop();
                return /^[A-Za-z_]\w*$/.test(last) ? last : last.slice(-1);
            }
        }
        return null;
    }

    function matchParen(tk, open) {
        let depth = 0;
        for (let k = open; k < tk.length; k++) {
            if (tk[k].v === '(') depth++;
            else if (tk[k].v === ')') { depth--; if (depth === 0) return k; }
        }
        return -1;
    }
    function matchBracket(tk, open) {
        let depth = 0;
        for (let k = open; k < tk.length; k++) {
            if (tk[k].v === '[') depth++;
            else if (tk[k].v === ']') { depth--; if (depth === 0) return k; }
        }
        return -1;
    }
    // End (exclusive) of an initializer: the , or ; at depth 0
    function initEnd(tk, from) {
        let depth = 0;
        for (let k = from; k < tk.length; k++) {
            const v = tk[k].v;
            if (v === '(' || v === '[' || v === '{') depth++;
            else if (v === ')' || v === ']' || v === '}') { if (depth === 0) return k; depth--; }
            else if ((v === ',' || v === ';') && depth === 0) return k;
        }
        return tk.length - 1;
    }
    // End (exclusive) of a statement's expression: the ; at depth 0 (or the ; itself included when `inclusive`)
    function statementEnd(tk, from, inclusive) {
        let depth = 0;
        for (let k = from; k < tk.length; k++) {
            const v = tk[k].v;
            if (v === '(' || v === '[' || v === '{') depth++;
            else if (v === ')' || v === ']' || v === '}') depth--;
            else if (v === ';' && depth === 0) return inclusive ? k + 1 : k;
        }
        return tk.length - 1;
    }
    // End (exclusive) of the operand after a cast: a name with .member / [index] / (call), a number, or (group)
    function operandEnd(tk, from) {
        let k = from;
        if (tk[k].v === '-' || tk[k].v === '+' || tk[k].v === '!') k++;
        if (tk[k].v === '(') return matchParen(tk, k) + 1;
        if (tk[k].t === 'num' || tk[k].t === 'str' || tk[k].t === 'chr') return k + 1;
        if (tk[k].t !== 'id') return from;
        k++;
        while (true) {
            if (tk[k].v === '.' && tk[k + 1].t === 'id') { k += 2; continue; }
            if (tk[k].v === '[') { k = matchBracket(tk, k) + 1; continue; }
            if (tk[k].v === '(') { k = matchParen(tk, k) + 1; continue; }
            return k;
        }
    }
    // 'a' stays a one-letter string (Serial.read() returns one too, so c == 'F' works); escapes keep their meaning
    function charLiteral(v) {
        return v;
    }

    const api = { transpile, tokenize };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.ArduinoTranspiler = api;
})(typeof window !== 'undefined' ? window : globalThis);
