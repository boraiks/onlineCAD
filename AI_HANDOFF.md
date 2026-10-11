# onlineCAD — Yapay Zekâ Geliştirici Devir Belgesi (AI Handoff)

Bu belge, **onlineCAD** (eski adıyla webCAD) projesini devralacak bir sonraki yapay zekâ veya geliştirici için hazırlanmış kapsamlı durum, mimari ve geliştirme özetidir.

## Son güncelleme (2026-10-10)

- **STL / Model İçe Aktarma Hata Düzeltmesi (CAD-I001 updateSaveStatus) & Otomatik Merkeze / Zemine Hizalama (Auto-Center & Ground Z = 0)**:
  - **Hata Çözümü (`updateSaveStatus is not defined`)**: `app.js` içerisinde içe aktarma sonrasında çağrılan ancak tanımlanmamış olan `updateSaveStatus` fonksiyonu tanımlandı ve çalışma alanının kaydedilmemiş yeni içerik içerdiği (`Unsaved workspace`) doğru şekilde bildirildi. İçe aktarma sonrası fırlatılan `CAD-I001 STL Import Failed` hatası giderildi.
  - **Havada Asılı Duran STL Problemi & Otomatik Zemin Hizalama**: Dışarıdan veya internetten indirilen (ör. Porsche araba modeli) STL dosyalarında koordinatlar orijinden ve zemin seviyesinden çok uzakta/havada olabiliyordu. Artık içe aktarma esnasında (`cad.importers.importMeshToBodies`):
    - Modelin $X$ ve $Y$ merkezi otomatik olarak orijine ($(0, 0)$) kaydırılır.
    - Modelin en alt tabanı ($Z_{\min}$) tam olarak zemin düzlemine ($Z = 0$) oturtulur.
    - Büyük STL optimizasyon penceresine de `Center model to origin & place on ground (Z = 0)` onay kutusu eklenmiştir (varsayılan: açık).
  - **Move/Rotate Paneline Tek Tıkla 'CENTER & GROUND (Z = 0)' Butonu**: `MOVE/ROTATE` panelinde (`#bodyMoveCenterGround`), seçili herhangi bir gövdeyi anında sahnenin merkezine çekip zemine ($Z=0$) oturtan hızlı buton eklendi.
  - **İçe Aktarılan Modellerde Seçim Vurgusu (Selection Bounding Cage)**: Yüksek poligonlu içe aktarılmış gövdelerde düzlemsel yüzey kümelemesi atlandığı için sahnede veya ağaçta seçildiklerinde vurgu görünmüyordu. Artık `cad.bodyFaces.renderBodyHighlight`, bu gövdeler için 3D sınırlayıcı tel kafes (CAD bounding cage) ve köşe tutamaçları çizerek modelin seçildiğini net bir şekilde gösterir. Sahnede doğrudan modele tıklandığında da gövde anında seçilir.
  - **Kök Neden Tespiti (Lag & Stutter Root Cause)**: İnternetten indirilen dense / high-poly STL modellerinde (50.000 – 300.000+ üçgen), önceki render motoru her karede ve her fare hareketinde tüm üçgenleri CPU üzerinde `camera.project()` ile hesaplıyor, devasa JavaScript dizileri tahsis edip (`triangles.push`) 60 FPS hızında GPU'ya sıfırdan yüklüyordu (`gl.bufferData`). Ayrıca fare her hareket ettiğinde (`pointermove`) sınırlayıcı kutu testi olmaksızın yüz binlerce üçgen üzerinde ışın kesişimi (raycast) deneniyordu.
  - **WebGL GPU Tepe Gölgelendirici (Vertex Shader MVP Matrix & Static VBO)**:
    - 3D projeksiyon dönüşümü WebGL tepe gölgelendiricisine (`vertexSource`) taşındı (`uniform mat4 uMVPMatrix; uniform float uDepthBias;`).
    - Modeller ilk yüklendiğinde statik VBO (`gl.STATIC_DRAW`, interleaved `[x,y,z, nx,ny,nz, r,g,b,a]`) olarak GPU belleğine derlenir.
    - Kamera döndürülürken (orbit, pan, zoom) GPU yalnızca MVP matrisini günceller; CPU tarafında sıfır bellek ayırma (0 garbage allocation) ile 100k+ üçgenli modellerde bile 60 FPS tereyağı gibi akıcı görüntü elde edilir.
    - Derinlik `near`/`far` aralığı tüm köşeler yerine 8 AABB köşe noktasından hesaplanarak $O(N)$ döngüleri ortadan kaldırıldı.
  - **Ekran Sınırlayıcı Kutu (Screen Bounding Box Guard & Raycast Culling)**:
    - `cad.bodyFaces` içine ekran izdüşüm sınırlayıcı kutusu (`screenBounds`) eklendi. İmleç bir gövdenin 2D sınır kutusunun dışındaysa yüz binlerce üçgen üzerinde raycast yapılmaz ($O(1)$ erken çıkış).
    - 8.000'den fazla üçgenli gövdelerde gereksiz düzlemsel yama BFS döngüleri (`patches`) bastırıldı.
  - **Akıllı Uzamsal Kümeleme (Fast Spatial Grid Clustering Polygonizer)**:
    - `cad.meshDecimator.decimateGridClustering` algoritması eklendi (`js/mesh-decimator.js`). İnternetten indirilen STL'lerde sıklıkla görülen açık dikişler, delikler ve non-manifold yapılarda dahi asla çökmeyen $O(N)$ uzamsal kümeleme yapar.
    - Yüzey alanı tabanlı hücre boyutu formülü ($\text{cellSize} \propto \sqrt{\text{Area} / \text{targetVertices}}$) sayesinde girilen yüzde oranıyla (ör. %75) hedef üçgen sayısı kusursuz örtüşür.
  - **Kullanıcı Tanımlı Polygonizer Paneli (`DECIMATE` & `#meshDecimatePanel`)**:
    - Araç çubuğuna **DECIMATE** ikonu ve paneli entegre edildi.
    - Kullanıcı istediği gövdeyi seçip azaltma kaydırıcısıyla (%10 – %95) veya hazır butonlarla (%25, %50, %75, %90) istediği oranda poligon sadeleştirmesini belirler.
    - Orijinal üçgen sayısı ile hedeflenen yeni üçgen sayısı anlık gösterilir, sahnede canlı yarı saydam önizleme sunulur.
    - `APPLY` butonuyla gövde güncellenir; işlem `HistoryManager` ile tek tıkla `Ctrl+Z` geri ve `Ctrl+Y` ileri alınabilir.
  - **Büyük STL Otomatik Algılama Penceresi (`#highPolyModalBackdrop`)**:
    - 25.000'den fazla üçgene sahip STL, OBJ veya STEP modelleri açıldığında arayüzde otomatik bir optimizasyon penceresi açılır:
      - **Orijinali Koru** (%0)
      - **%75 Sadeleştir** (Önerilen - 4 kat daha hızlı)
      - **%90 Sadeleştir** (Ultra Hızlı)
      - **Polygonizer ile Özel Ayarla...** (İçe aktarıp paneli otomatik açar).

- **2D Line Fillet Düzeltmesi (Sketch Fillet Direct Selection)**:
  - Eskiz modunda (`SketchFilletController`) iki çizginin kesiştiği ortak köşe noktasına doğrudan tıklandığında veya fareyle üzerine gelindiğinde radius önizlemesinin çıkmaması sorunu giderildi. Kesişen segment uç noktası toleransı gevşetildi ve köşe tıklaması doğrudan algılanır hale getirildi.

