# webCAD

Tarayıcıda çalışan CAD uygulaması için ilk çalışma alanı taslağı.

## Bu sürüm

- Üstte döndürülebilen ve yakınlaştırılabilen 3D örnek görünüm
- Altta kaydırılabilen ve yakınlaştırılabilen sketch örnek görünümü
- İki alan arasında sürüklenebilen ayırıcı
- Mobil ekranlara uyarlanan arayüz
- Harici paket veya hesap gerektirmeyen statik dosyalar

Örnek geometri yalnızca çalışma alanını göstermek içindir; henüz çizim aracı, dosya kaydetme veya DXF çıktısı yoktur. DXF dışa aktarımı eklendiğinde arayüzden R12 ve R2000 seçimi yapılması planlanmıştır.

## Çalıştırma

`index.html` dosyasını güncel bir tarayıcıda açın. Yerel sunucu tercih ederseniz bu klasörde `python -m http.server 8000` çalıştırıp `http://localhost:8000` adresini ziyaret edin.

Statik dosyalar ücretsiz statik site barındırma hizmetlerinde yayımlanabilir. Uygulamanın bu aşamada sunucu tarafı bağımlılığı yoktur.
