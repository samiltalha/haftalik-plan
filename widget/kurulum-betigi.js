// Haftalık Plan widget'ını internetten indirip "Günlük Akış" adıyla kaydeder.
const url = 'https://raw.githubusercontent.com/samiltalha/haftalik-plan/main/widget/haftalik-plan-widget.js';
const code = await new Request(url).loadString();
let fm;
try { fm = FileManager.iCloud(); fm.documentsDirectory(); } catch (e) { fm = FileManager.local(); }
fm.writeString(fm.joinPath(fm.documentsDirectory(), 'Günlük Akış.js'), code);
const a = new Alert();
a.title = 'Kuruldu ✓';
a.message = '"Günlük Akış" betiği eklendi (' + code.split('\n').length + ' satır). Scriptable listesinden açıp ▶︎ ile çalıştır.';
a.addAction('Tamam');
await a.present();