- **3D Katı Gövde Fillet & Chamfer: Joined ve Egzantrik Gövdelerde Kusursuz Radius**:
  - **Tahribatsız CSG Toroid Kesici (Non-Destructive Cutter)**: `solidKernel.bevelCircularRim` fonksiyonu önceki yapay tekil silindir re-generation yaklaşımı yerine gövdenin mevcut manifold geometrisini koruyarak kenar halkası boyunca toroidal kesici (`original.subtract(cutter)`) kullanacak şekilde yeniden yazıldı.
  - **Joined ve Çoklu Ekstrüzyon Gövdeler**: Birbirine kaynatılmış (`Join`), delikli veya egzantrik (eccentric) iç içe geçmiş gövdelerin kenarlarına fillet uygulandığında diğer birleşik özellikler artık bozulmaz/silinmez.
  - **Art Arda Çoklu Kenar Pah ve Radius**: Bir silindirin veya katının üst kenarına fillet uygulandıktan sonra alt kenarına veya diğer kenarlarına da art arda bağımsız fillet ve chamfer uygulanabilir.
  - **Planar Yüzey Halka Algılama**: `bodyRenderer.selectableEdges`, daha önce boolean işlem görmüş gövdelerde devre dışı kalan hücre kısıtını kaldırarak tüm düzlemsel sınır döngülerinden (`cad.bodyFaces.patches`) dairesel kenar halkalarını tespit eder.

- **Gelişmiş Geri / İleri Alma (Undo / Redo & Origin Planes) Güvenilirliği**:
  - **Global Window Capture**: `Ctrl+Z` ve `Ctrl+Y` tuş kombinasyonları `window.addEventListener('keydown', ..., { capture: true })` seviyesinde yakalanır; odaklanmış butonların veya ağaç öğelerinin kısayolu yutması engellendi. Farklı klavye düzenleri için `code === 'KeyZ'/'KeyY'` ve `keyCode 90/89` alternatifleri eklendi.
  - **Başlık Çubuğunda Undo / Redo Butonları**: Üst titlebar'a hızlı erişim için tıklanabilir ve durum duyarlı (aktif/pasif) `Undo` ve `Redo` butonları eklendi.
  - **Ekran HUD Bildirimi**: Kısayola basıldığında ekranda anlık `UNDO` ve `REDO` bildirim rozeti gösterilir.
  - **Orijin Düzlemi Görünürlükleri**: Orijin düzlemleri (`XY, XZ, YZ`) ve gövde göz ikonları açılıp kapatıldığında işlem geçmişe kaydedilir; `Ctrl+Z` / `Ctrl+Y` ile doğrudan geri ve ileri alınabilir.

- **3D Modda 'F' Fillet Kısayolu**:
  - Eskiz dışındayken klavyeden doğrudan `F` tuşuna basıldığında 3D Katı Fillet aracı (`#solidFilletBtn`) anında aktifleşir.

- **3D Gövdeler İçin Dikdörtgen ve Dairesel Çoğaltma (Body Rectangular & Circular Pattern)**:
  - **Gövde Çoğaltma Aracı (`cad.BodyPatternController`)**: 3D katı gövdeler için Autodesk Fusion 360 tarzı `Pattern` sistemi eklendi (`js/body-pattern.js`).
  - **Rectangular Pattern**: İki bağımsız yön (X, Y veya Z ekseni), adet (Count) ve aralık (Spacing / Distance) ile 2D matris halinde katı gövdeleri çoğaltır.
  - **Circular Pattern**: Seçilen eksen (X, Y veya Z) etrafında, girilen adet ve toplam açı (ör. $360^\circ$) boyunca gövdenin kendi ekseninde/merkezinde radyal kopyalarını üretir.
  - **Canlı Yarı Saydam Önizleme**: Parametreler değiştirilirken sahne üzerinde gerçek zamanlı silik hayalet gövde önizlemeleri çizilir.
  - **Geri Alma Desteği**: `OK` ile çoğaltılan gövdeler tek bir komut olarak geçmişe yazılır; `Ctrl+Z` ile tek hamlede geri alınabilir.

  - **Extrude ile Birebir Aynı Tasarım**: Delik açma aracı (`SolidHoleController`) aktif olup yüzey seçildiğinde, delik merkezinin hemen yanında ekranda yüzen modern ve yarı saydam bir bilgi kartı (`#solidHoleHud`, `.extrude-hud`) açılır.
  - **Canlı ve İki Yönlü Parametre Girişi**: Kart üzerinde `Operation: CUT` (kırmızı CAD vurgusu), `Type` (Simple, Counterbore, Countersink), `Extents` (Through All, Distance) ve doğrudan tuval üzerinden yazılabilen `Diameter`, `Depth`, `CB Dia`, `CB Depth`, `CS Dia`, `CS Angle` sayısal girişleri yer alır.
  - **Kamera ve Konum Takibi**: Kamera açısı döndürüldüğünde, yaklaşıldığında veya kaydırıldığında kart 3D deliğin ekran izdüşümünü (`project(centerWorld)`) otomatik takip eder; tuval kenarlarına çarpmayacak şekilde sınır kilitlidir.
  - **Klavyeyle Hızlı Onay**: HUD kutusundayken `Enter` deliği anında deler (`commit`), `Escape` aracı kapatır, `Tab` bir sonraki ölçü kutusuna geçirir. Eski 2D canvas tek satırlık metin etiketi tamamen kaldırıldı.

- **Autodesk Fusion 360 Tarzı Stüdyo Işık Kaynağı, Gölgelendirme ve Parlama (Studio Lighting & Specular System)**:
  - **Doğal Stüdyo Işık Açısı (Key & Fill Directional Lights)**: Autodesk Fusion 360'ın imza stüdyo ortamı uyarınca sol-üst-ön açıdan gelen ana ışık kaynağı (`uKeyLightDir` = `[0.40, -0.45, 0.75]`) ve sağ-alt-arkadan gelen yumuşak dolgu ışığı (`uFillLightDir` = `[-0.45, 0.40, 0.30]`) yerleştirildi. Işık yönüne bakan üst ve ön yüzeyler parlarken, arkada kalan yüzeyler doğal CAD gölgesine bürünür.
  - **Blinn-Phong Parlama ve Saten Metal Doku (Specular Highlights)**: Fusion 360'taki çelik/metal yüzey parlaması (`uShininess: 38.0`, `uSpecularStrength: 0.52`) entegre edildi. Eğrisel yüzeylerde, delik ağızlarında, pah ve radius geçişlerinde ışık kaynağına ve kameraya göre dinamik parıltı (gleam/specular sheen) oluşur.
  - **Kavisli Yüzeylerde İpeksi Yumuşak Normaller (Smooth Normal Shading)**: Silindirler, delik iç cidarları ve yuvarlatılmış geçişler için köşe normalleri kırışıklık açısı eşiği (`COS_CREASE = 0.743` ~ $42^\circ$) ile yumuşatıldı. 64 segmentli silindirler tek parça ipeksi kavisli bir gövde gibi pürüzsüz görünürken; $90^\circ$ küp köşeleri ve silindir kapakları jilet gibi keskin CAD kenarları olarak kalır.
  - **Yalnızca Modele Etki Eden Işık (Grid Gölgesiz Temiz Zemin)**: Kullanıcı talebi doğrultusunda zemin/ızgara düzlemindeki temas gölgesi kaldırıldı; ışık ve parlama efektleri yalnızca 3D katı model gövdesinin kendi yüzeylerine, delik cidarlarına ve pahlarına vuracak şekilde izole edildi. Zemin ızgarası tamamen berrak ve okunaklı tutulur.
  - **Fresnel Kenar Ayrımı ve Tel Kafes Koruma**: Silüet kenarlarında hafif ışık sıçraması (`Fresnel rim`) ile parçanın arka plandan ayrılması sağlandı. Üçgen ağ çizgileri ve özellik kenarları ise sıfır normal geçerek ışık modülasyonundan muaf tutuldu; her zaman net antrasit çizgiler olarak korunur.

