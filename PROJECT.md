# edgewit

**Test-case-first knowledge bank for AI coding agents.**

Kod yazmadan önce "bu şey nerede kırılır?" sorusunu deterministik olarak cevaplayan
bir edge-case kataloğu + onu ajanlara servis eden bir MCP yüzeyi + o metodolojiyi
zorlayan bir skill.

---

## 1. Problem

AI ajanları kod üretmekte iyi, **spec'i sorgulamakta kötü**.

Bir ajana "login endpoint yaz" dersen çalışan 30 satır yazar. Sormadığı şeyler:

- Token istek işlenirken expire olursa?
- Aynı kullanıcı 3 cihazdan aynı anda login olursa?
- Şifre reset token'ı iki kez kullanılırsa?
- Rate limit'e takılan istek retry edilirse idempotent mi?

Bunlar "yaratıcılık" gerektirmiyor. Bunlar **bilinen, tekrarlayan, kataloglanabilir**
şeyler. Ajanın eksiği bilgi değil, **o bilgiyi doğru anda hatırlama refleksi**.

edgewit bu refleksi dışsallaştırır: kodun yazılmasından önce çalışan bir katman.

### Neden "test-case-first"

Test case yazmak = uygulamanın limitlerini yazmak. Limitler yazılıysa:

- Ajanın üreteceği kodun kabul kriteri baştan bellidir.
- Belirsizlikler kod yazılmadan önce yüzeye çıkar (en ucuz olduğu an).
- "Bitti" ifadesi ölçülebilir hale gelir.

Bu bir QA pratiği değil, bir **spec pratiği**. Testler burada doğrulama aracı değil,
**tasarım aracı**.

---

## 2. Ne DEĞİL

Kapsamı korumak için, açıkça dışarıda bıraktıklarımız:

| Değil | Neden |
|---|---|
| Test runner | Test çalıştırmıyoruz. Case üretiyoruz, koşturmayı proje kendi yapar. |
| Test generator (kod → test) | Var olan koddan test türetmek farklı problem. Biz kod yokken çalışırız. |
| Linter / static analyzer | AST'ye bakmıyoruz. Niyet ve domain seviyesinde çalışıyoruz. |
| Genel-amaçlı QA asistanı | Küratörlenmiş, dar, derin bir bank. Genişlik değil derinlik. |
| LLM ile doldurulmuş katalog | Bank elle yazılır. LLM'e yazdırılırsa değer önermesi çöker (bkz. §7). |

---

## 3. Mimari — üç katman

```
┌─────────────────────────────────────────────────────────┐
│  SKILL katmanı  —  metodolojiyi zorlar                  │
│  "kod yazmadan önce probe et, belirsizlikleri sor"      │
└────────────────────────┬────────────────────────────────┘
                         │ çağırır
┌────────────────────────▼────────────────────────────────┐
│  MCP katmanı  —  deterministik retrieval                │
│  probe_limits / generate_test_cases / audit_coverage    │
└────────────────────────┬────────────────────────────────┘
                         │ okur
┌────────────────────────▼────────────────────────────────┐
│  BANK katmanı  —  küratörlenmiş bilgi                   │
│  banks/frontend/**  banks/backend/**  (YAML)            │
└─────────────────────────────────────────────────────────┘
```

**Neden üç katman ayrı:**

- Yalnız **MCP** yazarsan ajan onu çağırmayı unutur. Tool'un varlığı kullanılmasını
  garanti etmez.
- Yalnız **skill** yazarsan bilgi hallucinate olur. Skill davranış tarifler, veri taşımaz.
- **Bank** MCP'den ayrı olmalı ki katkı vermek kod bilgisi gerektirmesin ve bank
  başka yüzeylerden de (CLI, statik site, doküman) okunabilsin.

---

## 4. Bank katmanı — frontend / backend ayrımı

Bu ayrım kozmetik değil. İki tarafın **kırılma modeli** temelden farklı:

- **Backend** deterministiktir ve durum sunucudadır. Kırılmalar: eşzamanlılık, kısmi
  başarısızlık, veri bütünlüğü, güven sınırı.
- **Frontend** non-deterministiktir ve durum kullanıcıdadır. Kırılmalar: kullanıcı
  zamanlaması, ağ değişkenliği, cihaz/ortam çeşitliliği, algı.

