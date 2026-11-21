# E-posta bildirimleri kurulumu

## 1) Gmail uygulama şifresi
1. myaccount.google.com → **Güvenlik** → **2 Adımlı Doğrulama**'yı aç.
2. Arama kutusuna **"Uygulama şifreleri"** yaz, ad olarak `Haftalik Plan` ver, **Oluştur**'a bas.
3. Çıkan 16 harfli şifreyi bir kenara kopyala. Bu şifreyi kimseyle paylaşma, sohbete de yazma.

## 2) Supabase'de gizli ayarlar
Supabase → projen → **Edge Functions** → **Secrets** → iki tane ekle:
- `GMAIL_USER` = Gmail adresin (ör. ornek@gmail.com)
- `GMAIL_APP_PASSWORD` = 1. adımdaki 16 harfli şifre

## 3) "bildirim" fonksiyonunu oluştur
1. **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Fonksiyon adı: `bildirim` (tam olarak böyle).
3. Editördeki her şeyi sil, `bildirim-index.ts` dosyasının tamamını yapıştır, **Deploy**'a bas.
4. Fonksiyonun **Details / Settings** sekmesinde **Verify JWT** (Enforce JWT verification) ayarını **kapat** ve kaydet.

## 4) Veritabanı
**SQL Editor** → `bildirim.sql` dosyasının tamamını yapıştır → **Run**.
(Önce `guncelleme.sql` çalıştırılmış olmalı.)

Bitince Claude'a "tamam" yaz, test e-postasıyla kontrol edilecek.