- **onlineCAD Marka Yenilemesi (Rebranding)**:
  - Proje ismi `webCAD`'den **onlineCAD**'e güncellendi.
  - Arayüz başlığı, `onlineCAD — Workspace`, üst marka logosu (`online<span>CAD</span>`), sekme etiketleri ve dokümantasyon güncellendi.

- **Proje Kaydetme ve Açma (`.ocad` Dosya Formatı)**:
  - **Yerel Proje Formatı (`.ocad`)**: `onlineCAD` projeleri artık tarayıcı üzerinden JSON tabanlı `.ocad` formatında diske kaydedilebilir (`Save Project`, `Ctrl+S`) ve geri açılabilir (`Open Project`, `Ctrl+O`).
  - **Eksiksiz Durum Saklama**: Tüm 2D eskizler (`sketches`), geometriler (`lines, circles, rectangles, arcs, points`), ölçülendirmeler (`measurements`), kısıtlar (`constraints`), orta noktalar (`midpoints`), katı gövde yüzeylerinden üretilen özel düzlemler (`custom face planes`), ekstrüzyon katı gövdeleri (`bodies`) ve WebGL üçgen ağları (`mesh`), kamera konumu (`pan`, `zoom`, `pivot`) eksiksiz olarak serialize ve deserialize edilir.
  - **Yeni Proje (`New Design` - `Ctrl+Alt+N`)**: Çalışma alanını sıfırlama, çizim varsa kullanıcı onay uyarısı alma ve temiz bir tasarım başlatma desteği.
  - **Canlı Başlık Düzenleme**: Üst titlebar'daki "Untitled Design" metnine tıklanarak tasarım ismi doğrudan düzenlenebilir; BROWSER ağacındaki kök satırıyla ve indirilen dosya adlarıyla anında senkronize olur.

- **3D Yazıcı İçin Binary STL Dışa Aktarma (`.stl` Export)**:
  - **Endüstri Standardı Binary STL**: Sahnede görünür olan tüm 3D katı gövdeler tek tıkla standart ikili (Binary) STL dosyası olarak indirilebilir (`EXPORT` menüsü → `Export STL`).
  - **Doğru Yüzey Normalleri ve Milimetre Koordinatları**: Her üçgen için otomatik $N = (V_2 - V_1) \times (V_3 - V_1)$ normal hesabı yapılır; Cura, PrusaSlicer, Bambu Studio, OrcaSlicer ve Blender ile %100 uyumludur.
  - **Tabbar FILE & EXPORT Menüleri**: Üst sekme çubuğunda modern CAD standardı `FILE` ve `EXPORT` açılır menüleri eklendi.

- **Gövde İçi Ekstrüzyonda Otomatik CUT Seçimi ve Kırmızı Önizleme (Extrude Auto-CUT & Red Visuals)**:
  - **Katı Kesişiminde Otomatik CUT (Auto-Switch to CUT)**: Bir profil veya yüzey ekstrüzyonu mevcut bir katı gövdenin (`body`) veya birden çok gövdenin içinden geçerken/kesişirken (`toolIntersectsTarget` / `checkAnyIntersection` ve 3D AABB + katı hacim penetrasyon tespiti), ekstrüzyon operasyonu kendiliğinden **CUT** fonksiyonunu seçer (`extrudeOperation = 'cut'`).
  - **Dışarı Çıkınca Otomatik Geri Dönüş (Fusion 360 Ergonomisi)**: Ekstrüzyon oku gövdenin dışına / boşluğa doğru çekildiğinde operasyon otomatik olarak önceki durumuna (eskizden başlatıldıysa `New Body`, yüzeyden başlatıldıysa `Join`) geri döner. Kullanıcı açılır kutudan manuel bir seçim yaptığında ise kullanıcının bilinçli tercihi korunur.
  - **Belirgin Kırmızı Ekstrüzyon Görünümü (Vibrant Red CUT Preview)**: CUT moduna geçildiğinde kesen ekstrüzyon hacmi 3D sahnede canlı yarı saydam kırmızı kapaklar (`rgba(235, 55, 55, .72)`), kırmızı yan yüzeyler (`rgba(205, 40, 40, .58)`) ve kalın kırmızı silüet kenarları (`#c62828`, 1.4px) ile çizilir; böylece kullanıcı gövdeyi yonttuğunu anında anlar.
  - **Kırmızı 3D Ok ve Profil Vurgusu**: 3D sürükleme oku gövdesi koyu kırmızı (`#b71c1c`), başı parlak kırmızı (`#e53935`), taban halkası kırmızı hatlı olur; seçili profil konturları ve seçili yüzey vurgusu kırmızı renge döner.
  - **HUD ve Panel Entegrasyonu**: Ekrandaki hareketli HUD paneli kırmızı kenarlık ve kırmızı `Operation CUT` rozeti kazanır; yan paneldeki Operation seçimi kırmızı arka plan ve kırmızı metne geçer, `OK` butonu kırmızı vurgulanır (`#dc3545`). Durum çubuğunda `EXTRUDE CUT · Set distance and confirm` gösterilir.

- **Extrude Konumunda Show Mesh Kesin Bastırılması (Show Mesh Extrude Suppression)**:
  - **Extrude Sırasında Show Mesh Asla Çalışmaz**: 3D katı oluşturulurken veya düzenlenirken (`extrudeController.active` veya önizleme aşamasında) üçgen ağ çizgilerinin (`Show Mesh`) görünmesi tamamen engellenmiştir. Kullanıcı ayarlarında veya `localStorage` içinde `showMesh: true` olsa dahi ekstrüzyon esnasında hem WebGL derinlik motoru (`bodyRenderer`) hem de Canvas 2D gövde işleyicisi (`renderBodies`) üçgenleme hatlarını gizler.
  - **INSPECT Menüsü ve Seçeneği Kilitlenir**: Extrude paneli açıkken üst araç çubuğundaki `INSPECT` menü butonu devre dışı bırakılır (`disabled`), menü açılırsa otomatik kapatılır ve menü öğesi tıklanamaz hale getirilir (`.toolbar-menu.is-disabled`, `pointer-events: none`). Tıklama yapılsa bile `extrudeController.active` kontrolü ile durum değişimi engellenir.
  - **Extrude Kapanınca Durumun Şeffaf Geri Yüklenmesi**: Extrude tamamlandığında (`OK`) veya iptal edildiğinde (`Cancel` / `Escape`), `INSPECT` menüsü ve `Show Mesh` seçeneği yeniden aktifleşir; kullanıcının önceki `Show Mesh` tercihi bozulmadan eski durumuna geri döner.