Aynı şemayı paylaşırlar ama `observable` (nasıl gözlemlenir) alanları taban tabana
farklı üretilir. Bu yüzden ayrı ağaçlar.

### Ağaç

```
banks/
├── backend/
│   ├── auth/
│   │   ├── token-lifecycle.yaml       # expire, refresh race, clock skew, revocation
│   │   ├── session.yaml               # concurrent device, fixation, logout propagation
│   │   └── password-reset.yaml        # token reuse, enumeration, expiry window
│   ├── rest-api/
│   │   ├── pagination.yaml            # cursor drift, page beyond end, mid-scroll delete
│   │   ├── idempotency.yaml           # retry, duplicate key, partial write
│   │   ├── validation.yaml            # type coercion, unicode, null vs absent, size limits
│   │   ├── error-contract.yaml        # status code semantics, leakage, partial success
│   │   └── versioning.yaml            # breaking change, deprecation, client skew
│   ├── data/
│   │   ├── transactions.yaml          # isolation, deadlock, rollback side-effect
│   │   ├── migrations.yaml            # backward compat, long-running, rollback
│   │   └── constraints.yaml           # unique race, cascade delete, orphan
│   ├── concurrency/
│   │   ├── race-conditions.yaml       # TOCTOU, lost update, double-submit
│   │   └── locking.yaml               # timeout, deadlock, lock leak
│   ├── integration/
│   │   ├── external-calls.yaml        # timeout, partial response, retry storm
│   │   ├── webhooks.yaml              # replay, out-of-order, signature, at-least-once
│   │   └── queues.yaml                # poison message, duplicate, ordering, DLQ
│   ├── files/
│   │   └── upload.yaml                # size, mime spoof, path traversal, interrupted
│   └── cross-cutting/
│       ├── datetime-timezone.yaml     # DST, leap, negative duration, storage tz
│       ├── money.yaml                 # rounding, currency mixing, float, negative
│       └── rate-limiting.yaml         # burst, distributed counter, retry-after
│
└── frontend/
    ├── forms/
    │   ├── validation.yaml            # sync vs async, paste, autofill, error timing
    │   ├── submission.yaml            # double-submit, unload during submit, slow network
    │   └── state-persistence.yaml     # back button, refresh, draft recovery
    ├── async-ui/
    │   ├── loading-states.yaml        # skeleton vs spinner, flash, min-duration
    │   ├── race-conditions.yaml       # stale response, unmount-after-fetch, out-of-order
    │   └── error-recovery.yaml        # retry affordance, partial failure, offline
    ├── data-display/
    │   ├── lists.yaml                 # empty, one item, 10k items, mid-list mutation
    │   ├── pagination-scroll.yaml     # infinite scroll + back nav, scroll restore
    │   └── text-overflow.yaml         # long words, RTL, i18n length growth, emoji
    ├── navigation/
    │   ├── routing.yaml               # deep link, unauth redirect + return, back/forward
    │   └── unsaved-changes.yaml       # nav guard, browser close, tab switch
    ├── input/
    │   ├── interaction.yaml           # double-click, rapid toggle, keyboard-only, touch
    │   └── file-picker.yaml           # cancel, huge file, wrong type, drag-drop
    ├── state/
    │   ├── auth-ui.yaml               # token expiry mid-session, multi-tab logout
    │   └── optimistic-updates.yaml    # rollback, conflict, offline queue
    └── cross-cutting/
        ├── accessibility.yaml         # focus trap, announce, contrast, reduced motion
        ├── responsive.yaml            # breakpoint boundary, orientation, zoom 200%
        └── performance-perception.yaml # jank, layout shift, time-to-interactive
```

Bu ağacın tamamı **hedef**, başlangıç değil. Başlangıç kapsamı §8'de.

### Case şeması

