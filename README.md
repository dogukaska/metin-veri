# Metin ve Veri

Dijital Çakı’nın tarayıcıda çalışan metin karşılaştırma, satır temizleme ve CSV tekilleştirme aracı.

CSV için [PapaParse 5.5.3](https://github.com/mholt/PapaParse) kullanılır. MIT lisans bildirimi `vendor/` dizinindedir. CSV’nin ilk satırı başlık kabul edilir.

CSV yükleme hatasının düzeltilmesinde ve tarayıcı testlerinde OpenAI Codex kullanıldı.

[CSV ↔ Excel](https://dogukaska.github.io/metin-veri/excel/) CSV ve XLSX dosyalarını tarayıcıda dönüştürür. CSV hücreleri XLSX’e metin olarak aktarılır. XLSX’ten CSV’ye aktarımda tek bir sayfa seçilir ve görüntülenen değerler kullanılır.

XLSX için yayımlayıcının [SheetJS CE 0.20.3 dağıtımı](https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz) kullanılır. Apache 2.0 lisansı `vendor/SHEETJS-LICENSE` dosyasındadır. Dönüştürücü ve tarayıcı kontrolleri OpenAI Codex desteğiyle geliştirildi.