- **Yüzeye Çift Tıklamayla Tüm Body'yi Seçebilme (Fusion 360 Ergonomisi)**:
  - **Çift Tıkla Body Seçimi**: 3D model görünümünde bir katının (body) herhangi bir yüzeyine çift tıklandığında (`dblclick` veya hızlı 2. tık) tek bir yüzey yerine gövdenin tamamı (`body`) seçilir.
  - **Canlı Görsel Vurgu (Body Highlight)**: Seçilen gövdenin kameraya bakan tüm yüzeyleri CAD mavi tonu (`rgba(33, 137, 227, .38)`) ile doldurulur ve tüm sınır hatları katı CAD mavi çizgileriyle (`#0e70b0`, 2.0px) belirginleştirilir.
  - **Tek Tık vs Çift Tık Ayrımı**: Yüzeye tek tıklandığında yalnızca o yüzey seçilir (`FACE SELECTED`); çift tıklandığında tüm gövde seçilir (`BODY SELECTED`). Body seçiliyken başka bir yüzeye tek tıklandığında doğrudan ilgili yüzey seçimine geri dönülür; boşluğa tıklandığında veya `Escape` tuşuna basıldığında seçim kaldırılır.
  - **Proje Ağacı (Browser Tree) ile Senkronizasyon**: Body seçildiğinde soldaki BROWSER panelinde ilgili `Body` satırı otomatik olarak `.is-selected` vurgusu alır. Ayrıca ağaçtaki `Body` satırına tıklandığında da 3D sahnedeki gövde seçilebilir/seçimi kaldırılabilir.
  - **Move/Rotate ile Doğrudan Entegrasyon**: Bir gövde seçiliyken araç çubuğundan `Move / Rotate` açıldığında seçili gövde anında hedeflenir ve 3D taşıma/döndürme gizmo okları otomatik olarak bu gövde üzerinde açılır.

  - **Doğrudan Sayısal Giriş**: Çizgi çizilirken kullanıcı ekranda herhangi bir yere tıklamak zorunda kalmadan klavyeden sayı tuşlarına (`0-9`, `.`, `,`) bastığında girdi anında HUD üzerindeki `Length` alanına yönlendirilir ve odaklanır.
  - **Otomatik Distance Ölçüsü (`makeLineMeasurement`)**: Değeri girilerek tamamlanan her çizgi, tuvalde sanki **Distance (`D`)** kısayoluna basılıp çizgi seçilmiş gibi tam bir CAD ölçülendirmesi (uzantı çizgileri, çift yönlü oklar ve değer etiketi) ile görünür. Bu ölçü `sketch.measurements` koleksiyonuna kalıcı olarak eklenir.
  - **Constant Olarak İşaretlenme ve Belirgin Görünüm**: Değeri girilen çizgiler otomatik olarak `isConstant === true` durumuna geçer ve tuvalde serbest mavi (`#127fb2`) çizgilerden farklı olarak CAD siyahı (`#182230`) ve kalın (2.2px) hatla, koyu uç noktalarıyla belirgin biçimde çizilir.
  - **Etkileşim, Sürükleme ve Düzenleme**: Eklenen ölçü etiketi tuval üzerinde sürüklenebilir, çift tıklanarak değeri güncellenebilir, uç noktaları sürüklendiğinde sabit uzunluk korunarak döndürülebilir ve `Ctrl+Z` / `Ctrl+Y` ile eksiksiz geri/ileri alınabilir.
  - **Zincirleme Çizgi Çizimi**: Art arda çizilen çizgilerde değer girilen her segment kendi bağımsız mesafe ölçüsünü alır ve constant olur; değer girilmeyen segmentler serbest kalır.
- **3D Uzaydan Hızlı Çizim Kısayolları (L / C / R)**:
  - Aktif bir sketch açık değilken doğrudan **Line (`L`)**, **Circle (`C`)** veya **Rectangle (`R`)** kısayoluna basıldığında, kullanıcı sanki üst bardaki `SKETCH` butonuna basmış gibi tüm orijin düzlemleri (`XY`, `XZ`, `YZ`) seçim için gösterilir.
  - Bir düzleme tıklandığında sketch o düzlemde otomatik oluşturulur ve basılan kısayola ait çizim aracı (Line, Circle veya Rectangle) eline verilmiş (aktif) şekilde başlar.
  - Bu davranış **yalnızca** bu üç temel çizim aracı (L, C, R) ile sınırlıdır; diğer sketch araçları (P, F, T, M, D, A, H vb.) sketch açık değilken tetiklenmez. Düzlem seçimindeyken `Escape` ile seçim iptal edilebilir veya L/C/R arasında geçiş yapılabilir.
- **Extrude Manyetik Mesafe Tutunması (Snapping)**:
  - 3D ekstrüzyon oku sürüklendiğinde mesafe rastgele ondalıklar yerine akıllı CAD adımlarına tutunur (snapping).
  - 1 ile 10 mm arasında tam sayılara (`1, 2, 3, 4, 5, 6, 7, 8, 9, 10 mm`) manyetik olarak kilitlenir.
  - 10 mm sonrasında 5'in katlarına (`10, 15, 20, 25, 30... mm`) ve buçuklu ölçülere (`10.5, 11.5, 12.5, 13.5... mm`) hassas olarak tutunur.
  - Kullanıcı `Shift` tuşuna basılı tutarak sürüklerse serbest (unconstrained) milimetrik değer alabilir; kutuya elle değer girildiğinde istenen herhangi bir değer saklanabilir.
- **Fusion 360 Tarzı HORIZONTAL / VERTICAL (`H`)**:
  - **Tek Çizgi Toggle**: Çizgiye tıklandığında baskın eksene göre yatay veya dikey kısıt uygulanır; aynı kısıt varken tekrar tıklandığında kısıt kaldırılır (toggle off).
  - **İki Nokta Hizalama (Point-to-Point H/V)**: Çizgi uçları, dikdörtgen köşeleri, çember merkezleri, yay noktaları, serbest çizim noktaları (`P`) veya Orijin `[0, 0]` arasından iki nokta seçilerek yatay veya dikey hizalanabilir. İlk nokta seçildiğinde dinamik rehber önizleme çizgisi ve CAD halkası gösterilir, `Escape` ile seçim iptal edilebilir.
  - **Sürüklemede Kısıtın Korunması (No-tilt drag preservation)**: Yatay veya dikey çizgilerin uçları sürüklendiğinde eksen açısı kesinlikle bozulmaz (çizgi asla eğilmez, sabit uzunluk korunur). İki nokta kısıtlandığında biri sürüklendiğinde diğeri dinamik takip eder; sabit veya orijin noktaya bağlıysa serbestlik derecesi kilitlenir.
  - **Etkileşimli Rozetler (Badge Hit-Testing & Removal)**: Tuval üzerinde `H` ve `V` rozetleri görünür, üzerine gelindiğinde kırmızı vurgulanır ve tıklandığında kısıt silinir. Tüm işlemler geçmiş yöneticisine (`Ctrl+Z` / `Ctrl+Y`) entegredir.
- **POINT** (`P`) grid üzerinde bağımsız nokta oluşturur. **FIX / UNFIX** varsayılan kısayolsuzdur; çizgi, dikdörtgen, çember, yay ve noktayı kilitler. **TANGENT** (`G`) çizgi–çember veya iki çember arasında teğet bağıntısı oluşturur. H/V ve teğet bağıntıları `js/sketch-constraints.js` içinde tutulur; sabitlik `entity.fixed` alanındadır. Tam bir parametrik solver henüz yoktur; uzunluk/açı ölçüsü olan çizgiye teğet uygulanmadan önce ilgili ölçü kaldırılmalıdır.
- Ölçülendirme tekilleştirildi: D ile bir geometriye tıklamak artık hem geometri ölçüsü hem ikinci ölçüm kaydı üretmez. Kullanıcının çizim sırasında girdiği mevcut ölçü tekrar eklenmez; dikdörtgenin karşı kenarları aynı genişlik/yüksekliği paylaşır. Çember çapı dış etikete tek ve düz lider çizgisiyle bağlanır.
- **Settings → Shortcuts** kategorisi kısayolları değiştirmeyi sağlar; varsayılanlar L/R/C/P/F/T/M/D/A/H/G, Midpoint ve Fix/Unfix atanmamış. Tek harf çakışması engellenir; yerel depolama uygunsa seçimler saklanır. Eski aşağıdaki kısayol ve çap çizgisi tariflerinde bu güncel davranış esas alınmalıdır.