```yaml
# banks/backend/auth/token-lifecycle.yaml
domain: backend/auth/token-lifecycle
version: 1
description: >
  Access/refresh token'ların yaşam döngüsündeki sınır durumları.

cases:
  - id: auth.token.expires-mid-request
    title: Token istek işlenirken expire olur
    category: boundary          # boundary | race | failure | security | data-integrity | ux
    risk: high                  # high | medium | low
    applies_when:               # retrieval filtresi — hangi bağlamda gündeme gelir
      - stateless auth (JWT vb.)
      - uzun süren istek işleme (>1s)

    question: >
      Auth başta doğrulanıp işlem 30 saniye sürerse, token o sırada expire olursa
      istek tamamlanır mı, yarıda kesilir mi?

    why: >
      Auth genelde middleware'de bir kez kontrol edilir. İşlem süresi token
      ömrüne yaklaştığında, "yetkiliyken başlayan" iş "yetkisizken" biter.
      Yarım kalan yan etkiler en tehlikeli sonucudur.

    observable: >
      İşlem ya tamamen uygulanır ya hiç uygulanmaz. Yarım yazılmış durum
      kalmamalı. Kesilme durumunda dönen hata, işlemin uygulanmadığını
      belirtmeli.

    failure_mode: >
      Kısmi yazma: kayıt oluşturulmuş ama ilişkili kayıt oluşturulmamış,
      istemci 401 alıp retry ediyor, çift kayıt.

    given_when_then:
      given: "Geçerli ama 2 saniye sonra expire olacak bir token"
      when:  "İşlenmesi 5 saniye süren bir yazma isteği gönderilir"
      then:  "İşlem ya tam uygulanır ya hiç uygulanmaz; kısmi durum kalmaz"

    seen_in:                    # kanıt bağı — bkz. §7
      - "RFC 6749 §1.5 (refresh token rationale)"
      - "Stripe API: idempotency keys, 24h retention"

    related:
      - auth.token.refresh-race
      - rest.idempotency.retry-after-timeout
```

**Şemadaki kritik alanlar:**

| Alan | Neden var |
|---|---|
| `observable` | Bu olmadan katalog blog yazısına dönüşür. Ölçülebilir davranış tarifi. |
| `failure_mode` | "Yanlış giderse ne olur" — riski somutlaştırır, önceliklendirmeyi mümkün kılar. |
| `applies_when` | Retrieval'ın alakasız case döndürmesini engeller. Sinyal/gürültü oranı. |
| `seen_in` | Kanıt bağı. "İyi fikir" ile "gerçekten olmuş" arasındaki fark. |
| `category` | Sonuç kümesini çeşitlendirmek için (hepsi `security` dönmesin). |
| `related` | Graf yapısı — bir case diğerini tetikler. |

Şema `schema/case.schema.json` ile doğrulanır; CI'da her PR'da koşar. Şemaya
uymayan case merge edilmez.

---

## 5. MCP yüzeyi

Üç tool. Fazlası ajanın seçim yükünü artırır ve hiçbiri düzgün kullanılmaz.

### `probe_limits`

Kod yazılmadan önce çağrılır. **En önemli tool.**

```
input:
  feature_description: string      # "kullanıcı profil fotoğrafı yükleyebilsin"
  side: "frontend" | "backend" | "both"
  domains?: string[]               # opsiyonel daraltma
  depth?: "quick" | "standard" | "deep"   # ~5 / ~12 / ~25 case

output:
  matched_domains: string[]
  cases: Case[]                    # risk'e göre sıralı, kategori-çeşitlendirilmiş
  open_questions: string[]         # kullanıcıya sorulacak, cevabı ajanda olmayan sorular
  assumed_defaults: string[]       # sorulmazsa varsayılacaklar (açıkça beyan)
```

`open_questions` alanı ürünün kalbi. Ajan bunları kullanıcıya sorar; sorulmayanlar
`assumed_defaults` olarak açıkça beyan edilir. Sessiz varsayım yok.

### `generate_test_cases`

Probe çıktısını çalışan test iskeletine çevirir.

```
input:
  cases: Case[] | case_ids: string[]
  framework: "pytest" | "vitest" | "jest" | "go-test" | "playwright" | "gherkin"
  context?: string                 # mevcut test dosyası stili, fixture'lar

output:
  files: [{path, content}]
  notes: string[]                  # otomatikleştirilemeyen, manuel doğrulama gerekenler
```

Assertion'lar `observable` alanından türer — bu yüzden `observable` zorunlu alan.
Otomatikleştirilemeyen case'ler (örn. "algısal jank") sessizce atlanmaz, `notes`
altında açıkça listelenir.

