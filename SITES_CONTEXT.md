# haorio.com - Sites Overview & Development Guide

## Project Structure

haorio.com은 여러 개의 독립 SPA(Single Page App) 사이트들을 호스팅하는 플랫폼입니다.

```
sites/
├── home/                    # Blog (Next.js) — Obsidian 연동
├── lab/                     # Study apps (React + Vite)
├── itpeflash/               # 기술사 오답 노트 (this project)
├── multiling/               # 다국어 학습 (this project)
├── langstudy/               # 언어 학습
├── jw-study/                # 여호와의 증인 자료
├── iban-ko/                 # IBAN 설명
├── itpe/                    # 기술사 개요
└── notes/                   # 노트 앱
```

## Active Standalone Sites (Created this session)

### 1. itpeflash.haorio.com
**Repository:** https://github.com/Haorio-Lab/itpeflash.haorio.com.git

기술사 시험 오답 노트. CDN React + localStorage CRUD.

**Features:**
- Card-based note management (17 도메인)
- Rich text editor (contenteditable + execCommand)
- Image resize functionality
- Browser history support (back button)
- soft delete → trash → permanent

**Obsidian Integration:**
- WebDAV mount: `/mnt/synology/homes/HenryHoy/Drive/ObsidianVault/HenryNote/기술사 오답 노트/`
- Sample MD: `2026-06-18-정규화-3정규형-혼동.md`
- Frontmatter: title, domain, tags, importance, source, created
- Body sections: ## 문제, ## 내용, ## 암기두음, ## 메모

**Deployment:**
```bash
npm run deploy:itpeflash
```
Custom domain: CNAME → haorio-itpeflash.pages.dev

**See:** `sites/itpeflash/CONTEXT.md` for detailed architecture

---

### 2. multiling.haorio.com
**Repository:** https://github.com/Haorio-Lab/multiling.haorio.com.git

7개 언어 다국어 학습 플랫폼. CDN React, no persistence.

**Features:**
- 4 screens: Today (Card/List), Flashcard, Review, Saved
- 18 pre-loaded vocabulary concepts
- Language toggles (KO/EN/JA/ZH/ES/DE/FR)
- Status tracking (unchecked → memorized → review → difficult)
- 3D flashcard flip animation
- Desktop sidebar + Mobile bottom nav

**Data Model:**
```javascript
{
  id, ko, ko_rom, en, en_rom, ja, ja_rom, zh, zh_rom, es, es_rom, de, de_rom, fr, fr_rom,
  tags[], ex: {ko, en, ja, zh, es, de, fr}
}
```

**Storage:** UI-only state (no localStorage)

**Deployment:**
```bash
npm run deploy:multiling
```
Custom domain: CNAME → haorio-multiling.pages.dev

**See:** `sites/multiling/CONTEXT.md` for detailed architecture

---

## Deployment Pipeline

### Local Setup
```bash
npm install  # if needed
npm run deploy:itpeflash   # or deploy:multiling
```

### Cloudflare Pages
- Project names: `haorio-itpeflash`, `haorio-multiling`
- Branch: `main`
- Custom domains via CNAME (API-configured, typically active in 2-5 min)

### Environment
`.env` in root contains:
```
CLOUDFLARE_API_TOKEN=cfut_...
CLOUDFLARE_ACCOUNT_ID=8698003337...
```

### Domain Setup
Custom domain added via Cloudflare API:
```bash
curl -X POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/pages/projects/{PROJECT}/domains \
  -H "Authorization: Bearer {TOKEN}" \
  -d '{"name":"..."}'
```

DNS record (CNAME, proxied):
```
multiling.haorio.com → haorio-multiling.pages.dev
itpeflash.haorio.com → haorio-itpeflash.pages.dev
```

## File Conventions

### Per-Site Structure
```
sites/{name}/
├── index.html           # main file (CDN React apps)
├── _headers             # Cloudflare security headers
├── CONTEXT.md           # next developer guide
└── [optional] public/, src/, etc (if build step)
```

### _headers Content (Security)
```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://cloudflareinsights.com; img-src 'self' data:; font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://static.cloudflareinsights.com; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
```

CSP note: allows React/Babel CDN (unpkg), Cloudflare Insights, Google Fonts, but blocks external iframes.

## Common Tasks

### Test Locally
CDN-based sites (no build step):
```bash
cd sites/{site}
python3 -m http.server 8000
# open localhost:8000
```

Build-based sites:
```bash
npm run dev:{site}   # sites/home, sites/lab
```

### Add New Single-File CDN React Site
1. Create `sites/{name}/` directory
2. Create `index.html` with:
   ```html
   <!DOCTYPE html>
   <script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"></script>
   <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"></script>
   <script src="https://unpkg.com/@babel/standalone@7.24.7/babel.min.js"></script>
   <script type="text/babel">
     // React code
   </script>
   ```
3. Add `_headers` (copy from itpeflash/multiling)
4. Add `CONTEXT.md` (for next developer)
5. In `package.json`, add:
   ```json
   "deploy:{name}": "npx wrangler pages deploy sites/{name} --project-name=haorio-{name} --branch=main --commit-dirty=true"
   ```
6. Create GitHub repo `Haorio-Lab/{name}.haorio.com.git`
7. Push & create Cloudflare Pages project

### Modify Existing Site
1. Edit `sites/{site}/index.html`
2. Test locally (python3 -m http.server)
3. Deploy: `npm run deploy:{site}`

## Obsidian Integration

Only applicable to **itpeflash** (for now).

### Important: WebDAV Handling
```bash
# ⚠️  NEVER do this (WSL OOM-kill):
find /mnt/synology/... -name "*.md"  # recursive scan kills WSL

# DO THIS instead (bounded):
ls -la /mnt/synology/homes/HenryHoy/Drive/ObsidianVault/HenryNote/기술사\ 오답\ 노트/
```

### File Template for itpeflash MD Files
See `sites/itpeflash/CONTEXT.md` for exact schema and example.

Location: `/mnt/synology/homes/HenryHoy/Drive/ObsidianVault/HenryNote/기술사 오답 노트/{date}-{slug}.md`

## Troubleshooting

### Deployment Fails: "Project not found"
Cloudflare Pages project doesn't exist. Create it:
```bash
npx wrangler pages project create haorio-{name} --production-branch=main
```

### Custom Domain Stuck on "pending"
Domain verification usually takes 2-5 min. Check status via API:
```bash
curl https://api.cloudflare.com/client/v4/accounts/{ID}/pages/projects/{PROJECT}/domains \
  -H "Authorization: Bearer {TOKEN}"
```

### WebDAV Mount Slow/Hanging
davfs2 may be congested. Check mount status:
```bash
mount | grep synology
# if hung: sudo umount /mnt/synology (then remount)
```

### localStorage Data Lost
Possible causes:
- Private browsing mode (no persistence)
- Cache cleared
- Site name changed (key lookup mismatch)

For itpeflash, keys are: `oa-notes-v2`, `oa-statuses`

---

## Next Steps for New Developers

1. **Start with CONTEXT.md in the specific site folder** (multiling/ or itpeflash/)
2. **Test locally** before deploying
3. **Obey WebDAV rules** if touching Obsidian integration
4. **Keep _headers updated** when adding external dependencies
5. **Push to both GitHub repos AND deploy via wrangler**

---

**Last updated:** 2026-06-18  
**Maintained by:** Claude Code + haorio