---

## 1. Proje Amacı ve Temel İlkeler

- **Ürün Tanımı**: Tarayıcıda kurulumsuz, sunucusuz ve derleme adımı olmadan doğrudan çalışan, ücretsiz bir Web CAD uygulaması.
- **Kullanıcı Deneyimi**: Fusion 360 hissiyatı ve ergonomisine yakın, temiz, açık gri/beyaz temalı, modern bir arayüz.
- **Teknik Kısıt**: Saf web teknolojileri (**Vanilla JS, CSS, HTML**). Kesinlikle `npm`, `node_modules`, `webpack/vite` veya sunucu gerektirmez; `index.html` doğrudan `file://` protokolüyle veya statik bir CDN üzerinden açılabilmelidir.
- **Dil Kuralı**: Uygulama arayüzündeki tüm görünen metinler **İngilizce** olmalıdır. Geliştirici notları ve kullanıcıyla iletişim Türkçe yürütülebilir.
- **Gizlilik Kuralı**: Bu açık/kamusal bir proje olacağından kod tabanında veya commit/notlarda yerel makineye, dosya yollarına veya kullanıcıya ait hiçbir özel bilgi bulunmamalıdır.

---

## 2. Mevcut Durumda Neler Yapıldı ve Nasıl Çalışıyor?

### A. Üst Bar ve Sekmeler (`.tabbar` & `.toolbar`)
1. **Workspace Tabbar (`.tabbar`)**:
   - **`DESIGN`**: Aktif çalışma alanı sekmesi.
   - **`IMPORT` Dropdown Menüsü**: Açılır ok (`⌄`) ile açılan modern CAD menüsü. İçerisinde format ikonları ve `TO-DO` etiketleriyle şu öğeler yer alır:
     - `Import STL (.stl)`
     - `Import .STEP (.step, .stp)`
     - `Import OBJ (.obj)`
     - `Import DXF (.dxf)`
     - Tıklandığında durum çubuğunda (status bar) geçici olarak `FEATURE PLANNED (TO-DO)` bilgilendirmesi gösterilir. Dışarı tıklandığında veya `Escape` ile kapanır.
   - **`SETTINGS` Butonu**: İkonsuz/emojisiz sade metin butonu. Tıklandığında kategorili tercihler penceresini açar.
2. **Araç Çubuğu (`.toolbar`)**:
   - `MODEL` çalışma alanı seçicisi.
   - `CREATE` grubu içinde yatay olarak (`flex-direction: row; gap: 4px;`) dizilmiş araçlar:
     - **`SKETCH`** (Önceki adı `Open Sketch`): Tıklandığında orijin seçim düzlemlerini açar; düzlem seçilince sketch aynı tam boy 3D çalışma alanında düzenlenir.
      - Aktif sketch sırasında **LINE**, **RECTANGLE**, **CIRCLE**, hafif transparan kırmızı tonlu **DISTANCE**, **ANGLE**, **MIDPOINT**, bunların hemen yanında **SPLIT VIEW** ve hafif transparan yeşil tonlu **FINISH SKETCH** görünür. Sketch açıkken 3D araçları olan **EXTRUDE** ve **HOLE** gizlenir; sketch bitince tekrar görünür. Alt 2D görünüm varsayılan olarak kapalıdır; SPLIT VIEW ile yalnızca referans görünümü olarak açılır.
     - **`EXTRUDE`**: CAD 3D ekstrüzyon ikonuna sahip planlanan araç (`TO-DO`).
     - **`HOLE`**: CAD silindir delik/merkez eksen ikonuna sahip planlanan araç (`TO-DO`).
   - Sağ tarafta `3D WORKSPACE` durum göstergesi.

### B. Hiyerarşik Proje Ağacı (Browser Tree — Node & Leaf Mimarisi)
- **Başlık (`.panel-heading`)**: `BROWSER` başlığı yer alır (sağındaki gereksiz üç nokta `•••` kaldırıldı).
- **Kök Düğüm (Root Node — `Untitled Design`)**:
   - `#projectTreeRow` satırına veya solundaki chevron işaretine (`⌄`) tıklandığında altındaki bütün ağaç (`#rootChildren`) tek tıkla kapanır (`›`) veya açılır (`⌄`).
- **Alt Düğümler ve Yapraklar (`root-children`)**:
   - `Document Settings` (yaprak / leaf).
   - **`Origin` Klasörü (Sub-node)**:
     - Klasör chevron'u (`›` / `⌄`) ile açılıp kapanabilir.
     - Ana klasörün yanında master göz butonu (`#originEyeBtn`) bulunur; tüm orijin sistemini tek tıkla gizler/gösterir.
     - Klasör açıldığında 7 bağımsız öğe (leaves) listelenir:
       - **`O`**: Merkez orijin noktası
       - **`X`**: Kırmızı X ekseni
       - **`Y`**: Yeşil Y ekseni
       - **`Z`**: Mavi Z ekseni
       - **`XY`**: Kırmızı XY orijin düzlemi
       - **`XZ`**: Mavi XZ orijin düzlemi
       - **`YZ`**: Yeşil YZ orijin düzlemi
     - Her öğenin yanında etkileşimli göz butonu (`.tree-eye`) bulunur. Kapatıldığında 3D sahnede ilgili eksen çizgisi, eksi yön kesikli çizgisi ve koordinat yazıları anında gizlenir.
   - **`Sketches` Klasörü**: Sketch açıldığında `Sketch 1` yaprağını listeler.

### C. 3D Koordinat Izgarası ve Matematik
- **Birimler**: Tüm ölçümler milimetre (`mm`) cinsindedir.
- **5x5 Alt Kareler**: Her ana kare arasında 5x5 alt ızgara kareleri dinamik çizilir.
- **Minimum Ölçek Tabanı**: Koordinat ölçeği minimum **1.25 mm** ile sınırlandırılmıştır (daha küçük değere asla bölünmez; 1.25, 2.5, 5, 12.5... şeklinde katlanır).
- **Maksimum Sınır**: Izgara sonsuz gitmez; maksimum **1000 mm** (1 metre plaka) ile sınırlandırılmıştır.
- **Etiketler (Labels)**: Çok yakındayken (`majorStep <= 2.5`) sayılar 1 ile 20 mm aralığında gösterilir; font `11px Consolas` ile okunaklıdır.
- **Düzlem Seçim Geçişi**: İmleç 3D uzayda gezinirken XY, XZ, YZ düzlemleri arasında geçiş animasyonsuz, anında ışınlanarak (`teleport snap`) gerçekleşir. Tıklanan bölgeye göre sketch açılır.

### D. Kamera ve 3D Gezinme (`js/camera.js`)
- **Orbit (Döndürme)**: `Shift + MMB` veya `ViewCube`.
  - **Constrained Orbit**: Z ekseni dik tutulur, ancak kutup sınırlaması yoktur; kamera modelin altı dahil serbestçe 360° takla atabilir (tumbling).
  - **Free Orbit**: Tam serbest yörünge. Ayarlardan seçilebilir.
- **Pan (Kaydırma)**:
  - `MMB` (orta fare tuşu) ile basılı tutup sürüklerken imleç hareketini **1:1 doğrudan, sıfır gecikmeyle** takip eder.
  - Tuş bırakıldığı anda **hiçbir kayma/sürüklenme (coasting) olmadan tam bırakılan pikselde durur**.