### `audit_coverage`

Var olan kodu/testi bank'a karşı diff'ler. **En çok "vay be" dedirten tool** —
çünkü eksikliği ispatlar, öneri sunmaz.

```
input:
  side: "frontend" | "backend" | "both"
  test_files?: string[]            # okunacak mevcut testler
  source_files?: string[]          # ele alınan davranışın çıkarımı için
  domains?: string[]

output:
  covered: [{case_id, evidence}]        # nerede ele alınmış
  uncovered: [{case_id, risk, why_matters}]
  coverage_by_domain: {domain: {covered: n, total: n}}
```

### Neden bu üç tool

Her biri farklı bir ana denk gelir: **kod öncesi** (probe), **kod anı** (generate),
**kod sonrası** (audit). Aynı bank'ı üç farklı zamanda kullanılabilir kılar. Dördüncü
bir tool eklemek istersen, önce bu üçünden hangisinin zamanına düştüğünü sor —
muhtemelen mevcut birinin parametresi olmalı.

---

## 6. Skill yüzeyi

MCP bilgiyi sağlar, skill **davranışı zorlar**. Skill olmadan ajan probe etmeyi unutur.

```
skills/
├── edgewit/                    # ana yönlendirici
├── edgewit-probe/              # kod öncesi limit belirleme
└── edgewit-audit/              # mevcut kodu bank'a karşı denetleme
```

### `edgewit` (router)

Tetikleyiciler: yeni bir özellik/endpoint/ekran yazma isteği, "edge case", "test
case", "bunu nasıl test ederim", "neyi kaçırıyorum".

Görev: niyeti anlayıp `edgewit-probe` veya `edgewit-audit`'e yönlendirmek.

### `edgewit-probe` — çekirdek metodoloji

Zorunlu sıra:

1. **Kod yazma.** Özellik tarifini `side` ile birlikte `probe_limits`'e ver.
2. Dönen `open_questions`'ı kullanıcıya sor — hepsini değil, cevabı işi
   **materyal olarak değiştirecek** olanları (2-4 tane).
3. Cevaplanmayanları `assumed_defaults`'tan alıp **açıkça beyan et**.
4. Netleşen limitleri kısa bir "limit spec" olarak yaz (madde madde, kullanıcı görsün).
5. Ancak bundan sonra kod veya test yaz.

