#!/usr/bin/env node
/**
 * Local IPU ExamWeb Spring Boot Diagnostic Script
 *
 * Tests live login + result endpoint discovery against https://examweb.ggsipu.ac.in
 * without rebuilding the Rust desktop binary.
 *
 * Security & privacy:
 * - User manually solves the CAPTCHA image (opened in default image viewer).
 * - Password input is masked and NEVER printed or written to disk.
 * - Console output prints a redacted, paste-ready schema report (routes, form fields,
 *   JS fetch calls, HTTP statuses, and JSON key structures) while saving the raw
 *   inspection snapshot only inside your OS %TEMP% folder.
 *
 * Usage:
 *   node scripts/test-ipu-portal.mjs
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn } from 'node:child_process';

const BASE = 'https://examweb.ggsipu.ac.in';
const LOGIN_PAGE = `${BASE}/web/login.jsp`;
const USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

class CookieJar {
    constructor() {
        this.cookies = new Map();
    }
    ingest(headers) {
        const setCookies = typeof headers.getSetCookie === 'function'
            ? headers.getSetCookie()
            : (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
        for (const raw of setCookies) {
            if (!raw) continue;
            const pair = raw.split(';')[0]?.trim();
            if (!pair) continue;
            const eq = pair.indexOf('=');
            if (eq <= 0) continue;
            const name = pair.slice(0, eq).trim();
            const val = pair.slice(eq + 1).trim();
            if (val === '' || val === '""') {
                this.cookies.delete(name);
            } else {
                this.cookies.set(name, val);
            }
        }
    }
    header() {
        return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
}

function resolveUrl(raw, baseUrl) {
    try {
        return new URL(raw, baseUrl).toString();
    } catch {
        if (raw.startsWith('/')) return `${BASE}${raw}`;
        return `${BASE}/web/${raw}`;
    }
}

function openFileDefault(filePath) {
    try {
        if (process.platform === 'win32') {
            spawn('cmd', ['/c', 'start', '', filePath], { detached: true, stdio: 'ignore' }).unref();
        } else if (process.platform === 'darwin') {
            spawn('open', [filePath], { detached: true, stdio: 'ignore' }).unref();
        } else {
            spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' }).unref();
        }
    } catch {
        // Non-fatal; user can open the path printed to console.
    }
}

function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question(question, (ans) => {
            rl.close();
            resolve(ans.trim());
        });
    });
}

function askSecret(question) {
    return new Promise((resolve) => {
        const stdin = process.stdin;
        const stdout = process.stdout;
        stdout.write(question);
        if (!stdin.isTTY) {
            const rl = readline.createInterface({ input: stdin, output: stdout });
            rl.question('', (ans) => {
                rl.close();
                resolve(ans);
            });
            return;
        }
        stdin.setRawMode(true);
        stdin.resume();
        stdin.setEncoding('utf8');
        let value = '';
        const onData = (ch) => {
            if (ch === '\r' || ch === '\n' || ch === '\u0004') {
                stdin.setRawMode(false);
                stdin.pause();
                stdin.removeListener('data', onData);
                stdout.write('\n');
                resolve(value);
            } else if (ch === '\u0003') {
                stdin.setRawMode(false);
                stdout.write('\nCancelled.\n');
                process.exit(1);
            } else if (ch === '\u007f' || ch === '\b') {
                if (value.length > 0) {
                    value = value.slice(0, -1);
                    stdout.write('\b \b');
                }
            } else {
                value += ch;
                stdout.write('*');
            }
        };
        stdin.on('data', onData);
    });
}

async function fetchWithJar(jar, url, opts = {}, maxRedirects = 6) {
    let currentUrl = url;
    let method = opts.method || 'GET';
    let body = opts.body;
    let extraHeaders = { ...(opts.headers || {}) };

    for (let hop = 0; hop <= maxRedirects; hop++) {
        const headers = {
            'User-Agent': USER_AGENT,
            Accept: 'text/html,application/xhtml+xml,application/json,*/*;q=0.8',
            ...extraHeaders,
        };
        const cookieHdr = jar.header();
        if (cookieHdr) headers.Cookie = cookieHdr;

        const resp = await fetch(currentUrl, {
            method,
            headers,
            body,
            redirect: 'manual',
        });
        jar.ingest(resp.headers);

        const loc = resp.headers.get('location');
        if (resp.status >= 300 && resp.status < 400 && loc && hop < maxRedirects) {
            const nextUrl = resolveUrl(loc, currentUrl);
            extraHeaders = { Referer: currentUrl };
            currentUrl = nextUrl;
            method = 'GET';
            body = undefined;
            continue;
        }
        return { resp, finalUrl: currentUrl };
    }
    throw new Error('Too many redirects');
}

