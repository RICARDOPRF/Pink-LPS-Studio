# Pink 3D Avatar Storage

The definitive Pink avatar is stored outside GitHub Pages in Supabase Storage.

## Runtime flow

1. The browser reads `public.pink_avatar_assets` through RLS using a publishable key.
2. Only the row with `is_active = true` and `status = 'active'` is visible to public clients.
3. The object URL is built from the public `pink-assets` bucket and `object_path`.
4. `window.PinkAvatarRegistry` hands the asset to `window.PinkAvatar3D.loadModel()` when `window.PinkAvatarModelAdapter` is available.
5. If there is no active asset, registry access fails, or an adapter is unavailable, the current portrait fallback remains active.

## Intended object layout

`pink-assets/avatars/pink/v1/pink.glb`

Future versions should use immutable version folders such as `v2`, `v3`, etc. The database controls which version is active.

## Security

- The bucket is public for direct model delivery by known object URL.
- No broad Storage SELECT policy is created, avoiding bucket listing exposure.
- No anonymous/authenticated upload, update, or delete policy is created.
- Model metadata is protected with RLS; public clients can only read the active row.
- Supabase publishable keys are browser-safe identifiers, not service-role or provider secrets.