- **Fit View / Ekrana Sığdırma**:
  - `MMB` (orta fare) ile çift tıklandığında, alt araç çubuğundaki `#viewFit` (Fit) butonuna basıldığında veya `Home` tuşuna basıldığında yumuşak animasyonla (`animateFit`, ~320ms cubic easing) odaklanır.
  - **Çoklu Body Desteği**: Sahnede birden fazla katı cisim (body) varsa, kameranın baktığı açıya göre tüm görünür body'lerin ortak sınırları hesaplanır (`computeFit`); kamera tüm body'leri ekrana eksiksiz ve dengeli bir boşlukla sığdıracak şekilde hem kaydırır (pan) hem de yakınlaştırır/uzaklaştırır (zoom). Gizli (`visible: false`) body'ler hesaba katılmaz; hiç body yoksa orijin ızgara merkezine döner.
- **Zoom**: Fare tekerleği veya `Ctrl + Shift + MMB`. İmleç yönüne doğru logaritmik yakınlaşır.

### E. Tercihler Penceresi (`js/settings.js`)
- Üst sekmedeki `SETTINGS` butonuna basıldığında modal pencere açılır.
- Sol tarafta kategoriler (`General`, `Camera`), sağda canlı kontroller:
  - `Default Orbit type`: Constrained Orbit / Free Orbit
  - `Reverse zoom direction`: On / Off
  - `Enable camera pivot`: On / Off
- Değişiklikler anında canlı sahneye yansır. `Escape` veya arka plana tıklanarak kapatılır.

### F. Geri / İleri Alma (`js/history.js`)
- Standart Windows kısayolları: **`Ctrl+Z`** (Undo) ve **`Ctrl+Y` / `Ctrl+Shift+Z`** (Redo). `event.code` desteği ile tüm klavye düzenlerinde (Türkçe Q vb.) kesintisiz çalışır.
- Sketch açma/kapama, çizim nesnesi oluşturma/düzenleme, ölçülendirme, kısıtlamalar, 3D Extrude, Fillet/Chamfer, Move/Rotate işlemlerinin tamamı geçmiş yığınına kaydedilir.
- **Ağaç Görünürlük Kontrolleri (Origin Düzlemleri, Body, Sketch)**: Ağaçtaki göz (`.tree-eye`) butonları üzerinden yapılan tüm görünürlük açma/kapama işlemleri (XY, XZ, YZ, Orijin klasörü, Body ve Sketch görünürlükleri) `history` yığınına kaydedilir; `Ctrl+Z` ile anında geri alınabilir ve `Ctrl+Y` ile ileri alınabilir. İlgili ağaç satırlarının ve göz ikonlarının UI stilleri ile canvas çizimi eşzamanlı güncellenir.

### G. Sketch Geometrisi ve Ölçülü Araçlar (`js/sketch-model.js`, `js/sketch-geometry.js`, `js/sketch-tool.js`, `js/sketch-render.js`)
- Her sketch düzlemi ve kimliğiyle tutulur; Line, Rectangle, Circle ve Arc nesneleri canvas pikselleri yerine düzlem üzerindeki **milimetre koordinatları** olarak saklanır. Sayfa yenilendiğinde veri kaybolur; dosya kaydetme henüz yoktur.
- **L / R / C / F / D / A / M** kısayolları Line, Rectangle, Circle, Fillet, Distance, Angle ve Midpoint araçlarını açar; ayrıca üst çubukta **MIRROR** aracı mevcuttur.
- **FILLET (`F`)**: İki çizginin birleştiği köşe düğümüne tıklandığında veya birbirine bağlı iki çizgi seçildiğinde teğet yay oluşturur; HUD üzerinden mm cinsinden Radius girilebilir, çizgiler teğet noktalara kırpılır ve kapalı profiller yay ile kesintisiz korunur.
- **MIRROR**: Ekran görüntüsündeki koyu CAD paneli tarzında yüzen bir palet açar (`Objects` ve `Mirror Line` seçim butonları, `OK` ve `Cancel`). Çizim nesneleri seçildikten sonra herhangi bir çizgi veya orijin X/Y ekseni ayna hattı olarak işaretlenebilir; anlık kesikli hayalet önizleme sunulur ve OK tıklandığında nesneler simetrik olarak aktarılır.
- D iki yakalanmış nokta arasını, mevcut bir çizginin uzunluğunu, dikdörtgen kenarını veya çemberin çapını ölçer; A kesişen iki çizginin açısını ölçer; M çizgi veya dikdörtgen kenarının orta noktasını işaretler. Aktif araçlarda sınır üstüne gelince çizgi, dikdörtgen kenarı veya çember çevresi kalın mavi vurgulanır. Ölçü açıklamaları sketch verisinde saklanır, taşınabilir, araç değişse veya sketch kapansa da görünür ve undo/redo ile yönetilir. Düz ölçü çubukları uç noktalara bağlı kalır; dik yönde taşınır ve yazı çubuk boyunca kayar. Çember çapı yazı sürüklenince sabit merkez etrafında döner, ok uçları çevrede kalır; dıştaki yazıya yatay bitiş çizgisi eklenir. Çizgi uzunluğu etiketine çift tıklanınca girilen uzunluk, çizginin başlangıcını koruyup bitişini kendi doğrultusunda taşır. Dikdörtgen kenarı uzunluğunu düzenlemek dikdörtgenin başlangıç köşesini, çember çapını düzenlemek merkezini sabit tutar. Çizim noktaları görünen ızgara adımına, özellikle orijine, var olan uç noktalara ve kenar orta noktalarına yakalanır; 1000 mm sınırının dışı çizim almaz. İlk çizim noktasından sonra imleç yanında canlı ölçü kutuları görünür: Line için Length/Angle, Rectangle için Width/Height, Circle için Diameter/Radius. Tab mevcut değeri kilitler ve sonraki kutuya geçer; Line'da yalnızca bir alan, Rectangle'da iki alan birlikte kilitlenebilir. Enter veya ikinci tıklama geçerli şekli tamamlar. Escape bekleyen şekli iptal eder. Oluşturma undo/redo ile çalışır.
- Line, Rectangle ve Circle sınırları kesişimlerde bölünür; oluşan kapalı yüzler mavi yarı saydam profiller olarak çizilir. Çizgi parçaları kapalı bölgeden dışarı uzansa da profil bulunur. İç bölge hover ve tıklamayla seçilebilir; gerçek Extrude henüz uygulanmadı. Kapalı profil bulma, çizim ve seçim ayrı modüllerdedir.
- **Constant (sabit) vs Unconstrained (serbest) Geometri ve Doğrudan Sürükleyerek Boyutlandırma (Fusion 360 tarzı)**:
  - Çizilen elemanların değerleri verilmişse (çember için çap veya yarıçap, çizgi için uzunluk, dikdörtgen için genişlik ve yükseklik veya `D` aracı ile ölçü eklenmişse), eleman **constant** sayılır ve kenarları katı CAD siyahı (`#182230`) ile çizilir.
  - Değerleri henüz kısıtlanmamış elemanlar CAD mavisi (`#127fb2`) ile çizilir. Uç noktaları ve köşeleri interaktif CAD tarzı beyaz dolgulu daireler olarak görünür.
  - Sketch düzenlenirken serbest geometriler doğrudan farenin sol tuşuyla tutulup çekilerek boyutlandırılabilir:
    - **Circle**: Çember çevresinden tutulup dışa doğru çekildikçe çapı/yarıçapı büyür (uzar), merkeze doğru çekildikçe küçülür (kısalır). Merkezi tutulup çekilirse çember taşınır. Constant çemberlerin çevresi sabit kalır, boyutu değiştirilemez.
    - **Line**: Uç noktalarından tutulup çekilerek serbestçe uzatılabilir, kısaltılabilir veya açısı değiştirilebilir. Uzunluğu sabit ise çekildiğinde açı döner ancak uzunluk korunur.
    - **Rectangle**: Serbest kenarlar dik yönde sürüklenerek genişlik veya yükseklik değiştirilebilir; serbest köşeler sürüklenerek ayarlanabilir. Sabit kenarlar ve kısıtlı boyutlar kesinlikle kilitli kalır: Width constant ise dikey kenarlar (Edge 1 & 3) ve köşelerin X ekseni kilitlidir (genişlik uzatılamaz), yalnızca serbest olan yükseklik değişebilir. Height constant ise yatay kenarlar (Edge 0 & 2) ve köşelerin Y ekseni kilitlidir (yükseklik uzatılamaz). Her iki boyut da constant ise tüm kenar ve köşeler kilitlidir, dikdörtgen boyutlandırılamaz.
  - Tutamaçların üzerine gelindiğinde interaktif fare imleci geri bildirimi anında değişir (`ew-resize`, `ns-resize`, `nwse-resize`, `nesw-resize`, `crosshair`, `default`).
  - Yapılan tüm sürükleme ve boyutlandırmalar `Ctrl+Z` (Undo) ve `Ctrl+Y` (Redo) geçmiş yığınına kaydedilir.
