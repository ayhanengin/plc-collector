# 🔌 PLC Data Collector v2.0

**Endüstriyel PLC Veri Toplama ve İzleme Platformu**

Siemens S7, Modbus ve daha fazla protokol desteğiyle PLC'lerinizi gerçek zamanlı izleyin, veri kaydedin ve analiz edin.

---

## ✨ Özellikler

- 🔌 **Çoklu Protokol**: Siemens S7 (S7-300/400/1200/1500) ve Modbus TCP/RTU
- 📊 **Gerçek Zamanlı İzleme**: WebSocket ile anlık değer güncellemeleri
- 💾 **Esnek Veri Kayıt**: SQLite, PostgreSQL, MSSQL, Oracle, MySQL desteği
- 🔗 **SSH Gateway**: Farklı subnet'lerdeki PLC'lere SSH tunnel üzerinden erişim
- 📋 **TIA Portal Entegrasyonu**: Tag'leri TIA Portal'dan kopyala-yapıştır ile içe aktar
- 🔑 **Lisans Sistemi**: Free, Professional ve Enterprise planları

---

## 📦 Kurulum

### Hızlı Başlangıç (Free Mod)

```bash
# 1. Depoyu klonlayın
git clone https://github.com/ayhanengin/plc-collector.git
cd plc-collector

# 2. Bağımlılıkları kurun
npm install

# 3. Başlatın
npm run dev
```

**Hepsi bu!** Veritabanı kurulumu gerekmez. `http://localhost:4000` adresinde açılır.

### Docker ile

```bash
docker-compose up -d
```

### Windows'ta

1. [Node.js 20+](https://nodejs.org) indirin ve kurun
2. `release/` klasörünü bilgisayarınıza kopyalayın
3. `start.bat` dosyasına çift tıklayın
4. Tarayıcı otomatik açılacak

---

## 🔑 Lisans Planları

| Özellik | Free | Professional | Enterprise |
|---------|------|-------------|-----------|
| PLC Bağlantısı | 1 | 10 | Sınırsız |
| Tag Tanımı | 50 | 500 | Sınırsız |
| Gerçek Zamanlı İzleme | ✅ | ✅ | ✅ |
| WebSocket | ✅ | ✅ | ✅ |
| Veri Kayıt | ❌ | ✅ | ✅ |
| SQLite / PostgreSQL | ❌ | ✅ | ✅ |
| MSSQL / MySQL | ❌ | ✅ | ✅ |
| Oracle | ❌ | ❌ | ✅ |
| SSH Gateway | ❌ | ✅ | ✅ |
| CSV Dışa Aktarma | ❌ | ✅ | ✅ |
| Fiyat | Ücretsiz | İletişime geçin | İletişime geçin |

---

## 🗄 Veritabanı Seçenekleri

| Motor | Açıklama | Kullanım |
|-------|----------|----------|
| `none` | Veri kaydetmez, sadece canlı izleme | Ücretsiz demo |
| `sqlite` | Gömülü dosya tabanlı, kurulum gerektirmez | Küçük-orta kurulumlar |
| `postgres` | PostgreSQL + TimescaleDB desteği | Endüstriyel üretim |
| `mssql` | Microsoft SQL Server | Windows ortamları |
| `mysql` | MySQL / MariaDB | Web tabanlı sistemler |
| `oracle` | Oracle Database | Kurumsal sistemler |

`.env` dosyasında `DB_ENGINE=sqlite` şeklinde ayarlayın.

---

## 🔧 API

| Endpoint | Açıklama |
|----------|----------|
| `GET /api/connections` | PLC bağlantılarını listele |
| `POST /api/connections` | Yeni PLC ekle |
| `POST /api/connections/:id/connect` | PLC'ye bağlan |
| `GET /api/tags` | Tag'leri listele |
| `POST /api/tags/bulk` | Toplu tag içe aktar |
| `GET /api/data/history/:tagId` | Geçmiş veri sorgula |
| `GET /api/license` | Lisans bilgisi |
| `POST /api/license/activate` | Lisans aktifleştir |
| `GET /api/setup/status` | Sistem durumu |
| `GET /api/setup/db-engines` | Desteklenen DB motorları |
| `WebSocket: tagUpdate` | Anlık tag değerleri |

---

## 📁 Proje Yapısı

```
plc-collector/
├── src/
│   ├── adapters/           # Veritabanı adaptörleri (Adapter Pattern)
│   │   ├── IDataAdapter.ts       # Interface
│   │   ├── NullAdapter.ts        # Free mod
│   │   ├── SqliteDataAdapter.ts  # SQLite
│   │   ├── PostgresAdapter.ts    # PostgreSQL
│   │   └── AdapterFactory.ts     # Factory
│   ├── api/                # REST API route'ları
│   ├── config/
│   │   └── configDb.ts     # SQLite config database
│   ├── core/
│   │   ├── ConnectionManager.ts  # PLC bağlantı yönetimi
│   │   ├── DataLogger.ts         # Veri kayıt
│   │   ├── GatewayManager.ts     # SSH tunnel yönetimi
│   │   ├── LicenseManager.ts     # Lisans sistemi
│   │   ├── Poller.ts             # Tag okuma döngüsü
│   │   └── TagManager.ts         # Tag CRUD
│   ├── drivers/            # PLC protokol sürücüleri
│   └── index.ts            # Ana giriş noktası
├── data/                   # SQLite veritabanları (otomatik oluşur)
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🏭 Geliştiren

**DM Software** — Endüstriyel Otomasyon Çözümleri

---

## 📄 Lisans

Bu yazılım tescillidir. Dağıtım ve kullanım lisans sözleşmesine tabidir.
