/**
 * lib/localVideoServer.ts
 *
 * Shared by app/recap.tsx and app/rep-feedback.tsx — both play a recorded
 * clip inside a WebView artboard's <video> tag.
 *
 * THIRD approach to this problem, after two that didn't pan out:
 *   1. Base64 data: URI — held the whole clip in memory twice over (JS
 *      source text + decoded inside the WebView), silently went blank
 *      under memory pressure with no catchable callback (confirmed via
 *      device logs — nothing printed after onLoadEnd, across clip sizes).
 *   2. file:// src + WKWebView's allowingReadAccessToURL — fixed two real
 *      bugs in the computed grant (a wrong guessed root, then a /var vs
 *      /private/var symlink mismatch) and confirmed via logs the grant was
 *      finally mathematically correct — and the video STILL failed with
 *      the same MEDIA_ERR_SRC_NOT_SUPPORTED. Whatever's actually wrong
 *      with allowingReadAccessToURL for this case isn't diagnosable
 *      further without native (Xcode) tooling this session doesn't have.
 *
 * This sidesteps the whole WKWebView file-access security model: a tiny
 * local HTTP server (loopback-only, 127.0.0.1) serves the directory the
 * recorded clip lives in, and the <video> tag gets a normal http:// src.
 * Loading an http:// sub-resource into a page (whether that page is
 * itself file:// or Metro's dev http://) is NOT blocked the way a file://
 * sub-resource is — this is the same category of access as any other
 * <video src="http://..."> on the open web.
 *
 * ONE server for the whole app (the library's own docs: "at most one
 * server instance can be active... attempts to start a new instance will
 * crash" — recap.tsx stays mounted underneath rep-feedback.tsx after
 * router.push, so both are alive at once and must share the same
 * instance, not each start their own). Also reconnects to an
 * already-running NATIVE server via getActiveServerId() if the JS module
 * itself got reloaded (Fast Refresh) without stopping it first — per the
 * library's own documented pattern for this exact situation.
 */

import Server, { getActiveServerId, STATES } from '@dr.pogodin/react-native-static-server';

let serverPromise: Promise<Server> | null = null;
let currentRootDir: string | null = null;

function dirnameOfFileUri(fileUri: string): string {
  const idx = fileUri.lastIndexOf('/');
  return idx >= 0 ? fileUri.slice(0, idx) : fileUri;
}

function basenameOfFileUri(fileUri: string): string {
  const idx = fileUri.lastIndexOf('/');
  return idx >= 0 ? fileUri.slice(idx + 1) : fileUri;
}

async function ensureServer(rootDir: string): Promise<Server> {
  if (serverPromise && currentRootDir === rootDir) return serverPromise;
  currentRootDir = rootDir;
  serverPromise = (async () => {
    const activeId = await getActiveServerId();
    const server = activeId != null
      ? new Server({ fileDir: rootDir, id: activeId, state: STATES.ACTIVE })
      : new Server({ fileDir: rootDir });
    await server.start();
    return server;
  })();
  return serverPromise;
}

// Turns a recorded clip's real file:// path into a loopback http:// URL a
// WebView's <video> tag can load directly.
export async function getLocalVideoHttpUrl(videoFileUri: string): Promise<string> {
  const rootDir = dirnameOfFileUri(videoFileUri);
  const server = await ensureServer(rootDir);
  return `${server.origin}/${encodeURIComponent(basenameOfFileUri(videoFileUri))}`;
}