Anti-pattern (skill'de açıkça yazılacak): probe sonucunu 20 maddelik liste olarak
kullanıcıya boşaltmak. Ajan filtreler, önceliklendirir, karar verir. Bank ham
malzeme; skill onu karara çevirir.

### `edgewit-audit`

"Şu modülde neyi kaçırdım" sorusuna cevap. `audit_coverage` çağırır, sonucu
risk sırasına dizer, en yüksek riskli 3-5 boşluk için somut test önerir.

### Bölünme mantığı

Probe ve audit ayrı skill, çünkü **zamanları farklı ve davranışları çelişkili**:
probe soru sorup bekler (yavaş, diyaloglu), audit rapor üretir (hızlı, tek atış).
Tek skill'de birleştirilirse ikisi de bulanıklaşır.

---

## 7. Bank'ı LLM'e doldurtmama kararı

Bu projenin **tek en önemli kararı**.

Değer önermesi: "LLM'in doğru anda hatırlamadığı şeyi burada tutuyorum."
Bank'ı LLM'e yazdırırsan, LLM'in zaten ürettiği şeyi LLM'e geri servis etmiş
olursun — önerme çöker, proje bir wrapper'a dönüşür.

**Kural:** her case'in `seen_in` alanı, LLM'in kafasından gelmeyen bir kaynağa
işaret etmeli:

- RFC / spesifikasyon maddesi (RFC 6749, RFC 7231, WCAG kriteri...)
- Bilinen bir outage postmortem'i
- Olgun bir API'nin dokümante ettiği davranış (Stripe idempotency, S3 consistency)
- CVE sınıfı veya OWASP maddesi
- **Kendi debug ettiğin gerçek bug** — bunlar en değerlileri, çünkü kimsede yok

LLM yardımı şurada meşru: taslak metni düzeltmek, şema alanlarını doldurmak,
YAML formatlamak. Case'in **kendisini icat etmek** için değil.

Kalite eşiği: **8 domain × 15 gerçek case**, 40 domain × generic doldurmadan
kat kat değerli.

---

## 8. Yol haritası

### Faz 0 — iskelet
- `schema/case.schema.json`
- Şema doğrulayıcı (`scripts/validate.*`) + CI
- Repo yapısı, README, katkı formatı (kendin için bile olsa yaz — 2 ay sonra
  kendi şemanı hatırlamayacaksın)

### Faz 1 — ilk bank (dar ve derin)
İki domain, her biri gerçekten derin:

- `backend/rest-api/pagination.yaml`
- `backend/auth/token-lifecycle.yaml`

Neden bu ikisi: ikisi de sık yazılıyor, ikisi de yanlış yazılıyor, ikisinin de
kanıt kaynağı bol (RFC + olgun API dokümanları). Metodolojiyi kanıtlamaya yeter.

Hedef: her dosyada 12-18 case, `seen_in` alanı doldurulmuş.

### Faz 2 — MCP, tek tool
Sadece `probe_limits`. Gerçek işinde kullan. Bank'ın eksikleri burada ortaya çıkar —
onları düzelt. Diğer iki tool'u bu geri bildirim gelmeden yazma.

### Faz 3 — skill
`edgewit` + `edgewit-probe`. Metodolojiyi zorla, davranışı gözlemle.
Probe çıktısının ajanı gerçekten yavaşlatıp yavaşlatmadığını ölç.

### Faz 4 — frontend bank
- `frontend/async-ui/race-conditions.yaml` (stale response, unmount-after-fetch)
- `frontend/forms/submission.yaml` (double-submit, unload during submit)

Frontend'in `observable` alanı zor — burada şemanın gerçekten çalışıp çalışmadığı
test edilir. Backend'de kolay olan (assertion yazılabilir), frontend'de zor.

### Faz 5 — kalan iki tool
`generate_test_cases`, `audit_coverage`. Bank yeterince olgunlaştığında.

### Faz 6 — genişleme
Kalan domain'ler, kullanım sırasına göre. §4'teki ağaç bir hedef, bir taahhüt değil.

---

## 9. Başarı kriterleri

Bu projenin işe yarayıp yaramadığını nasıl anlarız:

1. **Kendi işinde kullanıyor musun?** Faz 3'ten sonra, yeni bir endpoint yazarken
   probe'u refleks olarak çağırıyorsan çalışıyor demektir. Çağırmıyorsan skill
   yeterince zorlamıyor ya da bank yeterince derin değil.
2. **Probe çıktısı seni şaşırtıyor mu?** Dönen case'lerin hepsi zaten aklındaysa
   bank değer katmıyor. Ayda birkaç kez "bunu düşünmemiştim" demelisin.
3. **Audit gerçek boşluk buluyor mu?** Var olan bir projede koşturunca somut,
   düzeltilebilir eksik bulmalı. Genel öneri üretiyorsa `observable` alanları
   yeterince keskin değil.

---

## 10. Portfolyo açısından

Bu bir "MCP yazdım" projesi değil, bir **metodoloji projesi**. Anlatımı şöyle:

> AI ajanları kod üretmekte iyi, spec'i sorgulamakta kötü. edgewit, kod yazılmadan
> önce çalışan bir katman: küratörlenmiş bir edge-case bankı, onu ajana servis eden
> bir MCP, ve ajanı probe etmeden kod yazmamaya zorlayan bir skill.

Güçlü tarafları:

- **Kanıt bağı** (`seen_in`): her iddia bir RFC'ye, postmortem'e ya da gerçek bir
  bug'a bağlı. Bu, projeyi "iyi fikirler listesi"nden ayırır.
- **Dar kapsam bilinçli**: §2'de ne olmadığı açıkça yazılı. Kapsam disiplini
  gösterir.
- **Kendi kullanımından doğmuş**: yol haritası kendi işinde kullanmayı bir faz
  olarak içeriyor (Faz 2). Teorik değil.

Anlatırken vurgulanacak asıl nokta: testler burada doğrulama aracı değil,
**tasarım aracı**. Limitleri yazmak = spec'i yazmak.