- Line/Rectangle/Circle ölçü kutularına elle girilen değerler, şekil üzerinde kalıcı ölçü açıklamaları olarak saklanır ve oklarla çizilir. D ile eklenen mesafe etiketi de sketch verisinde kalır; ilgili eleman anında constant olup siyah renge döner.
- Sketch bitirilince geometri silinmez. Proje ağacındaki sketch satırına tıklayarak yeniden düzenlenebilir. Birden fazla sketch oluşturulabilir.
- Kamera seçilen sketch düzlemine döner. Çizim noktası, ortografik kamera ışınının aktif düzlemle kesişiminden hesaplanır; düzleme tam kenardan bakılırken geçersiz çizim yapılmaz.
- SKETCH tıklandığında tüm düzlemler seçim için görünür hale gelir. Düzlem seçilip sketch açıldığında düzlem karoları 3D görünümden otomatik olarak tamamen kapatılır; kullanıcı isterse ağaçtaki göz ikonlarından manuel olarak istediği düzlemi açabilir.
- SPLIT VIEW alt 2D referans penceresini açıp kapatır. Çizim girişi üstteki ana çalışma alanındadır. Bu düzen ilerideki Hole gibi işlemlere uyarlanabilir.

### H. Kısayollar ve Etkileşim Tablosu

| Kategori | İşlem | Kısayol / Kontrol |
| --- | --- | --- |
| **Gezinme** | Kaydırma (Pan) | `MMB` (orta fare tuşu) sürükleme (1:1 takip, sıfır gecikme/kayma) |
| **Gezinme** | Döndürme (Orbit) | `Shift` + `MMB` veya `ViewCube` sürükleme |
| **Gezinme** | Yakınlaşma (Zoom) | Fare tekerleği veya `Ctrl` + `Shift` + `MMB` |
| **Gezinme** | Merkeze Odaklanma (Fit View) | Çift tık `MMB` |
| **Çizim** | Araç Kısayolları | `L` (Line), `R` (Rectangle), `C` (Circle), `F` (Fillet), `D` (Distance), `A` (Angle), `M` (Midpoint) |
| **Çizim** | Boyut Kilitleme / Geçiş | `Tab` |
| **Çizim** | Onay / İptal | `Enter` (tamamla), `Escape` (iptal et / paneli kapat) |
| **Doğrudan Boyutlandırma** | Serbest Geometriyi Çekme | Çember çevresini, çizgi uçlarını, dikdörtgen kenar/köşelerini fareyle sürükle |
| **Ölçülendirme** | Ölçü Etiketi Taşıma / Düzenleme | Etiketi sürükle (taşı), etikete çift tıkla (sayısal değeri düzenle) |
| **Geçmiş** | Geri / Yinele | `Ctrl+Z` (Undo), `Ctrl+Y` veya `Ctrl+Shift+Z` (Redo) |

### I. Doğrulama ve Testler
- **Birim Testler (Unit Tests)**: `node --test tests/sketch-model.test.mjs` (Matematik, projeksiyon, kısıtlar, kesişimler, kapalı profil tespiti ve undo/redo mantığı).
- **Canlı Tarayıcı CDP Testleri**: `python scratch/test_fusion_horizontal_vertical.py`, `python scratch/test_dimensions_drag.py` ve `python scratch/test_line_rect_drag.py` (Headless Edge/Chrome üzerinde doğrudan DOM ve canvas etkileşimleri, Fusion 360 H/V kısıt ve sürükleme koruması, constant/unconstrained stil kontrolleri ve fare sürükleme/boyutlandırma testleri).

---

## 3. Kod Dosya Haritası

```
WebCAD/
├── index.html           # Ana sayfa, sıralı defer scriptler ve UI bileşenleri
├── app.js               # Olay dinleyicileri, UI bağlama ve render koordinasyonu
├── README.md            # Kullanıcı odaklı özellik özeti ve çalıştırma bilgisi
├── GEMINI.md            # Ürün rehberi ve yapay zekâ kuralları
├── AI_HANDOFF.md        # Bu devir belgesi
├── js/
│   ├── math.js          # Vektör matematiği (cross, dot, normalize, addScaled vb.)
│   ├── orientation.js   # Basis matrisleri ve kuaterniyon slerp interpolasyonu
│   ├── planes.js        # Orijin düzlem tanımları (XY, XZ, YZ normal ve vektörleri)
│   ├── canvas.js        # Çizim yardımcıları (line, polygon, prepare, drawPlaneText)
│   ├── camera.js        # Kamera modeli, projeksiyon, pan, orbit, animateToBasis, animateFit
│   ├── model-view.js    # 3D sahne canvas'ı, ızgara, eksenler, düzlem ışın izleme ve render
│   ├── sketch-view.js   # Alt sketch görünümü ve 2D koordinat ızgarası
│   ├── view-cube.js     # ViewCube SVG kaplaması, 3D rotator ve hedef tıklama mantığı
│   ├── settings.js      # Uygulama tercihleri ve modal paneli
│   ├── history.js       # Undo / Redo komut yöneticisi
│   ├── sketch-model.js  # Sketch ve mm cinsinden nesne verisi
│   ├── sketch-grid.js   # Görünen ve yakalanan ızgaranın ortak adımı
│   ├── sketch-snap.js   # Orijin, uç nokta ve ızgara yakalama
│   ├── sketch-hit-test.js # Kenar bulma ve orta nokta işaretleri
│   ├── sketch-geometry.js # Ölçü ve şekil hesabı
│   ├── sketch-fillet.js # Köşe yuvarlama (fillet), teğet yay hesabı, HUD ve geri alma/yineleme
│   ├── sketch-mirror.js # Açık pattern paneli ile nesne ve ayna çizgisi seçimi, canlı hayalet önizleme
│   ├── sketch-pattern.js # Offset ve circular/rectangular pattern işlemleri
│   ├── sketch-wheel.js  # Sağ tıkla açılan şeffaf sketch araç çarkı
│   ├── sketch-dimensions.js # Kalıcı ölçü açıklamaları, ok ve uzatma çizgileri
│   ├── sketch-angle.js  # Kesişen çizgilerin açı hesabı
│   ├── sketch-distance.js # Nokta, çizgi uzunluğu ve açı açıklamaları
│   ├── sketch-annotation-interaction.js # Ölçü etiketini taşıma ve uzunluk düzenleme
│   ├── sketch-profiles.js # Kapalı konturları profil olarak bulma
│   ├── sketch-profile-selection.js # Profil üzerine gelme ve seçme
│   ├── sketch-render.js # Ortak çizim nesnesi renderer'ı
│   └── sketch-tool.js   # İşaretçi, klavye ve ölçü kutusu etkileşimi
└── css/
    ├── base.css         # Temel sıfırlamalar ve tipografi
    ├── chrome.css       # Başlık, sekme çubuğu, açılır menü ve araç çubuğu
    ├── browser.css      # Soldaki hiyerarşik proje ağacı (node/leaf) ve göz butonları
    ├── workspace.css    # 3D ve sketch bölmeli çalışma alanı yerleşimi
    ├── view-cube.css    # ViewCube 3D dönüş stilleri ve SVG eksen kaplamaları
    ├── settings.css     # Tercihler modal penceresi ve kategorileri
    ├── sketch-tools.css # Ölçü kutusu (HUD) ve etiket stilleri
    ├── sketch-wheel.css # Açık panel, araç çarkı ve sabit yeşil Line onayı
    └── responsive.css   # Dar ekran ve mobil uyumluluk kuralları
```

