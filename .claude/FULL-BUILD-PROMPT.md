# FULL PROJECT BUILD — Football Group Management Platform

Bu projeyi tek session'da sıfırdan ayağa kaldır. CLAUDE.md, .claude/schema.sql, .claude/schema.prisma, .claude/rls-policies.sql ve .claude/seed.sql dosyaları mevcut. Bunları referans al.

Multi-agent worktree'ler ve paralel çalışma ile hızlandır. Her fazı bitirince commit at.

---

## FAZ 0: ALTYAPI KURULUMU

### 0.1 — Docker + Supabase Local
- `docker-compose.yml` oluştur: Supabase local stack (PostgreSQL 15, GoTrue auth, PostgREST, Supabase Studio)
- Alternatif: `supabase init && supabase start` CLI kullan (hangisi daha stabil ise)
- `.env.local` dosyasını oluştur (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL)
- Docker'ı başlat, DB'nin ayağa kalktığını doğrula

### 0.2 — Veritabanı Şeması
- `.claude/schema.sql` dosyasını çalıştır
- `.claude/rls-policies.sql` dosyasını çalıştır
- `.claude/seed.sql` dosyasını çalıştır
- Prisma client'ı generate et (`npx prisma generate`)
- DB bağlantısını test et

### 0.3 — Next.js Projesi
- `npx create-next-app@latest . --typescript --tailwind --app --src-dir --import-alias "@/*"` (mevcut dosyalarla merge et)
- shadcn/ui kur ve yapılandır
- PWA manifest + service worker kur (next-pwa veya @ducanh2912/next-pwa)
- Temel layout: mobile-first responsive shell
- i18n kur (next-intl): en + tr dil dosyaları oluştur

### 0.4 — Proje Yapısı
```
src/
├── app/                    # Next.js App Router
│   ├── [locale]/          # i18n routing
│   │   ├── (auth)/        # login, register, forgot-password, reset-password
│   │   ├── (app)/         # authenticated user pages
│   │   │   ├── dashboard/
│   │   │   ├── matches/
│   │   │   ├── wallet/
│   │   │   ├── stats/
│   │   │   ├── profile/
│   │   │   └── notifications/
│   │   ├── (admin)/       # group admin pages
│   │   │   ├── matches/
│   │   │   ├── members/
│   │   │   ├── venues/
│   │   │   ├── payments/
│   │   │   ├── invites/
│   │   │   └── settings/
│   │   └── (owner)/       # owner console
│   │       ├── tenants/
│   │       └── dashboard/
│   ├── api/               # route handlers
│   └── invite/[token]/    # invite landing
├── components/            # reusable UI
│   ├── ui/               # shadcn primitives
│   ├── layout/           # shell, nav, bottom-bar
│   └── shared/           # domain-specific shared components
├── features/             # domain modules
│   ├── auth/
│   ├── tenants/
│   ├── members/
│   ├── matches/
│   ├── voting/
│   ├── ratings/
│   ├── wallet/
│   ├── stats/
│   └── notifications/
├── lib/                  # utilities
│   ├── supabase/        # client + server helpers
│   ├── validations/     # Zod schemas
│   └── i18n/
└── server/              # business logic layer
    ├── actions/         # server actions
    ├── services/        # domain services
    └── repositories/    # DB access
```

GIT COMMIT: "chore: project foundation — Next.js, Supabase, i18n, PWA, DB schema"

---

## FAZ 1: AUTH + TEMEL LAYOUT

### 1.1 — Supabase Auth
- Email + password auth (signUp, signIn, signOut)
- Email verification flow
- Password reset flow (forgot + reset pages)
- Auth middleware (src/middleware.ts): korumalı rotaları yönet
- Session yönetimi: Supabase SSR helpers

### 1.2 — Auth Sayfaları
- `/login` — email + şifre formu
- `/register` — kayıt formu + invite token desteği (query param olarak)
- `/forgot-password` — email gönder
- `/reset-password` — yeni şifre belirle
- `/invite/[token]` — invite landing: giriş yap veya kayıt ol, sonra gruba otomatik katıl
- `/join` — invite code ile katıl

