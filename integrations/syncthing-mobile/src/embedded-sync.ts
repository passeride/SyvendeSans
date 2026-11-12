/**
 * Original SyvendeSans integration code (proposed MIT license).
 * Adapted to SyncUp's NativeGoServerBridge contract, not yet wired to Noteriv.
 * Native bridge/Go daemon sources are MPL-2.0 in vendor/syncup.
 */
export interface SyncUpBridge {
  startServer(): number;
  stopServer(): boolean;
  getGuiAddress(): string;
  getApiKey(): string;
  getDeviceId(): string;
}

export type Vault = { folderId: string; label: string; uri: string };

export type FolderStatus = {
  state: string;
  needFiles: number;
  needBytes: number;
  globalFiles: number;
  error?: string;
};

export class EmbeddedSyncthing {
  private baseUrl: string | undefined;
  private key: string | undefined;

  constructor(
    private bridge: SyncUpBridge,
    private fetcher: typeof fetch = fetch,
  ) {}

  deviceId(): string {
    return this.bridge.getDeviceId();
  }

  async start(): Promise<void> {
    this.bridge.startServer();
    const gui = this.bridge.getGuiAddress();
    const url = new URL(gui.includes('://') ? gui : 'http://' + gui);
    if (url.protocol !== 'http:' ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        !url.port || url.username || url.password || url.pathname !== '/') {
      throw new Error('Refusing non-loopback Syncthing API address');
    }
    this.baseUrl = url.origin;
    this.key = this.bridge.getApiKey();
    if (!this.key) throw new Error('Embedded Syncthing has no REST API key');

    let lastFailure: unknown;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        await this.request('/rest/system/ping', 'GET', undefined, 1500);
        return;
      } catch (error) {
        lastFailure = error;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }
    throw new Error('Syncthing did not start: ' + String(lastFailure));
  }

  stop(): void {
    this.bridge.stopServer();
    this.baseUrl = undefined;
    this.key = undefined;
  }

  private async request<T>(
    path: string,
    method: 'GET' | 'PUT' | 'POST' = 'GET',
    body?: unknown,
    timeoutMs: number = 10_000,
  ): Promise<T> {
    if (!this.baseUrl || !this.key) throw new Error('Syncthing is not running');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher(this.baseUrl + path, {
        method,
        signal: controller.signal,
        headers: {
          'X-API-Key': this.key,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error('Syncthing REST ' + response.status + ' at ' + path);
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async status(folderId: string): Promise<FolderStatus> {
    const url = '/rest/db/status?folder=' + encodeURIComponent(folderId);
    return await this.request<FolderStatus>(url);
  }

  async scan(folderId: string): Promise<void> {
    await this.request<void>('/rest/db/scan?folder=' + encodeURIComponent(folderId), 'POST');
  }

  async addPeer(deviceId: string, name: string): Promise<void> {
    if (!/^[A-Z2-7-]{56,70}$/.test(deviceId)) throw new Error('Invalid device ID');
    const defaults = await this.request<Record<string, unknown>>('/rest/config/defaults/device');
    await this.request<void>('/rest/config/devices/' + encodeURIComponent(deviceId), 'PUT', {
      ...defaults,
      deviceID: deviceId,
      name,
      addresses: ['dynamic'],
      autoAcceptFolders: false,
    });
  }

  /**
   * Registers the very same file:// folder that Noteriv currently edits.
   * SAF content:// folders need the separate SyncUp Android SAF native adapter.
   */
  async addVault(vault: Vault, peerDeviceId: string): Promise<void> {
    if (!vault.uri.startsWith('file://')) throw new Error('Only app-local file:// vaults supported');
    const folderPath = decodeURIComponent(vault.uri.slice('file://'.length));
    if (!folderPath.startsWith('/')) throw new Error('Vault path is not absolute');
    const localDeviceId = this.deviceId();
    if (!localDeviceId) throw new Error('Syncthing identity not initialized');
    const defaults = await this.request<Record<string, unknown>>('/rest/config/defaults/folder');
    const member = (deviceID: string) => ({ deviceID, introducedBy: '', encryptionPassword: '' });
    await this.request<void>('/rest/config/folders/' + encodeURIComponent(vault.folderId), 'PUT', {
      ...defaults,
      id: vault.folderId,
      label: vault.label,
      filesystemType: 'basic',
      path: folderPath,
      type: 'sendreceive',
      devices: [member(localDeviceId), member(peerDeviceId)],
      fsWatcherEnabled: true,
      rescanIntervalS: 30,
    }, 120_000);
    const path = '/rest/db/ignores?folder=' + encodeURIComponent(vault.folderId);
    const previous = await this.request<{ ignore?: string[] }>(path);
    const ignore = [...new Set([
      ...(previous.ignore ?? []),
      '.noteriv/sync-state.json',
      '.git/',
      '.obsidian/workspace',
      '.obsidian/workspace.json',
      '.obsidian/workspace-mobile.json',
    ])];
    await this.request<void>(path, 'POST', { ignore });
  }
}
