var fs = require('fs');
var p = 'backend/prisma/schema.prisma';
var c = fs.readFileSync(p, 'utf8');

// Fix UnlockedChapter relation and unique
var old1 = 'fields: Claude-Opus, references:';
var new1 = 'fields: Claude-Opus, references:';
c = c.replace(old1, new1);

var old2 = '@@unique(Claude-Opus)';
var new2 = '@@unique(Claude-Opus)';
c = c.replace(old2, new2);

fs.writeFileSync(p, c, 'utf8');

// Verify
var lines = fs.readFileSync(p, 'utf8').split('\n');
for (var i = 0; i < lines.length; i++) {
  if (lines[i].indexOf('UnlockedChapter') > -1 || lines[i].indexOf('unlocked_chapter') > -1) {
    console.log('Line ' + (i+1) + ':', lines[i]);
  }
  if (lines[i].indexOf('fields: Claude-Opus.indexOf('@@unique([userId') > -1) {
    console.log('Line ' + (i+1) + ':', lines[i]);
  }
}