### 1.3 — Layout Shell
- Mobile bottom navigation bar (Dashboard, Matches, Wallet, Stats, Profile)
- Desktop sidebar navigation
- Top bar: grup adı, bildirim ikonu, dil değiştirme
- Grup seçici (kullanıcı birden fazla gruba üyeyse)
- Role-based navigation: admin menü items sadece admin/owner'a görünsün

### 1.4 — Invite Flow
- Invite link ile kayıt: token → register → otomatik membership oluştur
- Invite code ile katılma: kod gir → doğrula → membership oluştur
- Token/code register flow'u survive etmeli

GIT COMMIT: "feat: auth system — login, register, invite flow, layout shell"

---

## FAZ 2: TENANT + MEMBERSHIP

### 2.1 — Owner Console
- `/owner/dashboard` — tenant listesi, genel istatistikler
- `/owner/tenants` — tenant CRUD
- `/owner/tenants/[id]` — tenant detay, admin atama, feature flags

### 2.2 — Membership Yönetimi
- Admin: üye listesi (aktif, davetli, arşivlenmiş)
- Admin: guest oyuncu oluştur (sadece isim ile)
- Admin: kullanıcı arşivle / geri yükle
- Geri yükleme sırasında: admin istatistik dahil/hariç seçimi yapabilmeli
- Invite yönetimi: link oluştur/deaktive et, kod yenile

### 2.3 — Profil
- Kullanıcı profil düzenleme
- Pozisyon tercihleri seçimi (goalkeeper, defender, midfield, forward — çoklu)
- Dil tercihi
- Avatar

GIT COMMIT: "feat: tenant management, membership, profiles"

---

## FAZ 3: MAÇ İŞLEMLERİ

### 3.1 — Venue CRUD
- Admin: mekan oluştur/düzenle/deaktive et

### 3.2 — Maç Oluşturma + Yönetim
- Admin/assistant: maç oluştur (tarih, saat, mekan, format, ücret)
- Katılım yönetimi: invited → confirmed → declined → reserve → checked_in
- Takım atama: kırmızı/mavi takımlara oyuncu sürükle-bırak veya ata
- Maç durumu geçişleri: draft → open → teams_ready → completed/cancelled

### 3.3 — Pre-Match Poll
- Takımlar belirlendikten sonra: kazanan tahmini anketi aç
- Tüm grup üyeleri oy verebilir
- Sonuçları göster (oy sayıları)

### 3.4 — Maç Kapatma
- Admin: skor gir → match_results oluştur
- Sistem: win/loss/draw hesapla
- Sistem: played oyunculara match_fee uygula (ledger_transaction)
- Sistem: post-match rating ve player-of-the-match voting aç
- Sistem: bildirimler tetikle

GIT COMMIT: "feat: match lifecycle — create, attend, teams, poll, close"

---

## FAZ 4: POST-MATCH

### 4.1 — Player of the Match Voting
- Sadece played oyuncular oy verebilir
- Her iki takımdan birine oy verilebilir
- Kendi kendine oy YASAK
- 1 dakika edit penceresi, sonra kilitlenir

### 4.2 — Teammate Rating
- Sadece played oyuncular puan verebilir
- Sadece kendi takım arkadaşlarına (kendisi hariç)
- 1-5 arası integer
- 1 dakika edit penceresi
- Ham puanlar ASLA kullanıcıya veya admine gösterilmez
- Sadece ortalamalar ve aggregate veriler

### 4.3 — Rating Privacy
- Server actions üzerinden: sadece aggregate sonuçlar dön
- RLS: teammate_ratings ve player_of_match_votes doğrudan SELECT yasak
- API endpoint'leri sadece safe_member_stats_view ve safe_leaderboard_metrics_view üzerinden

GIT COMMIT: "feat: post-match voting and ratings with privacy enforcement"

---

## FAZ 5: FİNANS

### 5.1 — Ledger/Wallet
- Ledger-based transaction model (ledger_transactions tablosu)
- Balance = SUM of credits - SUM of debits
- Admin: ödeme kaydet ("Serdar £20 ödedi")
- Admin: düzeltme girişi yapabilir
- Kullanıcı: kendi bakiye ve işlem geçmişini görsün

### 5.2 — Wallet UI
- Kullanıcı: bakiye kartı + son işlemler listesi
- Admin: üye bakiyeleri tablosu + ödeme girişi formu
- İşlem detayları: tip, tutar, tarih, açıklama

