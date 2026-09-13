// Pink Avatar Asset Registry — Supabase-backed discovery for the definitive GLB/VRM avatar.
// Public/publishable credentials only. Model writes remain server/admin controlled.
(() => {
  const stage = document.querySelector('#pinkStage');
  if (!stage || window.PinkAvatarRegistry) return;

  const CONFIG = Object.freeze({
    supabaseUrl: 'https://membyrbgynicllzrhjsl.supabase.co',
    publishableKey: 'sb_publishable_GZzthc-BDR6jHPDgLfhe-A_esE0t_C1',
    table: 'pink_avatar_assets',
    defaultBucket: 'pink-assets'
  });

  const ALLOWED_FORMATS = new Set(['glb', 'gltf', 'vrm']);
  let status = 'idle';
  let lastAsset = null;
  let lastPublicUrl = null;
  let lastError = null;
  let requestSerial = 0;

  function setStatus(next, detail = '') {
    status = next;
    stage.dataset.avatarRegistry = next;
    if (detail) stage.dataset.avatarRegistryDetail = detail;
    else delete stage.dataset.avatarRegistryDetail;
  }

  function cleanPath(value) {
    const path = String(value || '').trim().replace(/^\/+/, '');
    if (!path || path.includes('..')) throw new Error('Pink avatar object path is invalid');
    return path;
  }

  function normalizeAsset(row) {
    if (!row || typeof row !== 'object') return null;
    const format = String(row.format || '').toLowerCase();
    if (!ALLOWED_FORMATS.has(format)) throw new Error(`Unsupported Pink avatar format: ${format || 'unknown'}`);
    const objectPath = cleanPath(row.object_path);
    const bucketId = String(row.bucket_id || CONFIG.defaultBucket).trim() || CONFIG.defaultBucket;
    return {
      slug: String(row.slug || 'pink').trim() || 'pink',
      version: String(row.version || 'unknown'),
      bucketId,
      objectPath,
      format,
      status: String(row.status || 'active'),
      metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
      updatedAt: row.updated_at || null
    };
  }

  function encodeObjectPath(path) {
    return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function publicObjectUrl(asset) {
    return `${CONFIG.supabaseUrl}/storage/v1/object/public/${encodeURIComponent(asset.bucketId)}/${encodeObjectPath(asset.objectPath)}`;
  }

  async function fetchActiveAsset() {
    const endpoint = new URL(`${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}`);
    endpoint.searchParams.set('select', 'slug,version,bucket_id,object_path,format,status,metadata,updated_at');
    endpoint.searchParams.set('is_active', 'eq.true');
    endpoint.searchParams.set('status', 'eq.active');
    endpoint.searchParams.set('limit', '1');

    const response = await fetch(endpoint, {
      headers: {
        apikey: CONFIG.publishableKey,
        Accept: 'application/json'
      },
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`Pink avatar registry HTTP ${response.status}`);
    const rows = await response.json();
    return normalizeAsset(Array.isArray(rows) ? rows[0] : null);
  }

  async function activateAsset(asset, serial) {
    if (!asset || serial !== requestSerial) return null;
    lastAsset = asset;
    lastPublicUrl = publicObjectUrl(asset);
    lastError = null;

    window.dispatchEvent(new CustomEvent('pinkavatar:asset-ready', {
      detail: { ...asset, url: lastPublicUrl }
    }));

    const avatar = window.PinkAvatar3D;
    const adapter = window.PinkAvatarModelAdapter;
    if (!avatar?.loadModel || !adapter?.load) {
      setStatus('adapter-pending', `${asset.slug}@${asset.version}`);
      return { asset, url: lastPublicUrl, loaded: false, reason: 'adapter-pending' };
    }

    setStatus('loading-model', `${asset.slug}@${asset.version}`);
    await avatar.loadModel({
      modelUrl: lastPublicUrl,
      format: asset.format,
      adapter,
      asset,
      metadata: asset.metadata
    });
    if (serial !== requestSerial) return null;
    setStatus('model-loaded', `${asset.slug}@${asset.version}`);
    return { asset, url: lastPublicUrl, loaded: true };
  }

  async function refresh() {
    const serial = ++requestSerial;
    setStatus('loading');
    lastError = null;
    try {
      const asset = await fetchActiveAsset();
      if (serial !== requestSerial) return snapshot();
      if (!asset) {
        lastAsset = null;
        lastPublicUrl = null;
        setStatus('no-active-model');
        return snapshot();
      }
      await activateAsset(asset, serial);
    } catch (error) {
      if (serial !== requestSerial) return snapshot();
      lastError = error;
      setStatus('error', error?.message || String(error));
      window.PinkEvolution?.recordIssue?.('avatar-registry', error?.message || error);
      console.warn('Pink avatar registry: keeping portrait fallback.', error);
    }
    return snapshot();
  }

  function snapshot() {
    return {
      status,
      asset: lastAsset ? { ...lastAsset } : null,
      url: lastPublicUrl,
      error: lastError?.message || null,
      fallbackActive: window.PinkAvatar3D?.snapshot?.().mode === 'portrait-fallback'
    };
  }

  function destroy() {
    requestSerial += 1;
    lastAsset = null;
    lastPublicUrl = null;
    lastError = null;
    setStatus('destroyed');
  }

  window.PinkAvatarRegistry = { refresh, snapshot, destroy };
  window.addEventListener('pinkavatar:adapter-ready', refresh);
  refresh();
})();
