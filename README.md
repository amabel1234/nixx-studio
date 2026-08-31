# Nixx Studio

Website katalog premium untuk jasa import map Roblox dengan tema dark gaming hitam-merah. Pengunjung dapat melihat paket, memilih fitur tambahan, mengisi username Roblox dan catatan, lalu membuka WhatsApp dengan pesan order yang sudah disiapkan. Admin dapat mengelola produk dan pengaturan kontak dari panel admin.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Express API
- Supabase Postgres via Replit connector atau direct Supabase REST
- Zod + OpenAPI-generated React Query hooks

## Setup lokal

1. Salin `.env.example` menjadi `.env` pada environment yang menjalankan API.
2. Isi `SESSION_SECRET`, `ADMIN_EMAIL`, dan `ADMIN_PASSWORD` dengan nilai kuat.
3. Jalankan isi `supabase/schema.sql` di Supabase SQL Editor. Script ini membuat tabel, RLS, pengaturan awal, dan tiga produk paket contoh.
4. Pastikan koneksi Supabase Replit sudah terpasang. Untuk Vercel, isi `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY` sebagai environment variable server-only.
5. Jalankan:

```bash
pnpm install
pnpm --filter @workspace/api-server run dev
```

Workflow web menjalankan frontend secara terpisah:

```bash
pnpm --filter @workspace/nixx-studio run dev
```

## Environment variable

| Variable | Wajib | Kegunaan |
| --- | --- | --- |
| `SESSION_SECRET` | Ya | Menandatangani cookie sesi admin |
| `ADMIN_EMAIL` | Ya | Email admin untuk login |
| `ADMIN_PASSWORD` | Ya | Password admin, jangan commit nilai aktual |
| `SUPABASE_URL` | Vercel | URL project Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel | Key server-only untuk operasi CRUD; jangan pernah expose ke frontend |
| `SUPABASE_ANON_KEY` | Opsional | Fallback key publik bila service role tidak dipakai |

Di Replit, API memakai koneksi Supabase terkelola sehingga URL dan key tidak perlu disimpan di source code. Di Vercel, API function memakai direct REST fallback dan membutuhkan tiga variable server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, dan kredensial admin.

## Supabase dan RLS

`supabase/schema.sql` mengaktifkan Row Level Security. Public hanya dapat membaca produk berstatus `active` dan site settings. Operasi admin dilakukan server-side menggunakan koneksi service role sehingga key tidak pernah dikirim ke browser.

## API

Kontrak utama berada di `lib/api-spec/openapi.yaml`. Setelah mengubah endpoint, regenerate client dan schema:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Endpoint:

- `GET /api/products`
- `POST/PATCH/DELETE /api/products` (admin)
- `GET/PATCH /api/settings`
- `POST /api/admin/login`
- `POST /api/admin/logout`
- `GET /api/admin/session`
- `GET /api/admin/summary`

## Build dan deploy

Build monorepo:

```bash
pnpm run build
```

Untuk Vercel, repository ini sudah memiliki `vercel.json`. Set Root Directory ke root repository, Build Command ke nilai pada `vercel.json`, dan isi semua environment variable yang ditandai Vercel pada tabel di atas. Jangan menaruh `SUPABASE_SERVICE_ROLE_KEY` di variable yang diawali `VITE_` dan jangan mengirimnya ke browser.

Project siap di-push ke GitHub:

```bash
git init
git add .
git commit -m "Build Nixx Studio"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```