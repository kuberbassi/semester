#!/usr/bin/env node
/**
 * Local Google Drive Desktop OAuth Diagnostic Script
 *
 * Tests the exact same fixed loopback redirect URI (http://127.0.0.1:43819/oauth/callback),
 * PKCE exchange, and Drive appDataFolder scope used by src-tauri/src/drive_sync.rs.
 *
 * Never prints Client Secret or OAuth tokens.
 *
 * Usage:
 *   node scripts/test-drive-oauth.mjs
 *   node scripts/test-drive-oauth.mjs --client-id "..." --client-secret "..."
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PORT = 43819;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth/callback`;
const SCOPES = [
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

function parseEnvFile(filePath) {
    const map = {};
    if (!fs.existsSync(filePath)) return map;
    for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let val = trimmed.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        map[key] = val;
    }
    return map;
}

function getArg(flag) {
    const idx = process.argv.indexOf(flag);
    return idx >= 0 ? process.argv[idx + 1] : '';
}

function openBrowser(url) {
    if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
        spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
        spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
}

async function main() {
    const rootDir = process.cwd();
    const rootEnv = parseEnvFile(path.join(rootDir, '.env'));
    const feEnv = parseEnvFile(path.join(rootDir, 'frontend', '.env'));

    const clientId =
        getArg('--client-id') ||
        process.env.GOOGLE_DESKTOP_CLIENT_ID ||
        rootEnv.GOOGLE_DESKTOP_CLIENT_ID ||
        process.env.GOOGLE_CLIENT_ID ||
        feEnv.VITE_GOOGLE_CLIENT_ID ||
        rootEnv.GOOGLE_CLIENT_ID ||
        '';
    const clientSecret =
        getArg('--client-secret') ||
        process.env.GOOGLE_DESKTOP_CLIENT_SECRET ||
        rootEnv.GOOGLE_DESKTOP_CLIENT_SECRET ||
        process.env.GOOGLE_CLIENT_SECRET ||
        rootEnv.GOOGLE_CLIENT_SECRET ||
        '';

    console.log('=====================================================');
    console.log(' Google Drive Desktop OAuth Local Diagnostic Tester');
    console.log('=====================================================');
    console.log(`Redirect URI  : ${REDIRECT_URI}`);
    console.log(`Client ID     : ${clientId ? `${clientId.slice(0, 12)}...${clientId.slice(-18)}` : '(MISSING!)'}`);
    console.log(`Client Secret : ${clientSecret ? `present (len=${clientSecret.length})` : '(not provided — PKCE only)'}\n`);

    if (!clientId) {
        console.error('ERROR: No Google Client ID found in frontend/.env, .env, or --client-id.');
        process.exit(1);
    }

    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const state = crypto.randomBytes(16).toString('hex');

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', challenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');

    const code = await new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const parsed = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
            if (parsed.pathname !== '/oauth/callback') {
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            const err = parsed.searchParams.get('error');
            const returnedState = parsed.searchParams.get('state');
            const authCode = parsed.searchParams.get('code');

            if (err) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end(`<h3>Google OAuth Error: ${err}</h3><p>Check your terminal output.</p>`);
                server.close();
                reject(new Error(`Google returned error="${err}" (${parsed.searchParams.get('error_description') || ''})`));
                return;
            }
            if (returnedState !== state || !authCode) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('State mismatch or missing code.');
                server.close();
                reject(new Error('OAuth state mismatch or missing authorization code.'));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h3>Callback received!</h3><p>You can close this tab and check your terminal.</p>');
            server.close();
            resolve(authCode);
        });

        server.on('error', (err) => {
            reject(new Error(`Could not bind 127.0.0.1:${PORT} (${err.message}). Make sure Semester.exe is not mid-OAuth.`));
        });

        server.listen(PORT, '127.0.0.1', () => {
            console.log(`[1/3] Listening on ${REDIRECT_URI}`);
            console.log('[2/3] Opening Google Sign-In in your browser...');
            console.log('      If you see Error 400: redirect_uri_mismatch in Google, add the exact Redirect URI above');
            console.log('      to Google Cloud Console -> APIs & Services -> Credentials -> Authorized redirect URIs.\n');
            openBrowser(authUrl.toString());
        });

        setTimeout(() => {
            server.close();
            reject(new Error('Timed out after 180s waiting for Google OAuth callback.'));
        }, 180_000).unref();
    });

    console.log('[3/3] Authorization code received! Exchanging for tokens...');
    const tokenParams = new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
    });
    if (clientSecret) {
        tokenParams.set('client_secret', clientSecret);
    }

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: tokenParams.toString(),
    });
    const tokenJson = await tokenResp.json();

    if (!tokenResp.ok) {
        console.error('\nTOKEN EXCHANGE FAILED:');
        console.error(JSON.stringify({ status: tokenResp.status, error: tokenJson.error, description: tokenJson.error_description }, null, 2));
        if (String(tokenJson.error_description || '').toLowerCase().includes('client_secret')) {
            console.error('\nHINT: Your OAuth Client requires a Client Secret. Add GOOGLE_CLIENT_SECRET to .env or pass --client-secret, and save it in Semester Settings -> Data -> Google Drive Auto-Sync -> OAuth Setup.');
        }
        process.exit(1);
    }

    console.log(`    Token exchange OK! Has access_token=${Boolean(tokenJson.access_token)}, has refresh_token=${Boolean(tokenJson.refresh_token)}`);

    if (tokenJson.refresh_token) {
        const refreshParams = new URLSearchParams({
            client_id: clientId,
            refresh_token: tokenJson.refresh_token,
            grant_type: 'refresh_token',
        });
        if (clientSecret) refreshParams.set('client_secret', clientSecret);
        const refResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: refreshParams.toString(),
        });
        const refJson = await refResp.json();
        if (!refResp.ok || !refJson.access_token) {
            console.error('\nREFRESH TOKEN CHECK FAILED:', JSON.stringify({ status: refResp.status, error: refJson.error, description: refJson.error_description }));
            process.exit(1);
        }
        console.log('    Silent refresh_token exchange OK!');
    }

    const driveResp = await fetch(
        'https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&fields=files(id,name,modifiedTime,size)&pageSize=5',
        { headers: { Authorization: `Bearer ${tokenJson.access_token}` } }
    );
    const driveJson = await driveResp.json();
    if (!driveResp.ok) {
        console.error('\nGOOGLE DRIVE API CHECK FAILED:');
        console.error(JSON.stringify({ status: driveResp.status, error: driveJson.error }, null, 2));
        console.error('\nHINT: Enable "Google Drive API" in Google Cloud Console -> APIs & Services -> Library.');
        process.exit(1);
    }

    console.log(`    Google Drive appDataFolder access OK! Existing backup files: ${(driveJson.files || []).length}`);
    for (const f of driveJson.files || []) {
        console.log(`      - ${f.name} (${f.size || '?'} bytes, modified ${f.modifiedTime})`);
    }
    console.log('\nALL CHECKS PASSED! Your Google Drive OAuth setup is ready for Semester Desktop.');
}

main().catch((err) => {
    console.error('\nERROR:', err.message || err);
    process.exit(1);
});
