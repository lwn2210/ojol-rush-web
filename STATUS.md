# ojol-rush-web — Status: PROTOTIPE (milestone 1)

## Apa ini
Game web 2D top-down: kamu driver ojol (jaket dan box hijau polos, tanpa merek) di gang dan jalan Jakarta. Jemput pesanan di warung, antar ke pelanggan sebelum waktunya habis, kejar bintang lima. TypeScript + Vite 8 + Canvas 2D, tanpa game engine. Semua gambar prosedural (tanpa file aset), semua suara sintetis.

## Arsitektur
- `src/sim/`: seluruh shift berupa data JSON biasa + `step(state, input)` dengan tick tetap 60 Hz. Tanpa DOM, jam, atau `Math.random`. RNG mulberry32 yang state-nya ikut di dalam state, jadi seed + input yang sama = shift yang sama persis (ada tesnya).
  - `map.ts`: kota 46×46 tile. Jalan utama 2 lajur tiap 11 tile, blok rumah 9×9 di antaranya, gang 1 tile diukir dari seed (tembus, T, L "gang tikus", buntu). Genangan, polisi tidur, 10 warung, ±400 alamat pelanggan, 40 titik razia. BFS buat jarak dan rute.
  - `game.ts`: motor (setir ke arah input, gas = panjang input), tabrakan tembok per sumbu + bantuan sudut masuk gang, lalu lintas (mobil, angkot ngetem, bajaj, gerobak) lajur kiri dengan belok acak di perempatan, razia, order, timer, rating.
  - `autopilot.ts`: driver bot (rute BFS + hindari kendaraan). Dipakai buat demo di belakang menu dan di tes.
- `src/render/`: Canvas 2D cuma membaca state. Kota dilukis sekali ke canvas offscreen (maks 80 px/tile), tiap frame tinggal blit bagian yang kelihatan + kendaraan, motor, pin, razia, garis rute, partikel. Posisi diinterpolasi antar tick.
- `src/audio.ts` (kelas `Sfx`), `src/input.ts`, `src/hud.ts`, `src/app.ts`: pola sama dengan `layangan-duel-web`.

## Mekanik
- Order masuk otomatis. Garis rute oranye = jemput di warung, hijau = antar. Berhenti di pin (lingkaran progres penuh) buat ambil/serahin.
- Timer order = jarak rute ÷ 3,4 tile/detik + 14 detik. Habis = pelanggan cancel, bintang 1.
- Bintang: mulai 5, −1 per nabrak (kendaraan atau tembok kencang), −1 per 2× ngebut di polisi tidur pas bawa makanan ("makanan goyang"), −1 kalau sisa waktu < 20%. Tip Rp 2.000–5.000 buat bintang 5.
- Ongkir Rp 5.000 + Rp 350/tile, dibulatkan ke Rp 500.
- Genangan: kecepatan maks 45%. Razia: 3 titik aktif, pindah tiap 32–48 detik, kena = ditahan 4 detik lalu kebal 3 detik. Kelihatan di peta kecil (titik merah).
- Mobil ngerem dan klakson kalau motor diam di depannya; dari samping di perempatan tetap bisa nabrak.
- Shift 3 menit. Rating akun = (bintang + 3 trip bintang 5 awal) / jumlah; di bawah 3,5 = akun dibekukan, shift selesai.
- Layar akhir: pendapatan, antaran, rating, bintang 5, cancel, nabrak, kena razia. Rekor (pendapatan tertinggi) di localStorage `ojol-rush.best`.
- Kontrol: WASD/panah, Spasi/H = klakson, M = suara, P/Esc = jeda (otomatis jeda kalau tab disembunyikan). HP: joystick mengambang (tahan di mana saja, geser) + tombol "Tin!".
- Suara sintetis Web Audio: mesin motor (ikut kecepatan), klakson sendiri dan klakson mobil (pelan kalau jauh), notifikasi order, ambil, koin antar, cancel, nabrak, cipratan, jedug polisi tidur, peluit razia, detik terakhir, jingle akhir shift. AudioContext nyala di gesture pertama.

## Tes
- `npm run verify`: 24 tes vitest + typecheck + build. Lulus 2026-11-05.
  - Peta (5): grid jalan, **semua pin resto dan rumah bisa dicapai dari start di 40 seed** (plus tidak ada tile terisolasi), pin bukan di perempatan/genangan/polisi tidur/razia, rute BFS valid.
  - Motor (6): ngegas dan berhenti, belok/putar balik, nabrak tembok kencang vs pelan, tidak pernah nembus tembok (6000 tick input acak), genangan, polisi tidur.
  - Lalu lintas (3): tetap di lajur kiri selama semenit, mobil ngerem + klakson buat motor di depannya, nabrak mobil dihitung dan tidak nembus.
  - Razia (2), order/timer/rating (7, termasuk autopilot nyelesaiin 3 order di 6 seed tanpa cancel dan satu shift penuh di lalu lintas + razia), determinisme (1).
- Build: JS 56 KB (21 KB gzip), CSS 7 KB.
- Browser pane (Chromium, 2026-11-05): menu → Mulai Shift → jemput → antar (bintang + ongkir + tip) → shift selesai → layar hasil + rekor baru. Kontrol keyboard dan joystick sentuh (layout HP 375×812) dicek. Tanpa error console.
- Safari iOS (iPhone 17 simulator, 2026-11-05): render Canvas, HUD + safe area, joystick sentuh (motor jalan dan belok), audio nyala setelah tap.

## Gap
- Belum dimainkan manusia sampai satu shift penuh di HP. Tuning (timer order, kepadatan lalu lintas, frekuensi razia) baru dicek pakai autopilot: bot selesai di bawah separuh waktu order, 11–16 antaran per shift
- Alur penuh di iOS belum diulang (cuma menu → shift → nyetir); hasil/rekor dicek di Chromium
- Kalau motor diam di lajur depan mobil, mobilnya nunggu terus sambil klakson (sengaja, tapi bisa bikin antrean)
- Lalu lintas cuma di jalan utama; gang sepi (cuma polisi tidur dan genangan). Belum ada pejalan kaki, motor lain, lampu merah
- Kendaraan belok di perempatan dengan sudut patah (diperhalus di render saja). Dua kendaraan yang saling nunggu di perempatan "nyelip" tembus setelah 1,5 detik
- Peta di-generate per shift dari seed, belum ada pilihan peta tetap atau level
- Safari macOS belum dicoba langsung. Di iPhone, saklar silent ikut membisukan Web Audio
