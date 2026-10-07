# webCAD

Tarayıcıda çalışan CAD uygulaması için ilk çalışma alanı taslağı.

## Bu sürüm

- Tek ve geniş 3D örnek görünüm
- Fusion tarzı üst araç şeridi ve solda proje ağacı
- 3D görünümü döndürme, kaydırma, yakınlaştırma ve sıfırlama
- Mobil ekranlara uyarlanan arayüz
- Harici paket veya hesap gerektirmeyen statik dosyalar

Örnek geometri yalnızca çalışma alanını göstermek içindir. Üst şeritteki çizim ve modelleme komutları henüz etkin değildir. Dosya kaydetme ve DXF çıktısı bu sürümde yoktur; sonraki aşamada DXF R12 ve R2000 seçeneği eklenecektir.

## Çalıştırma

`index.html` dosyasını güncel bir tarayıcıda açın. Yerel sunucu tercih ederseniz bu klasörde `python -m http.server 8000` çalıştırıp `http://localhost:8000` adresini ziyaret edin.

Statik dosyalar ücretsiz statik site barındırma hizmetlerinde yayımlanabilir. Uygulamanın bu aşamada sunucu tarafı bağımlılığı yoktur.