GIT COMMIT: "feat: wallet/ledger system with payment entry"

---

## FAZ 6: İSTATİSTİKLER + LEADERBOARD

### 6.1 — Kişisel İstatistikler
- Toplam maç, galibiyet, mağlubiyet, beraberlik, win rate
- Player of the match sayısı
- Genel ortalama rating
- Pozisyon dağılımı
- Son maçlar

### 6.2 — Grup Leaderboard
- En iyi ortalama rating
- En çok player of the match
- En yüksek win rate
- Son form (son 5-10 maç)

### 6.3 — Admin Analytics
- Maç tamamlanma oranları
- Rating doluluk oranları
- Basit pair/chemistry özeti (aynı takımda oynayan ikililerin win rate'i)

GIT COMMIT: "feat: statistics, leaderboards, analytics views"

---

## FAZ 7: BİLDİRİMLER

### 7.1 — In-App Notifications
- Bildirim listesi sayfası
- Okundu işaretleme
- Bildirim badge (navbar'da)

### 7.2 — Web Push
- Push subscription kayıt (PushSubscription API)
- Service worker push handler
- Bildirim tipleri: match_starting_soon, pre_match_poll_open, post_match_rating_open, wallet_updated

GIT COMMIT: "feat: in-app and web push notifications"

---

## FAZ 8: GUEST CONVERSION

- Admin: guest oyuncuyu registered member'a dönüştür
- Dönüşüm sırasında korunacaklar: maç geçmişi, takım atamaları, wallet, istatistikler, PotM sayısı, alınan puanlar
- 3 maç üst üste oynayan guest → main squad eligibility algılansın (admin onayı gerekli, otomatik promote yok)
- person_account_links tablosu üzerinden link_type: claimed_guest

GIT COMMIT: "feat: guest-to-member conversion with history preservation"

---

## FAZ 9: POLISH + PWA

- Tüm sayfaların responsive kontrolü (mobile-first)
- Dark/light mode
- Loading states, error boundaries
- Empty states
- Install prompt (PWA)
- Offline fallback sayfası

GIT COMMIT: "feat: PWA polish, responsive, dark mode, error handling"

---

## FAZ 10: TEST SÜİTİ — PARALEL AGENT'LARLA

### 10.1 — Unit Tests (Vitest)
Aşağıdaki tüm domain servislerini test et:
- Tenant isolation: bir grubun verisi başka gruba sızmaz
- Role-based permissions: her rol sadece yetkili aksiyonları alabilir
- Invite join flow: link ile, code ile, manual ekleme
- Guest conversion: tüm geçmiş korunuyor mu?
- Match close + fee application: skor gir → played oyunculara fee
- Rating eligibility: sadece played oyuncular rate edebilir, sadece takım arkadaşını, kendini değil
- 1 dakika edit lock: süre dolunca güncelleme reddedilmeli
- Archive/restore: arşivlenen kullanıcı listeden kaybolur, geri yüklenince admin istatistik kararı verir
- Stats inclusion/exclusion: excluded kullanıcı leaderboard'da görünmez
- Wallet balance hesaplama: ledger entries'den doğru balance türetilir
- Self-vote prevention: player of the match'te kendine oy atamaz
- Cross-team rating prevention: karşı takıma puan veremez

### 10.2 — E2E Tests (Playwright)
Her senaryo için tam akış testi:

**Auth Flows:**
- Register → email verify → login
- Login → dashboard
- Forgot password → reset → login with new password
- Register with invite token → auto-join group
- Join with invite code

**Admin Flows:**
- Create venue → create match → open attendance
- Manage attendance: invite, confirm, decline, reserve
- Assign teams (drag players to red/blue)
- Open pre-match poll
- Close match: enter score → verify fee charged
- Create guest player
- Archive user → verify hidden from lists
- Restore user → choose stats inclusion
- Record payment → verify wallet updated
- Generate/regenerate invite link and code

**User Flows:**
- View dashboard → upcoming match
- Confirm/decline attendance
- Vote in pre-match prediction poll
- After match close: submit player of the match vote
- After match close: rate teammates (1-5)
- Try to edit rating after 1 minute → should fail
- View personal stats
- View leaderboard
- View wallet balance and history
- Switch between groups (multi-group user)
- Change profile, positions, language

**Privacy & Security E2E:**
- User tries to access admin page → redirect/403
- User tries to see raw ratings → not exposed
- Admin tries to see individual rating values → only aggregates shown
- User from Group A tries to access Group B data → blocked
- Guest user (no account) appears in match but can't login
- Expired invite token → rejected
- Used-up invite (max_uses reached) → rejected

**Edge Cases:**
- Match with 0 participants → close attempt should handle gracefully
- Double-vote prevention (player of match)
- Rating exactly at boundary (1 and 5 are valid, 0 and 6 are not)
- Concurrent rating submissions
- Currency display matches group setting

### 10.3 — Security Tests
- SQL injection attempts on all form inputs
- XSS attempts on all text fields (display_name, venue name, notes, etc.)
- CSRF protection verification
- RLS bypass attempts: direct Supabase client calls from wrong tenant context
- Auth token tampering: modify JWT claims → should be rejected
- Role escalation: user tries admin-only server actions
- Rate limiting on auth endpoints (login, register, forgot-password)
- Sensitive data exposure: check API responses don't leak password hashes, raw ratings, auth tokens

### 10.4 — Monkey / Chaos Testing
gremlins.js veya benzeri chaos testing aracı ile:
- Random click, scroll, form fill, navigation testi
- Tüm sayfalarda 30 saniye monkey test
- Console error yakalama
- Unhandled promise rejection yakalama
- Network error simulation (offline mode)
- Rapid navigation (back/forward spam)

Eğer gremlins.js uygun değilse, Playwright ile custom monkey test yaz:
```typescript
// Rastgele sayfalarda:
// - Rastgele elementlere tıkla
// - Rastgele text input'lara random string yaz
// - Rastgele butonlara bas
// - Console.error dinle
// - Unhandled exception dinle
// - 60 saniye boyunca tekrarla
// - Hiçbir unhandled crash olmamalı
```

### 10.5 — Performance Tests
- Lighthouse CI: mobile score > 80
- Largest Contentful Paint < 2.5s
- First Input Delay < 100ms
- Cumulative Layout Shift < 0.1

### 10.6 — Accessibility Tests
- axe-core ile tüm sayfaları tara
- Klavye navigasyonu çalışıyor mu
- Screen reader uyumluluğu (aria labels)
- Renk kontrastı kontrolü

GIT COMMIT: "test: comprehensive test suite — unit, e2e, security, chaos, a11y"

---

## ÇALIŞMA STRATEJİSİ

1. **Paralel agent'lar kullan:** Bağımsız fazları worktree'lerde paralel çalıştır. Örneğin:
   - Agent 1: Auth + Layout (Faz 1)
   - Agent 2: Owner Console (Faz 2.1)
   - Bunlar bittikten sonra merge edip devam et

2. **Her faz bitiminde:**
   - `npm run build` — build hatası olmamalı
   - `npm run lint` — lint temiz olmalı
   - TypeScript strict mode hata vermemeli
   - Git commit at

3. **Test fazında paralel:**
   - Agent A: Unit testleri yaz + çalıştır
   - Agent B: E2E testleri yaz + çalıştır
   - Agent C: Security testleri yaz + çalıştır
   - Agent D: Monkey/chaos testleri yaz + çalıştır

4. **Son kontrol:**
   - Tüm testler geçiyor mu?
   - Build başarılı mı?
   - Docker ile fresh start yapınca her şey çalışıyor mu?
   - `docker compose up` → DB migrate → seed → `npm run dev` → app açılıyor mu?

---

## KRİTİK KURALLAR (CLAUDE.md'den)

- Tenant isolation: HER YERDE zorla
- Raw rating verisi: ASLA expose etme
- Ledger: mutable balance YASAK, transaction log zorunlu
- Guest conversion: geçmiş ASLA kaybolmamalı
- Match fee: sadece match close + played status'ta uygulanır
- Self-vote: YASAK
- Cross-team rating: YASAK
- 1 dakika edit lock: zorunlu
- i18n: tüm string'ler en + tr olmalı
- Soft delete: hard delete yok normal flow'da