function extractHiddenFields(html) {
    const out = {};
    const inputRe = /<input\b([^>]+)>/gi;
    const attrRe = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let m;
    while ((m = inputRe.exec(html)) !== null) {
        const attrs = {};
        let am;
        while ((am = attrRe.exec(m[1])) !== null) {
            attrs[am[1].toLowerCase()] = am[2] ?? am[3] ?? am[4] ?? '';
        }
        if (attrs.name && ['hidden', 'submit', 'button'].includes((attrs.type || 'text').toLowerCase())) {
            out[attrs.name] = attrs.value || '';
        }
    }
    return out;
}

function summarizeJsonShape(val, depth = 0) {
    if (val === null) return 'null';
    if (Array.isArray(val)) {
        if (val.length === 0) return 'Array(0)';
        if (depth >= 3) return `Array(${val.length})`;
        return {
            __type: `Array(${val.length})`,
            firstItem: summarizeJsonShape(val[0], depth + 1),
        };
    }
    if (typeof val === 'object') {
        if (depth >= 3) return `Object{${Object.keys(val).join(', ')}}`;
        const shape = {};
        for (const [k, v] of Object.entries(val)) {
            if (typeof v === 'string') {
                // Redact likely personal strings while keeping codes/numbers/dates visible
                const lk = k.toLowerCase();
                const isPersonal =
                    lk.includes('name') && !lk.includes('paper') && !lk.includes('sub') && !lk.includes('prg') && !lk.includes('inst')
                    || lk.includes('father') || lk.includes('mother') || lk.includes('mob') || lk.includes('phone')
                    || lk.includes('email') || lk.includes('roll') || lk.includes('addr') || lk.includes('dob');
                shape[k] = isPersonal ? `<string len=${v.length}>` : `string(${JSON.stringify(v.slice(0, 60))})`;
            } else if (typeof v === 'number' || typeof v === 'boolean') {
                shape[k] = `${typeof v}(${v})`;
            } else {
                shape[k] = summarizeJsonShape(v, depth + 1);
            }
        }
        return shape;
    }
    return typeof val;
}

