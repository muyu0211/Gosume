const fs = require('fs');
try {
  fs.unlinkSync('D:/Kits/IDE/Gosume/frontend/src/components/template/TemplateSelector.tsx');
  fs.writeFileSync('D:/Kits/IDE/Gosume/frontend/_out.txt', 'deleted: ' + !fs.existsSync('D:/Kits/IDE/Gosume/frontend/src/components/template/TemplateSelector.tsx'), 'utf8');
} catch (e) {
  fs.writeFileSync('D:/Kits/IDE/Gosume/frontend/_out.txt', 'ERR ' + e.message, 'utf8');
}