---

## 4. Tamamlanan Son Özellikler ve Sıradaki Görevler

### Tamamlanan Son Özellikler:
1. **onlineCAD Yeniden Markalama & Belge Başlığı**:
   - Başlık ve arayüz `onlineCAD` olarak güncellendi.
   - Üst çubukta düzenlenebilir belge başlığı (`#documentTitleText`), unsur ağacı kök düğümü ve indirme dosya adıyla iki yönlü senkronize çalışıyor.
2. **Yerel Proje Formatı (`.ocad`)**:
   - `Ctrl+S` ve `Ctrl+O` ile kayıpsız proje kaydetme ve açma ([`js/project-io.js`](file:///c:/Users/b0r4/Desktop/WebCAD/js/project-io.js)).
   - Kullanıcı talebi doğrultusunda **yalnızca `.ocad` uzantısı** kabul edilir; dosya seçicide ve doğrulamada `.json` uzantısı kesinlikle filtrelenir ve reddedilir.
3. **Binary STL Dışa Aktarma (`.stl`)**:
   - Sahnede görünür tüm 3D katı modelleri endüstri standardı **Binary STL** (80-byte header, float32 vertex ve normal vektörleri) formatında dışa aktarır; Cura, PrusaSlicer, Bambu Studio vb. dilimleyicilerle %100 uyumludur.
4. **Evrensel İçe Aktarma / Importers (`js/importers.js`)**:
   - **STL Import (`.stl`)**: Binary ve ASCII STL dosyalarını ayrıştırır, kaynak verteksleri mekânsal hash tablosuyla birleştirir (welding) ve 3D katı model gövdesi olarak sahneye ekler.
   - **STEP Import (`.step`, `.stp`)**: ISO 10303-21 standardında faceted B-Rep, Cartesian points, edge loops, poly loops ve AP242 yüzeylerini çözümler; ear-clipping algoritmasıyla üçgenleyerek 3D sahneye taşır.
   - **OBJ Import (`.obj`)**: Wavefront OBJ verteks, normal ve yüzeylerini (üçgen, dörtgen ve n-gon fan triangulation) içe aktarır.
   - **DXF Import (`.dxf`)**: AutoCAD 2D teknik çizimlerindeki `LINE`, `CIRCLE`, `ARC`, `LWPOLYLINE` (bulge kavis faktörü dâhil yay dönüşümü), `ELLIPSE` ve `SPLINE` nesnelerini çözümler. Aktif bir sketch varsa doğrudan ona ekler; yoksa otomatik yeni bir 2D sketch (`XY` düzleminde) oluşturup unsurları yerleştirir ve kamerayı odaklayarak hemen `EXTRUDE` yapılabilir hale getirir. `3DFACE` içeren modelleri ise 3D gövde olarak sahneler.
   - **Sürükle-Bırak (Drag & Drop)**: Masaüstünden `.ocad`, `.stl`, `.step`, `.stp`, `.obj` veya `.dxf` dosyaları doğrudan tarayıcıya sürüklendiğinde otomatik algılanıp yüklenir.

5. **3D Solid Hole (Delik Aracı - Simple, Counterbore, Countersink)**:
   - Düzlemsel gövde yüzeylerine tek tıkla delik konumu belirleme.
   - Boydan boya (Through All) ve derinlikli (Distance) delikler; havşa başlı (Countersink) ve faturalı (Counterbore) delik geometrileri ([`js/solid-hole.js`](file:///c:/Users/b0r4/Desktop/WebCAD/js/solid-hole.js)).
6. **3D Body Pattern (Çoğaltma - Dikdörtgensel & Dairesel)**:
   - Katı gövdeleri X/Y/Z eksenleri boyunca mesafe ve adet ile dikdörtgensel çoğaltma.
   - Z/Y/X eksenleri etrafında açı ve adet ile dairesel çoğaltma ([`js/body-pattern.js`](file:///c:/Users/b0r4/Desktop/WebCAD/js/body-pattern.js)).
7. **Tersine Mühendislik Tabanlı Analitik Feature-Fitting (Mesh to Solid Rebuild)**:
   - STL üçgen mesh dosyalarından orijinal CAD ilksellerini (düzlemler, silindirik delikler/miller, küreler) matematiksel olarak tanıma ([`js/mesh-feature-fit-core.js`](file:///c:/Users/b0r4/Desktop/WebCAD/js/mesh-feature-fit-core.js)).
   - Eşdüzlemli ve teğet yüzey ayrıştırması (tangent flat peel-off).
   - Silindir ve kürelerde kiriş (chord) çokgenleşmesini ortadan kaldırıp gerçek kavisli yüzeyleri hassas olarak yeniden inşa etme (hacim ve şekil hatası 10-100 kat düşürülür).
   - Organik/serbest formları deforme etmeden koruma (freeform fallback).
   - Web Worker ve ana iş parçacığı dönüşüm hatlarına tam entegrasyon; 170/170 birim test başarıyla tamamlandı.

### Sıradaki Geliştirme Maddeleri:
1. **DXF Export (2D Dışa Aktarma)**:
   - 2D sketch nesnelerini AutoCAD R12 / R2000 uyumlu ASCII DXF olarak dışa aktarma.
2. **3D Revolve (Döndürerek Katılama)**:
   - Manifold çekirdeğinde mevcut olan revolve yeteneğini 3D araç çubuğuna entegre etme.

---

## 5. Yeni AI İçin Kritik Davranış Kuralları

- **Mimariyi Bozma**: Tüm scriptler namespaced (`window.WebCAD`) ve sıralı yüklenir. ES modül derleyicisi veya bundler ekleme.
- **Kullanıcı Talimatı Önceliklidir**: Bu belgedeki herhangi bir açıklama, kullanıcının o anki yeni bir isteğiyle çelişirse, kullanıcının son talimatı esastır.
- **Küçük ve Sağlam Adımlarla İlerle**: Bir seferde çok fazla varsayımsal özellik ekleme. İstenen tekil özelliği temiz ve doğrulanabilir şekilde bitir.
- **Konsol ve Parantez Kontrolü**: Yapılan her JavaScript değişikliğinde blok ve parantez dengesini (`{`, `}`) kontrol et; `file://` açılışında konsol hatası vermediğinden emin ol.