async function main() {
    console.log('=====================================================');
    console.log(' IPU ExamWeb Spring Boot Local Diagnostic Tester');
    console.log('=====================================================\n');

    const jar = new CookieJar();

    // 1. Load login page & CAPTCHA
    console.log('[1/4] Fetching login page & live CAPTCHA...');
    const { resp: loginPageResp, finalUrl: loginPageUrl } = await fetchWithJar(jar, LOGIN_PAGE);
    const loginHtml = await loginPageResp.text();
    if (!loginPageResp.ok) {
        throw new Error(`Login page returned HTTP ${loginPageResp.status}`);
    }

    const captchaMatch =
        loginHtml.match(/<img[^>]+id=["']?(?:captchaImage|captcha)["']?[^>]+src=["']([^"']+)["']/i) ||
        loginHtml.match(/<img[^>]+src=["']([^"']*(?:captcha|kaptcha)[^"']*)["']/i);
    if (!captchaMatch) {
        throw new Error('Could not find CAPTCHA image URL on login page.');
    }

    const captchaUrl = resolveUrl(captchaMatch[1], loginPageUrl);
    const { resp: capResp } = await fetchWithJar(jar, captchaUrl, {
        headers: { Referer: loginPageUrl, Accept: 'image/*,*/*;q=0.8' },
    });
    const capBuf = Buffer.from(await capResp.arrayBuffer());
    const captchaPath = path.join(os.tmpdir(), 'ipu-captcha-test.png');
    fs.writeFileSync(captchaPath, capBuf);
    openFileDefault(captchaPath);

    console.log(`    CAPTCHA saved & opened: ${captchaPath}`);
    console.log(`    Cookies captured: ${[...jar.cookies.keys()].join(', ') || '(none)'}`);

    const formActionMatch = loginHtml.match(/<form[^>]+action=["']([^"']+)["']/i);
    const loginAction = formActionMatch ? resolveUrl(formActionMatch[1], loginPageUrl) : `${BASE}/web/login`;
    const hiddenFields = extractHiddenFields(loginHtml);
    const usesCrypt = loginHtml.includes('hashPassword') || loginHtml.toLowerCase().includes('crypt.js');

    // 2. Prompt user
    console.log('\n[2/4] Enter your IPU ExamWeb credentials (nothing is saved or printed):');
    const enrollment = await ask('  Enrollment Number : ');
    const password = await askSecret('  ExamWeb Password  : ');
    const captcha = await ask('  CAPTCHA (exact)   : ');

    if (!enrollment || !password || !captcha) {
        throw new Error('All three fields are required.');
    }

    const submittedPassword = usesCrypt
        ? crypto.createHash('sha256').update(`${password}${captcha}`).digest('base64')
        : password;

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(hiddenFields)) {
        if (!['username', 'passwd', 'captcha'].includes(k.toLowerCase())) {
            params.append(k, v);
        }
    }
    params.append('username', enrollment);
    params.append('passwd', submittedPassword);
    params.append('captcha', captcha);

    // 3. Submit login
    console.log(`\n[3/4] Posting login to ${loginAction} ...`);
    const { resp: postResp, finalUrl: afterLoginUrl } = await fetchWithJar(jar, loginAction, {
        method: 'POST',
        headers: {
            Referer: loginPageUrl,
            Origin: BASE,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });
    const homeHtml = await postResp.text();
    console.log(`    HTTP ${postResp.status} -> ${afterLoginUrl} (${homeHtml.length} bytes)`);

    const titleMatch = homeHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : '(no title)';
    console.log(`    Page <title>: ${title}`);

    if (/system message/i.test(title) || /login page/i.test(title)) {
        const msgMatch = homeHtml.match(/<div[^>]*class=["'][^"']*message[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
        console.error('    Login did NOT reach studenthome:', msgMatch ? msgMatch[1].replace(/<[^>]+>/g, ' ').trim() : 'returned to login page');
        process.exit(1);
    }

    // 4. Inspect studenthome structure (forms, selects, scripts, links)
    console.log('\n[4/4] Inspecting authenticated studenthome & probing /web/student/search ...');

    const forms = [...homeHtml.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => ({
        attrs: m[1].trim(),
        inputs: [...m[2].matchAll(/<(?:input|select|button)\b[^>]*>/gi)].map((x) => x[0]),
        options: [...m[2].matchAll(/<option\b[^>]*>[\s\S]*?<\/option>/gi)].map((x) => x[0].replace(/\s+/g, ' ').trim()),
    }));

    const scriptSrcs = [...homeHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
    const inlineScripts = [...homeHtml.matchAll(/<script(?![^>]+src=)[^>]*>([\s\S]*?)<\/script>/gi)]
        .map((m) => m[1].trim())
        .filter(Boolean);
    const links = [...homeHtml.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
        href: m[1],
        text: m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }));

    console.log('\n--- FORMS ON STUDENTHOME ---');
    console.log(JSON.stringify(forms, null, 2));

    console.log('\n--- LINKS ON STUDENTHOME ---');
    console.log(JSON.stringify(links, null, 2));

    console.log('\n--- EXTERNAL SCRIPTS ON STUDENTHOME ---');
    console.log(JSON.stringify(scriptSrcs, null, 2));

    console.log('\n--- INLINE SCRIPTS ON STUDENTHOME ---');
    inlineScripts.forEach((s, i) => {
        console.log(`\n/* inline script #${i + 1} (${s.length} chars) */`);
        console.log(s);
    });

    // Fetch non-vendor external scripts too
    const externalJsBodies = {};
    for (const src of scriptSrcs) {
        if (/jquery|bootstrap|popper|fontawesome|chart|datatables/i.test(src)) continue;
        const jsUrl = resolveUrl(src, afterLoginUrl);
        if (!jsUrl.startsWith(BASE)) continue;
        const { resp: jsResp } = await fetchWithJar(jar, jsUrl, { headers: { Referer: afterLoginUrl } });
        const jsText = await jsResp.text();
        externalJsBodies[src] = jsText;
        console.log(`\n/* external script ${src} (HTTP ${jsResp.status}, ${jsText.length} chars) */`);
        console.log(jsText.slice(0, 4000));
    }

    // Extract any extra fetch/url paths from inline + external scripts
    const allJs = [...inlineScripts, ...Object.values(externalJsBodies)].join('\n');
    const discoveredFetchUrls = new Set();
    for (const m of allJs.matchAll(/(?:fetch\s*\(|url\s*:\s*|\$\.(?:get|post|getJSON)\s*\()\s*["'`]([^"'`]+)["'`]/gi)) {
        discoveredFetchUrls.add(m[1]);
    }

    // Probe candidate result endpoints cleanly (GET ONLY on /web/student/search so we don't hit 405!)
    const probes = [
        '/web/student/search?euno=100',
        '/web/student/search?euno=1',
        '/web/student/search?euno=2',
        '/web/student/search?flag=2&euno=100',
        '/web/student/search?flag=2&euno=1',
        '/web/student/search',
        '/web/student/profile',
    ];
    for (const raw of discoveredFetchUrls) {
        if (!raw.includes('logout') && !raw.includes('login')) {
            probes.push(raw);
        }
    }

    console.log('\n--- ENDPOINT PROBE RESULTS (REDACTED SCHEMA) ---');
    const probeReport = [];
    for (const p of [...new Set(probes)]) {
        const fullUrl = resolveUrl(p, afterLoginUrl);
        try {
            const { resp: r } = await fetchWithJar(jar, fullUrl, {
                headers: {
                    Referer: afterLoginUrl,
                    'X-Requested-With': 'XMLHttpRequest',
                    Accept: 'application/json, text/html, */*',
                },
            });
            const ct = r.headers.get('content-type') || '';
            const text = await r.text();
            let summary;
            if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
                try {
                    const parsed = JSON.parse(text);
                    summary = summarizeJsonShape(parsed);
                } catch {
                    summary = `unparseable-json len=${text.length}`;
                }
            } else {
                const titleM = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
                const hasTable = /<table\b/i.test(text);
                summary = {
                    htmlTitle: titleM ? titleM[1].trim() : null,
                    hasTable,
                    len: text.length,
                    snippet: text.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 260),
                };
            }
            const entry = { path: p, status: r.status, contentType: ct, len: text.length, summary };
            probeReport.push(entry);
            console.log(`\nGET ${p} -> HTTP ${r.status} (${ct}, ${text.length} bytes)`);
            console.log(JSON.stringify(summary, null, 2));
        } catch (err) {
            console.log(`\nGET ${p} -> ERR ${err.message}`);
        }
    }

    const reportPath = path.join(os.tmpdir(), 'ipu-diagnostic-report.json');
    fs.writeFileSync(
        reportPath,
        JSON.stringify({ afterLoginUrl, title, forms, links, scriptSrcs, inlineScripts, probeReport }, null, 2)
    );
    console.log(`\nSaved redacted report to: ${reportPath}`);
    console.log('Done! Paste the output above to lock src-tauri/src/ipu.rs to the exact live schema.');
}

main().catch((err) => {
    console.error('\nERROR:', err.message || err);
    process.exit(1);
});
